**中文** · [English](README.en.md)

# shuohao-skills

**AI 短剧制作的 skill 集合**：从一本小说到直接喂生成管线的制作素材——拆角色、排大纲、出场景与道具设定、写剧本、切分镜。给 AI 编码 agent 用，**Claude Code 和 codex 都能跑**。

整条管线长这样——**改编大纲收敛结构，剧本、场景、角色三者同步迭代，分镜只做输出不做新决定**：

<img src="assets/pipeline.webp" alt="AI 短剧制作流程图" width="680">

| Skill | 做什么 |
| --- | --- |
| [**novel-outline**](skills/novel-outline) | 把一本小说改编成短剧大纲五件套：改编说明、人物表、爽点表、分集梗概、资产清单（含叙事道具表）。14 道质量门全部脚本检查，支持已有大纲的体检模式 |
| [**novel-characters**](skills/novel-characters) | 群像视觉矩阵 + 角色资产；cinematic 采用严格真人定妆摄影，并另出 screen-test 单帧供分镜使用，避免三视图的动画/目录感下传 |
| [**novel-art**](skills/novel-art) | 场景 + 叙事道具资产；cinematic 使用真实地点/实体搭景连续性摄影，禁止概念图、动画和3D/CGI信号。11道门脚本检查 |
| [**novel-script**](skills/novel-script) | 给 AI 短剧写剧本：场次 + 节拍流（动作与台词交替），逐集时长按语速确定性折算；每场入口状态 + 每个动作拍 `statePatch` 计算剧情状态链，台词本按角色聚合并直接对接 TTS。11 道质量门全部脚本检查 |
| [**novel-storyboard**](skills/novel-storyboard) | 每段粗九宫格→人工选N格→高清终稿；cinematic 九宫格和终稿都强制真人演员、实体场景与光学摄影，23道门检查 |

**五个 skill 的报告都支持中英双语界面**：默认中文，`render --lang en` 出全英文报告（数据内容保持原文）。

## 推荐完整流程

这套仓库不是一条 `node` 命令自动写完整部剧，而是让 agent 按五个 skill 分阶段创作、脚本逐阶段校验。推荐依赖顺序：

```text
小说原文
  → novel-outline
  → novel-characters
  → novel-art
  → novel-script
  → novel-storyboard
  → 分镜投产包 + 合并报告
```

Codex 用 `$novel-*` 显式调用；Claude Code 用 `/novel-*`。下面以 Codex 为例，路径换成自己的即可。

### 1. 先定改编大纲

大纲是角色、场景、剧本的共同上游。开始时一次给齐**总集数 × 单集时长、题材、改编幅度、必须保留的角色或情节**：

```text
$novel-outline

把 D:\novels\原著.txt 改编成 60 集、每集 2 分钟的都市逆袭短剧。
改编幅度用“抽核”，保留主角和原著核心反转。
输出到 D:\novels\demo\outline。
```

这一段会先交付快版骨架，拍板砍线、合人和爽点位置后才写分集梗概。产出 `<剧名>-outline.json` / `.md` / `outline-report.html`。

### 2. 做角色设定

把原文与 `outline.json` 一起交给角色 skill；完整管线中不要重新判断角色重要性，沿用大纲分档：

```text
$novel-characters

使用原文 D:\novels\原著.txt 和
D:\novels\demo\outline\<剧名>-outline.json 生成角色设定集。
画风使用 cinematic；先完成 design-matrix，给 protagonist / major
各生成身份候选并确认 identity，再展开完整设定图，输出到
D:\novels\demo\characters。
```

可用画风：`realistic`（半写实厚涂）、`cinematic`（电影级真人写实）、`naturalistic`（现实/纪实：真实焦平面、局部材质差异、物理接触与不完美现场光）、`ghibli`（手绘动画）、`inkwash`（国风水墨）。`naturalistic` 下游优先使用角色 `screen-test.png` 与场景/道具 `master.png` 单帧，不把多面板技术设定表当成主要镜头参考。

### 3. 做场景与叙事道具

角色和美术必须使用同一个 `style`。把 `outline.json` 与 `cast.json` 一起交给美术 skill：

```text
$novel-art

基于 outline.json 与 cast.json 生成场景和叙事道具设定，
保持 cinematic 画风，输出到 D:\novels\demo\art。
```

产出 `art.json`、场景/道具提示词、报告和可选设定图。这里只建跨集一致性资产；一次性手部物件留到分镜提示词处理。

### 4. 小批量写剧本

剧本消费大纲、角色和美术资产。一次建议写 **1–3 集**，通过时长和对账门后再继续：

