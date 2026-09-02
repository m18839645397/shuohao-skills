# H3 视频提示词 · 官方结构内化版

方法论来自 MiniMax-H3 官方 `h3-prompt-writing`（2026-08-28 核对 commit `d21241f0a4b3acbb34c97dae47fa417b7065e438`），已内化到本 skill，不要求另装外部技能。写每段 `h3Prompt` 前先读 `camera-direction.md`、`prompt-detail.md`、`continuity.md`；选了 `h3Style` 再读 `h3-styles.md`。

## 先定生成模式

新 seed 写入 `h3PromptMode: "official-auto"`，按每段实际参考图自动路由：

- **1 个 cut / 1 张首帧图 → I2VA**：从 `<Picture 1>` 的 0.00 秒入口态向后发展。
- **2 个以上 cut / 每切一张分镜参考图 → Ref2VA**：`<Picture 1>` 是首帧，其余 Picture 是各 Shot 的 storyboard reference；使用官方六段式。
- 不把多张 Shot 参考图伪装成 FL2VA。FL2VA 只表达首帧到末帧的连续路径，通常偏单镜；当前多切分镜应走 Ref2VA。
- 旧 JSON 没有 `h3PromptMode` 时继续兼容原来的多图对齐行，便于回放和重渲染；新项目不要再照旧格式起稿。

官方自动模式默认且推荐 `promptLang: "en"`。Ref2VA 六段式按官方要求全英文；台词、歌词和画面可见文字保留原语言。

