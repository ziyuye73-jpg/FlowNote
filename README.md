# FlowNote · 流程笔记

> 把浏览器里的一次操作演示，变成可复用的自动化工作流。
> 录屏式的演示 → 条件分支 → 导出 JSON → Codex 整理成 Skill → 由 Codex 执行。

FlowNote 是面向 macOS 和 Windows 用户的**浏览器工作流录制工具**，由 Chrome / Edge 扩展（Manifest V3）和 Codex 插件两部分组成。你在网页上演示一遍操作（填表、拖动、排序、滚动、查询、下载报表……），扩展会记录关键步骤；你可以补充说明、添加等待和条件分支并导出 JSON，再由 Codex 整理成可编辑、可复用的 Skill，之后交给 Codex 按实时页面执行。

**当前版本：v0.8.1**（含自解释拖动 JSON、滚动识别、可配置等待和条件分支）。显示名称为 **FlowNote · 流程笔记**；为了兼容已有安装和录制文件，内部插件 ID、Skill 名称及录制来源标识仍使用 `windows-record-replay`。

---

## ✨ 核心特性

| 功能 | 说明 |
|---|---|
| 🎬 操作录制 | 记录点击、填写、选择、勾选、表单提交、Enter / Escape 和页面跳转 |
| 🖱️ 拖动与滚动 | 识别滑块、商品排序、元素拖放、Canvas 轨迹，以及页面和容器滚动 |
| 🧩 弹层与嵌入页面 | 自动发现选定标签页中可访问的 HTTP(S) iframe，支持跨站、动态加载和嵌套框架 |
| 🔀 条件分支 | 从任意步骤之后录制另一条路线（如"查询结果显示暂无数据"），最多 20 个分支，支持嵌套 |
| ⏱️ 等待步骤 | 停止录制后，在任意两步之间插入 1～3600 秒的固定等待 |
| 🗺️ 路线查看 | 切换主流程 / 分支，查看全部路线及其连接关系 |
| 🚫 网站黑名单 | 按整站排除网站及其子域名，设置保存在本机并立即生效 |
| 📤 JSON 导出 | 导出主流程、全部分支、条件、框架信息和检测到的录制缺口 |
| 🔄 Skill 转换 | 一键将录制转换为 Skill 草稿及结构化工作流，供 Codex 整理和执行 |
| 🔒 隐私优先 | 录制数据保存在扩展本地存储，默认不记录输入值和敏感字段 |

---

## 🧠 工作原理

```text
网页操作演示
    ↓
FlowNote 扩展记录步骤
    ↓
检查、补充说明、添加等待、录制条件分支
    ↓
导出 JSON
    ↓
Codex 整理为 Skill
    ↓
Codex 使用浏览器工具执行，并检查结果
```

扩展负责**记录**操作；Python 转换器负责**校验和整理**录制文件；Codex 负责**理解流程、补齐运行参数、观察实时页面并执行**。执行阶段需要可用的浏览器控制工具（如 Codex 浏览器工具或 Kimi 浏览器扩展）。

> 独立实现，非 OpenAI 官方 Record & Replay，未接入其私有录制接口。不录制操作系统桌面软件，不提供扩展内"一键盲播"。转换完成的 Skill 初始状态为"需要实际运行验证"——录制到一次点击并不代表业务操作成功，执行时仍需检查下载文件、查询结果或页面反馈。

---

## 🖥️ 桌面端第一版

新增 Electron 桌面控制台，支持导入并编辑录制、生成 Skill、打开专用 Chromium 登录会话，以及运行抖音视频上传和标题话题填写，停在发布前。任意录制目前用于管理和导出 Skill；桌面执行器提供固定的抖音发布准备流程。运行、构建和验证方法见 [桌面端说明](desktop/README.md)。

源码启动：`npm ci` → `npx playwright install chromium` → `npm run desktop`。需要 Node.js 22+ 和 Python 3.10+。桌面安装包构建时包含 Chromium，转换器仍使用本机 Python。

## 🚀 快速开始

### 1. 安装浏览器录制扩展（首次手动加载）

