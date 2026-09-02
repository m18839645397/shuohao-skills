**中文** · [English](README.en.md)

# novel-storyboard

给 AI 短剧出**分镜**：把 novel-script 的节拍流切成可以直接下单给视频模型的生成任务单。这是管线里第一个直接面对视频模型的层，前提刻在骨子里：**镜头是生成出来的，多切一刀的成本几乎为零**，短剧观众的注意力节奏是 3 秒左右一切。所以结构是三层：

```
段（segment）＝ 一次视频生成调用，新 seed 默认 5–10 秒，不跨场次
 ├─ 分镜（cut）× 3–5 ＝ 段内剪切，每切 2–5 秒（硬门），各自认领剧本节拍
 ├─ 分镜图 ＝ 每切一张关键帧（<段号>/f1..fN.png）：主图钉 0.00 秒，子图钉各自切点
 └─ H3 提示词 ＝ 一段一条；新 seed 单图 I2VA、多图 Ref2VA，Picture/Shot/切点逐字对账
```

- **两人对话的正反打在一段里一次生成**——全景、A 近景、B 近景各是一个 2–5 秒的分镜，每格构图由自己的分镜图控制，不靠文字赌
- **H3 模式由参考图数量推导** — 新 seed 写 `h3PromptMode: "official-auto"`：单 cut 用 I2VA 三字段；多 cut 用 Ref2VA 六字段，Picture 定义、`fully_preserved` 记录、对应 Shot 与切点时刻全部由结构推导并逐字对账。旧 JSON 原多图格式继续兼容
- **提示词按官方口径默认英文、逐镜换行** — 每个镜头独立一行；台词/歌词/画面文字保留原文（`<d>[Chinese] …</d>` 逐字）。说话人 `(Sx)` 按本段发声顺序稳定复用，画外音检查闭唇。Ref2VA 强制英文；旧模式仍兼容 `promptLang: 'zh'`
- **8 种可选 H3 风格** — MiniMax 官方其余 8 个技能拆为 `h3Style`：极简产品广告、风格化 3D、纸艺定格、品牌宣传、音乐美学贴字、双人游戏菜单、半调纸拼贴、手绘实拍融合。只继承视听/运动风格，不继承业务流程；详见 `references/h3-styles.md`
- **每切有可执行的摄影计划** — 新 seed 默认开启 `cameraPlanMode: "cinematic-controlled"`：起始机位、速度/幅度、目标、焦点、结束构图、导演意图和转场逐字进入自己的 `[Shot k]`；固定镜头默认，一切只用一个主运镜
- **最终提示词达到投产丰富度** — `promptDetailMode: "production-rich"` 要求逐切写空间、光线、主体、动作、效果、连续性，逐段写四层声景和配乐类型/配器/动态/同步点；不是靠字数堆形容词
- **分镜图按叙事需要自动分配信息量** — `framePlanMode: "adaptive-density"` 按镜头功能选择 sparse / balanced / rich；报告和 export 确定性组装完整 imagePrompt，不再把薄的基础 `frame` 直接交给图像模型
- **参考图职责隔离，人物按行为重新调度** — 场景图不下传原机位，角色 screen-test 不下传试镜姿势/手势/手持物，道具 master 不下传白底展示角度；手、视线、承重与道具朝向服从剧本任务，不为镜头摆拍
- **人物表演有六项可校验调度** — 新 seed 默认 `frameBehaviorMode: "causal-blocking"`；有人物的分镜逐项写主体优先级、身体力学、手部任务、视线、微表情和道具交互，空镜跳过
- **每段从真正的初始帧开始** — `frameEntryMode: "start-boundary"` 强制 f1 展示本切新动作前 entry state；只延后本切动作，保留 startState 已存在的搬运、承重、接触和环境动势；后续子分镜才允许 impact/result
- **一次粗九宫格后人工选镜** — `candidateMode: "single-grid-rough"` 每段只用一次调用生成粗九格；报告按点击顺序导出 selection.json，选中格再分别生成高清图，衔接由 edgePlans 管
- **cinematic 严格真人摄影** — 九宫格和终稿都强制真人演员、实体服装/场景、光学镜头与传感器质感，拦截 illustration、concept art、anime、cel shading、3D/CGI/game 信号
- **相邻镜头共享同一状态边界** — `continuityMode: "state-linked"` 对账每切八项 startState/endState、五项 transitionPlan 和连续段 handoff；Shot 2 起先承接同一瞬间再改变景别/机位
- **先继承剧本，再设计摄影** — 上游剧本启用状态链时，每切 `sourceState.before/after` 精确复制认领首拍/末拍的计算状态；跨层门拦截“分镜内部自洽，但没有继承剧本”的假连续
- **分镜图是资产合成，不是凭空画** — 出图挂场景/角色/道具设定图当参考图，novel-art 和 novel-characters 的图在这一步真正被消费。有 codex 就真出图（可选）

