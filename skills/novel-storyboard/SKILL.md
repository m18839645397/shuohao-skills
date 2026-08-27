---
name: novel-storyboard
version: 1.13.0
description: |
  给 AI 短剧出分镜：三层结构——段（新 seed 默认 5–10 秒，一次视频生成）→ 分镜（段内 2–5 秒的剪切，认领剧本节拍）
  → 分镜图（每切一张关键帧：主分镜图钉 0.00 秒，子分镜图钉各自切点）。
  每段自带一条 MiniMax H3 视频提示词（官方口径默认英文、逐镜换行，promptLang 可切中文）：对齐指令和
  [Shot k] 切点时刻由分镜结构推导、逐字对账，台词逐字进 <d> 块（写法规范已内化为
  references/h3-prompt.md，不依赖外部 skill）；每切带克制电影化 cameraPlan，明确起点、目标、焦点、
  速度/幅度、结束构图、导演意图与转场；投产级丰富模式逐切写空间、光线、主体、动作、效果与连续性，
  静态分镜图按镜头功能自动分配 sparse/balanced/rich 画面密度并确定性组装完整 imagePrompt，
  每段 f1 强制对齐动作前 entry state，人物动作只在0.00秒之后开始，
  每段可先用一次调用生成粗略九宫格，人工按顺序选择 N 格后再分别生成高清终稿，并以 edgePlan 处理相邻衔接，
  逐段写分层声景和配乐动态；状态链模式对账相邻镜头与连续段的人物位置、姿势、视线、道具、光效、
  银幕方向和动作/声音桥，避免硬切与状态重置。
  产出 storyboard.json + Markdown + 单页评审报告（分镜节奏带 / 分集分镜表 / 生成批次单 /
  配音对齐单，含导出 JSON）。分镜图出图拿场景与角色设定图当参考图走 codex $imagegen（可选）。
  23 道质量门全部由脚本确定性检查（含九宫格人工选择、边运镜、分镜图密度、段首入口帧、剧本状态继承；shot-recipe 可选挂载）；
  export 一键导出 H3 提示词、逐切完整分镜图提示词和按 Picture 序的分镜图清单。零依赖、零 API key，用当前会话额度。
  Use when asked to 分镜、出分镜、镜头表、切镜、storyboard for AI short drama。
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - Glob
triggers:
  - novel-storyboard
  - 分镜
  - 出分镜
  - 镜头表
  - 切镜
  - 首帧
  - storyboard
  - shot list
metadata:
  license: Apache-2.0
  requires:
    bins:
      - node          # >= 18，只用标准库，无 npm 依赖
    optional:
      - codex         # 有才出首帧图；没有就只交提示词，其余照常
  runtimes:
    - claude-code
    - codex
---

## novel-storyboard

给 AI 短剧出**分镜**——管线里第一个直接面对视频模型的层。**前提刻在骨子里：镜头是生成出来的，多切一镜的成本几乎为零**，所以这里不心疼镜头数量。新 seed 默认每段 5–10 秒；旧 JSON 未写段下限时仍只守模型单段上限 15 秒。

**核心机制：镜头认领节拍。** 每个镜头声明它覆盖剧本某场的哪几个连续节拍（`sceneIndex` + `beats: [起, 止]`），镜头不许跨场次——换景必换镜。这让分镜和剧本的关系变成可机械对账的：