```text
$novel-script

使用 outline.json、cast.json、art.json，先写第 1–3 集，
每集目标 120 秒，输出到 D:\novels\demo\script。
```

新 seed 默认启用 `continuityMode: "state-linked"`。写作时每场先给完整 `continuity.entryState`，每个动作拍只用 `statePatch` 写改变的角色位置/姿态/视线/情绪、道具归属和未完成动作；出口状态由脚本计算，台词拍不改变物理状态。产出 `script.json`、分集剧本、时长报告和按角色聚合的台词本。

### 5. 出分镜与 H3 提示词

分镜消费前四段 JSON。先做第一集，并从本批挑 rich / balanced / sparse 各一张确认方向：

```text
$novel-storyboard

使用 outline.json、cast.json、art.json、script.json 制作第 1 集分镜。
先生成 rich 定场/高潮、balanced 对话/移动、sparse 反应/特写各一张供我确认，再继续整集；
输出到 D:\novels\demo\storyboard。
```

新 seed 默认每段 5–10 秒，并启用 `h3PromptMode: "official-auto"`、`cameraPlanMode: "cinematic-controlled"`、`promptDetailMode: "production-rich"`、`framePlanMode: "adaptive-density"` 与 `continuityMode: "state-linked"`。H3 单图自动走 I2VA、多分镜参考图走 Ref2VA；每切先继承剧本状态，再按镜头功能选择 sparse / balanced / rich。还可从 MiniMax 官方其余 8 个技能中选择一种 `h3Style`（先运行 `h3-styles` 查看），只套用视听/运动风格，不套业务流程。

完成后导出 H3 投产包：

```bash
cd D:/novels/demo/storyboard
node <项目目录>/skills/novel-storyboard/scripts/novel-storyboard.mjs export \
  ./<剧名>-storyboard.json --script ../script/<剧名>-script.json --out .
```

每个 `E01-01/` 段目录就是一次视频生成所需的 `prompt.md` + `f1..fN.png`；不要把这些段目录再套进 `segments/`，否则报告的相对图片路径会失效。

### 6. 合并评审报告

任意阶段完成后都可以组装单页；有哪几份 JSON 就显示哪几个面板：

```bash
node scripts/report.mjs --from D:/novels/demo --out D:/novels/demo/report.html
```

建议始终遵守四条：**先大纲拍板再细化、角色与美术同画风、剧本和分镜小批量推进、每阶段必须通过 validate 再交给下游**。

## 合成一张单页

五段的报告可以合成一张单页，左侧导航切换——**有哪几段就出哪几个面板**：

```bash
node scripts/report.mjs --from <demo目录> --out report.html
```