产出 `storyboard.json` + Markdown + 一个双击就能开的 `storyboard-report.html`：

![storyboard-report.html](assets/report.webp)

## 质量门：24 道，全是代码

与仓库里另外四个 skill 同一主张：**checklist 交给模型自觉是靠不住的**。

| 门 | 规则 |
| --- | --- |
| **节拍全覆盖** | 剧本每个节拍被恰好一个分镜认领、按顺序、连续、不跨场 |
| 段时长 | 新 seed 为 5–10 秒；旧 JSON 未写下限时继续只守默认 15 秒上限 |
| **分镜时长** | 每切 2–5 秒——3 秒左右的短剧节奏是**硬门**不是建议 |
| 台词装得下 | 认领节拍的台词秒数 ≤ 分镜秒数，逐切检查 |
| 每集总时长 | Σ段 落在剧本 `targetSeconds` ±15% 内 |
| 同框上限 | 单个分镜 ≤ 3 人，超了必须带拆解说明 |
| 段号纪律 | `E01-01` 格式、按顺序连号——段号就是素材文件名 |
| 景别短语 | `close-up` 这类英文短语必须出现在分镜图提示词里 |
| 运镜与执行计划 | 运镜直接用 H3 官方词表且进入自己的 `[Shot k]`；电影化模式下 `cameraPlan` 五个 prompt-ready 字段、速度/幅度与转场逐字对账，固定/动态参数匹配，同切冲突运镜被拦 |
| **H3 结构** | 单图 I2VA、多图 Ref2VA；字段顺序、Picture 定义、保真关系、对应 Shot 与切点时刻逐字对账 |
| **H3 台词逐字** | 认领台词在正确 Shot 逐字进 `<d>`；`(Sx)` 稳定，画外音注明闭唇 |
| **提示词语言一致** | 正文语言与 `promptLang` 双向对账：设定中文写成英文、设定英文混进中文，都拦 |
| **投产提示词丰富度** | 逐切 `visualPlan` 六层、逐段声景四层和有配乐时的音乐四层逐字进入对应 H3 字段，并设中英文最低信息量；无配乐明确 N/A/无 |
| **分镜图自适应密度** | `framePlan` 按 establishing / dialogue / reaction / action / reveal / insert / atmosphere 分配 sparse / balanced / rich 内容预算；字段数量、合理搭配和完整 imagePrompt 确定性检查 |
| **人物因果调度** | 有人物的分镜必须写 `framePlan.behavior` 六项，并逐字进入完整 imagePrompt；空镜免填，旧 JSON 未启用模式时明确跳过 |
| **镜间与段间连续性** | 相邻 cut 的八项末态/首态逐字相等，Shot 2 起切点/动作/光线/声音/轴线桥进入正确字段；同场连续 segment 的状态和 handoff 对账，换场/时间跳跃显式豁免 |
| **风格短语统一** | 静态 `style` 保持同剧画风；选了 `h3Style` 后，其确定性风格指纹逐段进入 Shot 1 |
| 分镜图提示词卫生 | 全英文非空 |
| 提示词不含角色名 | 分镜图提示词恒查；H3 提示词仅英文模式查（中文放行，身份靠分镜图锚定）。给 `--outline` / `--cast` 才查，不给**明说跳过** |
| 引用对账 | 场次/人物/道具全部对账剧本该场 |
| **镜头配方**（可选挂载） | 给了 `--shots <卡片目录>` 才查：cut 的 `recipe` id 在卡库里、卡片的每条必备短语出现在该切组装后的完整 imagePrompt 里、多格配方的连排格数够。不给 `--shots` **明说跳过**；给了但全篇没引用配方也明说 |
| **剧本状态继承** | 上游剧本启用状态链时，每切 `sourceState.before/after` 必须精确等于所认领首拍/末拍的计算状态 |