| 交付 | 解决什么 |
| --- | --- |
| 节拍认领 | 每个节拍被恰好一个镜头认领、顺序不乱——剧本改了重跑 validate，失效的镜头当场点名 |
| 单段 5–10 秒 | 新 seed 默认生成区间；长对话和连续动作在动作中段做 handoff，旧 JSON 仍兼容只守 15 秒上限 |
| 台词装得下 | 认领节拍的台词秒数 ≤ 镜头秒数——逐镜检查，不是拍脑袋 |
| 入口首帧 + 运动双提示词 | 每段 f1 是动作前 entry state，运动只在0.00秒后发生；景别、运镜是枚举，英文短语必须写进对应提示词 |
| **H3 视频提示词（每镜一段）** | MiniMax H3 的 I2VA 结构：固定对齐指令 + integrated_multimodal_description + overall_soundscape + non_diegetic_music。**认领节拍的台词逐字进 `<d>[Chinese] …</d>` 块**——对白、声景、配乐一段提示词全带上 |
| 生成批次单 | 同场景 + 同光照的镜头归一批，共用同一张环境参考图——AI 版的顺场表，脚本自动汇总 |
| 配音对齐单 | 每句台词对到镜号——TTS 音频贴到哪一段视频，脚本自动汇总 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-storyboard.mjs`，零依赖，`node` 直接跑。

**边界（不做的事）**：不写戏不改台词（`novel-script` 的活）、不出场景/角色/道具设定图（`novel-art` / `novel-characters` 的活）、不做视频生成与剪辑合成。口型/唇形同步暂不管——那是生成管线的事。

---

### Step 0 — 定输入与范围

**script.json 是硬前提**——分镜离开剧本没有意义，validate/render 都必须给 `--script`。其余上游按有则用：

- `--outline` / `--cast`：提示词禁人名检查 + 报告里 C01 显示成人名
- `--art`：报告里 S01 显示成场景名 + 批次单嵌场景设定图
- `--shots <卡片目录>`：**可选**挂载 shot-recipes 的镜头配方卡库（指向 `shot-recipes/references/cards`，只接受目录不接受导出的 JSON），开启 `shot-recipe` 门。没装 shot-recipes 就别给——本 skill 自包含，不依赖它

**一次切几集**：跟剧本的批次走（剧本写到哪就分到哪），默认一批 ≤ 3 集。

### Step 1 — seed 工作底稿

```bash
node {baseDir}/scripts/novel-storyboard.mjs seed <script.json> --eps 1-3 > <workdir>/storyboard.json
```

确定性展开逐拍状态，并默认写入 `candidateMode: "single-grid-rough"`、`selectionMode: "human-ordered"`、`edgePlanMode: "edge-driven"` 及现有运镜、丰富度、入口帧、连续性模式。

### Step 2 — 逐集分段切镜

每集一份任务，能并发就并发。每份任务拿到：

- `{baseDir}/references/storyboard-pass.md`、`camera-direction.md`、`prompt-detail.md`、`candidate-grid.md`、`frame-entry.md`、`frame-density.md`、`continuity.md` 和 `schema.md`（读它们，照着做）
- 该集的 seedScenes 底稿 + 场景卡（art.json 的锚点与光照提示词）+ 角色卡（cast.json 的形象要点）

流程先按剧情单元分段，为每段写固定九格 `candidateBoard.cells`，用 export 的 `candidate-grid.prompt.md` 一次生成粗图。报告中人工按播放顺序选 N 格并导出 selection.json；`select` 写回后，按 selected 重排 cuts，补齐 candidateId 与 N−1 条 edgePlans，再生成高清终稿与 H3。

```bash
node {baseDir}/scripts/novel-storyboard.mjs select <storyboard.json> <selection.json> \
  --out <storyboard-selected.json>
```

**画面密度不是剧情强度的同义词**：新空间定场和复杂关系用 rich；普通对话用 balanced；反应、停顿和手部/道具特写用 sparse。强烈情绪的脸部特写仍应克制，靠微表情、材质、光影和留白，而不是塞背景物件。最终出图不直接使用基础 `frame`，必须使用报告复制按钮或 export 生成的完整 imagePrompt。

**每段写一条 `h3Prompt`**，照 `{baseDir}/references/h3-prompt.md` 写（官方方法论的内化版，**不依赖任何外部 skill**）。官方口径默认英文（`promptLang` 可切中文），**每个镜头独立一行**。Shot 2 起先写同一瞬间承接句和 transitionPlan，再改变景别/机位；连续段 Shot 1 先写段间承接句和 handoff。其余保持：对齐指令/切点时刻推导，台词逐字进 `<d>`，cameraPlan/visualPlan 逐字进自己的 Shot，audioPlan 进入声景与配乐字段。

切完把 `seedScenes` 删掉。

### Step 3 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-storyboard.mjs validate <storyboard.json> \
  --script <script.json> --outline <outline.json> --cast <cast.json> \
  [--shots </path/to/cards>]
```

23 道质量门全是代码：新增 `candidate-grid-selection`，检查九格固定布局、人工选择数量和顺序、cuts/candidateId 对账、N−1 条 edgePlans 及目标 cut 运镜一致性。

**有违规逐条修，改完重跑，直到通过。**

**`shot-recipe`（可选挂载）**：给了 `--shots` 才查，不给就明说跳过。cut 上可以写一个可选的 `recipe`（配方卡 id，**cut 级不是 segment 级**，**多格配方靠连续同 id 的分镜表达**，不是数组），门查三条——id 在卡库里、卡片的每条 `must_phrases` 出现在该切组装后的完整 imagePrompt 里、卡片 `cuts` 下限 ≥ 2 时连续同 id 的分镜数不得低于该下限。

### Step 4 — 出分镜图（可选）

一切一张 16:9 关键帧，走 codex 内置 `$imagegen`，读 `{baseDir}/references/frame.md` 照契约做。要点：

