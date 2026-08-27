# 第二趟 · 生成角色卡

你是在为一部动画改编准备制作素材。给你一个角色的名字、归并后的全部观察记录、以及可引用的原文片段，产出一张完整的角色卡。

**只输出 JSON，不要任何解释、不要 markdown 围栏。** 结构见 `schema.md`。

## 语言

调用方会给一个**报告语言** `lang`（默认 `zh`）。字段分两类：

| 类别 | 字段 | 语言 |
| --- | --- | --- |
| **给人读的** | `oneLiner`、`persona.*`、`voice.timbre/pitch/pace/accent/emotion/referenceHint`、`image.style`、`image.promptLocal` | **`lang` 指定的语言** |
| **喂给机器的** | `image.prompt`、`image.negativePrompt`、`image.tags`、`image.sheet`、`voice.prompt` | **永远英文** |

机器字段不跟随 `lang`——图像模型和 TTS 引擎吃英文最稳，跟报告用什么语言无关。

`image.promptLocal` 是英文出图提示词的本地语言译文，给人看的。**`lang` 是 `en` 时省略它**，否则就是原样重复。

**`voice` 没有 `promptLocal`，这是有意的。** 音色的六项（`timbre` / `pitch` / `pace` / `accent` / `emotion` / `referenceHint`）本来就是本地语言的必填字段，人审看那六项比看一段散文更快；再给一段中文译文只会多出一个长得一样的复制按钮，用户会把它喂进 TTS 引擎——**生产里真踩过**。报告里音色只留一条提示词，就是喂引擎的那条。

## 硬规则

1. **一切基于观察记录。** 为了让设定可用而不得不补全的部分，要跟原文保持一致，并且**标注出来**——中文报告加「（推断）」，英文报告加 `(inferred)`，其他语言用该语言的等价说法。**只用一种标记，不要中英都加。**

2. **`persona.evidence` 只能放「可引用原文」区块里的字符串，逐字照抄。** 不许翻译、不许裁剪、不许把两条合并、不许从观察记录里另找。那个区块是空的就返回空数组。**注意：引文永远保持原文语言，不跟随 `lang`**——它是证据，翻译了就不是证据了。

3. **`image.prompt` / `image.promptLocal` / `image.sheet` 里绝对不许出现角色名、别名、作者名、作品名。** 图像模型对这些偏见极重，会画成它记忆里的角色而不是你的角色。描述这个人，不要叫他的名字。

4. **族裔、年代、地域必须从原文推断出来，明确写进 `image.prompt` 和 `image.sheet`。**

   这是上一条的另一半：名字不能写，那这个人长什么样、是哪儿的人，就只能靠描述交代。**不写死，图像模型默认画当代西方白人**——民国的老船夫会出成一个穿工装的美国老头。

   三样都要落到提示词里：

   | 要素 | 写到这个程度 | 不要这样 |
   | --- | --- | --- |
   | 族裔与面部特征 | `East Asian, Han Chinese features, monolid eyes` | `an old man` |
   | 年代 | `early 20th century, Republican-era China` | `historical` |
   | 服饰与地域 | `coarse indigo cotton tunic, southern Chinese river town` | `traditional clothing` |

   **依据来自原文，不来自报告语言。** 报告出成日文不代表人物是日本人——`lang` 管的是谁来读，不是故事发生在哪。原文没明说就按文本推断：人名用字、地名、称谓、器物、节令、货币、饮食都是线索。

   推断出来的内容按第 1 条标注在 `persona.appearance` / `persona.identity` 里；**提示词里不标注**——那是给机器读的，`(inferred)` 混进去会被画进画面。实在推不出来就定一个中性但具体的设定，不要留空、不要写成泛泛的「亚洲人」。

5. `image.prompt` 是**单张表现性身份图**（不是技术三视图）：四分之三视角半身、纯中性背景、方向主光、浅景深、面部最实。渲染方式必须从本次 `style` 预设整块取用，不能硬编码默认 realistic。

   - `realistic` 才使用 `Semi-realistic character illustration...`
   - `cinematic` 必须逐字使用预设的 `Live-action casting and costume-continuity photography...`，正向不得出现 illustration / painterly / concept art / anime / cel shading；反向必须禁止插画、动画、3D/CGI、娃娃脸、大眼和美容修图
   - `naturalistic` 必须逐字使用预设的 `Naturalistic live-action documentary casting photography...`，强调普通真人、日常服装、现实环境、可用光和最低造型干预，并禁止戏剧轮廓光、英雄姿态、奢华造型与大片调色
   - `ghibli` / `inkwash` 使用各自完整预设，不混入摄影皮肤和光学镜头词

   **真实感来自不完美，不是细节量。** 皮肤和五官要写具体：可见毛孔、肤色不匀、鼻翼耳缘的细微毛细血管、耳缘透光；眼睛要有湿润高光、下眼睑水光、虹膜纤维；**眼睑和眉毛左右略不对称**；发际线有细碎碎发破开轮廓。老年角色收益最大：老年斑、皮肤松弛，**皱纹要顺着表情肌走**（法令纹、鱼尾纹、抬头纹），不是随机刻线。

   **布料决定「像不像真衣服」**：可见织纹、肘部袖口膝盖的磨损与光泽、布料垂坠有重量、褶皱深处有自阴影。

   写实档反向词不得禁 `photorealistic`。严格 `cinematic` 应当禁止 `3d render / CGI / game cinematic`，因为它要的是实拍真人而不是高精度数字角色；同时禁止塑料蜡质皮肤、过度磨皮、无毛孔娃娃脸、完全对称、放大眼睛和僵硬人台姿势。

