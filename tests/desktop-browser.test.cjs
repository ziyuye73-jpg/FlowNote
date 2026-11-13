'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { BrowserSession, isCreatorUrl, validatePreparation, HOME_URL, UPLOAD_URL } = require('../desktop/browser.cjs');

let temporary, videoPath, browser;
before(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'flownote-desktop-test-'));
  videoPath = path.join(temporary, 'fixture.mp4');
  // A synthetic file exercises file-input transfer; no real account or private recording is read.
  await fs.writeFile(videoPath, Buffer.from('isolated upload fixture'));
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  // Verify the absolute target before deleting this test's own temporary directory.
  if (temporary && path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('flownote-desktop-test-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

const options = () => ({ profileDir: path.join(temporary, 'profile'), extensionDir: path.resolve(__dirname, '../extension') });
const valid = () => ({ videoPath, title: '本地测试作品', topics: ['测试', '#知识'] });
const fixture = ({ plainText = false, tokenType = 'topic-id', login = false, ambiguous = false, pending = false, preview = false, hiddenUploading = false, noMedia = false } = {}) => `<!doctype html><meta charset="utf-8">
${login ? '<p>扫码登录</p>' : ''}
${hiddenUploading ? '<span hidden>正在上传</span><span style="visibility:hidden">处理中</span><p>帮助说明：上传中或处理中时请耐心等待</p>' : ''}
${preview ? `<div role="dialog"><h2>视频预览功能</h2><p>视频素材已按原始分辨率上传，预览处理中不会影响发布。</p><button onclick="this.parentElement.remove();window.dismissed++">我知道了</button></div>
${noMedia ? '' : '<img alt="视频预览" width="180" height="220" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22180%22 height=%22220%22%3E%3Crect width=%22180%22 height=%22220%22 fill=%22red%22/%3E%3C/svg%3E">'}` : ''}
<label>视频上传<input type="file" accept="video/*" onchange="window.uploads++;window.recordTransfer?.();${preview ? "history.replaceState({},'', '/creator-micro/content/post/video')" : pending ? '' : "document.querySelector('[role=status]').textContent='上传成功'"}"></label>
${ambiguous ? '<input type="file" accept="video/mp4">' : ''}
<p role="status"></p><input placeholder="填写作品标题">
<button type="button" onclick="document.querySelector('[role=combobox]').hidden=false">添加话题</button>
<input hidden role="combobox" aria-label="搜索话题" oninput="const option=document.querySelector('[role=option]');option.hidden=false;option.textContent='#'+this.value">
<div hidden role="option" onclick="const el=document.createElement('span');el.textContent=this.textContent;${plainText ? '' : "el.contentEditable='false';el.dataset.topicId='synthetic-topic'"};document.querySelector('[contenteditable=true]').append(el);this.hidden=true;document.querySelector('[role=combobox]').hidden=true"></div>
<div contenteditable="true" aria-label="作品描述" data-placeholder="添加作品简介"></div>
<button onclick="window.forbidden++">发布</button><button onclick="window.forbidden++">定时发布</button><button onclick="window.forbidden++">保存草稿</button>
<script>
window.uploads=0;window.forbidden=0;window.dismissed=0;window.spaces=[];
document.querySelector('[contenteditable=true]').addEventListener('keydown', event => {
  if (event.code !== 'Space') return;
  window.spaces.push({ trusted: event.isTrusted, text: event.currentTarget.textContent });
  const selection = getSelection();
  const node = selection.anchorNode;
  if (!event.isTrusted || node.nodeType !== Node.TEXT_NODE) return;
  const before = node.textContent.slice(0, selection.anchorOffset);
  const match = before.match(/#[\\p{L}\\p{N}_]+$/u);
  if (!match || ${plainText}) return;
  event.preventDefault();
  const range = document.createRange();
  range.setStart(node, selection.anchorOffset - match[0].length);
  range.setEnd(node, selection.anchorOffset);
  const token = document.createElement('span');
  token.textContent = match[0];
  ${tokenType === 'topic-id' ? "token.contentEditable='false';token.dataset.topicId='synthetic-topic';" : tokenType === 'opaque' ? "token.contentEditable='false';token.dataset.type='douyin-custom-entity';" : "token.contentEditable='false';token.dataset.topic='synthetic-topic';token.dataset.type='custom-topic';"}
  range.deleteContents();
  range.insertNode(token);
  const separator = document.createTextNode(' ');
  token.after(separator);
  range.setStart(separator, 1);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
});
</script>`;

async function isolated(settings = {}) {
  const context = await browser.newContext();
  let requests = 0;
  await context.route('**/*', route => {
    requests++;
    return route.fulfill({ contentType: 'text/html', body: fixture(settings) });
  });
  const page = await context.newPage();
  const progress = [];
  const session = new BrowserSession({ ...options(), onProgress: event => progress.push(event) }, { context, page, timeout: 450 });
  await session.open();
  return { context, page, session, progress, requests: () => requests };
}

test('creator whitelist checks exact HTTPS host and rejects lookalikes', () => {
  assert(isCreatorUrl(HOME_URL));
  assert(isCreatorUrl(UPLOAD_URL));
  for (const url of ['http://creator.douyin.com/', 'https://creator.douyin.com.evil.test/', 'https://douyin.com/', 'https://evil.test/?creator.douyin.com', 'https://user@creator.douyin.com/', 'https://creator.douyin.com:444/', 'javascript:alert(1)']) {
    assert.equal(isCreatorUrl(url), false, url);
  }
});

test('validates title, topics and local video path without silent truncation', () => {
  assert.deepEqual(validatePreparation(valid()), { videoPath, title: '本地测试作品', topics: ['测试', '知识'] });
  assert.equal(validatePreparation({ videoPath, title: ' 标题 ' }).title, '标题');
  for (const override of [
    { videoPath: 'relative.mp4' }, { videoPath: '/tmp/file.txt' }, { title: '' }, { title: '字'.repeat(31) },
    { title: '标题\n换行' }, { topics: '话题' }, { topics: ['测试', '#测试'] }, { topics: ['空 格'] },
    { topics: [''] }, { topics: ['#'] }, { topics: Array(6).fill('a') }
  ]) assert.throws(() => validatePreparation({ ...valid(), ...override }));
});

test('description accepts optional multiline text up to 1000 characters without truncation', () => {
  assert.equal(validatePreparation({ ...valid(), description: '说明\n第二行' }).description, '说明\n第二行');
  assert.equal(validatePreparation({ ...valid(), description: '字'.repeat(1000) }).description.length, 1000);
  for (const description of [null, 123, '字'.repeat(1001), '坏\x00文字']) {
    assert.throws(() => validatePreparation({ ...valid(), description }), { code: 'INVALID_DESCRIPTION' });
  }
  assert.equal(validatePreparation({ resume: true, title: '标题' }).resume, true);
});

test('screenshot-shaped image preview plus upload notice completes and dismisses only its notice', async () => {
  const { session, page } = await isolated({ preview: true, hiddenUploading: true });
  try {
    const result = await session.prepare({ ...valid(), description: '作品简介\n第二行' });
    assert.equal(result.evidence.upload.kind, 'editor-preview');
    assert.deepEqual(result.evidence.description, { value: '作品简介\n第二行', verified: true });
    assert.equal(await page.evaluate(() => window.dismissed), 1);
    assert.equal(await page.evaluate(() => window.forbidden), 0);
    assert.equal((await session._descriptionText(page.locator('[contenteditable=true]'))).trimEnd(), '作品简介\n第二行');
  } finally { await session.close(); }
});

test('hidden upload labels and prose containing processing do not block an explicit completion', async () => {
  const { session } = await isolated({ hiddenUploading: true });
  try { assert.equal((await session.prepare(valid())).verified, true); }
  finally { await session.close(); }
});

test('editor URL, title and upload notice without preview media are not completion evidence', async () => {
  const { session, page } = await isolated({ preview: true, noMedia: true });
  try {
    await assert.rejects(session.prepare(valid()), { code: 'VERIFICATION_FAILED' });
    assert.equal(await page.getByPlaceholder('填写作品标题').inputValue(), '');
    assert.equal(await page.evaluate(() => window.dismissed), 0);
  } finally { await session.close(); }
});

test('resume uses current verified editor without navigation or file transfer', async () => {
  const { session, page, requests } = await isolated({ preview: true });
  try {
    await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
    const before = requests();
    const result = await session.prepare({ resume: true, title: '继续填写', description: '简介', topics: ['测试'] });
    assert.equal(result.verified, true);
    assert.equal(result.evidence.video, undefined);
    assert.equal(requests(), before);
    assert.equal(await page.evaluate(() => window.uploads), 0);
    assert.equal(await page.evaluate(() => window.forbidden), 0);
  } finally { await session.close(); }
});

test('resume rejects upload page and an editor without completion evidence', async () => {
  const { session, page } = await isolated({ pending: true });
  try {
    await assert.rejects(session.prepare({ resume: true, title: '标题' }), { code: 'DOM_UNCERTAIN' });
    await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
    await assert.rejects(session.prepare({ resume: true, title: '标题' }), { code: 'VERIFICATION_FAILED' });
    assert.equal(await page.evaluate(() => window.uploads), 0);
  } finally { await session.close(); }
});

test('unrelated or ambiguous acknowledgement buttons are not clicked', async () => {
  const { session, page } = await isolated();
  try {
    await page.setContent('<div role="dialog">其他提醒<button onclick="window.clicked=true">我知道了</button></div>');
    await session._dismissPreviewNotice();
    assert.equal(await page.evaluate(() => window.clicked), undefined);
    await page.setContent('<div role="dialog">视频预览功能 视频素材已按原始分辨率上传<button onclick="window.clicked=true">我知道了</button><button onclick="window.clicked=true">我知道了</button></div>');
    await session._dismissPreviewNotice();
    assert.equal(await page.evaluate(() => window.clicked), undefined);
  } finally { await session.close(); }
});

test('visible compact uploading status blocks image preview completion', async () => {
  const { session, page } = await isolated({ preview: true });
  try {
    await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
    await page.locator('[role=status]').evaluate(el => { el.textContent = '正在上传 45%'; });
    assert.equal(await session._uploadEvidence(), null);
  } finally { await session.close(); }
});

test('final verification catches topic interactions corrupting description', async () => {
  const { session, page } = await isolated();
  const original = session._topicTokens.bind(session);
  let reads = 0;
  session._topicTokens = async () => {
    const result = await original();
    if (++reads === 2) await page.locator('[contenteditable=true]').evaluate(el => el.prepend('被修改'));
    return result;
  };
  try {
    await assert.rejects(session.prepare({ ...valid(), description: '简介' }), error => error.code === 'VERIFICATION_FAILED' && /简介/.test(error.message));
  } finally { await session.close(); }
});

test('open launches headed dedicated persistent profile with only the existing extension', async () => {
  let launch;
  let closed = 0;
  const page = { isClosed: () => false, setDefaultTimeout() {}, url: () => HOME_URL, async goto(url) { assert.equal(url, HOME_URL); } };
  const context = { async newPage() { return page; }, async close() { closed++; } };
  const session = new BrowserSession({ ...options(), browserPath: '/example/chromium' }, {
    chromium: { async launchPersistentContext(profile, config) { launch = { profile, config }; return context; } }
  });
  await session.open();
  assert.equal(launch.profile, options().profileDir);
  assert.equal(launch.config.headless, false);
  assert.equal(launch.config.channel, 'chromium');
  assert.equal(launch.config.executablePath, '/example/chromium');
  assert.deepEqual(launch.config.args, [`--disable-extensions-except=${options().extensionDir}`, `--load-extension=${options().extensionDir}`]);
  await session.close();
  await session.close();
  assert.equal(closed, 1);
});

test('open alone does not upload; explicit prepare verifies upload, title and selected tokens', async () => {
  const { page, session, progress } = await isolated();
  try {
    assert.equal(await page.evaluate(() => window.uploads), 0);
    const result = await session.prepare(valid());
    assert.equal(result.verified, true);
    assert.equal(result.published, false);
    assert.equal(result.evidence.url, UPLOAD_URL);
    assert.equal(result.evidence.video.size, (await fs.stat(videoPath)).size);
    assert.equal(result.evidence.upload.kind, 'upload-status');
    assert.deepEqual(result.evidence.title, { value: '本地测试作品', verified: true });
    assert.deepEqual(result.evidence.topics.map(item => item.topic), ['测试', '知识']);
    assert(result.evidence.topics.every(item => item.verified && item.token.id));
    assert.equal(await page.evaluate(() => window.uploads), 1);
    assert.equal(await page.evaluate(() => window.forbidden), 0);
    assert.equal(progress.at(-1).stage, 'prepared');
  } finally { await session.close(); }
});

test('Space commits trusted entities sequentially without replacing existing description or using topic buttons', async () => {
  for (const tokenType of ['topic-id', 'opaque', 'data-topic']) {
    const { session, page } = await isolated({ preview: true, tokenType });
    try {
      await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
      await page.locator('[contenteditable=true]').fill('已有简介\n第二行');
      // Another unrelated editor must not make description matching ambiguous.
      await page.evaluate(() => {
        const other = document.createElement('div');
        other.contentEditable = 'true'; other.textContent = '无关编辑框'; document.body.append(other);
        document.querySelector('button[onclick*="combobox"]').onclick = () => { window.forbidden++; };
      });
      const result = await session.prepare({ resume: true, title: '空格确认', topics: ['认知', '知识'] });
      assert.equal(result.verified, true);
      assert.deepEqual(result.evidence.topics.map(item => item.token.text), ['#认知', '#知识']);
      const editor = page.locator('[aria-label="作品描述"]');
      assert.equal((await session._descriptionText(editor)).trimEnd(), '已有简介\n第二行');
      const spaces = await page.evaluate(() => window.spaces);
      assert.equal(spaces.length, 2);
      assert(spaces.every(event => event.trusted));
      assert.match(spaces[0].text, /^已有简介.*#认知$/s);
      assert.match(spaces[1].text, /#认知.*#知识$/s);
      assert.equal(await page.evaluate(() => window.forbidden), 0);
    } finally { await session.close(); }
  }
});

test('topic Space still targets the editor after placeholder metadata disappears on input', async () => {
  const {session,page}=await isolated({preview:true});
  try {
    await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
    await page.evaluate(()=>{
      const editor=document.querySelector('[contenteditable=true]');
      editor.addEventListener('input',()=>{editor.removeAttribute('data-placeholder');editor.removeAttribute('aria-label');});
    });
    const result=await session.prepare({resume:true,title:'编辑框变化测试',topics:['认知','目标']});
    assert.equal(result.verified,true);
    assert.equal((await page.evaluate(()=>window.spaces)).length,2);
  } finally {await session.close();}
});

test('topic-editor zero-width placeholders do not count as changed description', async () => {
  const {session,page}=await isolated({preview:true});
  try {
    await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
    await page.evaluate(()=>{
      document.querySelector('[contenteditable=true]').addEventListener('keyup',event=>{
        if(event.code==='Space') event.currentTarget.append(document.createTextNode('\u200b\u00a0'));
      });
    });
    const result=await session.prepare({resume:true,title:'格式字符测试',topics:['认知','目标']});
    assert.equal(result.verified,true);
    assert.equal(result.evidence.topics.length,2);
  } finally {await session.close();}
});

test('explicit publishing clicks once and recognizes submission feedback, not audit success',async()=>{
 const {session,page}=await isolated({preview:true});
 try{
  await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
  const prepared=await session.prepare({resume:true,title:'发布测试',topics:[]});
  await page.evaluate(()=>{document.querySelectorAll('button').forEach(el=>{if(el.textContent==='发布')el.remove();});window.publishCount=0;const button=document.createElement('button');button.textContent='发布';button.onclick=()=>{window.publishCount++;history.pushState({},'', '/creator-micro/content/manage');};document.body.append(button);});
  const result=await session.publishPrepared(prepared);
  assert.equal(result.status,'submitted');assert.equal(await page.evaluate(()=>window.publishCount),1);
 }finally{await session.close();}
});

test('ambiguous description editors fail before typing topics', async () => {
  const { session, page } = await isolated({ preview: true });
  try {
    await page.goto('https://creator.douyin.com/creator-micro/content/post/video');
    await page.evaluate(() => {
      const editor = document.querySelector('[contenteditable=true]');
      editor.after(editor.cloneNode(true));
    });
    await assert.rejects(session.prepare({ resume: true, title: '标题', topics: ['认知'] }), { code: 'DOM_UNCERTAIN' });
    assert.deepEqual(await page.evaluate(() => window.spaces), []);
  } finally { await session.close(); }
});

test('caption text without topic token fails clearly instead of returning verified', async () => {
  const { page, session } = await isolated({ plainText: true });
  try {
    // Shorten only this verification wait; production keeps a 10-second DOM allowance.
    const originalWait = session._waitFor.bind(session);
    session._waitFor = (read, label) => originalWait(read, label, 450);
    await assert.rejects(session.prepare(valid()), error => {
      assert.equal(error.code, 'VERIFICATION_FAILED');
      assert.match(error.message, /token/);
      assert.equal(error.evidence.topics.length, 0);
      return true;
    });
    assert.equal(await page.evaluate(() => window.forbidden), 0);
  } finally { await session.close(); }
});

test('login requirement stops before file transfer', async () => {
  const { page, session } = await isolated({ login: true });
  try {
    await assert.rejects(session.prepare(valid()), { code: 'LOGIN_REQUIRED' });
    assert.equal(await page.evaluate(() => window.uploads), 0);
  } finally { await session.close(); }
});

test('ambiguous video inputs stop before file transfer', async () => {
  const { page, session } = await isolated({ ambiguous: true });
  try {
    await assert.rejects(session.prepare(valid()), { code: 'DOM_UNCERTAIN' });
    assert.equal(await page.evaluate(() => window.uploads), 0);
  } finally { await session.close(); }
});

test('missing, empty and non-file videos fail before navigation/upload', async () => {
  const { page, session, requests } = await isolated();
  try {
    const empty = path.join(temporary, 'empty.mp4');
    await fs.writeFile(empty, '');
    for (const file of [path.join(temporary, 'missing.mp4'), empty]) {
      await assert.rejects(session.prepare({ ...valid(), videoPath: file }));
    }
    const directory = path.join(temporary, 'directory.mp4');
    await fs.mkdir(directory);
    await assert.rejects(session.prepare({ ...valid(), videoPath: directory }), { code: 'INVALID_VIDEO' });
    assert.equal(requests(), 1);
    assert.equal(await page.evaluate(() => window.uploads), 0);
  } finally { await session.close(); }
});

test('off-domain pages cannot be operated', async () => {
  const { page, session } = await isolated();
  try {
    await page.goto('https://example.test/');
    await assert.rejects(session.prepare(valid()), { code: 'DOMAIN_NOT_ALLOWED' });
    assert.equal(await page.evaluate(() => window.uploads), 0);
  } finally { await session.close(); }
});

test('redirect out of creator fails before upload', async () => {
  const { context, page, session } = await isolated();
  try {
    const goto = page.goto.bind(page);
    page.goto = url => goto(url === UPLOAD_URL ? 'https://example.test/' : url);
    await assert.rejects(session.prepare(valid()), { code: 'DOMAIN_NOT_ALLOWED' });
    assert.equal(await page.evaluate(() => window.uploads), 0);
  } finally { await session.close(); }
});

test('cancel while waiting for upload closes only the owned context and interrupts promptly', async () => {
  const other = await browser.newContext();
  const { context, session } = await isolated({ pending: true });
  let closed = false;
  context.on('close', () => { closed = true; });
  const original = session._uploadEvidence.bind(session);
  session._uploadEvidence = async () => {
    const value = await original();
    void session.cancel();
    return value;
  };
  try {
    await assert.rejects(session.prepare(valid()), { code: 'CANCELLED' });
    await session.close();
    assert.equal(closed, true);
    const otherPage = await other.newPage();
    assert.equal(otherPage.isClosed(), false);
    await assert.rejects(session.open(), { code: 'CANCELLED' });
  } finally { await context.close(); await other.close(); }
});

test('an upload that never becomes ready fails without filling title', async () => {
  const { session, page } = await isolated({ pending: true });
  try {
    await assert.rejects(session.prepare(valid()), { code: 'VERIFICATION_FAILED' });
    assert.equal(await page.getByPlaceholder('填写作品标题').inputValue(), '');
    assert.equal(await page.evaluate(() => window.forbidden), 0);
  } finally { await session.close(); }
});

test('suggestion results with topic metadata are not selected editor tokens', async () => {
  const { session, page } = await isolated();
  try {
    await page.evaluate(() => {
      const el = document.createElement('span');
      el.dataset.topicId = 'suggestion-only';
      el.textContent = '#测试';
      document.body.append(el);
    });
    assert.deepEqual(await session._topicTokens(), []);
  } finally { await session.close(); }
});

test('final verification catches topic interaction rewriting the title', async () => {
  const { session } = await isolated();
  const originalTokens = session._topicTokens.bind(session);
  let reads = 0;
  session._topicTokens = async () => {
    const tokens = await originalTokens();
    if (++reads === 2) await session.page.getByPlaceholder('填写作品标题').fill('被改写');
    return tokens;
  };
  try {
    await assert.rejects(session.prepare(valid()), error => error.code === 'VERIFICATION_FAILED' && /标题/.test(error.message));
  } finally { await session.close(); }
});

test('cancel during browser launch closes the eventual owned context', async () => {
  let resolveLaunch, closed = 0;
  const launchStarted = new Promise(resolve => {
    resolveLaunch = resolve;
  });
  let started;
  const didStart = new Promise(resolve => { started = resolve; });
  const session = new BrowserSession(options(), {
    chromium: { launchPersistentContext() { started(); return launchStarted; } }
  });
  const opening = session.open();
  await didStart;
  let cancelFinished = false, releaseContext;
  const contextClosing = new Promise(resolve => { releaseContext = resolve; });
  const cancelling = session.cancel();
  assert.equal(session.cancel(), cancelling, 'repeated cancellation shares the actual completion');
  cancelling.then(() => { cancelFinished = true; });
  await assert.rejects(opening, { code: 'CANCELLED' });
  assert.equal(cancelFinished, false, 'profile may still be locked by the pending launch');
  resolveLaunch({ async close() { await contextClosing; closed++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelFinished, false, 'late context must finish closing before cancellation completes');
  releaseContext();
  await cancelling;
  assert.equal(cancelFinished, true);
  assert.equal(closed, 1);
  await session.cancel();
  assert.equal(closed, 1, 'cancellation remains idempotent after completion');
});

test('closing the browser externally allows open to launch a fresh context', async () => {
  const { EventEmitter } = require('node:events');
  let launched = 0;
  const contexts = [];
  const session = new BrowserSession(options(), {
    chromium: { async launchPersistentContext() {
      launched++;
      const context = new EventEmitter();
      const page = { isClosed: () => false, setDefaultTimeout() {}, url: () => HOME_URL, async goto() {} };
      context.newPage = async () => page;
      context.close = async () => context.emit('close');
      contexts.push(context);
      return context;
    } }
  });
  await session.open();
  await contexts[0].close();
  assert.equal(session.context, null);
  await session.open();
  assert.equal(launched, 2);
  assert.equal(session.context, contexts[1]);
  await session.close();
});

test('cancel from progress prevents the next side effect', async () => {
  const { session, page } = await isolated();
  let transferred = false;
  await page.exposeFunction('recordTransfer', () => { transferred = true; });
  session.onProgress = ({ stage }) => { if (stage === 'uploading') void session.cancel(); };
  await assert.rejects(session.prepare(valid()), { code: 'CANCELLED' });
  assert.equal(transferred, false);
  await session.close();
});
