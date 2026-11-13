# FlowNote Desktop

Electron 桌面控制台，支持 macOS / Windows 源码运行与本机构建。保留 Chromium 录制扩展，管理录制 JSON、导出 Skill，提供抖音视频上传填写执行器。

## 开发运行

需要 Node.js22+、Python3.10+（录制校验和 Skill 转换）；配置看图模型后还需 FFmpeg/ffprobe。

```sh
npm ci
npx playwright install chromium
npm run desktop
```

Python可通过FLOWNOTE_PYTHON指定；FFmpeg可通过FLOWNOTE_FFMPEG、FLOWNOTE_FFPROBE指定可执行文件。

## 使用

1. 在 Chrome/Edge 中录制并导出 JSON，在“录制文件”导入。可搜索、编辑、定位或删除本机库副本（系统废纸篓可恢复），原导入文件不变。
2. 在工作台选择自动化项目（当前为抖音视频发布）及当前流程JSON。所选录制用于关联上传填写任务，不代表任意录制逐条回放。无兼容流程会阻止执行。
3. 模型配置支持OpenAI Chat Completions兼容中转站、获取模型列表、手动模型ID及文字连接测试。API Key用系统safeStorage本机加密。看图模型可选，共用服务地址和Key；未测试视觉能力。
4. 选择视频与对应UTF-8 SRT/VTT/TXT字幕。AI以字幕全文生成标题和相关话题，不用文件名，不进行语音识别。看图模型留空时仅发字幕；填入时本机抽取5张低分辨率帧辅助理解。不发送完整音视频。没有实时话题热度数据。
5. 打开专用Chromium登录抖音，再开始上传填写。简介内按`#话题`+真实Space确认，核实话题实体。页面无法确认时停止，不盲目继续。
6. “填写完成后点击发布”默认关闭：关闭时停在发布前；开启且JSON含发布步骤时，核对通过直接点击一次，不再弹确认。结果不明确不重试，需到内容管理核对。提交反馈不代表审核通过。
7. 已上传的编辑页可“继续填写当前编辑页（不重新上传）”；但已有话题幂等去重尚待完善，重试前检查页面，避免重复话题。
8. 停止/退出会关闭客户端自有浏览器，上传内容不会自动撤回。日常Chrome资料不会被读取。

## 检查和构建

```sh
npm run test:desktop
npm run desktop:browser
npm run desktop:dist
```

构建将对应系统/架构的Chromium打入应用；Python和可选FFmpeg仍需在目标机器安装。Mac输出DMG/ZIP，Windows输出NSIS EXE，位于dist/desktop。默认未签名。

测试使用隔离用户目录和网络拦截页面夹具；包含真实Electron窗口、Python转换调用、合成视频本机抽帧。不会使用真实账号发布。真实抖音DOM和服务商协议仍需试用核验。Windows产物以CI实际结果为准。

完整开发交接见根目录 CODEX_HANDOFF.md。本机之前的DMG属于早期版本，最新源码需重新构建。
