const $ = id => document.getElementById(id);
const api = window.flowNote;
let recording = null, dirty = false, busy = false, libraryEntries = [], activeFlow = null;
function switchTab(name) {
  for (const tab of ['workbench','files','editor','settings']) $('tab-'+tab).hidden = tab !== name;
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('selected',button.dataset.tab === name);
    button.setAttribute('aria-current',button.dataset.tab === name ? 'page' : 'false');
  });
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click',()=>switchTab(button.dataset.tab)));
function overview() {
  $('stat-files').textContent = libraryEntries.length;
  $('stat-steps').textContent = recording ? recording.steps.length + (recording.branches || []).reduce((n,b)=>n+b.steps.length,0) : 0;
  $('stat-branches').textContent = recording?.branches?.length || 0;
  $('stat-state').textContent = $('run-state').textContent;
  const count = $('log').children.length;
  $('stat-logs').textContent = count;
  $('log-count').textContent = `共 ${count} 条`;
}
function showLibrary() {
  const query = $('library-search').value.trim().toLowerCase();
  const entries = libraryEntries.filter(entry => entry.title.toLowerCase().includes(query));
  $('library-list').replaceChildren();
  if (!entries.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = libraryEntries.length ? '没有匹配的录制。' : '还没有录制文件，点击右上角导入后会自动保存到这里。'; $('library-list').append(empty); }
  for (const entry of entries) {
    const row = document.createElement('div'); row.className = 'library-row';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = entry.title;
    const detail = document.createElement('small'); detail.textContent = `${entry.fileName} · ${entry.steps} 步 · ${new Date(entry.savedAt).toLocaleString()}`;
    info.append(title,detail);
    const open = document.createElement('button'); open.className='secondary'; open.textContent='打开';
    open.addEventListener('click', () => (async () => {
      if (dirty) { notice('当前有未保存编辑，请先点击“应用编辑”再打开另一份录制。',true); return; }
      recording = await call(() => api.openRecording(entry.id)); dirty = false; renderRecording(); notice(`已打开：${entry.title}`);
    })().catch(() => {}));
    const reveal = document.createElement('button'); reveal.className='secondary'; reveal.textContent='定位文件';
    reveal.addEventListener('click',()=>call(()=>api.revealRecording(entry.id)).catch(()=>{}));
    const remove=document.createElement('button');remove.className='secondary';remove.textContent='删除文件';
    remove.addEventListener('click',()=> (async()=>{
      if(dirty){notice('请先保存当前编辑，再删除文件。',true);return;}
      const result=await call(()=>api.deleteRecording(entry.id));
      if(result.deleted){recording=null;dirty=false;$('recording').hidden=true;$('empty').hidden=false;$('export').disabled=true;await refreshLibrary();notice('已移到系统废纸篓，原始导入文件不变。');}
    })().catch(()=>{}));
    row.append(info,open,reveal,remove); $('library-list').append(row);
  }
}
async function refreshLibrary() {
  libraryEntries = await call(() => api.listRecordings()); showLibrary(); overview();
  $('flow-select').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='请选择本次执行关联的 JSON';$('flow-select').append(empty);
  for(const item of libraryEntries){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.title} · ${item.fileName} · ${item.steps} 步`;$('flow-select').append(option);}
  showFlow(await call(()=>api.currentFlow()));
}
function showFlow(flow){
  activeFlow=flow;$('flow-select').value=flow?.id || '';
  $('publish-enabled').checked=false;$('publish-enabled').disabled=!flow?.publishes;
  $('publish-hint').textContent=flow?.publishes ? '此JSON包含发布步骤。默认不发布；开启后填写核对通过将自动点击一次发布，不再弹窗。' : '此JSON没有发布步骤，不能开启自动点击发布。';
  $('flow-details').textContent=flow ? `文件：${flow.fileName}\n流程：${flow.title} · ${flow.steps} 步\n执行方式：${flow.mode}\n${flow.scope}` : '尚未选择流程，不会开始上传。';
}
$('flow-select').addEventListener('change',()=>{
  const id=$('flow-select').value;
  if(!id){$('flow-select').value=activeFlow?.id || '';return;}
  call(()=>api.selectFlow(id)).then(showFlow).catch(()=>{$('flow-select').value=activeFlow?.id || '';});
});
listen('view-flow',async()=>{if(!activeFlow){notice('请先选择流程 JSON。',true);return;}if(dirty){notice('先保存当前编辑再查看其他流程。',true);return;}recording=await call(()=>api.openRecording(activeFlow.id));renderRecording();});
listen('import-flow',async()=>{const data=await call(()=>api.importRecording());if(data){recording=data;dirty=false;await refreshLibrary();switchTab('workbench');notice('已导入，请在当前流程 JSON 中选择。');}});
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
async function call(action) {
  try { const response = await action(); if (!response.ok) throw new Error(response.error); return response.value; }
  catch (error) { notice(error.message, true); throw error; }
}
function listen(id, action) { $(id).addEventListener('click', () => action().catch(() => {})); }
const labels = { navigate:'页面跳转',click:'点击',fill:'填写',select:'选择',check:'勾选',submit:'提交',keypress:'按键',manual:'手动操作',note:'说明',wait:'等待',drag:'拖动',scroll:'滚动' };
function routeSteps() { return $('route').value === 'main' ? recording.steps : recording.branches.find(b => b.id === $('route').value).steps; }
function renderSteps() {
  const steps = routeSteps();
  const branch = recording.branches?.find(b => b.id === $('route').value);
  $('route-info').textContent = branch ? `步骤 ${branch.afterStepId} 后分支：${branch.condition}` : '主路线 · 可删除非分支起点的步骤，或修改填写示例。';
  $('steps').replaceChildren();
  const anchors = new Set((recording.branches || []).map(b => b.afterStepId));
  steps.forEach((step, index) => {
    const row = document.createElement('div'); row.className = 'step';
    const number = document.createElement('span'); number.className = 'id'; number.textContent = step.id || index + 1;
    const body = document.createElement('div'); body.className = 'body';
    const title = document.createElement('strong'); title.textContent = `${labels[step.action] || step.action} · ${step.target?.name || step.target?.label || step.target?.placeholder || step.reason || (step.seconds ? step.seconds + ' 秒' : '')}`;
    const detail = document.createElement('small'); detail.textContent = step.url || ''; detail.title = step.url || '';
    body.append(title, detail);
    if (['fill','select','note'].includes(step.action)) {
      const input = document.createElement('input'); input.value = step.action === 'note' ? step.note || '' : step.value || '';
      input.placeholder = '运行时填写；留空则不保留示例'; input.maxLength = step.action === 'note' ? 1000 : 4000;
      input.setAttribute('aria-label', `步骤 ${step.id || index + 1} 的示例或说明`);
      input.addEventListener('input', () => { if (step.action === 'note') step.note = input.value; else if (input.value) step.value = input.value; else delete step.value; dirty = true; });
      body.append(input);
    }
    const remove = document.createElement('button'); remove.textContent = anchors.has(step.id) ? '分支起点' : '删除'; remove.disabled = anchors.has(step.id);
    remove.addEventListener('click', () => { steps.splice(index, 1); dirty = true; renderSteps(); });
    row.append(number, body, remove); $('steps').append(row);
  });
  $('count').textContent = `${recording.steps.length + (recording.branches || []).reduce((n,b) => n + b.steps.length,0)} 步`;
}
function renderRecording() {
  $('empty').hidden = true; $('recording').hidden = false; $('export').disabled = false;
  $('flow-title').value = recording.title || ''; $('goal').value = recording.goal || '';
  $('route').replaceChildren();
  for (const [value, text] of [['main','主路线'], ...(recording.branches || []).map(b => [b.id,b.name || b.id])]) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; $('route').append(option);
  }
  renderSteps(); overview(); switchTab('editor');
}
async function saveEdits() {
  if (!recording) return;
  recording.title = $('flow-title').value; recording.goal = $('goal').value;
  recording = await call(() => api.updateRecording(recording)); dirty = false; await refreshLibrary();
}
$('route').addEventListener('change', renderSteps);
for (const id of ['flow-title','goal']) $(id).addEventListener('input', () => { dirty = true; });
listen('import', async () => {
  const data = await call(() => api.importRecording());
  if (data) { recording = data; dirty = false; renderRecording(); await refreshLibrary(); notice('录制已导入并保存到“我的录制文件”，下次打开客户端仍可找到。'); }
});
listen('save', async () => { await saveEdits(); notice('编辑已应用，原始录制文件保持原样。'); });
listen('export', async () => {
  if (dirty) await saveEdits();
  const result = await call(() => api.exportSkill($('skill-name').value));
  if (result) notice(`Skill 草稿已生成：${result.skillPath}\n需实际运行验证；不会自动安装或覆盖已有 Skill。`);
});
listen('choose', async () => { const file = await call(() => api.chooseVideo()); if (file) { $('video').value = file; $('copy-preview').textContent='已选择视频，请选对应字幕，执行时根据视频内容生成文案。'; } });
function showCopy(copy) { $('copy-preview').textContent=`标题：${copy.title}\n话题：${copy.topics.map(x=>'#'+x).join(' ')}\n依据：${copy.analysisMode} · ${copy.frameCount} 张画面\n${copy.topicSource}`; }
api.onGeneratedCopy(showCopy);
async function loadModel() {
  const config=await call(()=>api.modelSettings());
  $('model-url').value=config.baseUrl; $('model-name').value=config.model; $('vision-model').value=config.visionModel || '';
  $('model-status').textContent=(config.hasKey ? 'API Key 已配置。' : '尚未配置 API Key。')+(config.secureStorage ? '密钥使用系统安全存储加密保存。' : '系统加密不可用，密钥仅保留在当前会话。');
}
function modelInput() {return {baseUrl:$('model-url').value.trim(),model:$('model-name').value.trim() || 'pending-selection',apiKey:$('model-key').value.trim()};}
async function modelOperation(id,action) {
  $(id).disabled=true; $('model-result').textContent='正在请求你配置的模型服务…';
  try {await action();} catch(error) {$('model-result').textContent=error.message;throw error;} finally {$(id).disabled=false;}
}
listen('fetch-models',()=>modelOperation('fetch-models',async()=>{
  const models=await call(()=>api.modelList(modelInput()));
  $('model-options').replaceChildren();$('model-select').replaceChildren();
  const current=$('model-name').value;
  for(const id of models){const option=document.createElement('option');option.value=id;option.textContent=id;$('model-options').append(option);$('model-select').append(option.cloneNode(true));}
  if(!models.includes(current)) $('model-name').value=models[0];
  $('model-select').value=$('model-name').value;$('model-select').hidden=false;
  $('model-result').textContent=`已获取 ${models.length} 个模型，请选择并保存配置。`;
}));
$('model-select').addEventListener('change',()=>{$('model-name').value=$('model-select').value;});
listen('test-model',()=>modelOperation('test-model',async()=>{
  const result=await call(()=>api.modelTest(modelInput()));
  $('model-result').textContent=`${result.message} 模型：${result.model}；请求地址：${result.url}`;
}));
listen('save-model',async()=>{await call(()=>api.saveModelSettings({baseUrl:$('model-url').value,model:$('model-name').value,visionModel:$('vision-model').value.trim(),apiKey:$('model-key').value.trim()}));$('model-key').value='';await loadModel();notice('模型配置已保存。');});
listen('generate-copy',async()=>{
  if(!$('video').value || !$('subtitle').value){notice('请先选择视频。',true);return;}
  running(true);
  try {showCopy(await call(()=>api.generateCopy($('video').value)));notice('AI 文案已生成，下次执行将使用这版文案。');}
  finally{running(false);}
});
loadModel().catch(()=>{});
listen('choose-subtitle',async()=>{const file=await call(()=>api.chooseSubtitle());if(file){$('subtitle').value=file;$('copy-preview').textContent='字幕已选择，下一次按字幕内容分析。';}});
listen('extension', () => call(() => api.showExtension()));
listen('browser', async () => {
  $('browser').disabled = true;
  $('browser').textContent = '正在启动并加载页面…';
  notice('正在启动专用浏览器，请稍候。');
  try { await call(() => api.openBrowser()); notice('专用浏览器已打开，请确认抖音登录账号。'); }
  finally { $('browser').disabled = false; $('browser').textContent = '打开专用浏览器 / 登录抖音 ↗'; }
});
function running(value) { busy = value; queueMicrotask(overview); for (const id of ['run','choose','browser','resume-fill','generate-copy','choose-subtitle','flow-select','import-flow','publish-enabled','project-select']) $(id).disabled = value; $('cancel').disabled = !value; $('run-state').textContent = value ? '正在执行' : '已停止'; }
async function prepare(resume = false) {
  if (busy) return;
  if(!activeFlow?.compatible){notice('请先选择支持的流程 JSON。',true);return;}
  const input = { projectId:$('project-select').value, resume, publish:$('publish-enabled').checked, videoPath: $('video').value };
  if (!input.videoPath || !$('subtitle').value) { notice('请先选择视频，请同时选择对应字幕。', true); return; }
  $('log').replaceChildren(); running(true);
  try {
    const result = await call(() => api.prepareVideo(input));
    notice(result.published ? '已点击发布并收到页面反馈，请到内容管理确认审核和可见状态。' : result.verified ? '准备完成：已核对上传、标题和话题。请到浏览器检查，当前未发布。' : '执行已结束，请检查浏览器中的实际结果。');
    $('run-state').textContent = result.published ? '已提交' : result.verified ? '准备完成' : '待检查';
  } finally { const text = $('run-state').textContent; running(false); if (text === '准备完成' || text === '待检查' || text === '已提交') $('run-state').textContent = text; }
}
listen('run', () => prepare(false));
listen('resume-fill', () => prepare(true));
listen('cancel', async () => { await call(() => api.cancel()); notice('已请求停止。正在进行的上传可能已到达网站，请检查浏览器。'); });
$('library-search').addEventListener('input',showLibrary);
listen('library-folder', () => call(() => api.recordingsFolder()));
listen('clear-log', async () => { $('log').replaceChildren(); overview(); });
refreshLibrary().catch(()=>{});
api.onProgress(data => {
  const item = document.createElement('li'); item.textContent = `${new Date().toLocaleTimeString()}  ${data.message}`; $('log').append(item); $('log').scrollTop = $('log').scrollHeight; overview();
});
call(() => api.status()).then(status => { $('environment').textContent = `v${status.version} · Python：${status.python}`; }).catch(() => {});

async function loadProjects(){
 const result=await call(()=>api.listProjects());$('project-select').replaceChildren();
 for(const project of result.projects){const option=document.createElement('option');option.value=project.id;option.textContent=project.name;$('project-select').append(option);}
 $('project-select').value=result.selectedId;
 const project=result.projects.find(item=>item.id===result.selectedId);
 if(project){$('automation-title').textContent=project.name;$('project-description').textContent=project.description;}
}
$('project-select').addEventListener('change',()=>call(()=>api.selectProject($('project-select').value)).then(project=>{
 $('automation-title').textContent=project.name;$('project-description').textContent=project.description;$('publish-enabled').checked=false;
}).catch(()=>{}));
loadProjects().catch(()=>{});