1. 将本插件 `extension` 文件夹放在**固定位置**（不要放在会被清理的临时目录或 Codex 版本缓存中）。
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
3. 开启"开发者模式"，选择**加载已解压的扩展程序**。
4. 选择直接包含 `manifest.json` 的 `extension` 文件夹，然后将图标固定到工具栏。

更新已有扩展时：在扩展管理页点击**重新加载**，如浏览器要求确认新增网站访问权限请完成一次确认，再刷新目标网页（先保存未完成内容）。

### 2. 安装 Codex 插件

当前机器的插件 ID 为 `windows-record-replay`。在 Codex 插件页打开并安装，或使用已配置个人市场的 CLI：

```powershell
codex plugin add windows-record-replay@personal
```

> 分享给另一台机器时，需通过该机器 Codex 支持的插件导入 / 本地市场流程安装；CLI 命令假设个人市场条目已存在。

### 3. 录制你的第一个流程

1. 打开要演示的网站并完成登录。
2. 点击扩展，填写流程名称和完成目标，按**开始录制当前页**。
3. 像平常一样操作。页面右下角显示录制提示，工具栏显示 `REC`。
4. 切换到新标签页后，打开扩展，按**继续录制当前页**。同一标签页的普通网站跳转、刷新会自动继续，黑名单网站除外。
5. 完成后按**停止录制**。检查步骤、删除多余内容，必要时添加固定等待，或补充日期规则、命名规则、成功判断等说明。
6. 点击**导出录制 JSON**，把文件交给 Codex：

   > 使用 windows-record-replay，把这份录制整理成下载经营日报的 Skill。日期作为参数。

7. 以后使用生成的 Skill：

   > 使用 daily-report-download，下载昨天的经营日报，保存到我指定的文件夹。

### 4. 本地转换命令（可选）

需要 **Python 3.10+**，仅使用标准库。macOS（Terminal，项目根目录）：

```sh
sh scripts/convert-recording.sh "/Users/yourname/Downloads/recording.json" --name daily-report-download
```

Windows（PowerShell，项目根目录，支持 `py -3`、`python3` 或 `python`）：

```powershell
powershell.exe -NoProfile -File .\scripts\Convert-Recording.ps1 -Recording "C:\Users\yourname\Downloads\recording.json" -Name daily-report-download
```

两端均可直接使用 Python；macOS 通常使用 `python3`，Windows 通常使用 `py -3`：

```sh
python3 scripts/recording_to_skill.py "recording.json" --name daily-report-download --output "./generated-skills"
```

不传 `--output` / `-Output` 时默认安装到当前用户的 `~/.codex/skills/<name>`（Windows 对应 `%USERPROFILE%\.codex\skills\<name>`）。路径含空格、中文时加引号。入口可通过环境变量 `FLOWNOTE_PYTHON` 指定 Python 可执行文件。Skill 名称拒绝 Windows 保留设备名（如 `con`、`nul`），保证生成目录可跨端使用。

转换器会生成 Skill 草稿和结构化工作流，保留"尚未实测"状态。重复名称会报错，已有 Skill 不会被覆盖。

---

## 💻 双端支持与分发

macOS（Apple Silicon / Intel）和 Windows 10 / 11 使用同一份扩展，在 Chrome / Edge 114+ 中加载；建议更新到当前稳定版。首次加载时 macOS 在 Finder 中选择 `extension` 文件夹，Windows 在资源管理器中选择。此项目是浏览器扩展和 Codex 插件，不需要桌面安装程序；Safari 不支持此 Chromium 扩展。

可在两端交换导出的 JSON 和生成的 Skill；网页登录状态、下载目录以及浏览器连接在目标机器上重新配置。普通 Enter / Escape 会录制；带 Command / Control / Option / Alt / Shift 的 Enter / Escape 会保存为手动步骤，执行时确认目标平台等效快捷键，避免误当成普通回车。

生成双端共用安装包（在项目根目录执行）：

```sh
python3 scripts/package_release.py
```

Windows 将 `python3` 换为 `py -3`。输出 `dist/FlowNote-macOS-Windows.zip`，包含扩展、Codex 插件、两端转换入口及说明，不包含录制数据。解压到固定位置后按快速开始加载扩展；打包不会自动安装到浏览器或 Codex。已有同名压缩包会拒绝覆盖，可用 `--output` 指定新路径。

