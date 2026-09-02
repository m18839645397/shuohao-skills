# storyboard.json 结构

三层：**集 → 段（segment）→ 分镜（cut）**。

- **段** = 一次视频生成调用；新 seed 默认 `min/maxSegmentSeconds = 5/10`，不跨场次——换景必开新段
- **分镜** = 段内的一次剪切，`minCutSeconds`–`maxCutSeconds`（默认 2–5 秒），各自认领剧本节拍、带景别运镜和一张分镜图
- **分镜图** = 每个分镜一张关键帧：第 1 切的是**主分镜图**（钉在 0.00 秒），其余是**子分镜图**（各钉在自己的切点时刻）。**每段一个文件夹**：`<段号>/f<切序>.png` + `prompt.md`（export 生成，内容就是 h3Prompt）

```json
{
  "source": "渡口",
  "cameraPlanMode": "cinematic-controlled",
  "promptDetailMode": "production-rich",
  "framePlanMode": "adaptive-density",
  "frameBehaviorMode": "causal-blocking",
  "frameEntryMode": "start-boundary",
  "candidateMode": "single-grid-rough",
  "selectionMode": "human-ordered",
  "edgePlanMode": "edge-driven",
  "continuityMode": "state-linked",
  "h3PromptMode": "official-auto",
  "h3Style": null,
  "style": "realistic",
  "promptLang": "en",
  "params": { "minSegmentSeconds": 5, "maxSegmentSeconds": 10, "minCutSeconds": 2, "maxCutSeconds": 5, "maxOnScreen": 3, "tolerance": 0.15 },
  "episodes": [ { "ep": 1, "segments": [ ... ] } ]
}
```

`promptLang` 可省略（默认 `en`）。`style` 与角色/场景 skill 同名对齐；`h3Style` 是可选的视频运动/包装风格，8 个值见 `h3-styles.md`，不要与静态资产 `style` 混为一谈。cinematic 每条 frame 使用 `live-action production still`，完整 imagePrompt 自动加入真人演员、实体场景、光学镜头、传感器质感，以及插画/动画/3D/CG禁项。

`seed` 默认写入上述模式。每段先用一次 `single-grid-rough` 生成粗九宫格，人工顺序选择后重排 cuts，并用 `edge-driven` 规划相邻终稿衔接；详见 `candidate-grid.md`。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是素材文件名（`E01-01.mp4` / `E01-01-f1.png`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存**——少一处会漂的冗余 |
| `candidateBoard` | object | `mode` + 固定九格 `cells` + 人工 `selected` + `needsReplan`。九格结构与选择数量见 `candidate-grid.md` |
| `edgePlans` | object[] | 相邻人工选择之间的运镜边，恰好 N−1 条；from/to、camera、transition、pace、magnitude、target、focus、intent |
| `handoff` | object | 段间交接：本集第一段 `episode-start`；其余为 `continuous` / `scene-change` / `time-jump`。连续段带 fromSegment、visualCarry、motionCarry、audioCarry |
| `audioPlan` | object | 投产音频计划：`soundscape` 含 baseline/build/events/aftermath；`music.mode` 为 scored 时含 style/instrumentation/arc/sync，为 none 时配乐字段写 N/A/无 |
| `h3Prompt` | string | **一段一条 H3 视频提示词**，正文语言跟 `promptLang`（默认英文）；新 seed 单图 I2VA、多图 Ref2VA，结构见 `references/h3-prompt.md` |
| `note` | string | 备注，可选 |

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 认领该场第几拍到第几拍（含两端）。**每个节拍必须被恰好一个分镜认领**，按顺序、连续 |
| `candidateId` | string | 本切来自人工选择的 G1–G9 哪一格；顺序必须与 candidateBoard.selected 一致 |
| `sourceState` | object | 跨层剧情状态：`before` 必须精确复制认领首拍的 `stateBefore`，`after` 必须精确复制认领末拍的 `stateAfter`。仅在上游剧本启用状态链时必填 |
| `seconds` | number | 分镜时长，2–5 秒——短剧的注意力节奏是硬门。认领节拍的台词秒数必须装得下 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写 |
| `camera` | enum | 运镜，**直接用 H3 官方词表**（原样字符串）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise` |
| `cameraPlan` | object | 克制电影化执行计划：`pace`、`magnitude`、`start`、`target`、`end`、`focus`、`intent`；五个文本字段跟随 `promptLang`，是要逐字写进 H3 的 prompt-ready 原句 |
| `transition` | enum | 本切如何从上一切进入：`straight-cut` / `cut-on-action` / `reaction-cut` / `match-cut` / `reveal-cut` |
| `visualPlan` | object | 投产视觉计划：`environment` / `lighting` / `subject` / `action` / `effects` / `continuity`，跟随 promptLang，逐字进入本切 `[Shot k]` |
| `framePlan` | object | 分镜图计划：`moment` / `entryStatePrompt` + `role` / `density` / `keyMoment` / `composition` / `atmosphere` / `foreground[]` / `background[]` / `storyCues[]` / `exclude[]`；有人物时再带 `behavior` 六项：primaryFocus / bodyMechanics / handPurpose / eyeline / expression / propInteraction。段首 moment 强制 entry；详见 `frame-entry.md`、`frame-density.md`、`frame-behavior.md` |
| `startState` / `endState` | object | 连续状态八项：location、subjectPosition、bodyPose、gaze、propState、lightState、effectState、screenDirection；相邻 cut 强制前末态 = 后首态 |
| `transitionPlan` | object | Shot 2 起的动作桥：cutPoint、motionCarry、lightCarry、audioCarry、axisCarry；前四个视觉字段进入当前 Shot，audioCarry 进入声景 |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `frame` | string | **分镜图基础英文提示词**：保存景别、主体和统一风格短语；禁角色名。最终交给 imagegen 的完整提示词由脚本把它与 `framePlan`、参考图职责和连续性约束确定性组装 |
| `recipe` | string | 镜头配方卡 id，可选。挂了 `--shots <卡片目录>` 才查（`shot-recipe` 门）。**cut 级不是 segment 级**——一段可以跨多种配方；**多格配方靠连续同 id 的分镜表达**，不是数组 |
| `note` | string | 备注，可选 |

`recipe` 是**可选挂载**：不给 `--shots` 就整门跳过。给了就查三条——id 在卡库里、卡片的每条 `must_phrases` 出现在该切组装后的完整 imagePrompt 里（两边小写化后 `includes`）、卡片 `cuts` 下限 ≥ 2 时连续同 id 的分镜数不得低于该下限。卡片的**建议景别与运镜不设门**，只在报告里提示偏离：配方是语汇不是法条。

## h3Prompt 的结构（多道门逐层对账）

写法见 `references/h3-prompt.md`（官方方法论的内化版，本 skill 自包含不依赖外部 skill）。新 seed 的 `h3PromptMode: "official-auto"` 按参考图数量路由：

- 单 cut：I2VA，固定首帧对齐行 + 三个 core fields。
- 多 cut：Ref2VA，六字段按序：`subject_definitions` / `summary` / `retention_analysis` / `detailed_description` / `overall_soundscape` / `non_diegetic_music`。

多 cut 骨架：

```text
subject_definitions:
<Picture 1> is the first frame of [Shot 1] at 0.00 seconds, ...
<Picture 2> is a storyboard reference for [Shot 2] at 3.00 seconds, ...