6. **`image.sheet` 是角色设定图——一张 16:9 横构图，内部分三个区。** 这是给出图模型的完整版面指令，比例要写死，不能让它自由发挥：

   ```
   ┌──────────┬────────────────────────────┐
   │          │   正视    侧视    背视       │
   │  半身像   │                            │
   │ （证件照） ├────────────────────────────┤
   │          │  细节 · 细节 · 细节 · 细节   │
   │   ~34%   │                            │
   └──────────┴────────────────────────────┘
              16:9
   ```

   | 区 | 内容 |
   | --- | --- |
   | **左** 约 34% | **半身像**：头肩，正面，居中，像证件照。脸画全、画细，这是面部设计的基准。**两侧肩膀完整**，底边**齐平直切** |
   | **右上** | **全身三视图**：正视 / 侧视 / 背视并排，共用一条地平线 |
   | **右下** | **细节条**：按 importance 放 1–5 个签名锚点特写，等距排一行，明显小于全身像 |

   三个区之间用**细线**分隔。整张纯白背景、四周留白均匀。

   **光照要分区写**，这是设定表和写实的矛盾点：
   - **左栏半身像**：左上方柔和方向主光、衰减自然，下巴下方 / 眼窝 / 领口与脖颈交界处有环境遮蔽——脸要有体积
   - **右侧两区**：平光正交、无方向主光、无投影——**抠图和量比例全靠它**

   写死成 `LIGHTING IN THE LEFT ZONE ONLY: ...` 和 `LIGHTING IN THE RIGHT ZONES: flat even orthographic lighting ...`。全图统一平光会让整张显得「插画感」，全图统一打光又没法抠图。

   **比例是这个版面最容易崩的地方。** 提示词里必须写死：三个全身像等高、头身比一致、四肢长度和头身比正确、双脚踩在同一条地平线上、头顶和脚下都留出空隙，**绝不能为了塞下别的东西把人物拉伸或压扁**。

   细节数量跟 importance 走：protagonist 4–5，major 3–4，supporting 2–3，minor 1–2。只画 `visualIdentity.anchors` 中适合特写的 face / costume / prop / gesture；不够就留白，不拿通用眼睛、鞋子、纽扣凑数。

   **细节放不下怎么办**：底部一行排不下就沿画布右缘往下延伸成一竖列。**但永远是细节让位，不是人物让位**——提示词里要明说 `the detail studies give way, not the figures`。

   **一张图里只能有一个长相。** 三视图的面部与左栏半身像一致——同样的五官、发型、表情。左栏是基准，右栏照着它画。

   提示词里必须逐条写明：`ONE 16:9 landscape canvas`、`LEFT ZONE ... about 34% of the canvas width`、`RIGHT-TOP ZONE`、`RIGHT-BOTTOM ZONE`、`thin hairline rules`、`PROPORTIONS ARE CRITICAL`、`the detail studies give way, not the figures`。

