**中文** · [English](README.en.md)

# novel-characters

丢一本小说或一篇短故事进去，输出每个角色的完整设定：

- **角色表** — 谁出场了，主角还是龙套，跨章节的不同称呼归并到同一个人
- **人物画像** — 性别、年龄、身份、外貌、性情、动机、人物弧光、关系网，每条附**原文逐字引文**
- **形象提示词** — 半写实厚涂路线，双语出图 prompt + negative prompt + 风格标签，直接喂 Midjourney / SD / GPT-Image
- **群像视觉身份** — 先做 design-matrix，再按 importance 分配1–5个签名锚点；主角在剪影、中景和特写三个距离都能认出，重要角色主动形成对照
- **音色提示词** — 音色、音高、语速、口音、情绪，双语 voice-design prompt，直接喂 Qwen3-TTS / ElevenLabs Voice Design
- **角色设定图** — **每个角色一张**：16:9 分三区，左侧约 34% 证件照式半身像（面部基准）、右上全身三视图、右下关键细节特写条。**画风可选**：默认半写实厚涂，也可以出电影级真人写实、吉卜力动画风或国风水墨。白底方便抠图，走 codex 内置出图（可选）
- **cinematic 真人定妆单帧** — 额外生成 screen-test.png 给分镜使用，避免白底三视图把目录/动画设定稿质感传到最终镜头
- **关系图谱** — 报告里的一个全景视图：谁跟谁有关系、是什么关系，一眼看完。悬停一个人亮出他的全部关系，点一下跳到那个人的详情

产出 `cast.json` + Markdown + 一个双击就能开的 `report.html`。

**报告语言可指定**，默认中文：

```
/novel-characters ./book.txt --lang en
/novel-characters ./book.txt --lang ja
```

内置 **中文 / English / 日本語** 三套界面文案。**其他语言一样支持**——skill 会现场把界面文案翻译成目标语言，存进 `cast.json` 的 `ui` 字段，渲染时合并进去。所以法语、韩语、西班牙语都能出完整报告，不会露出英文界面。

想自己准备翻译：

```bash
node scripts/novel-characters.mjs ui-template fr   # 打印待翻译的骨架
```

## 上游

管线里**大纲在角色的上游**：

```
novel-outline    → outline.json （什么：结构与分集，谁进谁不进）
novel-characters → cast.json    （谁：角色资产）
```

有 `outline.json` 就走 `seed`——它的 `characters` 块已经定死了角色清单：

```bash
node scripts/novel-characters.mjs seed outline.json > seed.json
```

搬过来的是大纲拍板过的事实（角色码、名字、分档、人物线、由原著的谁合并而来），留空的是这一层才该做的设计（别名、画像、visualIdentity、形象提示词、音色提示词）。新 seed 默认开启 `designMode: "ensemble-signature"`。

**大纲定的分档不要在这一层推翻**，觉得不对回去改大纲。主角组内部可以细分——`lead` 是「男女主 + 主反派」一整组，seed 一律给 protagonist，照 `seedNote` 里的定位把主角之外的改成 major。

**没有 `outline.json` 也照常跑**，本 skill 不依赖它——跳过 seed，直接丢一本小说进去，自己从原文拆角色表。

## 使用

安装见[仓库根 README](../../README.md)。装好后：

```
/novel-characters ./你的小说.txt
```

或者直接说「帮我拆一下这本书的角色」并给出路径。

### 报告语言

默认中文。用 `--lang`，或者直接说「用英文」「日本語で」：

```
/novel-characters ./book.txt --lang en
/novel-characters ./book.txt --lang ja
```

内置 **中文 / English / 日本語** 三套界面文案。**其他语言一样支持**——skill 会现场把界面文案翻译成目标语言，存进 `cast.json` 的 `ui` 字段，渲染时合并。法语、韩语、西班牙语都能出完整报告，不会露出英文界面。