## ⏱️ 固定等待

停止录制后，每个步骤右侧都会显示**等待**按钮。点击后填写 1～3600 秒整数，FlowNote 会在这一步完成后、下一步开始前插入一条独立的等待步骤。等待步骤可以继续添加等待、创建分支或删除，导出的 JSON 和生成的 Skill 都会保留秒数。

等待只属于当前路线。主流程中的等待不会自动复制到条件分支，分支需要时应切换到对应路线后单独添加。固定时间结束不代表页面一定准备完成；Codex 执行时仍应观察实时页面，并在提交、下载等关键动作后验证结果。

---

## 🖱️ 拖动与滚动

录制期间，主指针移动达到 8 个 CSS 像素后才会被识别为拖动，避免把普通点击误判成拖动。FlowNote 会优先保存当前控件和目标元素的标签、角色、名称等语义信息，再保存元素内 0～1 的相对坐标作为回放提示：

- **滑块**：始终记录并显示起点、终点的元素内相对位置；默认把最终值作为运行参数，只有开启“保留填写示例”才额外保存起始值和目标值。
- **商品排序 / HTML 拖放**：记录被拖元素、放置目标和放在目标之前或之后。
- **普通元素拖放**：记录来源、目标和相对起终点。
- **Canvas**：记录相对起终点和最多 24 个简化轨迹点。页面尺寸或画布内容变化后，需要实时确认。
- **页面与容器滚动**：停止滚动约 300 毫秒后记录最终位置；连续滚动会合并。拖动浏览器右侧原生页面滚动条也通过页面最终滚动位置表示。

拖入本地文件时不会保存文件路径或内容，只保留需要在回放时重新选择文件的手动提示。生成 Skill 后，如果当前浏览器工具不支持拖动、Canvas 轨迹或指定容器滚动，Codex 应要求人工完成该步骤，不能擅自改成点击。

新录制使用 schema v3。拖动 JSON 会直接声明单位、原点、参照元素和重放策略，不需要 AI 猜测坐标含义：

```json
{
  "action": "drag",
  "dragType": "range",
  "coordinateSystem": {"unit": "ratio", "origin": "top-left"},
  "start": {"x": 0.2, "y": 0.5, "relativeTo": "source"},
  "end": {"x": 0.8, "y": 0.5, "relativeTo": "source"},
  "startValue": "20",
  "targetValue": "80",
  "replayStrategy": "set-value-first"
}
```

`ratio` 表示 0～1 的元素内比例，原点为左上角。`relativeTo` 指明坐标相对于被拖元素还是 `dropTarget`；滑块优先使用运行时目标值，坐标仅作为备用提示。旧版 schema v1/v2 以及旧字段 `value` 仍可由转换器读取并补齐这些语义。

---

## 🔀 条件分支

例如主流程是 `1 → 2 → 3 → 4 → 5`，而第 3 步完成后页面可能显示"暂无数据"，可以为这种情况增加另一条路线：

```text
1 → 2 → 3 ┬→ 4 → 5       主流程
          └→ 6 → 7 → 8   当页面显示暂无数据时
```

1. 先录制主流程并停止（也可以在分支起点处先停止）。
2. 在第 3 步旁点击**分支**，填写名称和触发条件。
3. 在网页手动恢复到第 3 步完成时的状态，点击**继续录制此分支**，演示另一条路线。
4. 停止后通过**当前路线**切换主流程 / 分支；**查看全部路线**展示分支结构。

要点：

- 分支发生在选中步骤**之后**；若希望跳过第 3 步本身，请从第 2 步创建。
- 创建和切换分支不会自动回退网页，也不会录制暂停期间的准备操作。
- 执行时满足某条分支条件就沿该分支继续，跳过原路线剩余步骤；没有条件匹配时继续原路线；分支结束后不会自动接回原路线。
- 多个条件同时匹配或无法判断时，需要澄清。条件由 Codex 结合实时页面理解，扩展本身不自动判断和回放。
- 支持同一起点多个分支和分支内再分支，最多 20 个；步骤编号跨路线唯一且保持稳定；删除分支会同时删除其子分支。
- 新录制采用 schema v3；schema v2 的分支录制和 schema v1 的早期录制仍可使用。

