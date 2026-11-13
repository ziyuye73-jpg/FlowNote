const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('flowNote', {
  listProjects: () => ipcRenderer.invoke('list-projects'),
  selectProject: id => ipcRenderer.invoke('select-project',id),
  deleteRecording: id => ipcRenderer.invoke('delete-recording',id),
  selectFlow: id => ipcRenderer.invoke('select-flow',id),
  currentFlow: () => ipcRenderer.invoke('current-flow'),
  chooseSubtitle: () => ipcRenderer.invoke('choose-subtitle'),
  modelList: input => ipcRenderer.invoke('model-list',input),
  modelTest: input => ipcRenderer.invoke('model-test',input),
  modelSettings: () => ipcRenderer.invoke('model-settings'),
  saveModelSettings: input => ipcRenderer.invoke('save-model-settings',input),
  generateCopy: videoPath => ipcRenderer.invoke('generate-copy',videoPath),
  onGeneratedCopy: callback => { const listener=(_event,data)=>callback(data); ipcRenderer.on('generated-copy',listener); return ()=>ipcRenderer.removeListener('generated-copy',listener); },
  listRecordings: () => ipcRenderer.invoke('list-recordings'),
  openRecording: id => ipcRenderer.invoke('open-recording', id),
  revealRecording: id => ipcRenderer.invoke('reveal-recording', id),
  recordingsFolder: () => ipcRenderer.invoke('recordings-folder'),
  importRecording: () => ipcRenderer.invoke('import-recording'),
  updateRecording: data => ipcRenderer.invoke('update-recording', data),
  exportSkill: name => ipcRenderer.invoke('export-skill', name),
  chooseVideo: () => ipcRenderer.invoke('choose-video'),
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  prepareVideo: input => ipcRenderer.invoke('prepare-video', input),
  cancel: () => ipcRenderer.invoke('cancel-run'),
  showExtension: () => ipcRenderer.invoke('show-extension'),
  status: () => ipcRenderer.invoke('status'),
  onProgress: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  }
});
