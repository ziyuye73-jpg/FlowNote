const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {CopyGenerator,parseCopy,configInput}=require('../desktop/ai.cjs');
const secure={isEncryptionAvailable:()=>true,encryptString:x=>Buffer.from('encrypted:'+x),decryptString:x=>x.toString().slice(10)};
test('sends supplied subtitle content instead of filename and keeps key out of public settings',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flownote-ai-'));
 const video=path.join(dir,'为什么达成目标更焦虑.mp4');await fs.writeFile(video,'fixture');
 let request;
 const ai=new CopyGenerator(dir,secure,async(url,options)=>{request={url,options};return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({title:'达成目标，为什么还焦虑',topics:['目标','焦虑','认知']})}}]})}});
 assert.equal((await ai.publicSettings()).hasKey,false);
 await ai.save({baseUrl:'https://api.deepseek.com',model:'deepseek-chat',apiKey:'test-key'});
 const settings=await ai.publicSettings();assert.equal(settings.hasKey,true);assert(!JSON.stringify(settings).includes('test-key'));
 const result=await ai.generate(video,undefined,{transcript:"真实字幕讨论目标与焦虑",frames:[],duration:null});assert.equal(result.topics.length,3);
 assert.equal(request.url,'https://api.deepseek.com/v1/chat/completions');
 assert(!request.options.body.includes(dir));assert(request.options.body.includes('真实字幕讨论目标与焦虑'));assert(!request.options.body.includes('为什么达成目标更焦虑'));
 assert.equal(request.options.redirect,'error');
 const persisted=await fs.readFile(path.join(dir,'model.json'),'utf8');assert(!persisted.includes('test-key'));
 const restarted=new CopyGenerator(dir,secure);assert.equal((await restarted.publicSettings()).hasKey,true);
 await assert.rejects(ai.save({baseUrl:'https://different.example',model:'model'}),/重新填写/);
});
test('rejects invalid endpoints and untrusted malformed AI outputs',()=>{
 for(const url of ['http://api.example','https://user:key@api.example','https://api.example/?key=x'])assert.throws(()=>configInput({baseUrl:url,model:'model'}));
 for(const content of ['not JSON',JSON.stringify({title:'a'.repeat(31),topics:['目标','焦虑']}),JSON.stringify({title:'标题',topics:['#目标','焦虑']})])assert.throws(()=>parseCopy(content));
});
test('missing key fails before network request; HTTP errors do not leak provider payload',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flownote-ai-'));const video=path.join(dir,'视频.mp4');await fs.writeFile(video,'x');
 let calls=0;const ai=new CopyGenerator(dir,secure,async()=>{calls++;return {ok:false,status:401}});
 await assert.rejects(ai.generate(video,undefined,{transcript:"真实字幕讨论目标与焦虑",frames:[],duration:null}),/API Key/);assert.equal(calls,0);
 await ai.save({baseUrl:'https://api.deepseek.com',model:'deepseek-chat',apiKey:'test-key'});
 await assert.rejects(ai.generate(video,undefined,{transcript:"真实字幕讨论目标与焦虑",frames:[],duration:null}),/HTTP 401/);
});

test('supports root, v1 and full endpoints plus model discovery with 404 fallback',async()=>{
 const {endpoints}=require('../desktop/ai.cjs');
 assert.deepEqual(endpoints('https://relay.example/v1','models'),['https://relay.example/v1/models']);
 assert.deepEqual(endpoints('https://relay.example/v1/chat/completions','models'),['https://relay.example/v1/models']);
 assert.equal(configInput({baseUrl:'http://127.0.0.1:11434/v1',model:'local'}).model,'local');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flownote-models-'));
 const urls=[];let mode='models';
 const ai=new CopyGenerator(dir,secure,async(url,options)=>{
  urls.push(url);
  if(url.includes('/v1/'))return {ok:false,status:404};
  return {ok:true,status:200,json:async()=>mode==='models'?{data:[{id:'deepSeek-v4.1-flash-1017'},{id:'gpt-custom'}]}:{choices:[{message:{content:'OK'}}]}};
 });
 const input={baseUrl:'https://relay.example',model:'deepSeek-v4.1-flash-1017',apiKey:'relay-key'};
 assert.deepEqual(await ai.models(input),['deepSeek-v4.1-flash-1017','gpt-custom']);
 assert.deepEqual(urls,['https://relay.example/v1/models','https://relay.example/models']);
 mode='test';const result=await ai.test(input);assert.equal(result.model,input.model);assert.equal(result.url,'https://relay.example/chat/completions');
});
