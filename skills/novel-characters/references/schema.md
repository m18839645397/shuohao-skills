# 角色卡结构

`cast.json` 顶层：

```json
{
  "source": "寒站",
  "lang": "zh",
  "style": "realistic",
  "designMode": "ensemble-signature",
  "designPrinciple": "民国水乡的现实质感；主角组用收拢与外张、直线与圆形建立对照。",
  "summary": "民国北方的一处小站因山路中断而停运。四个互不信任的人被困在煤油灯下，各自等待不同的消息……",
  "characters": [ /* 角色卡 */ ]
}
```

| 顶层字段 | 必填 | 说明 |
| --- | --- | --- |
| `source` | 是 | 书名/篇名，报告标题用 |
| `lang` | 是 | 报告语言，默认 `zh` |
| `style` | 是 | `realistic` 半写实、`cinematic` 电影真人、`naturalistic` 现实纪实、`ghibli` 动画、`inkwash` 水墨。见 `style-presets.md` |
| `designMode` | 是 | 固定为 `ensemble-signature`；缺失时 validate 直接报错 |
| `designPrinciple` | designMode 时是 | 本剧群像共同遵守的现实程度、形状语言与对照原则，使用报告语言 |
| `ui` | 视情况 | 界面文案翻译。`lang` 是 `zh`/`en`/`ja` 时**不需要**（内置）；其他任何语言**必填**，否则 `validate` 报错。用 `ui-template <lang>` 生成骨架后翻译。只覆盖部分键也可以，缺的用内置英文兜底 |
| `summary` | 是 | **故事摘要**，中文 3–5 句。交代时空背景、核心情境、人物聚在一起的由头。报告顶部显示，让人不看原文也知道这几个角色是什么关系。不要剧透结局，也不要写成推荐语 |
| `characters` | 是 | 角色卡数组 |

`summary` 缺失会被 `validate` 判为违规——报告顶部会空着。

单张角色卡：

```json
{
  "name": "乔叔",
  "aliases": ["老乔"],
  "importance": "major",
  "oneLiner": "守着停运寒站煤炉的老扳道工，一只眼睛已被煤尘磨浑。",

  "persona": {
    "gender": "男",
    "ageRange": "约七十岁（推断）",
    "identity": "寒站老扳道工",
    "appearance": "背驼得像一张拉满的弓。左眼被风沙磨得只剩一层白翳。……",
    "personality": ["沉默", "耐性", "老练"],
    "temperament": "开口时嗓子里像卡着半口江水，含混、发沉。……",
    "motivation": "守住停运的小站，并让被困的人熬过寒夜。",
    "arc": "静止。他是这条河的一部分。",
    "relationships": [{ "name": "林雁", "relation": "被困在小站的年轻旅客" }],
    "evidence": ["乔叔弯腰添煤，灰白胡茬上挂着煤灰。"]
  },

  "visualIdentity": {
    "designThesis": "把几十年铁路劳动形成的弯曲体态与煤尘损伤变成稳定身份。",
    "anchors": [
      { "type": "silhouette", "scale": "silhouette", "prompt": "a deeply bowed crescent silhouette shaped by decades of railway labour" },
      { "type": "face", "scale": "close", "prompt": "a weather-cut elderly face with one clouded left eye and a compressed mouth" },
      { "type": "costume", "scale": "medium", "prompt": "a heavy brown canvas work jacket polished pale across both elbows and cuffs" }
    ],
    "contrastAgainst": [{ "target": "林雁", "axes": ["silhouette", "costume"], "rule": "老扳道工弯曲、粗糙、厚重；年轻旅客收拢、平直、轻薄。" }]
  },

  "image": {
    "style": "电影级真人写实",
    "prompt": "Live-action casting and costume-continuity photography of a real human performer ...",
    "promptLocal": "角色设定图：约七十岁的中国老扳道工……",
    "negativePrompt": "illustration, digital painting, concept art, anime, cel shading, 3d render, CGI character, oversized eyes, porcelain doll face, ...",
    "tags": ["live-action casting photography", "costume continuity", "cinema-camera portrait"],
    "sheet": "A photographic contact sheet of the same real human performer on ONE 16:9 landscape canvas ..."
  },

  "voice": {
    "timbre": "沙哑低沉的男中低音，喉音重",
    "pitch": "低",
    "pace": "缓慢，字与字之间拖着气口",
    "accent": "南方水乡口音，尾音含混",
    "emotion": "疲惫而平静",
    "referenceHint": "像一个守了几十年山中小站的老工人",
    "prompt": "An elderly male voice, around seventy-five. Low bass-baritone ..."
  }
}
```

