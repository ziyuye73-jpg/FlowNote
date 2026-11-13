# Codex 开发交接

## 当前工作目录和远端

最终源码工作目录：`/Users/xiaoyu/Developer/FlowNote-local-fix/FlowNote`。
`origin` 为用户 fork `https://github.com/ziyuye73-jpg/FlowNote`；`upstream` 为原作者仓库。
旧文稿目录中的 FlowNote 不是最终源码，曾受 iCloud 占位文件/同步影响，不要覆盖本目录。

## 产品现状

- Electron 桌面端，Playwright 独立 Chromium 用户目录；Chrome/Edge 录制扩展仍保留。
- 工作台：自动化项目 → 流程 JSON → 发布复选框；另有录制文件、流程编辑、模型配置页。
- 当前唯一执行器是抖音上传填写适配器，不是任意 JSON 逐条回放。`projects.cjs` 是项目入口；`flow-binding.cjs` 判断 JSON 兼容性。不能将选择 JSON 宣称为通用回放。
- 用户明确要求：勾选发布即在填写核对后点击一次发布，不再弹最终确认；未勾选不点击。仅当所选 JSON 包含发布步骤允许开启。不要恢复重复确认弹窗。
- 发布成功证据仅为已提交反馈/进入内容管理，不代表审核通过。结果不明确时不自动重试。
- AI 按用户提供的 SRT/VTT/TXT 全文生成标题及2–5个相关话题，不按文件名猜测，不运行ASR。视觉模型可选，启用后本机 FFmpeg 抽5张<=640px JPEG，向同一模型服务发送字幕与帧，不发送完整音视频。
- 模型接口支持 OpenAI Chat Completions 中转站：根地址先 /v1、404才无/v1回退；支持手填完整路径、获取模型列表、文字模型测试；图片输入能力尚不自动测试。Key 用 Electron safeStorage 加密，仅本机保存。
- 热度数据未接入，不能声称话题是实时热门。
- 话题方式：简介编辑器尾部输入 `#话题` 后真实 Space，核实实体；不能只填普通字符串就算成功。简介定位使用临时 data-flownote-editor 标记避免 placeholder消失，忽略编辑器零宽/末尾空白但保留正文变动检查。
- 导入的JSON副本进入本机录制库；可搜索、打开、定位、确认后移到系统废纸篓；不得删除用户桌面原文件。JSON选择持久化。

## 运行和检查

Node.js22+、Python3.10+（原转换器），可选 FFmpeg/ffprobe（画面分析）。

```sh
npm ci
npx playwright install chromium
npm run desktop
npm test
python3 -m unittest discover -s tests -v
npm run test:desktop
npm run test:browser
```

桌面UI测试用临时 user-data-dir，不要接用户真实登录目录。浏览器执行测试用拦截网络的本地DOM夹具。不要在自动测试中读取真实model.json/API Key、上传真实媒体或发布作品。

构建：`npm run desktop:browser` 下载构建用Chromium，`npm run desktop:pack` / `npm run desktop:dist`。Mac本机已构建过arm64包；Windows尚待CI验证。FFmpeg未内置，Windows CI需安装它用于真实抽帧测试。

## 安装版与交付限制

本机 `/Applications/FlowNote.app` 在多次试用中通过更新app.asar热修；旧DMG不是最新代码。`/Users/xiaoyu/Developer/FlowNote-patch-stage` 和各备份asar不是版本管理源码。以本repo重新构建产物。

用户数据（账号、Key、录制、所选流程）位于Electron userData，mac默认 `~/Library/Application Support/flownote`，不进入Git。

## 后续重点

1. 在真实抖音编辑页验证当前发布开关、话题实体判定与上传反馈；网页DOM变化可能仍需适配。不能把夹具通过当真实发布成功。
2. 增加其他项目时实现对应执行器与表单，当前注册表仅有一个项目。
3. 当前JSON兼容检测只是识别上传/填写意图，尚未完整验证所有录制步骤是否被支持；通用执行、分支回放、等待步骤等未接入执行器。
4. 继续填写会重新追加话题，已有话题去重和部分失败后的幂等恢复仍需完善，避免重复标签。
5. 视觉模型需明确能力检测；长字幕上下文、模型格式差异、VTT/SRT更多边界有改进空间。
6. 项目/JSON/输入表单的持久化和多项目独立配置仍是初版；目前只有一个项目，不应承诺任意项目自动运行。
7. 所有package版本仍为0.8.1，应在下一次正式发行整理版本、图标、签名和安装包。