summary:
[keyframe completion + reference generation] ...

retention_analysis:
<Picture 1> ([Shot 1] first frame): fully_preserved - ...
<Picture 2> ([Shot 2] storyboard reference at 3.00 seconds): fully_preserved - ...

detailed_description:
[Shot 1] ... <Picture 1> ...
[Shot 2] At 00:03.000, ... <Picture 2> ...

overall_soundscape: …（环境声与动作声，1–4 句）

non_diegetic_music: …（1–3 句，没有就 N/A）
```

确定性检查：

1. `official-auto` 单图必须走 I2VA，多图必须走 Ref2VA；旧 JSON 未声明模式时保留原多图格式兼容
2. I2VA 三字段、Ref2VA 六字段齐全且按序；Ref2VA 的 Picture 定义、`fully_preserved` 记录和 Shot 引用逐张对账
3. **每个 `[Shot k]`（k ≥ 2）必须带切点时刻 `At 00:0X.XXX,`，且等于前面分镜秒数的累计**——节奏写在纸上就必须和提示词一致
4. 认领节拍的每句台词在**正确 Shot** 逐字进 `<d>[Chinese] …</d>`；`(Sx)` 按本段发声顺序稳定分配；画外音用 `says in an off-screen voiceover` 并注明 `lips remain completely closed`
5. `<d>` 块之外的正文语言与 `promptLang` 一致（中文写成英文、英文混进中文都拦）；英文模式禁角色名，中文模式放行（身份靠分镜图锚定）
6. 每个分镜的运镜词必须出现在自己的 `[Shot k]`；电影化模式下，动态运镜的速度/幅度、转场 token、`cameraPlan` 五个文本字段逐字对账，固定/动态参数匹配，并拦截英文提示词中同切出现多个主运镜
7. 丰富模式下，`visualPlan` 六层逐字进入本切；`audioPlan.soundscape` 四层逐字进入 overall_soundscape；有配乐时 `audioPlan.music` 四层逐字进入 non_diegetic_music，无配乐明确 N/A/无。英文每项至少 24 字符，中文至少 10 字符
8. 自适应分镜图模式下，`framePlan` 按镜头功能使用 sparse/balanced/rich 的内容预算，字段与数量确定性校验；报告和 export 输出脚本组装后的完整 `imagePrompt`
9. 入口帧模式下，每段 f1 必须 `moment=entry`，五项 `entryStatePrompt` 完整英文，禁止动作中段/结果语义；[Shot 1] 声明动作仅在0.00秒后开始
10. 九宫格模式下，每段恰好九格；人工选择从 entry 到 result，数量符合段长；cuts/candidateId 与 N−1 条 edgePlans 对账
11. 连续模式下，相邻 cut 状态八项逐字相等，Shot 2 起有同一瞬间承接句和五项 transitionPlan；连续 segment 的末态/首态相等，handoff 三项进入下一段 Shot 1 与声景
12. 上游剧本启用状态链时，每切 `sourceState.before/after` 与认领节拍的计算前态/后态逐项相等
13. 选择 `h3Style` 时，其确定性风格指纹必须逐段进入视听描述的 `[Shot 1]`；8 种风格详见 `h3-styles.md`

## 时长约束链

台词秒数（按剧本语速折算）≤ 分镜 `seconds` ≤ 5 秒；新 seed 的段 Σ分镜为 5–10 秒；集 Σ段 落在剧本 `targetSeconds` ±15%。全部由 validate 逐级对账。