---

## 🔒 访问范围与数据处理

- 扩展申请普通 HTTP(S) 网站访问权限，以便自动连接跨站弹层。**只有点击"开始录制当前页"才采集选定标签页的操作**，其他标签页不会自动参与。
- 录制数据保存在**扩展本地存储**。默认不保存输入值，而是作为后续运行参数；开启"保留填写示例"后才记录普通字段示例值。
- **密码、验证码、密钥等常见敏感字段不保存**（启发式识别）。网址查询参数值替换为占位符，网址片段不保留；路径、标签、页面文字仍可能含业务数据，导出前请检查。
- 扩展本身**没有网络上传或 Cookie 读取功能**。提供给 Codex 后，相关数据按 Codex 的正常设置处理。
- **网站黑名单**：设置 → 网站黑名单，输入域名或粘贴网址。规则按整站匹配（含子域名，不区分协议、端口或路径），最多保存 100 个网站，立即生效；清除录制不会清除黑名单。

---

## ⚠️ 已知限制

- 不支持 `about:blank` / `srcdoc` / `blob` 等特殊框架、关闭的 Shadow DOM、浏览器设置页和 PDF 阅读器；Shadow DOM 拖动会转为手动步骤。
- Canvas 只保存相对轨迹；回放精度取决于画布尺寸、内容状态和浏览器工具的坐标操作能力。
- 文件拖放和原生文件选择框不保存本地路径或内容，执行时需要重新提供文件。
- 下载按钮的点击会被记录，但下载文件本身和下载完成事件不会录制。
- 单段最多约 1500 个事件或 3.5 MB，达到上限自动停止；较长流程请分段录制。

---

## ✅ 测试

- `tests/test_converter.py`：验证参数化、拖动/滚动、等待步骤、拒绝覆盖、敏感字段清理和无效文件处理（Python 标准库）。
- `tests/core.test.cjs`：不依赖浏览器，验证自解释拖动字段、旧字段兼容和非法元数据拒绝。
- `tests/browser-smoke.cjs`：在隔离 Chromium 用户目录和本地测试页面上验证扩展实际录制、拖动、滚动、等待步骤和分支流程（需要 Node.js、Playwright 和 Chromium；可用 `WRR_PLAYWRIGHT` / `WRR_CHROMIUM` 环境变量指定本地运行时）。

以下开发检查用于完整源码 checkout（分发 ZIP 不含开发依赖和测试；需要 Node.js 22+，Python 3.10+）：

```sh
python3 -m unittest discover -s tests -v
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Windows 第一行改为 `py -3 -m unittest discover -s tests -v`。GitHub Actions 在 `macos-latest` / `windows-latest` 上运行上述检查和 ZIP 打包。新增跨平台测试覆盖中文及空格路径、入口失败退出、已有 Skill 保护及分发内容；转换器另有 schema v3 稀疏 ID 和分支参数回归测试。

> 浏览器端"加载已解压扩展"和真实业务网站的兼容性需要在用户浏览器中验证；测试通过不代表所有网站都兼容。

---

## 📁 项目结构

```text
FlowNote/
├── .codex-plugin/plugin.json           Codex 插件配置
├── extension/
│   ├── manifest.json                  Manifest V3 扩展配置
│   ├── background.js                  状态、框架注入、路线及权限范围管理
│   ├── content.js                     网页中的操作事件采集
│   ├── core.js                        脱敏、步骤合并、黑名单及分支辅助逻辑
│   ├── popup.html / popup.css / popup.js  操作面板
│   └── icons/                         SVG 源图与不同尺寸 PNG 图标
├── scripts/
│   ├── recording_to_skill.py          录制校验与 Skill 转换
│   ├── Convert-Recording.ps1          Windows 转换入口
│   ├── convert-recording.sh           macOS 转换入口
│   └── package_release.py            双端 ZIP 打包
├── skills/windows-record-replay/SKILL.md  Codex 使用指引
├── tests/                             转换器测试及隔离浏览器测试
└── README.md                          本文档
```

浏览器端使用 JavaScript、HTML、CSS 和 Chromium 扩展 API；转换器使用 Python 标准库。