## I2VA：单分镜段

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description:
[Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

`[Shot 1]` 先建立画风、构图、主体、空间与 `<Picture 1>` 的身份/位置锚点，尽早写入 `motion begins only after the 0.00-second entry frame`。这句只延后本切新认领的动作；若 startState 已有未完成搬运、承重、接触或环境动势，先明确其当前阶段继续存在，再展开本切动作、运镜、状态变化、同步声音和台词。

## Ref2VA：多分镜段

字段顺序固定：

```text
subject_definitions:
<Picture 1> is the first frame of [Shot 1] at 0.00 seconds, defining its viewpoint, subject placement, identity anchors, and pre-action state.
<Picture 2> is a storyboard reference for [Shot 2] at 3.00 seconds, defining its viewpoint, subject placement, identity anchors, and cut-entry state.

summary:
[keyframe completion + reference generation] The target video begins from <Picture 1> and uses <Picture 2> as a storyboard reference for the ordered shot flow.

retention_analysis:
<Picture 1> ([Shot 1] first frame): fully_preserved - preserve the referenced composition, subject placement, identity anchors, and pre-action state at 0.00 seconds.
<Picture 2> ([Shot 2] storyboard reference at 3.00 seconds): fully_preserved - preserve the referenced viewpoint, subject placement, identity anchors, and cut-entry state.

detailed_description:
[Shot 1] ... <Picture 1> ...
[Shot 2] At 00:03.000, ... <Picture 2> ...

overall_soundscape: ...

non_diegetic_music: ...
```

Picture 定义、保真前缀和秒数来自 `h3ReferencePlan(cuts)`，质量门逐字检查；复制模板后再在每行后补具体人物、构图、道具与状态，不要改前缀。每个 `[Shot k]` 必须引用对应 `<Picture k>`。`summary` 不讲剧情梗概，只说明目标视频和参考关系。

cuts 完成后可直接生成不含剧情臆测的可填充骨架：

```bash
node scripts/novel-storyboard.mjs h3-scaffold storyboard.json --segment E01-01
```

骨架中的方括号占位必须用真实 `visualPlan`、`cameraPlan`、状态、声音与台词填完，不能把占位原样交给 H3。

## 每个 Shot 的写法顺序

每个镜头独立一行。第一镜不写时间戳；后续镜头以推导切点开头：`[Shot 2] At 00:03.000, ...`。

建议顺序：

1. Shot 2 起先写 transition 与 `continue directly from Shot k at the same instant`；连续 segment 的 Shot 1 先写 segment handoff。
2. 锚定本 Shot 的 `<Picture k>`、`sourceState.before` / `startState`、人物位置、道具持有人、构图和光位。
3. 写 `visualPlan.environment / lighting / subject / action / effects / continuity` 原文。
4. 把 before → after 翻成可观察的动作；不要写剧情总结或抽象情绪。
5. 自然写入一个主运镜，以及有意义时的幅度与速度，再写 cameraPlan 的起点、目标、焦点、结束构图和意图。
6. 写 diegetic sound、人物反应、对白；停在 `endState`，把状态交给下一 Shot。

选了 `h3Style` 时，运行 `h3-styles <id> --lang en`，把输出的确定性风格指纹逐字放在每段视听描述的 `[Shot 1]` 开头。风格不许覆盖剧情事实和参考图。

## 运镜

- 官方词表见 `schema.md`；英文自然语言中表达，不在句尾堆标签。
- 完整运镜由 **类型 + 幅度 + 速度** 组成；中等幅度/正常速度无意义时可省略，但新 `cameraPlanMode` 会要求结构化值与提示词对账。
- 每切一个主运镜。固定镜头用 `Static Shot`；动态镜头不得再夹带其他冲突运镜词。
- `cameraPlan.start / target / end / focus / intent`、速度、幅度、transition token 必须逐字进入自己的 Shot。
- 轻微改景别或角度优先运镜；新信息、状态、时间或视点变化才切镜。

## 说话人与台词

- `(S1)`、`(S2)` 按**本段真实发声顺序**分配；同一说话人跨 Shot 始终复用同一编号。质量门按剧本 speaker 对账。
- 说话人第一次发声时，在 `<d>` 外写身份、年龄段、音色、语速/口音和表演动作；后续保留编号，不必重复长定义。
- `<d>` 内只放语言标签和剧本原文，文字与标点不得改：`<d>[Chinese] 原台词。</d>`。
- 多人同说用 `(S1,S2)`。
- 画外音必须用 `says in an off-screen voiceover`，并在 `</d>` 后注明对应画面人物 `lips remain completely closed`。
- 当前 beat 认领以整拍为单位，正常不会把一句台词拆到两个 Shot。导入外部数据确有跨切台词时，两部分都用 `<scenetrans>` 并说明声音连续；视频结尾截断语音用 `<cutoff>`，不要伪造完整句。

## 画面文字与音频分层

- 画面真实可见的招牌、字条、歌词或 UI 文案用英文双引号包住，保留原文，不翻译。
- 台词、歌声、剧内音乐、同步动作声写在视听描述中。
- `overall_soundscape` 用 1–4 句汇总环境声、物理动作声和非语言人声，不重复 `<d>` 台词。
- `non_diegetic_music` 用 1–3 句写观众听见、角色听不见的配器、速度、节奏和动态；不要只写“感人/电影感”。无配乐写 `N/A`。
- 风格预设对声音有建议，但不能新增剧本没有的旁白、歌词、Logo、UI 文案或产品主张。

## 关键帧与连续性

- f1 是 0.00 秒本切新动作前 entry state；本切新动作只能在入口帧之后开始，但 startState 已存在的未完成动作和物理动势不能被重置。
- Ref2VA 的 f2...fN 是 Shot 规划参考，不是让模型静止复刻整段；每个 Shot 先承接状态，再沿可见动作走向下一状态。
- `sourceState` 是剧本事实，`startState/endState` 是摄影翻译，`transitionPlan/handoff` 是跨切桥。三层不能互相替代。
- 人物位置、姿势、视线、道具、光效、银幕方向和声音桥都要从上一末态接到下一首态；换场或时间跳跃必须显式标记。

## 自检

- 模式与参考数匹配：单图 I2VA，多图 Ref2VA。
- 字段名、顺序、Picture 定义、保真记录和 Shot 时刻没有漂。
- 每个 Picture 在对应 Shot 出现；第一镜无时间戳，后续切点等于前面 cut 秒数之和。
- 每句台词在正确 Shot 的 `<d>` 中，前面有正确 `(Sx)`；画外音闭唇。
- 风格指纹只在选了 `h3Style` 时要求，并逐段进入 Shot 1。
- 声景和配乐不重复 `<d>`；视觉、声音和状态变化彼此一致。