两条不跟随语言：**出图和 TTS 提示词永远英文**（引擎吃英文最稳）；**原文引文永远保持原文语言**（翻译了就不是证据了）。

### 出图风格

默认 `realistic`（半写实厚涂）。想要动画质感：

```
/novel-characters ./book.txt --style ghibli
```

| id | 说明 |
| --- | --- |
| `realistic` | 半写实厚涂，皮肤有毛孔和肌理，布料有织纹磨损。默认 |
| `cinematic` | 电影级真人写实，真实肤质、电影人像布光、物理可信服装材质与克制电影调色 |
| `naturalistic` | 现实/纪实风格，普通真人、日常服装、现实环境、可用光、中性色和最低修饰 |
| `ghibli` | 吉卜力式手绘赛璐璐，等宽墨线、单层柔和阴影、平涂色块 |
| `inkwash` | 国风水墨，宣纸留白、书法线条、分层墨色与克制矿物色点染 |

两个可以组合：`--lang ja --style ghibli`。

```bash
node scripts/novel-characters.mjs styles          # 看所有预设
node scripts/novel-characters.mjs styles ghibli   # 看某一个的完整内容
```

**换风格是整套换**，不是只换一句画风——每个预设自带渲染方式、表面处理、光照、反向提示词、标签五块。详见 [`references/style-presets.md`](references/style-presets.md)。

## 报告长什么样

三栏工作台：顶栏搜索，左栏是故事摘要 + 按戏份排的角色列表，主区一次只看一个角色。

**关系图谱**在左栏顶部，跟角色详情互斥。边直接来自每个角色的 `relationships`，不用模型再跑一趟：

- 按**名字 + 别名**连边——老周的关系里写「老伯」也连到同一个节点
- 同一对人的两条单向记述合并成一条边，两个方向的说法都留着
- 弦上标一段关系文字（截到 6 字，全文在悬停提示和右侧关系表里）。边多了会糊，
  ≤ 14 条默认标出来，再多默认收起，顶部有开关
- 悬停一个人亮出他的全部关系线，悬停关系表某一行只亮那一条，点谁跳谁

圆环布局在 Node 里算好直接写进内联 SVG，**不引任何库**——report.html 始终是一个能离线双击打开的单文件。

### 导出 JSON

顶栏的「导出 JSON」下载的**就是 `cast.json` 本身的形状**，不是另一套导出格式：

```json
{ "source": "…", "lang": "zh", "style": "realistic", "summary": "…", "characters": [ … ] }
```

所以外部工具改完可以**直接喂回 `render` 重新出报告**，也能过 `validate`。角色卡里的 `sheetImage`（`images/<slug>-sheet.png`）一并带出，拿得到哪张图对应哪个人。

数据以 `<script type="application/json">` 内嵌在报告里，点导出只是把它包成 Blob 下载，**不发任何网络请求**。

## 它是怎么工作的

长文本一次性塞进上下文会丢角色，所以拆成两趟：

**第一趟 · 扫描**（便宜）
按段落切成 4 万字符的重叠块，每块并发抽「角色名 + 别名 + 该块里的具体描写 + 逐字引文」。重叠是为了让卡在切口上的角色两边都能看见。

**归并**
按名字和别名建索引，`陆行远` / `陆` / `姑娘` 这类跨块的不同叫法收敛成同一个人。精确匹配管不到的（「陆」和「陆行远」没有共同键），脚本会按名字包含关系列成 `mergeCandidates` 疑似同人候选，由模型复核后写成 merges.json 确定性落地合并。按出现块数当戏份权重排序。

**群像设计趟**
先写 `design-matrix.json`：主角4–5个签名锚点、主要角色3–4、配角2–3、龙套1–2；重要角色明确在哪两个视觉轴上互相避让。矩阵按 id／名字注入角色卡，是全批角色的视觉唯一来源。

**第二趟 · 出卡**
只对戏份最重的 N 位（**默认 30**），把归并记录与完整群像矩阵一起喂进去。同批角色不再只知道名字，而是知道别人已经占用的剪影、脸部、服装、姿态和道具空间。

