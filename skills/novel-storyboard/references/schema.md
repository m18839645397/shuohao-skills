# storyboard.json 结构

三层：**集 → 段（segment）→ 分镜（cut）**。

- **段** = 一次视频生成调用，总时长 ≤ `maxSegmentSeconds`（默认 15 秒），不跨场次——换景必开新段
- **分镜** = 段内的一次剪切，`minCutSeconds`–`maxCutSeconds`（默认 2–5 秒），各自认领剧本节拍、带景别运镜和一张分镜图
- **分镜图** = 每个分镜一张关键帧：第 1 切的是**主分镜图**（钉在 0.00 秒），其余是**子分镜图**（各钉在自己的切点时刻）。**每段一个文件夹**：`<段号>/f<切序>.png` + `prompt.md`（export 生成，内容就是 h3Prompt）

```json
{
  "source": "渡口",
  "cameraPlanMode": "cinematic-controlled",
  "promptDetailMode": "production-rich",
  "continuityMode": "state-linked",
  "style": "realistic",
  "promptLang": "zh",
  "params": { "maxSegmentSeconds": 15, "minCutSeconds": 2, "maxCutSeconds": 5, "maxOnScreen": 3, "tolerance": 0.15 },
  "episodes": [ { "ep": 1, "segments": [ ... ] } ]
}
```

`promptLang` 可省略（**默认 `en`——官方规范口径**）：整条英文、禁角色名，台词在 `<d>[Chinese]` 里保留原文。设成 `zh` 可切整条中文（对齐指令、字段名、镜头标记都有中文版，人名放行）——偏离官方推荐的备选项。`style` 可省略（默认 `realistic`），预设与角色/场景 skill 同名对齐（`realistic` / `cinematic` / `ghibli` / `inkwash`），对应的英文短语（如 `cinematic film still`）必须出现在**每条**分镜图提示词里——同一部剧的分镜图不许画风漂，门查。

`seed` 默认写入 `cameraPlanMode: "cinematic-controlled"`、`promptDetailMode: "production-rich"` 与 `continuityMode: "state-linked"`。三者分别控制运镜执行、提示词丰富度和镜间/段间状态链，详见 `camera-direction.md`、`prompt-detail.md`、`continuity.md`。旧 JSON 没有对应模式字段时继续按旧规则校验，报告会明确提示该项检查已跳过。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是素材文件名（`E01-01.mp4` / `E01-01-f1.png`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存**——少一处会漂的冗余 |
| `handoff` | object | 段间交接：本集第一段 `episode-start`；其余为 `continuous` / `scene-change` / `time-jump`。连续段带 fromSegment、visualCarry、motionCarry、audioCarry |
| `audioPlan` | object | 投产音频计划：`soundscape` 含 baseline/build/events/aftermath；`music.mode` 为 scored 时含 style/instrumentation/arc/sync，为 none 时配乐字段写 N/A/无 |
| `h3Prompt` | string | **一段一条 H3 视频提示词**，正文语言跟 `promptLang`（默认中文），结构见 `references/h3-prompt.md` |
| `note` | string | 备注，可选 |

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 认领该场第几拍到第几拍（含两端）。**每个节拍必须被恰好一个分镜认领**，按顺序、连续 |
| `seconds` | number | 分镜时长，2–5 秒——短剧的注意力节奏是硬门。认领节拍的台词秒数必须装得下 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写 |
| `camera` | enum | 运镜，**直接用 H3 官方词表**（原样字符串）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise` |
| `cameraPlan` | object | 克制电影化执行计划：`pace`、`magnitude`、`start`、`target`、`end`、`focus`、`intent`；五个文本字段跟随 `promptLang`，是要逐字写进 H3 的 prompt-ready 原句 |
| `transition` | enum | 本切如何从上一切进入：`straight-cut` / `cut-on-action` / `reaction-cut` / `match-cut` / `reveal-cut` |
| `visualPlan` | object | 投产视觉计划：`environment` / `lighting` / `subject` / `action` / `effects` / `continuity`，跟随 promptLang，逐字进入本切 `[Shot k]` |
| `startState` / `endState` | object | 连续状态八项：location、subjectPosition、bodyPose、gaze、propState、lightState、effectState、screenDirection；相邻 cut 强制前末态 = 后首态 |
| `transitionPlan` | object | Shot 2 起的动作桥：cutPoint、motionCarry、lightCarry、audioCarry、axisCarry；前四个视觉字段进入当前 Shot，audioCarry 进入声景 |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `frame` | string | **分镜图英文提示词**：这一格关键帧的样子。景别英文短语必须在里面；禁角色名 |
| `recipe` | string | 镜头配方卡 id，可选。挂了 `--shots <卡片目录>` 才查（`shot-recipe` 门）。**cut 级不是 segment 级**——一段可以跨多种配方；**多格配方靠连续同 id 的分镜表达**，不是数组 |
| `note` | string | 备注，可选 |

`recipe` 是**可选挂载**：不给 `--shots` 就整门跳过。给了就查三条——id 在卡库里、卡片的每条 `must_phrases` 出现在该切的 `frame` 里（两边小写化后 `includes`）、卡片 `cuts` 下限 ≥ 2 时连续同 id 的分镜数不得低于该下限。卡片的**建议景别与运镜不设门**，只在报告里提示偏离：配方是语汇不是法条。

## h3Prompt 的结构（多道门逐层对账）

写法见 `references/h3-prompt.md`（官方方法论的内化版，本 skill 自包含不依赖外部 skill）。骨架：

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 3.00-second mark of the target video; ….

integrated_multimodal_description:
[Shot 1] Cinematic, live-action, …（首格锚定 → 动作 → 运镜 → 对白）
[Shot 2] At 00:03.000, the camera cuts to …（每个镜头独立一行，切点时刻开头）

overall_soundscape: …（环境声与动作声，1–4 句）

non_diegetic_music: …（1–3 句，没有就 N/A）
```

