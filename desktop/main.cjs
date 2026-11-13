const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
if (app.isPackaged) process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'browsers');
const { WorkflowStore } = require('./workflow.cjs');
const { BrowserSession } = require('./browser.cjs');
const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const store = new WorkflowStore(root);
const { RecordingLibrary } = require('./library.cjs');
const library = new RecordingLibrary(path.join(app.getPath('userData'), 'recordings'));
const { CopyGenerator } = require('./ai.cjs');
const generator = new CopyGenerator(app.getPath('userData'), safeStorage);
const { LocalMedia } = require('./media.cjs');
const media = new LocalMedia({directory:app.getPath('userData'),onProgress:progress});
handle('media-status', () => media.status());
let selectedSubtitle=null, generated=null, generationController=null;
let window, session, running=false, opening=null, stopping=null;
handle('choose-subtitle',async()=>{
  if(running) throw new Error('任务执行中不能更换字幕。');
  const result=await dialog.showOpenDialog(window,{title:'选择视频对应字幕',filters:[{name:'字幕',extensions:['srt','vtt','txt']}],properties:['openFile']});
  if(result.canceled)return null;
  selectedSubtitle=result.filePaths[0];generated=null;return selectedSubtitle;
});
handle('model-settings', () => generator.publicSettings());
handle('model-list', input => generator.models(input));
handle('model-test', input => generator.test(input));
handle('save-model-settings', async input => {
  if(running) throw new Error('任务执行中不能修改模型配置。');
  const result=await generator.save(input); generated=null; return result;
});
async function generate(videoPath) {
  await generator.credentials();
  const settings=await generator.publicSettings();
  progress({stage:'analyzing',message:'正在读取你提供的字幕，不进行语音识别…'});
  const subtitleFile=selectedSubtitle;
  if(!subtitleFile) throw new Error('请先选择对应字幕。');
  const content = await media.extract(videoPath,generationController?.signal,subtitleFile,!!settings.visionModel);
  const subtitleHash=content.subtitleHash;
  if(generationController?.signal.aborted) throw new Error('已停止任务。');
  progress({stage:'generating',message:`字幕读取完成，发送字幕文字与 ${content.frames.length} 张关键帧到配置模型进行内容分析…`});
  const copy = await generator.generate(videoPath,generationController?.signal,content);
  if(generationController?.signal.aborted) throw new Error('已停止任务。');
  if(subtitleHash!==require('node:crypto').createHash('sha256').update(await require('node:fs/promises').readFile(subtitleFile)).digest('hex')) throw new Error('分析期间字幕被修改，请重新生成。');
  generated = { videoPath, copy, subtitlePath:subtitleFile, subtitleHash };
  window.webContents.send('generated-copy',copy);
  progress({stage:'generated',message:`已生成标题：${copy.title}；话题：${copy.topics.map(x=>'#'+x).join(' ')}（未核实实时热度）`});
  return copy;
}
handle('generate-copy', async videoPath => {
  if(running) throw new Error('任务正在执行，请稍后再生成。');
  running=true; generationController=new AbortController();
  try { return await generate(videoPath); }
  finally { running=false; generationController=null; }
});
async function openBrowser() {
  if (stopping) await stopping;
  if (!opening) {
    const browser = getSession();
    opening = browser.open().finally(() => { opening = null; });
  }
  return opening;
}
const uiUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
function progress(event) { if (window && !window.isDestroyed()) window.webContents.send('progress', event); }
function handle(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame.url !== uiUrl) throw new Error('不允许的调用来源。');
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { progress({ stage: 'error', message: error.message }); return { ok: false, error: error.message }; }
  });
}
function getSession() {
  if (!session || session.cancelled) session = new BrowserSession({
    profileDir: path.join(app.getPath('userData'), 'browser-profile'),
    extensionDir: path.join(root, 'extension'),
    browserPath: require('playwright').chromium.executablePath(),
    onProgress: progress
  });
  return session;
}
handle('import-recording', async () => {
  const result = await dialog.showOpenDialog(window, { title: '导入 FlowNote 录制', filters: [{ name: '录制 JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (result.canceled) return null;
  const data = await store.importFile(result.filePaths[0]);
  await library.add(data);
  return data;
});
const {describeFlow}=require('./flow-binding.cjs');
const {projects,getProject}=require('./projects.cjs');
let selectedProject='douyin-video';
handle('list-projects',()=>({projects,selectedId:selectedProject}));
handle('select-project',id=>{
  if(running)throw new Error('任务执行中不能切换项目。');
  const project=getProject(id);selectedProject=project.id;return project;
});
let selectedFlow=null;
handle('select-flow',async id=>{
  if(running)throw new Error('任务执行中不能切换流程。');
  const entries=await library.list();const entry=entries.find(item=>item.id===id);
  if(!entry)throw new Error('请选择库中存在的录制 JSON。');
  const data=JSON.parse(await require('node:fs/promises').readFile(library.file(id),'utf8'));
  await store.validate(data);
  selectedFlow=describeFlow(data,id,entry.fileName);
  await require('node:fs/promises').writeFile(path.join(app.getPath('userData'),'selected-flow.json'),JSON.stringify({id,projectId:selectedProject}));
  return selectedFlow;
});
handle('current-flow',async()=>{
  if(selectedFlow)return selectedFlow;
  try{
    const saved=JSON.parse(await require('node:fs/promises').readFile(path.join(app.getPath('userData'),'selected-flow.json'),'utf8'));
    const entry=(await library.list()).find(item=>item.id===saved.id);
    if(entry){const data=JSON.parse(await require('node:fs/promises').readFile(library.file(entry.id),'utf8'));selectedFlow=describeFlow(data,entry.id,entry.fileName);}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  return selectedFlow;
});
handle('delete-recording',async id=>{
  if(running)throw new Error('任务运行中不能删除录制。');
  const entry=(await library.list()).find(item=>item.id===id);
  if(!entry)throw new Error('录制文件不存在。');
  const result=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','移到废纸篓'],defaultId:0,cancelId:0,message:`删除“${entry.title}”？`,detail:'仅删除客户端录制库中的这一份 JSON，原始导入文件不变；可从系统废纸篓恢复。'});
  if(result.response!==1)return {deleted:false};
  const file=library.file(id);
  const resolved=await require('node:fs/promises').realpath(file);
  if(path.dirname(resolved)!==await require('node:fs/promises').realpath(library.directory))throw new Error('录制路径校验失败，未删除。');
  await shell.trashItem(resolved);
  if(selectedFlow?.id===id){selectedFlow=null;await require('node:fs/promises').writeFile(path.join(app.getPath('userData'),'selected-flow.json'),JSON.stringify({id:null}));}
  store.recording=null;
  return {deleted:true};
});
handle('list-recordings', () => library.list());
handle('open-recording', id => store.importFile(library.file(id)));
handle('reveal-recording', id => { shell.showItemInFolder(library.file(id)); return true; });
handle('recordings-folder', async () => {
  await library.list();
  const error = await shell.openPath(library.directory);
  if (error) throw new Error(error);
});
handle('update-recording', async data => {
  const result = await store.update(data);
  await library.add(result);
  return result;
});
handle('export-skill', async name => {
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error('Skill 名称须为小写英文、数字及连字符，最多 64 字符。');
  const result = await dialog.showOpenDialog(window, { title: '选择 Skill 输出父文件夹（已有 Skill 不会覆盖）', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return null;
  return store.exportSkill(result.filePaths[0], name);
});
handle('choose-video', async () => {
  const result = await dialog.showOpenDialog(window, { title: '选择本次上传的视频', properties: ['openFile'], filters: [{ name: '视频', extensions: ['mp4', 'mov', 'm4v', 'webm'] }] });
  if(result.canceled) return null;
  generated=null;
  return result.filePaths[0];
});
handle('open-browser', async () => {
  if (running) throw new Error('已有任务正在运行。');
  await openBrowser(); return true;
});
handle('prepare-video', async input => {
  const project=getProject(input?.projectId);
  if(project.id!==selectedProject)throw new Error('自动化项目已变化，请重新选择。');
  if(!selectedFlow?.compatible)throw new Error('请先选择一个支持的流程 JSON，再开始执行。');
  progress({stage:'flow',message:`本次流程：${selectedFlow.title} · ${selectedFlow.fileName}；${selectedFlow.scope}`});
  if (running) throw new Error('已有任务正在运行。');
  running = true;
  try {
    generationController=new AbortController();
    let copy;
    if(generated?.videoPath === input?.videoPath) {
      const stat=await require('node:fs/promises').stat(input.videoPath);
      const fingerprint=require('node:crypto').createHash('sha256').update(`${input.videoPath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
      const subtitleHash=selectedSubtitle ? require('node:crypto').createHash('sha256').update(await require('node:fs/promises').readFile(selectedSubtitle)).digest('hex') : null;
      if(fingerprint===generated.copy.fingerprint && selectedSubtitle===generated.subtitlePath && subtitleHash===generated.subtitleHash) copy=generated.copy;
    }
    if(!copy) copy=await generate(input?.videoPath);
    if(generationController.signal.aborted) throw new Error('已停止任务。');
    const preparation = {videoPath:input.videoPath,resume:input.resume===true,title:copy.title,topics:copy.topics};
    if (stopping) await stopping;
    if (opening) await opening;
    if(generationController.signal.aborted) throw new Error('已停止任务。');
    const browser = getSession();
    if (!browser.page || browser.page.isClosed()) {
      if (input?.resume) throw new Error('没有可继续的编辑页面，请先打开专用浏览器并进入已上传视频的编辑页。');
      await openBrowser();
    }
    if(generationController.signal.aborted) throw new Error('已停止任务。');
    const result=await browser.prepare(preparation);
    if(input.publish!==true)return result;
    if(!selectedFlow.publishes)throw new Error('所选 JSON 没有发布步骤，已停在发布前。');
    progress({stage:'publish-authorized',message:'已按本次勾选的发布选项自动提交，不再弹出重复确认。'});
    if(generationController.signal.aborted)throw new Error('已停止任务。');
    return await browser.publishPrepared(result);
  }
  finally { running = false; generationController=null; }
});
handle('cancel-run', async () => {
  generationController?.abort();
  if (!stopping) stopping = Promise.resolve(session?.cancel()).finally(() => { stopping = null; });
  await stopping;
  return true;
});
handle('show-extension', async () => { const error = await shell.openPath(path.join(root, 'extension')); if (error) throw new Error(error); });
handle('status', async () => {
  let python;
  try { const runtime = await store.runtime(); python = runtime.command; } catch (error) { python = error.message; }
  return { version: app.getVersion(), python, profile: path.join(app.getPath('userData'), 'browser-profile') };
});
app.whenReady().then(() => {
  window = new BrowserWindow({ width: 1220, height: 840, minWidth: 960, minHeight: 680, title: 'FlowNote · 流程笔记', backgroundColor: '#f5f6fa',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== uiUrl) event.preventDefault(); });
  window.loadFile(path.join(__dirname, 'index.html'));
});
let closing = false;
app.on('before-quit', event => {
  generationController?.abort();
  if (closing || !session) return;
  event.preventDefault(); closing = true;
  Promise.resolve(session.cancel()).catch(() => {}).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
