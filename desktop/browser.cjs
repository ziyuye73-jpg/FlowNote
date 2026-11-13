'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const HOME_URL = 'https://creator.douyin.com/';
const UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';

function failure(code, message, evidence) {
  return Object.assign(new Error(message), { code, ...(evidence && { evidence }) });
}

function isCreatorUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'creator.douyin.com' &&
      !url.username && !url.password && (!url.port || url.port === '443');
  } catch { return false; }
}

function validatePreparation({ videoPath, title, description, topics = [], resume = false } = {}) {
  if (typeof resume !== 'boolean') throw failure('INVALID_RESUME', 'resume 须为布尔值。');
  if (!resume && (typeof videoPath !== 'string' || !path.isAbsolute(videoPath) ||
      !/\.(mp4|mov|m4v|webm)$/i.test(videoPath))) {
    throw failure('INVALID_VIDEO', '请选择本地绝对路径的 MP4、MOV、M4V 或 WebM 视频。');
  }
  if (typeof title !== 'string' || !title.trim() || Array.from(title.trim()).length > 30 || /[\r\n\x00-\x1f]/.test(title)) {
    throw failure('INVALID_TITLE', '作品标题须为 1–30 个字符的单行文字。');
  }
  if (!Array.isArray(topics) || topics.length > 5 || topics.some(topic =>
    typeof topic !== 'string' || !/^[\p{L}\p{N}_]{1,30}$/u.test(topic.replace(/^#/, '')))) {
    throw failure('INVALID_TOPICS', '话题须为最多 5 个、每个 1–30 字的文字/数字/下划线，可带开头 #。');
  }
  const normalizedTopics = topics.map(topic => topic.replace(/^#/, ''));
  if (new Set(normalizedTopics).size !== normalizedTopics.length) {
    throw failure('INVALID_TOPICS', '话题不能重复。');
  }
  if (description !== undefined && (typeof description !== 'string' || Array.from(description).length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(description))) {
    throw failure('INVALID_DESCRIPTION', '作品简介须为最多 1000 个字符的文字。');
  }
  return { videoPath, title: title.trim(), topics: normalizedTopics,
    ...(description !== undefined && { description }), ...(resume && { resume }) };
}

class BrowserSession {
  // The optional second argument injects Playwright objects for isolated tests only.
  constructor({ profileDir, extensionDir, browserPath, onProgress } = {}, dependencies = {}) {
    if (!path.isAbsolute(profileDir || '') || !path.isAbsolute(extensionDir || '')) {
      throw failure('INVALID_PATH', 'profileDir 和 extensionDir 须为专用目录的绝对路径。');
    }
    this.profileDir = profileDir;
    this.extensionDir = extensionDir;
    this.browserPath = browserPath;
    this.onProgress = onProgress;
    this.chromium = dependencies.chromium || chromium;
    this.context = dependencies.context || null;
    this.page = dependencies.page || null;
    this.timeout = dependencies.timeout || 120000;
    this.cancelled = false;
    this.running = false;
    this._cancelPromise = new Promise((_, reject) => { this._rejectCancel = reject; });
    this._cancelPromise.catch(() => {});
  }

  _check(requireCreator = true) {
    if (this.cancelled) throw failure('CANCELLED', '操作已取消；已上传的内容不会自动撤回。');
    if (requireCreator && (!this.page || !isCreatorUrl(this.page.url()))) {
      throw failure('DOMAIN_NOT_ALLOWED', '仅允许在 https://creator.douyin.com 页面准备上传。');
    }
  }

  async _step(action, requireCreator = true) {
    this._check(requireCreator);
    const result = await Promise.race([Promise.resolve().then(() => {
      this._check(requireCreator);
      return action();
    }), this._cancelPromise]);
    this._check(requireCreator);
    return result;
  }

  _progress(stage, message) {
    this._check(false);
    this.onProgress?.({ stage, message });
    this._check(false);
  }

  async open() {
    this._check(false);
    if (this.running) throw failure('BUSY', '正在准备上传。');
    try {
      if (!this.context) {
        await fs.access(path.join(this.extensionDir, 'manifest.json'));
        await fs.mkdir(this.profileDir, { recursive: true });
        this._check(false);
        const launching = this.chromium.launchPersistentContext(this.profileDir, {
          headless: false,
          channel: 'chromium',
          ...(this.browserPath && { executablePath: this.browserPath }),
          args: [`--disable-extensions-except=${this.extensionDir}`, `--load-extension=${this.extensionDir}`]
        }).then(async context => {
          if (this.cancelled) { await context.close(); throw failure('CANCELLED', '操作已取消。'); }
          this.context = context;
          return context;
        });
        // Cancellation can happen before _step attaches to the launch promise.
        launching.catch(() => {});
        this._launching = launching;
        await this._step(() => launching, false);
      }
      if (this._observedContext !== this.context) {
        const context = this.context;
        this._observedContext = context;
        context.on?.('close', () => {
          if (this.context === context) { this.context = null; this.page = null; }
        });
      }
      if (!this.page || this.page.isClosed()) {
        this.page = this.context.pages?.().find(page => !page.isClosed() && page.url() === 'about:blank') ||
          await this._step(() => this.context.newPage(), false);
      }
      this.page.setDefaultTimeout(10000);
      await this._step(() => this.page.bringToFront?.(), false);
      this._progress('loading', '浏览器已启动，正在加载抖音创作者中心…');
      await this._step(() => this.page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }), false);
      await this._step(() => this.page.bringToFront?.(), false);
      this._check();
      this._progress('opened', '已打开抖音创作者中心，请在专用浏览器中登录，再显式开始准备上传。');
      return { url: this.page.url() };
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async _loginCheck() {
    const prompt = this.page.getByText(/^(扫码登录|请先登录|登录后上传|手机号登录|验证码登录)$/).filter({ visible: true });
    if (await this._step(() => prompt.count())) {
      throw failure('LOGIN_REQUIRED', '检测到登录提示，请在专用浏览器中完成登录后重试。');
    }
  }

  async _unique(locator, label) {
    const visible = locator.filter({ visible: true });
    if (await this._step(() => visible.count()) !== 1) {
      throw failure('DOM_UNCERTAIN', `无法唯一确认${label}，请人工检查当前抖音页面。`);
    }
    return visible;
  }

  async _waitFor(read, label, timeout = this.timeout) {
    const deadline = Date.now() + timeout;
    do {
      await this._loginCheck();
      const value = await this._step(read);
      if (value) return value;
      await this._step(() => new Promise(resolve => setTimeout(resolve, 200)));
    } while (Date.now() < deadline);
    throw failure('VERIFICATION_FAILED', `未能核实${label}；准备未完成，请检查浏览器。`);
  }

  async _uploadEvidence(verifiedNotice = false) {
    return this._step(() => this.page.evaluate(verifiedNotice => {
      const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      // Only compact visible status labels count, never aggregate body/editor prose.
      const labels = [...document.querySelectorAll('[role="status"],p,span,div')].filter(el =>
        visible(el) && !el.children.length && el.textContent.trim().length <= 60).map(el => el.textContent.trim());
      if (labels.some(text => /^(?:视频)?(?:上传失败|转码失败|处理失败)[！!。]?$/.test(text))) return { failed: true };
      if (labels.some(text => /^(?:视频)?(?:上传中|正在上传|正在转码|处理中|正在处理)(?:[.。…\s]*|\s*\d+(?:\.\d+)?\s*%)$/.test(text))) return null;
      const video = [...document.querySelectorAll('video')].find(el => visible(el) && el.readyState >= 1 && el.duration > 0 && (el.currentSrc || el.src));
      const success = labels.find(text => /^(上传成功|上传完成|视频上传成功|视频上传完成)$/.test(text));
      const notice = [...document.querySelectorAll('p,span,div')].some(el => visible(el) &&
        el.textContent.length < 500 && /视频素材已按原始分辨率上传/.test(el.textContent));
      const title = [...document.querySelectorAll('input')].some(el => visible(el) &&
        /作品标题|视频标题|填写标题|添加标题/.test(`${el.placeholder} ${el.getAttribute('aria-label') || ''}`));
      const preview = [...document.querySelectorAll('img,video')].some(el => {
        const rect = el.getBoundingClientRect();
        return visible(el) && rect.width >= 100 && rect.height >= 100 && (el.tagName === 'VIDEO' ?
          !!(el.currentSrc || el.src) : el.complete && el.naturalWidth >= 100 && !!el.currentSrc);
      });
      const editor = /^\/creator-micro\/content\/post\/video\/?$/.test(location.pathname);
      return video ? { kind: 'video-preview', duration: video.duration, readyState: video.readyState } :
        success ? { kind: 'upload-status', text: success } :
        editor && (notice || verifiedNotice) && title && preview ? { kind: 'editor-preview', notice: true } : null;
    }, verifiedNotice));
  }

  async _dismissPreviewNotice() {
    const acknowledge = this.page.getByRole('button', { name: '我知道了', exact: true }).filter({ visible: true });
    if (await this._step(() => acknowledge.count()) !== 1) return;
    const related = await this._step(() => acknowledge.evaluate(button => {
      for (let el = button.parentElement; el && el !== document.body; el = el.parentElement) {
        const text = el.innerText;
        if (text.length > 800) break;
        if (/视频预览功能/.test(text) && /视频素材已按原始分辨率上传/.test(text)) return true;
      }
      return false;
    }));
    if (related) await this._step(() => acknowledge.click());
  }

  async _descriptionText(editor) {
    return this._step(() => editor.evaluate(el => {
      if ('value' in el) return el.value;
      const copy = el.cloneNode(true);
      copy.querySelectorAll('[data-topic-id], [data-topic], [data-type="mention"], [data-type="topic"], [data-type="hashtag"], [contenteditable="false"]').forEach(token => token.remove());
      // Detached innerText loses contenteditable line breaks; measure a temporary inert copy.
      copy.removeAttribute('id');
      copy.setAttribute('inert', '');
      copy.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none';
      document.body.append(copy);
      try { return copy.innerText; } finally { copy.remove(); }
    }));
  }

  async _topicTokens(editor = this.page.locator('[contenteditable="true"]')) {
    return this._step(() => editor.evaluateAll(editors => editors.flatMap(editor => {
      // Plain caption text and suggestion-list metadata are not selected topic entities.
      return [...editor.querySelectorAll('[data-topic-id], [data-topic], [data-type="mention"], [data-type="topic"], [data-type="hashtag"], [contenteditable="false"]')]
        .filter(el => el.getClientRects().length)
        .map(el => ({ text: el.textContent.trim(), id: el.getAttribute('data-topic-id') || el.getAttribute('data-topic') || null }));
    })));
  }

  async prepare(input) {
    this._check();
    if (this.running) throw failure('BUSY', '已有上传准备正在进行。');
    this.running = true;
    const evidence = { url: this.page.url(), topics: [] };
    try {
      const data = validatePreparation(input);
      if (data.resume) {
        if (!/^\/creator-micro\/content\/post\/video\/?$/.test(new URL(this.page.url()).pathname)) {
          throw failure('DOM_UNCERTAIN', '继续填写仅允许在当前视频编辑页进行。');
        }
      } else {
      const stat = await this._step(() => fs.stat(data.videoPath));
      if (!stat.isFile() || stat.size === 0) throw failure('INVALID_VIDEO', '视频必须是非空的本地文件。');
      await this._step(() => fs.access(data.videoPath, require('node:fs').constants.R_OK));
      evidence.video = { name: path.basename(data.videoPath), size: stat.size };
      this._progress('navigating', '正在打开抖音视频上传页。');
      await this._step(() => this.page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
      await this._loginCheck();
      const upload = this.page.locator('input[type="file"]');
      await this._waitFor(async () => (await upload.count()) > 0, '视频上传控件', 15000);
      const candidates = await this._step(() => upload.evaluateAll(elements => elements.map((el, index) => ({
        index, accept: el.accept, label: `${el.getAttribute('aria-label') || ''} ${el.labels ? [...el.labels].map(l => l.textContent).join(' ') : ''}`
      })).filter(item => /video|\.mp4|\.mov|视频/i.test(`${item.accept} ${item.label}`))));
      if (candidates.length !== 1) throw failure('DOM_UNCERTAIN', '无法唯一确认用于视频的上传 input；没有上传文件。');
      this._progress('uploading', '正在上传选定视频；不会点击发布或保存草稿。');
      await this._step(() => upload.nth(candidates[0].index).setInputFiles(data.videoPath));
      }
      evidence.upload = await this._waitFor(() => this._uploadEvidence(), '上传完成或视频编辑预览');
      if (evidence.upload.failed) throw failure('UPLOAD_FAILED', '抖音页面报告视频上传或处理失败。');
      const verifiedPreviewUrl = evidence.upload.kind === 'editor-preview' ? this.page.url() : null;
      await this._dismissPreviewNotice();
      const title = await this._unique(this.page.getByRole('textbox', { name: /作品标题|视频标题|填写标题/ }).or(
        this.page.getByPlaceholder(/作品标题|视频标题|填写标题|添加标题/)), '作品标题输入框');
      this._progress('title', '已核实视频上传，正在填写作品标题。');
      await this._step(() => title.fill(data.title));
      const titleValue = await this._step(() => title.evaluate(el => 'value' in el ? el.value : el.textContent));
      if (titleValue !== data.title) throw failure('VERIFICATION_FAILED', '标题填写后核实不一致。');
      evidence.title = { value: titleValue, verified: true };
      let description, originalDescription;
      if (data.description !== undefined || data.topics.length) {
        const editors = this.page.locator('[contenteditable="true"]');
        const matched = editors.and(this.page.getByPlaceholder(/添加作品简介/).or(
          this.page.getByRole('textbox', { name: /作品简介|作品描述|简介/ })).or(
          this.page.locator('[data-placeholder*="作品简介"], [aria-label*="作品描述"]'))).filter({ visible: true });
        const identified = await this._unique(await this._step(() => matched.count()) ? matched : editors, '作品简介编辑框');
        // Empty-editor placeholders can disappear as soon as a hashtag is typed.
        const editorId = require('node:crypto').randomUUID();
        await this._step(() => identified.evaluate((el, id) => el.setAttribute('data-flownote-editor', id), editorId));
        description = this.page.locator(`[data-flownote-editor="${editorId}"][contenteditable="true"]`);
        if (data.description !== undefined) {
          await this._step(() => description.fill(data.description));
          if (await this._descriptionText(description) !== data.description) throw failure('VERIFICATION_FAILED', '简介填写后核实不一致。');
          evidence.description = { value: data.description, verified: true };
        }
        originalDescription = await this._descriptionText(description);
      }
      for (const topic of data.topics) {
        this._progress('topics', `正在简介中输入 #${topic} 并按空格确认。`);
        await this._step(() => description.focus());
        // Select the end directly; macOS Meta+End can scroll without moving the caret.
        await this._step(() => description.evaluate(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }));
        await this._step(() => this.page.keyboard.insertText(`#${topic}`));
        await this._step(() => description.press('Space'));
        const token = await this._waitFor(async () => (await this._topicTokens(description)).find(item => item.text === `#${topic}` ||
          (item.id && item.text === topic)), `话题 #${topic} 的已选 token`, 10000);
        evidence.topics.push({ topic, verified: true, token });
      }
      // Recheck every assertion together, since topic widgets can also modify the title.
      this._check();
      await this._loginCheck();
      evidence.upload = await this._uploadEvidence(verifiedPreviewUrl !== null && this.page.url() === verifiedPreviewUrl);
      if (!evidence.upload || evidence.upload.failed) throw failure('VERIFICATION_FAILED', '最终核实未发现上传就绪证据。');
      if (await this._step(() => title.evaluate(el => 'value' in el ? el.value : el.textContent)) !== data.title) {
        throw failure('VERIFICATION_FAILED', '话题操作后标题发生变化，准备未完成。');
      }
      if (description) {
        const current = await this._descriptionText(description);
        // Space can leave a separator after each entity; all original prose must stay intact.
        const prose = text => text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').replace(/\r\n?/g, '\n').trimEnd();
        if (prose(current) !== prose(originalDescription)) {
          throw failure('VERIFICATION_FAILED', '话题操作后简介发生变化，准备未完成。');
        }
      }
      const tokens = description ? await this._topicTokens(description) : [];
      if (data.topics.some(topic => !tokens.some(item => item.text === `#${topic}` || (item.id && item.text === topic)))) {
        throw failure('VERIFICATION_FAILED', '最终核实话题 token 不完整；普通文字不视为话题选择成功。');
      }
      evidence.url = this.page.url();
      this._progress('prepared', '已核实上传、标题及话题，已停在发布前，请人工检查。');
      return { verified: true, status: 'prepared', published: false, evidence };
    } catch (error) {
      if (!error.evidence) error.evidence = evidence;
      throw error;
    } finally { this.running = false; }
  }

  async publishPrepared(prepared) {
    this._check();
    if(!prepared?.verified || prepared.published || this.page.url()!==prepared.evidence?.url) throw failure('NOT_PREPARED','页面状态已变化，请重新核对发布内容。');
    const title=this.page.getByPlaceholder(/作品标题|视频标题|填写标题|添加标题/).filter({visible:true});
    if(await title.count()!==1 || await title.inputValue()!==prepared.evidence.title.value) throw failure('NOT_PREPARED','当前标题与已核对结果不一致，未发布。');
    const publish=await this._unique(this.page.getByRole('button',{name:'发布',exact:true}),'发布按钮');
    if(await this._step(()=>publish.isDisabled())) throw failure('NOT_READY','发布按钮不可用，请检查页面校验。');
    this._progress('publishing','正在点击一次发布；若结果不明确，不会自动重试。');
    try {
      await this._step(()=>publish.click());
      await this._waitFor(async()=>{
        const onManage=/^\/creator-micro\/content\/manage\/?$/.test(new URL(this.page.url()).pathname);
        const success=await this.page.getByText(/^(发布成功|作品发布成功|提交成功)$/).filter({visible:true}).count();
        return onManage || success>0;
      },'发布后的页面反馈',20000);
    } catch(error) {throw failure('PUBLISH_UNCERTAIN','已点击一次发布，但未确认页面结果。请到内容管理检查，不要重复点击。',prepared.evidence);}
    this._progress('submitted','已点击发布并收到页面反馈；作品是否审核通过或公开，请在内容管理确认。');
    return {...prepared,status:'submitted',published:true,evidence:{...prepared.evidence,submissionUrl:this.page.url(),publicationStatus:'submitted-not-review-verified'}};
  }

  cancel() {
    if (this._cancelling) return this._cancelling;
    this.cancelled = true;
    this._rejectCancel(failure('CANCELLED', '操作已取消；已上传的内容不会自动撤回。'));
    // Wait for a pending launch to close its late context before reusing the profile.
    this._cancelling = Promise.all([
      this.close(),
      this._launching?.catch(error => { if (error.code !== 'CANCELLED') throw error; })
    ]).then(() => undefined);
    return this._cancelling;
  }

  async close() {
    if (this._closing) return this._closing;
    const context = this.context;
    this.context = null;
    this.page = null;
    if (context) {
      this._closing = context.close();
      try { await this._closing; } finally { this._closing = null; }
    }
  }
}

module.exports = { BrowserSession, isCreatorUrl, validatePreparation, HOME_URL, UPLOAD_URL };