**校验**（这步不能跳）
四类硬规则，全部由脚本确定性检查，不靠模型自觉：

| 规则 | 为什么 |
| --- | --- |
| `evidence` 必须是原文**逐字连续**片段 | 防编造。被「他说」断开的对白不许拼接 |
| 出图 prompt **不许出现人名** | 图像模型对人名偏见极重，会画成它记忆里的角色 |
| 字段**语言分工** | 人类字段跟随 `--lang`、出图和 TTS 提示词永远英文，模型会漂 |
| **风格与反向提示词匹配** | `realistic` / `cinematic` / `naturalistic` 不禁 photorealistic；动画/水墨档必须禁 |
| **重要度视觉预算** | protagonist 4–5、major 3–4、supporting 2–3、minor 1–2；主角覆盖三个识别距离 |
| **签名锚点落地** | 每条锚点逐字进入 image.prompt 和 image.sheet；重要角色必须 contrastAgainst，跨角色锚点雷同会被拦 |
| 结构 + 枚举 | `importance` 只能是那四个值 |

这四条不是拍脑袋定的——是模型输出真的违反过、被校验脚本当场抓住才立起来的。

## 命令行直接用

脚本本身不需要 agent 也能跑，只有两趟模型调用需要：

```bash
node scripts/novel-characters.mjs seed outline.json              # 有大纲就从它预填角色表骨架
node scripts/novel-characters.mjs chunk book.txt /tmp/wk        # 切块
node scripts/novel-characters.mjs merge /tmp/wk                 # 归并 roster-*.json，附疑似同人候选
node scripts/novel-characters.mjs merge /tmp/wk --apply m.json   # 落地复核后的合并
node scripts/novel-characters.mjs assemble /tmp/wk --source 书名 # card-*.json 合成 cast.json，同档按戏份排序
node scripts/novel-characters.mjs validate cast.json book.txt   # 校验
node scripts/novel-characters.mjs render cast.json --html       # 出 report.html
node scripts/novel-characters.mjs slug "胡二爷"                  # 安全文件名
```

## 边界

- 单次上限 24 块（净覆盖约 93 万字符）。超了会明确报 `truncated`，**不静默截断**
- 人类可读字段跟随 `--lang`；出图和 TTS 提示词**永远英文**，那些引擎吃英文最稳，跟报告语言无关
- protagonist / major 先生成2–3张身份候选，选定 `identity.png` 后再展开 sheet；supporting / minor 默认直接出 sheet
- 同批统一画风优先用独立材质板；拿第一张角色图做参考时，必须禁止复制脸型、体态、发型、服装轮廓、色块和配饰

> ⚠️ **机器上装了多个 codex 要注意版本。** 旧版本会直接报 `requires a newer version of Codex` 而不是降级。skill 里带了自动挑最高版本的探测逻辑，整体太旧就 `npm i -g @openai/codex`。

## 文件

```
SKILL.md                 给 agent 读的工作流
scripts/
  novel-characters.mjs   chunk / merge / assemble / validate / identity-prompt / screen-test-prompt / render / slug
  selftest.mjs           408 项断言，不调模型
references/
  roster-pass.md         第一趟：扫描角色
  profile-pass.md        第二趟：生成角色卡（9 条硬规则）
  ensemble-design.md     群像视觉矩阵、importance 预算、重要角色身份锁定
  schema.md              角色卡结构 + 字段语言归属
  sheet.md               角色设定图出图的 codex 调用契约
  report-style.md        report.html 的设计约定
  style-presets.md       出图风格预设（含 naturalistic 现实风格）
```

## 自测

```bash
node scripts/selftest.mjs
```

408 项断言，覆盖群像视觉矩阵、cinematic、naturalistic现实风格、screen-test、身份锚点、合成和校验。不调模型、不花额度。

已在 Windows + Node 22.19.0 跑通全量自测；运行要求 Node ≥18。