- **没有 codex 就整步跳过**，只交提示词，报告显示占位不装有
- **参考图是命根子**：`-i` 挂上该段场景设定图（该光照状态）+ 画内角色的设定图 + 涉及道具的设定图，提示词只负责取景和此刻的姿态
- `cinematic` 优先挂角色 `screen-test.png`、场景/道具 `master.png` 单帧；不要把白底三视图或 L 形技术 sheet 当成唯一真人镜头参考
- **f1 不是动作代表帧**：它必须画 startState 的动作前入口态；奔跑、拍击、转身、开门等动作从0.00秒之后开始
- **九宫格只做粗选**：每段先生成一张 `candidate-grid.png`；图片里不画编号，报告叠加 G1–G9。选中格子必须分别重生成高清 f1..fN
- **链式参考也是硬要求**：f2 起额外挂本段 f1 + 立即上一切；连续段的下一段 f1 再挂上一段最后一帧。标准资产始终保留，防止链式漂移
- 一格一次调用绝不批量；输出 `./<段号>/f<切序>.png`（f1 = 主分镜图，每段一个文件夹）
- **默认先出三张代表图**：rich 定场/高潮、balanced 对话/移动、sparse 反应/特写各一张；三档信息量都正确再往后补
- 单个失败跳过不阻断，最后汇总说明

### Step 5 — 输出与汇报

```bash
cd <输出目录>
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --md \
  --script <script.json> --outline <outline.json> --art <art.json> > <剧名>-storyboard.md
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --html \
  --script <script.json> --outline <outline.json> --art <art.json> > storyboard-report.html
```

报告界面语言用 `--lang zh|en` 指定（优先级 `--lang` > JSON 顶层 `lang` 字段 > 默认中文）——只切界面标签，与 `promptLang`（H3 提示词语言）互相独立。`render` 自动去 `images/<镜号>-frame.png` 找首帧（批次单还会找场景设定图），**先出图再 render**。报告含：KPI 带、分镜节奏带（粗分隔 = 段边界、片宽 = 分镜时长占比、颜色深浅 = 景别远近、点击跳段卡）、分集分镜表（主分镜图 + 子分镜条 + 逐切分镜行 + 分镜图/H3 提示词复制按钮）、生成批次单、配音对齐单、质量门、导出 JSON。Markdown 版每段附完整 H3 提示词，直接复制可用。

汇报一句话说清：几集几镜、总时长 vs 目标、几个生成批次、出了几张首帧、报告路径；没过的门和没出的图明说。

最终落地：

```
<输出目录>/
├── <剧名>-storyboard.json
├── <剧名>-storyboard.md
├── storyboard-report.html         ← 双击就能开
├── manifest.json                  ← export 生成
└── E01-01/                        ← 一段一个文件夹 = 一次 H3 生成的全部材料
    ├── f1.png                     ← 主分镜图（有 codex 才有）
    ├── f2.png …                   ← 子分镜图
    ├── f1.prompt.md               ← 主分镜图完整 imagePrompt
    ├── f2.prompt.md …             ← 子分镜图完整 imagePrompt
    ├── candidate-grid.png         ← 一次调用生成的粗九宫格
    ├── candidate-grid.prompt.md   ← 九宫格提示词
    ├── candidate-selection.template.json
    └── prompt.md                  ← H3 提示词（export 生成）
```

---

## 五个 skill 的接力（管线到此闭环）

```
novel-outline    → outline.json    （什么：结构与分集）
novel-characters → cast.json       （谁：角色设定图）
novel-art        → art.json        （哪里：场景/道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：镜头、首帧、批次）
```

分镜是消费端：seed 吃 script.json，分镜图出图吃 art 和 characters 的设定图当参考，H3 提示词直接下单给视频模型，配音对齐单接 script 台词本的 TTS 产物。五份 JSON 各自的报告都带导出按钮，改完都能喂回各自的 render/validate。

## 边界

- 报告界面内置中英（`--lang`，默认中文）；提示词语言由 `promptLang` 单独控制（默认英文）
- 秒数是**下给视频模型的生成时长**不是估算——段上限按你的模型改 `params.maxSegmentSeconds`，切的节奏区间改 `min/maxCutSeconds`
- 口型/唇形同步暂不管——那是生成管线的事
- 分镜图不追求一次到位——它是给视频模型的构图锚，构图对、资产对就够，微调交给重生成

## 门失败会累积

`validate` 与 `checkup` 每次都把门的结果追加到**当前目录**的 `.gates.jsonl`；跑 `stats` 汇总：

```bash
node {baseDir}/scripts/novel-storyboard.mjs stats
```

回答三件事：**哪道门最常响**（那条规则模型最常无视，该改的是措辞）、**哪道门从没响过**（可能是死门，也可能规则已被内化）、**失败详情长什么样**（反复出现却没有门的那类问题，只能靠人看）。

不想记加 `--no-log`；写不进去静默跳过，不影响校验。

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

385 项断言，不调模型、不花额度。23 道门包含严格 cinematic 真人摄影、九宫格和终稿动画/CG信号击穿。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/渡口-storyboard.json`：《渡口》第 1 集完整旧版兼容夹具——10 段 34 切认领剧本全部 35 拍，用来守节拍、对齐、配方和旧 JSON 兼容。新 seed 的自适应分镜图结构以 `references/frame-density.md` 的 sparse/balanced/rich 三档示例及自测夹具为准。
