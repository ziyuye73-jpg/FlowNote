const projects=[{id:'douyin-video',name:'抖音视频发布',description:'选择视频与字幕，AI 生成标题话题，自动上传填写；发布由勾选项决定。'}];
function getProject(id){const project=projects.find(item=>item.id===id);if(!project)throw new Error('此自动化项目尚未接入执行器，不能运行。');return project;}
module.exports={projects,getProject};