确定性检查的八条：

1. **首行对齐指令整行由分镜结构按 `promptLang` 推导**（`h3AlignmentLine`）：多分镜的段把每张分镜图钉在自己的切点秒数上；单分镜的段用固定句式。validate **逐字对账**——分镜秒数一改，旧指令立刻对不上
2. 三个字段名齐全且按序；描述正文有 `[Shot 1]`
3. **每个 `[Shot k]`（k ≥ 2）必须带切点时刻 `At 00:0X.XXX,`，且等于前面分镜秒数的累计**——节奏写在纸上就必须和提示词一致
4. 认领节拍的每句台词**逐字**进 `<d>[Chinese] …</d>`；说话人身份音色语气用英文写在 `<d>` 外；画外音用 `says in an off-screen voiceover` 并注明唇形闭合
5. `<d>` 块之外的正文语言与 `promptLang` 一致（中文写成英文、英文混进中文都拦）；英文模式禁角色名，中文模式放行（身份靠分镜图锚定）
6. 每个分镜的运镜词必须出现在自己的 `[Shot k]`；电影化模式下，动态运镜的速度/幅度、转场 token、`cameraPlan` 五个文本字段逐字对账，固定/动态参数匹配，并拦截英文提示词中同切出现多个主运镜
7. 丰富模式下，`visualPlan` 六层逐字进入本切；`audioPlan.soundscape` 四层逐字进入 overall_soundscape；有配乐时 `audioPlan.music` 四层逐字进入 non_diegetic_music，无配乐明确 N/A/无。英文每项至少 24 字符，中文至少 10 字符
8. 连续模式下，相邻 cut 状态八项逐字相等，Shot 2 起有同一瞬间承接句和五项 transitionPlan；连续 segment 的末态/首态相等，handoff 三项进入下一段 Shot 1 与声景。scene-change/time-jump 显式标记后允许断开

## 时长约束链

台词秒数（按剧本语速折算）≤ 分镜 `seconds` ≤ 5 秒；段 Σ分镜 ≤ 15 秒；集 Σ段 落在剧本 `targetSeconds` ±15%。全部由 validate 逐级对账。
