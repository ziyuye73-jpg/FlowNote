const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {LocalMedia,readSubtitles,run}=require('../desktop/media.cjs');
test('reads full UTF8 subtitles without ASR or subprocesses in subtitles-only mode',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flownote-subs-'));const file=path.join(dir,'字幕.srt');
 await fs.writeFile(file,'\uFEFF1\n00:00:00,000 --> 00:00:01,000\n目标不是终点\n\n2\n00:00:01,000 --> 00:00:02,000\n<b>还要留意过程</b>');
 assert.equal(await readSubtitles(file),'目标不是终点\n还要留意过程');
 const media=new LocalMedia({directory:dir},{run:()=>{throw Error('must not spawn ASR')}});
 const result=await media.extract('/not-needed.mp4',undefined,file,false);assert.equal(result.frames.length,0);assert(result.transcript.includes('留意过程'));
 await assert.rejects(readSubtitles(path.join(dir,'missing.exe')),/字幕/);
});
test('extracts five local keyframes from synthetic video, never creates audio',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flownote-frames-'));const video=path.join(dir,'clip.mp4'),subs=path.join(dir,'subs.txt');await fs.writeFile(subs,'完整字幕内容');
 const media=new LocalMedia({directory:dir});const ffmpeg=await media.tool('ffmpeg');assert(ffmpeg,'FFmpeg required for real extraction test');
 await run(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=320x240:d=2','-c:v','mpeg4',video]);
 const result=await media.extract(video,undefined,subs,true);assert.equal(result.frames.length,5);assert(result.frames.every(frame=>frame.dataUrl.startsWith('data:image/jpeg;base64,')));assert.equal(result.transcript,'完整字幕内容');
 assert(!(await fs.readdir(dir)).some(name=>name.startsWith('media-')));
});

test('keeps numeric cue text and excludes WebVTT notes and cue identifiers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flownote-vtt-'));const file=path.join(dir,'sample.vtt');
 await fs.writeFile(file,'WEBVTT\n\nNOTE private production note\nnot for upload\n\nscene-one\n00:00:00.000 --> 00:00:01.000\n2026\n\nscene-two\n00:00:01.000 --> 00:00:02.000\n字幕正文');
 assert.equal(await readSubtitles(file),'2026\n字幕正文');
});
