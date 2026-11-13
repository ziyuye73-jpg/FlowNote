const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

function aborted() { const error = new Error('本机媒体处理已取消。'); error.name = 'AbortError'; return error; }
function run(command, args, { signal, timeout = 30000, limit = 1024 * 1024, onOutput } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const child = spawn(command, args, { shell: false, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', size = 0, failure;
    const stop = error => { failure ||= error; child.kill('SIGKILL'); };
    const cancel = () => stop(aborted());
    const timer = setTimeout(() => stop(new Error('本机媒体处理超时，请重试或使用较短视频。')), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    const collect = (data, output) => {
      size += data.length;
      if (size > limit) return stop(new Error('本机工具输出超过安全限制。'));
      if (output) stdout += data.toString(); else { stderr = (stderr + data.toString()).slice(-16000); onOutput?.(data.toString()); }
    };
    child.stdout.on('data', data => collect(data, true));
    child.stderr.on('data', data => collect(data, false));
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    child.on('error', error => { clean(); reject(error); });
    child.on('close', code => { clean(); failure ? reject(failure) : code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `本机工具退出 (${code})`)); });
  });
}

class LocalMedia {
  constructor({ directory, onProgress } = {}, dependencies = {}) {
    if (!directory) throw new Error('需要本机语音数据目录。');
    this.directory = path.resolve(directory);
    this.onProgress = onProgress;
    this.run = dependencies.run || run;
    this.env = dependencies.env || process.env;
  }
  progress(stage, message) { this.onProgress?.({ stage, message }); }
  async tool(name, signal) {
    const override = this.env[`FLOWNOTE_${name.toUpperCase()}`];
    const candidates = override ? [override] : [name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`];
    for (const command of candidates) {
      try { await this.run(command, ['-version'], { signal }); return command; }
      catch (error) { if (signal?.aborted) throw aborted(); }
    }
    return null;
  }
  async status(signal) {
    const [ffmpeg,ffprobe]=await Promise.all([this.tool('ffmpeg',signal),this.tool('ffprobe',signal)]);
    return {ready:!!(ffmpeg&&ffprobe),message:ffmpeg&&ffprobe?'本机抽帧工具已就绪；使用你提供的字幕，不进行语音识别。':'仅字幕模式可用；画面分析需要安装 FFmpeg。'};
  }
  async extract(videoPath, signal, subtitlePath, withFrames = false) {
    if (signal?.aborted) throw aborted();
    const {text:transcript,hash:subtitleHash}=await readSubtitles(subtitlePath,true);
    if(!withFrames) return {transcript,subtitleHash,frames:[],duration:null,analysisMode:'subtitles-only'};
    const source = path.resolve(videoPath);
    if (!(await fs.stat(source)).isFile()) throw new Error('请选择本机视频文件。');
    this.progress('media-check', '正在检查本机视频；音频和视频不会上传。');
    const [ffmpeg, ffprobe] = await Promise.all([this.tool('ffmpeg', signal), this.tool('ffprobe', signal)]);
    if (!ffmpeg || !ffprobe) throw new Error('未找到 ffmpeg/ffprobe，请安装 FFmpeg，或关闭关键帧分析使用仅字幕模式。');
    const probe = JSON.parse(await this.run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source], { signal }));
    const video = probe.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const audio = probe.streams?.find(stream => stream.codec_type === 'audio');
    const duration = Number(probe.format?.duration || video?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error('无法读取有效的视频画面或时长。');
    if (duration > 1800) throw new Error('本机分析仅支持不超过 30 分钟的视频，不会截断转写。');
    await fs.mkdir(this.directory, { recursive: true });
    const temp = await fs.mkdtemp(path.join(this.directory, 'media-'));
    try {
      const frames = [];
      for (let i = 0; i < 5; i++) {
        const seconds = duration * (i + 0.5) / 5;
        const frame = path.join(temp, `frame-${i}.jpg`);
        this.progress('media-frames', `正在本机提取少量画面（${i + 1}/5）。`);
        await this.run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(seconds), '-i', source, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease', '-q:v', '5', frame], { signal, timeout: 120000 });
        if ((await fs.stat(frame)).size > 512 * 1024) throw new Error('提取画面超出大小限制。');
        frames.push({ seconds, dataUrl: `data:image/jpeg;base64,${(await fs.readFile(frame)).toString('base64')}` });
      }
      this.progress('media-ready','字幕与关键帧已准备，不进行语音识别。');
      return { transcript, subtitleHash, frames, duration, analysisMode: 'local-transcript-and-frames' };
    } finally {
      const resolved = path.resolve(temp);
      if (path.dirname(resolved) !== this.directory || !path.basename(resolved).startsWith('media-')) throw new Error('临时目录校验失败，未删除。');
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
}
async function readSubtitles(file, withHash=false) {
  if(typeof file!=='string' || !path.isAbsolute(file) || !/\.(srt|vtt|txt)$/i.test(file)) throw new Error('请选择对应的 SRT、VTT 或 TXT 字幕文件。');
  const stat=await fs.stat(file);
  if(!stat.isFile() || stat.size>2000000) throw new Error('字幕文件无效或超过2 MB。');
  const bytes=await fs.readFile(file);
  const source=bytes.toString('utf8').replace(/^\uFEFF/,'');
  if(source.includes('\uFFFD')) throw new Error('字幕编码无法识别，请保存为 UTF-8。');
  const text=/\.txt$/i.test(file) ? source.trim() : source.replace(/\r\n?/g,'\n').split(/\n\s*\n/).flatMap(block=>{
    const lines=block.split('\n');
    if(/^(WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(lines[0].trim())) return [];
    const timing=lines.findIndex(line=>line.includes('-->'));
    if(timing<0) return [];
    return lines.slice(timing+1).map(line=>line.replace(/<[^>]*>/g,''));
  }).join('\n').trim();
  if(!text || text.length>100000) throw new Error('字幕为空或超出100000字限制，不会静默截断。');
  return withHash ? {text,hash:require('node:crypto').createHash('sha256').update(bytes).digest('hex')} : text;
}
module.exports = { LocalMedia, run, readSubtitles };
