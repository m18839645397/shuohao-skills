# H3 视频提示词 · 写法规范（内化版）

方法论学自 MiniMax-H3 官方提示词指南（I2VA / 多图对齐模式），**内化成本 skill 自带文档——不依赖任何外部 skill**。写每段的 `h3Prompt` 照这份做；先读 `camera-direction.md`、`prompt-detail.md` 和 `continuity.md`，结构、投产信息与镜间状态都有质量门逐字对账。

## 语言分工

- **默认整条英文**（`promptLang: 'en'`）——官方规范的口径：正文、对齐指令、字段名、镜头标记全英文，禁角色名（用 an old ferryman 这类通用身份）
- 三样东西保留原文语言（官方规定）：**台词**（`<d>[Chinese] …</d>` 逐字原文，一个标点都不许动，门盯着）、歌词、画面里可见的文字（英文双引号原样引用）
- `promptLang: 'zh'` 可切整条中文（对齐指令、字段名、镜头标记都有中文版，人名放行）——偏离官方推荐的备选项，实测中文效果不稳就回英文

## 结构（validate 逐字对账的部分）

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 3.00-second mark of the target video; ….
（单分镜的段改用官方 I2VA 固定句：For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.）

integrated_multimodal_description:
[Shot 1] Cinematic, live-action, cold gray-green palette. 先写 `motion begins only after the 0.00-second entry frame`，确认 <Picture 1> 是 sourceState.before / startState 的动作前入口态；随后才把 before → after 翻成可见动作，再写 visualPlan、cameraPlan、结束状态、连续性、导演意图和台词（全英文）。
[Shot 2] At 00:03.000, continue directly from Shot 1 at the same instant, then anchor <Picture 2>: ……（**每个镜头独立一行**；先承接上一镜的状态和动作桥，再改变景别/机位）

overall_soundscape: audioPlan.soundscape 的基底、渐强、事件、余韵四层。不复述台词。

non_diegetic_music: 有配乐时写 audioPlan.music 的类型、配器、动态曲线、同步点；没有就写 N/A。
```

中文模式（promptLang=zh）的对应 token：`参考图与目标视频的对齐——` / `整体视听描述：` / `[镜头 k] 于 00:0X.XXX，`，配乐没有写「无」。

首行对齐指令和切点时刻**由分镜秒数推导**，改了秒数忘改提示词，validate 当场拦。

## 运镜

- 先读 `camera-direction.md`。新 seed 默认 `cameraPlanMode: "cinematic-controlled"`，每切都填 `cameraPlan` 与 `transition`。
- 词表 20 种（schema.md 的 camera 枚举）。**一切只用一个主运镜**，固定镜头默认；不要用否定句罗列其他运镜词。
- 每个分镜的运镜词必须落在自己那一行里：英文用官方词（static shot / push in / tracking shot……），中文模式用词表中文词（固定/推/拉/跟拍……）。
- 动态运镜的速度、幅度、转场 token，以及 `start` / `target` / `end` / `focus` / `intent` 五个 prompt-ready 原句必须逐字进入自己的 `[Shot k]`；质量门会对账。
- `Static Shot` 必须用 `pace=static`、`magnitude=none`；POV 可以固定或移动，但固定时这两个值必须成对出现；其他运镜必须给非静态速度与非零幅度。

## 说话人与台词

- 说话人第一次出现给足辨识信息（身份、年龄段、音色、语速），编号 `(S1)` `(S2)` 全段稳定；同说不同人用 `(S1,S2)`
- `<d>` 里只放语言标签和台词原文；身份、音色、语气写在 `<d>` 外面
- **画外音**：中文写「以画外音说（唇形完全闭合）」；英文用官方句式 `says in an off-screen voiceover … while their lips remain completely closed`
- 画面里真实可见的文字（招牌、字条）用英文双引号原样引用，不翻译

## 声音字段的分工（踩过的坑）

- 台词、歌声、剧内音乐 → 描述字段；环境与动作声 → `overall_soundscape`；配乐 → `non_diegetic_music`
- **声景也是动作指令**：画面动作改了，声景必须一起改——声景里写「铜铃在撞击时炸响」，视频就真把撞击演出来
- 新 seed 默认 `promptDetailMode: "production-rich"`。逐切 `visualPlan` 六层、逐段 `audioPlan.soundscape` 四层和有配乐时的 `audioPlan.music` 四层必须逐字进入对应字段，详见 `prompt-detail.md`。

## 关键帧怎么用

- 静态关键帧先按 `frame-density.md` 填 `framePlan`，再使用报告或 export 生成的完整 imagePrompt 出图；不要把 JSON 里的基础 `frame` 直接交给图像模型。
- 每段 f1 强制 `moment=entry`，逐项翻译 startState；H3 动作只能在0.00秒入口帧之后开始。详见 `frame-entry.md`。
- 主分镜图（f1）钉 0.00 秒，是这一段世界观的完全参照；每个 `[Shot k]` 先锚定 `<Picture k>` 的构图与人物状态，再写动作展开
- 动作遵守 novel-script 的**常见动作原则**：挑担上船、搭手卸担这类模型见过千万次的动作；精确物理交互、微表情不要写
- 人物**此刻的位置状态**（已上船 / 在舱内）要和分镜图一致——图与文对不上，模型听图的，动作就乱
- f2 起关键帧生成必须同时挂标准资产、本段 f1 和立即上一切；连续段的下一段 f1 还要挂上一段最后一帧。具体调用见 `frame.md` 和 `continuity.md`。

## 连续性

- 新 seed 默认 `continuityMode: "state-linked"`。
- 上游剧本也启用状态链时，cut 先按认领节拍复制 `sourceState.before/after`。`[Shot k]` 的动作必须从 before 开始、停在 after，不得重新发明道具持有人或动作阶段。
- 相邻 cut 的 `endState` 与 `startState` 八项逐字相等；Shot 2 起填 `transitionPlan`，明确切点、动作、光线、声音和轴线怎样跨切。
- Shot 2 起必须含 `continue directly from Shot k at the same instant`；中文使用「在同一时刻直接承接镜头 k」。转场桥的视觉字段进入当前 Shot，audioCarry 进入 overall_soundscape。
- 同场连续 segment 用 `handoff.kind=continuous`，段首写 `continue directly from segment E01-01 at the same instant`；换场/时间跳跃分别标记 `scene-change` / `time-jump`。