## 语言分工

「本地语言」= 顶层 `lang` 指定的语言，默认中文。

| 字段 | 类型 | 语言 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 原文 | 原文里用得最多的称呼 |
| `aliases` | string[] | 原文 | 其他称谓；职业名词（如「货郎」）归 `identity`，不进这里 |
| `importance` | enum | — | `protagonist` / `major` / `supporting` / `minor`，**只能这四个** |
| `oneLiner` | string | **本地语言** | 一句话抓住这个人 |
| `persona.*` | — | **本地语言** | `personality` 3–5 个词 |
| `persona.evidence` | string[] | **原文语言** | **逐字引用**，永远不翻译——翻了就不是证据了。没有就空数组 |
| `visualIdentity.designThesis` | string | 本地语言 | 剧情功能怎样翻译成外形；不是“漂亮、神秘、有气质” |
| `visualIdentity.anchors` | object[] | prompt 英文 | 按 importance 分配 1–5 个签名锚点；type/scale/prompt 结构见 `ensemble-design.md`，prompt 必须逐字进入 image.prompt 与 image.sheet |
| `visualIdentity.contrastAgainst` | object[] | rule 本地语言 | 主角／主要角色至少一项；明确与另一重要角色在哪两个以上视觉轴形成反差 |
| `image.style` | string | 本地语言 | 画风一句话 |
| `image.prompt` | string | **英文** | 单张卡通设定图；**禁止出现人名**；**必须写明族裔／年代／地域** |
| `image.promptLocal` | string | 本地语言 | 上面那条的译文；`lang=en` 时省略；**同样禁止人名** |
| `image.negativePrompt` | string | **英文** | 逗号分隔 |
| `image.tags` | string[] | **英文** | 4–8 个风格标签 |
| `image.sheet` | string | **英文** | **角色设定图**，16:9 三区版面：左约 34% 半身像（面部基准）／右上全身三视图／右下细节条，细线分隔；**禁止出现人名**；**必须写明族裔／年代／地域** |
| `voice.timbre/pitch/pace/accent/emotion/referenceHint` | string | **本地语言** | 最容易写漂的地方，注意 |
| `voice.prompt` | string | **英文** | 给 TTS 音色设计引擎。**没有 `promptLocal` 对照版，这是有意的**——上面六项已经是本地语言，再给一段中文散文只会让人复制错，把它喂进 TTS（生产里踩过） |

**英文字段不跟随 `lang`。** 图像模型和 TTS 引擎吃英文最稳，跟报告用什么语言无关。

## 群像视觉身份

新流程先写 `design-matrix.json`，再由 assemble 注入每张角色卡。主角4–5个锚点、主要角色3–4个、配角2–3个、龙套1–2个；重要角色签名不得雷同。完整契约见 `ensemble-design.md`。

## 设定图的三区版面

16:9 横构图，细线分成三块：

- **左（约 34%）** 半身像当**面部设计基准**，尺寸大、五官画得细，可以直接拿去做表情设计
- **右上** 三视图管剪影、比例、服装，脸照左栏画
- **右下** 细节条，按 importance 放 1–5 个签名锚点特写；主角4–5、主要角色3–4、配角2–3、龙套1–2，不够就留白

两个最容易崩的点：**一张图里出现两个长相**，以及**为了塞下细节把人物压扁**。提示词里都要写死——细节放不下就往右缘延伸，**永远是细节让位，不是人物让位**。

## 校验

`scripts/novel-characters.mjs validate <cast.json> <book.txt>` 会检查：结构完整性、`importance` 枚举、群像视觉身份预算、签名锚点逐字进入两条出图提示词、重要角色主动对照、锚点雷同、**引文逐字**、**出图提示词不含人名**和**语言分工**。违规逐条列出并 exit 1。
