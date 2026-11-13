function describeFlow(data, id, fileName) {
  const steps=data.steps || [];
  const upload=steps.some(step=>step.action==='manual' && step.target?.inputType==='file') || steps.some(step=>step.action==='click' && step.target?.name==='上传视频');
  const fill=steps.some(step=>step.action==='fill');
  const site=steps.some(step=>{try{return new URL(step.pageUrl || step.url).hostname==='creator.douyin.com';}catch{return false;}});
  const publishes=steps.some(step=>step.action==='click' && /^发布$/.test(step.target?.name || ''));
  const compatible=site && upload && fill && !(data.branches || []).length;
  return {id,title:data.title || '未命名流程',fileName,steps:steps.length,publishes,compatible,
    mode:'抖音发布准备适配器（非逐条回放）',
    scope:compatible ? `按所选录制关联抖音上传和填写任务，文案使用本次AI结果；${publishes?'录制包含发布；默认不点击发布，勾选发布选项后核对通过即自动点击一次发布。':'执行停在发布前。'}` : '当前执行器不支持此录制（需抖音上传填写主流程且无分支），不会自动执行。'};
}
module.exports={describeFlow};
