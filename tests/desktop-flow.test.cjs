const {test}=require('node:test');const assert=require('node:assert/strict');const {describeFlow}=require('../desktop/flow-binding.cjs');
test('selected flow exposes its JSON and skipped publication instead of claiming full replay',()=>{
 const data={title:'作品发布',steps:[{action:'navigate',url:'https://creator.douyin.com/'},{action:'manual',target:{inputType:'file'}},{action:'fill'},{action:'click',target:{name:'发布'}}]};
 const flow=describeFlow(data,'abc','wrr-test.json');assert.equal(flow.compatible,true);assert.equal(flow.fileName,'wrr-test.json');assert.equal(flow.publishes,true);assert.match(flow.scope,/不点击发布/);assert.match(flow.mode,/非逐条回放/);
 assert.equal(describeFlow({...data,branches:[{}]},'abc','x.json').compatible,false);
 assert.equal(describeFlow({steps:[]},'abc','x.json').compatible,false);
});
test('automation projects only expose implemented executors',()=>{
 const {projects,getProject}=require('../desktop/projects.cjs');
 assert.equal(projects.length,1);assert.equal(getProject('douyin-video').name,'抖音视频发布');
 assert.throws(()=>getProject('not-implemented'),/尚未接入/);
});