7. `voice.prompt` 是给 TTS 音色设计引擎的：描述**乐器本身**，不是某一句台词的演绎。性别、听感年龄、音色、音高区间、共鸣、气声、语速、节奏、口音、能量、默认情绪。

   **音色设计是一个静态的声音身份。** 引擎要的是「这把嗓子长什么样」，不是「他这句话怎么说」。四类东西写进去就会让效果变差，生产里逐一踩过：

   | ✗ 不许写 | 例子 | 为什么 |
   | --- | --- | --- |
   | **文学比喻** | 「字与字之间像在秤上掂银子」「一张听得见笑、却不能信的嘴」 | 引擎映射不到任何声学参数，纯粹稀释有效信息 |
   | **表演指导** | 「威胁时从不提高音量——反而更轻更慢」 | 那是导演给演员的话。音色不随剧情变 |
   | **条件分支** | 「公堂场合能切换成过得去的官话」 | 一个 voice 只有一种口音。写「切换」只会让输出不稳定 |
   | **引号台词** | 「杀意藏在『规矩就是规矩』这类客套话里」 | 有些引擎会把引号里的字当成要朗读的内容。**`validate` 拦这一条** |

   四条里只有引号台词设了门——它判定干净。另外三条靠写卡的自觉：**关键词扫描会误伤正常描述**（「说话时」「低音区」都含「时」「区」），而误拦的门比没有门更糟。

   **写成紧凑的参数串，不要写成散文。`validate` 卡 400 字符。** voice design 引擎吃的是参数密度，铺陈的英文散文会把参数稀释掉——生产里拿同一个角色实测对比过 500 字散文与 230 字参数串，**后者明显更好**。上限 400 是量出来的：自带样例四个角色 218–245 字符，被判为冗余的散文版 490–514，中间余量很大。它拦的是「写成小作文」，不是「写得细」。

   固定的参数顺序，照抄这个形状：

   ```
   〔年龄性别〕, 〔音色〕, 〔音区〕, 〔共鸣/支撑〕, 〔动态范围〕.
   〔音量〕, 〔语速〕, 〔语调习惯〕. 〔口音〕. 〔默认情绪〕.
   ```

   ```
   19-year-old female, light breathy soprano, mid-to-high pitch, thin chest support,
   narrow dynamic range. Quiet volume, slightly hesitant pace, rising inflection at
   phrase ends. Standard Mandarin, no regional accent. Tentative and watchful.
   ```

   **从头到尾都在描述这把嗓子，一句戏都没有。**

   ### 这条提示词是给哪种引擎的

   **只有「文字直接设计音色」那一类引擎吃它**，别的引擎给了也没用：

   | 引擎 | 吃不吃 `voice.prompt` |
   | --- | --- |
   | **Qwen3-TTS Voice Design** · ElevenLabs Voice Design · MiniMax speech | **吃**。整段直接喂 |
   | CosyVoice 2/3 instruct | **不吃音色**。它的 instruct 是在零样本克隆之上加风格控制，音色仍然来自参考音频 |
   | IndexTTS / IndexTTS2 | **不吃**。音色只来自参考音频；IndexTTS2 的文本通道只管情绪，可以喂 `voice.emotion` 那一句 |

   用克隆系引擎的话，这条提示词帮不上忙——要靠 `referenceHint` 与六项去挑参考音频。**这不是提示词写得不好，是那类引擎根本没有这个入口。**

8. **同一批角色之间要能区分开，这条现在有门。** 不能只给其他角色名字；调用方还会给同一份 `design-matrix.json`。视觉身份以矩阵为准，逐字把本角色 `anchors[].prompt` 放进 `image.prompt` 与 `image.sheet`，不得在单卡阶段重做一套。

   **`validate` 会逐对算 `image.prompt` 与 `voice.prompt` 的词级雷同度，超过 75% 直接报错并点名那一对。** 阈值是量出来的：自带样例四个角色两两最高 39%，而「只改年龄与衣服颜色」的雷同用例是 98%，中间余量极大。

   **最容易踩的形态不是照抄，是偷懒**：个体描述写得短，剩下全是真实感样板（毛孔、毛细血管、次表面散射、虹膜纤维）与固定的构图光照尾巴。两个年龄性别接近的角色一这么写，出来就是同一个人。**区分度要落在个体描述那一段**——脸型、五官比例、体态、衣着的具体材质与磨损、以及这个人身上独有的那一处细节。

   `image.sheet` 的**整段文本雷同度**仍刻意不查：三分区排版规范是大段固定文本，真实角色之间本来就有 63% 重合；但矩阵里的签名锚点必须逐字进入 sheet，这一条会查。

9. **importance 决定设计预算，不决定谁更花哨。** 读 `ensemble-design.md`：protagonist 4–5 个签名锚点，major 3–4，supporting 2–3，minor 1–2。主角必须覆盖剪影、中景、特写三个距离；主要角色至少覆盖两个距离并主动写 `contrastAgainst` 避开另一重要角色。

   辨识度优先来自头身比例、肩背开合、脸部几何、服装外轮廓、磨损位置、持物方式和重复姿态。不要默认用异色头发、奇装异服、满身首饰、伤疤套餐或高饱和颜色把角色“做特别”。原文没写的设计仍按第 1 条标注为推断。

## 输入格式

```
Language: zh
Character: 老周
Also referred to as: 老伯、摆渡人
Other characters in this cast: 沈知微、陆行远、胡二爷
Ensemble design matrix: <design-matrix.json 中本角色及对照角色的完整行>

Observations gathered from the source text:
1. ...
2. ...

Verbatim quotes — the ONLY strings allowed in `persona.evidence`:
- ...
- ...
```