自测里每道门都有**击穿用例**——证明它真的会拦。

**镜头配方是可选挂载的语汇层**：cut 上可以写一个可选的 `recipe`（外部可选卡库中的卡片 id，**cut 级不是 segment 级**，**多格配方靠连续同 id 的分镜表达**，不是数组）。没装外部卡库照跑不误——本 skill 自包含，连解析卡片 frontmatter 的那 25 行都是自己写的，不跨目录 import。卡片的**建议景别与运镜刻意不设门**，只在报告的「配方」列加 `≠` 标记（悬停看建议值）、`checkup` 末尾出一段提示：配方是语汇不是法条，可选挂载的东西一旦变严就没人挂了，**误拦的门比没有门更糟**。

## 门失败会累积，`stats` 告诉你模型最常违反哪条规则

`validate` 与 `checkup` 每次都把门的结果追加到**当前目录**的 `.gates.jsonl`。积累几十次之后：

```bash
node scripts/novel-storyboard.mjs stats
```

它回答三个问题：

| 问题 | 说明什么 |
| --- | --- |
| **哪道门最常响** | 那条规则模型最常无视——**该改的是规则的措辞，不是再骂一遍模型** |
| **哪道门从没响过** | 可能是死门，也可能规则已经被模型内化了 |
| **失败详情长什么样** | 反复出现却没有对应门的那类问题，只能靠人看这些自由文本发现 |

这是从 SkillOpt「skill 文档是可训练状态」那套思路里拿的一条：**文档不是一次写好的说明书，是要按反馈迭代的东西**——但迭代要有依据，而不是靠印象。日志只累积证据，改不改、怎么改仍然是人的判断。

不想记就加 `--no-log`；写不进去会静默跳过，不影响校验本身。`.gates.jsonl` 已在 `.gitignore` 里。

## 报告长什么样

业内评审用的单页报告，页宽 1600：

- **KPI 带**：生成段数 / 分镜数与平均秒数 / 总时长 vs 目标 / 生成批次数 / 台词段数
- **分镜节奏带**（招牌图）：每集一行色带，**粗分隔 = 段边界（一次生成）**，片宽 = 分镜时长占比、颜色深浅 = 景别远近——深浅相间、长短相间就是好节奏；点一片跳到那张段卡
- **分集分镜表**：每段一张卡——**主分镜图** 16:9（缺图显示提示词占位，**不装有**）、**子分镜条**缩略格、下方**五五分栏**：左列逐切分镜行（起点秒 · 秒数 · 景别 · 运镜 · 转场 · 完整 cameraPlan · 配方 · 画面摘要**从剧本认领的节拍自动带出**），右列 H3 提示词面板——逐镜换行直接可读，一键复制
- **生成批次单**：同场景 + 同光照的段归一批，共用同一张环境参考图——批次卡嵌场景设定图，列出需要的角色设定图和道具
- **配音对齐单**：每句台词对到**段号#切序**——TTS 音频贴到哪一段的第几切，全自动
- **质量门**面板 + 页眉徽章 + **导出 JSON**（下载的就是 `storyboard.json` 原样）
- 全部图形内联 CSS/SVG，零外部依赖，离线双击能开
- 报告界面默认中文，`render --lang en` 输出全英文界面（内置 zh / en 两套）——只切界面标签，与 `promptLang`（H3 提示词语言，默认英文）互相独立。英文界面下质量门标签同样翻译（阈值原样），门的失败详情与数据内容保持原文

## 五个 skill 的接力（管线到此闭环）

```
novel-outline    → outline.json    （什么：结构与分集）
novel-characters → cast.json       （谁：角色设定图）
novel-art        → art.json        （哪里：场景/道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：段、分镜、分镜图、H3 提示词）
```

- `seed <script.json> --eps 1-3 [--h3-style <id>]` 确定性展开每场节拍的编号、秒数、说话人、`delivery`；状态链剧本还带逐拍 `stateBefore/stateAfter`，并默认写入 5–10 秒段长与官方 H3 自动路由
- `validate --script` 是硬前提（分镜离开剧本没有意义）；`--outline` / `--cast` 查提示词人名，`--art` 让报告显示场景名并在批次单嵌设定图
- 分镜图出图走 codex `$imagegen`，场景/角色/道具设定图当 `-i` 参考图；H3 提示词 + 整套分镜图直接下单给 MiniMax H3