`--from` 按下面的[工作目录约定](#端到端-demo-工作目录约定)自动发现五份 json；也可以逐个指定（`--outline` `--cast` `--art` `--script` `--storyboard`）。只跑了角色那一段就只有一个面板，不报错。

它是**组装器，不是独立 skill**：不 import 任何 skill 的代码，而是调各自的 `render --html` 拿产物再拼装。所以五个 skill 一行不改、各自仍然独立可跑、可以单独拷走；某个 skill 改了渲染，这边自动跟上。

合并时处理三件事——**这三件都在组装器里做，不侵入 skill**：

- **样式串味**。五份报告共用 57 个类名，其中 13 个同名不同定义（`.copy` `.kpis` `.badge` `.chip`……），所以给每份样式的每条选择器加作用域前缀
- **脚本串味**。各报告的脚本都是 `document.querySelector('.expo')` 这种全局查询，合成一页后只会命中第一个——五个导出按钮会全废。做法是给每份脚本套一层作用域代理
- **图片路径**。各报告的图相对自己那份 json 的目录（`images/…`、`E01-01/f1.png`），合成后按输出文件的位置重算

默认一次显示一个面板（五份加起来将近六十万字符）。左下角「平铺全部」把所有面板同时展开，Cmd+F 恢复全局搜索。数字键 `1`–`5` 切面板，`#pane-script` 这样的深链可以直接分享到某一屏。

```bash
node scripts/report-selftest.mjs   # 92 项断言，不起浏览器
```

丢一本小说进去，出这五套：

**novel-outline · 短剧改编大纲**

![短剧改编大纲报告](skills/novel-outline/assets/report.webp)

**novel-art · 美术设定集（场景 + 道具，设定图为 skill 实际生成）**

![美术设定集报告](skills/novel-art/assets/report.webp)

**novel-script · 剧本（时长仪表 + 分集剧本 + 台词本）**

![剧本报告](skills/novel-script/assets/report.webp)

**novel-storyboard · 分镜（分镜节奏带 + 主/子分镜图为 skill 实际生成 + H3 提示词）**

![分镜报告](skills/novel-storyboard/assets/report.webp)

## 安装

```bash
git clone https://github.com/eternityspring/shuohao-skills.git
cd shuohao-skills
./scripts/install.sh
```

自动检测本机装了 Claude Code 还是 codex，把所有 skill **软链**过去——`git pull` 之后立刻生效，不用重装。

```bash
./scripts/install.sh novel-characters   # 只装某一个
./scripts/install.sh --codex            # 只装到 codex
./scripts/install.sh --uninstall        # 取消软链
```

不想用脚本就自己链：

```bash
ln -s "$PWD/skills/novel-characters" ~/.claude/skills/novel-characters
ln -s "$PWD/skills/novel-characters" ~/.codex/skills/novel-characters
```

## 前置条件

| | 必需？ | 说明 |
| --- | --- | --- |
| **Node** | 必需 | ≥ 18。skill 的脚本只用标准库，**没有 npm 依赖，不需要 install** |
| **模型额度** | 必需 | 用你当前会话的额度，**不需要任何 API key** |
| **codex CLI** | 可选 | 出图才用得上（走内置 `$imagegen`）。没有就跳过出图，其余产出照常 |

## 仓库约定

每个 skill 一个目录，**自包含、可以单独拷走**：

```
skills/<skill-name>/
├── SKILL.md          给 agent 读的工作流（必需）
├── README.md         给人读的说明
├── scripts/
│   ├── <name>.mjs    确定性工具，零依赖
│   └── selftest.mjs  自测，不调模型（必需）
├── references/       按需加载的详细指令
├── examples/         自带样例，同时当测试夹具
└── assets/           截图
```

两条硬要求：

- 每个 skill 必须有 `SKILL.md`
- 每个 skill 必须有 `scripts/selftest.mjs`，**不调用模型、不花额度**，覆盖全部确定性逻辑

加新 skill 之前，先把全部自测跑一遍：

```bash
for f in skills/*/scripts/selftest.mjs; do node "$f"; done
```

没有配 CI——自测足够快（1 秒），本地跑一次比等 CI 更省事。**只在 macOS + Node 24 上验过**；代码没有平台相关调用，Linux 和更低版本 Node 理论上没问题，但没验。

## 端到端 demo 工作目录约定

把一本小说从头跑完五段（大纲 → 角色 → 美术 → 剧本 → 分镜），会产出大量 `*.json` / `*.md` / `*-report.html`。**不要平铺在根目录**，按五个 skill 各建一个目录归档，一眼对应流水线五段：

```
<demo>/
├── outline/       ← novel-outline 产出：<剧>-outline.json / .md / -report.html
├── characters/    ← novel-characters 产出：<剧>-cast.json / .md / -report.html
├── art/           ← novel-art 产出：<剧>-art.json / .md / -report.html
├── script/        ← novel-script 产出：<剧>-script.json / .md / -report.html
├── storyboard/    ← novel-storyboard 产出：<剧>-storyboard.json / .md / -report.html
│   ├── manifest.json  ← export 产出
│   ├── E01-01/        ← export 的分镜投产包，每段一个文件夹（H3 prompt.md + f1..fN.prompt.md + f1..fN.png）
│   ├── E01-02/
│   └── …
├── docs/          ← 自己写的使用说明、PR 草稿等（与机器产物解耦）
└── scripts/       ← 跑管线的辅助脚本（探索期脚本用 _ 前缀保留溯源）
```

约定要点：

- **每个 skill 一个目录**，装它自己的 `json` / `md` / `html` 三件套，加新角色/场景只往对应目录放，不污染根目录
- **分镜的 `manifest.json` 与 `E01-0x/` 投产包一起归 `storyboard/`**，就是 `export --out storyboard` 的原样产出。**段文件夹不要再往下收一层**（例如收进 `segments/`）：分镜报告里的图走相对路径 `<段号>/f<切序>.png`，报告 html 与段文件夹必须同级，多套一层目录，报告里的图会**静默**全变成「未生成」占位——实测把 10 个段文件夹移进 `segments/` 之后，内嵌图从 2 张变 0 张，报告不会报错
- **报告 HTML 与生成的图/视频可由 `render` 重跑再生**——进版本控制时建议只提交 `json` / `md` / `docs` / `scripts`，报告 HTML 和分镜 `png` 用 `.gitignore` 排除，保持仓库轻量
- 用法类文档（如各报告的使用说明）放 `docs/`，与 skill 自动生成的产物分开，方便单独维护

> 这套结构来自《渡口》端到端 demo 的实际归档经验，demo 的工作目录在本仓库之外，这里只固化约定。


## License

[Apache 2.0](LICENSE)