## 命令行直接用

```bash
node scripts/novel-storyboard.mjs seed script.json --eps 1     # 切镜底稿
node scripts/novel-storyboard.mjs h3-styles                    # 查看 8 种 H3 风格
node scripts/novel-storyboard.mjs seed script.json --eps 1 \
     --h3-style paper-collage-explainer-generator              # 可选套用一种风格
node scripts/novel-storyboard.mjs h3-scaffold sb.json \
     --segment E01-01                                           # cuts 完成后生成官方可填充骨架
node scripts/novel-storyboard.mjs validate sb.json \
     --script script.json --outline outline.json --cast cast.json
node scripts/novel-storyboard.mjs checkup sb.json --script script.json
node scripts/novel-storyboard.mjs validate sb.json --script script.json \
     --shots /path/to/cards                                              # 可选：挂载配方门
node scripts/novel-storyboard.mjs render sb.json --html \
     --script script.json --outline outline.json --art art.json > storyboard-report.html
node scripts/novel-storyboard.mjs render sb.json --html --lang en \
     --script script.json --outline outline.json --art art.json > storyboard-report.html   # 英文界面报告
node scripts/novel-storyboard.mjs export sb.json --script script.json   # H3 + 每切完整分镜图提示词投产包
```

`export` 的投产结构固定：**每段一个文件夹** `E01-01/`——分镜图 `f1..fN.png`、逐切完整 `f1.prompt.md..fN.prompt.md` 和 H3 `prompt.md` 同住；根部 `manifest.json` 带 Picture 序图清单、完整分镜图提示词路径、切点时刻表和缺图标注。

## 边界

- 不写戏不改台词、不出设定图、不做视频生成与剪辑合成
- 口型/唇形同步暂不管——那是生成管线的事
- 秒数是**下给视频模型的生成时长**不是估算；段上限、分镜节奏区间都在 `params` 里按模型调
- 报告界面内置中英（`--lang`，默认中文）；提示词语言由 `promptLang` 单独控制（默认英文）
- 分镜图默认先挑 rich / balanced / sparse 各一张看效果，确认三档信息量和构图再往后补——一集约 30–40 格，方向错了整批重来

## 文件

```
SKILL.md                 给 agent 读的工作流
scripts/
  novel-storyboard.mjs   seed / h3-styles / h3-scaffold / select / validate / checkup / render / export / slug
  selftest.mjs           445 项断言，不调模型
references/
  schema.md              storyboard.json 结构 + 时长约束链
  h3-prompt.md           H3 提示词写法规范（官方方法论内化版）
  h3-styles.md           MiniMax 官方 8 个视频技能拆出的 H3 风格层
  camera-direction.md    克制电影化运镜：执行计划、转场、按节拍自动选择
  prompt-detail.md       投产级丰富提示词：六层视觉、四层声景、配乐动态
  candidate-grid.md      单图粗九宫格、人工顺序选择、edge-driven 运镜
  frame-entry.md         段首 f1 动作入口态与 H3 0.00 秒起动边界
  frame-density.md       分镜图自适应 sparse / balanced / rich 画面密度
  frame-behavior.md      人物主体层级 / 动作相位 / 手 / 视线 / 表情 / 道具交互
  continuity.md          镜间状态链、动作/光线/声音桥、段间 handoff
  storyboard-pass.md     切镜：分段规则、导演运镜手感、常见病
  frame.md               分镜图出图的 codex 调用契约
  report-style.md        报告的设计约定
examples/
  渡口-storyboard.json    《渡口》第 1 集完整分镜（10 段 34 切认领 35 拍），全部质量门通过，也是自测夹具
assets/
  report.webp            报告截图
```

## 自测

```bash
node scripts/selftest.mjs
```

445 项断言，覆盖 I2VA/Ref2VA 自动路由与骨架、8 种 H3 风格、稳定说话人编号、cinematic、naturalistic 现实分镜、人物因果调度、九宫格、人工选择、edgePlans、入口帧和 24 道门。

已在 Windows + Node 22.19.0 跑通全量自测；运行要求 Node ≥ 18。
