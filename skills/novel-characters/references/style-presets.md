# 画风预设

出图风格可选。默认 `realistic`；电影级真人写实用 `cinematic`；普通真人、现实地点、可用光和中性色的纪实效果用 `naturalistic`；另有 `ghibli`、`inkwash`。

预设定义在 `scripts/novel-characters.mjs` 的 `STYLE_PRESETS` 里，跑
`node scripts/novel-characters.mjs styles` 可以把整段打出来直接用。

| id | 说明 |
| --- | --- |
| `realistic` | 半写实厚涂。默认 |
| `cinematic` | 电影级真人写实：真实肤质、电影人像布光、物理可信材质与克制电影调色 |
| `naturalistic` | 现实风格：普通真人、日常服装、现实环境、可用光/实用光源、中性白平衡、最低修饰，不做英雄化和大片化 |
| `ghibli` | 吉卜力式手绘赛璐璐动画 |
| `inkwash` | 国风水墨：宣纸留白、书法线条、分层墨色与克制矿物色点染 |

## ⚠️ 换风格是整套换，不是只换一句「画风」

每个预设自带五块，**必须整块取用，不要混搭**：

| 块 | 作用 |
| --- | --- |
| `render` | 渲染方式那句 |
| `surface` | 皮肤、眼睛、头发、布料怎么处理 |
| `lighting` | 光照 |
| `negative` | 反向提示词 |
| `tags` | 风格标签 |

**写实与非写实预设的 `negative` 几乎是相反的**：

- `realistic` / `cinematic` / `naturalistic` **绝不能**禁 `photorealistic`。
- `cinematic` **必须**禁 illustration / digital painting / concept art / anime / cel shading / toon shading / 3d render / CGI / game cinematic / oversized eyes / porcelain doll face / beauty retouching；它要的是实拍演员，不是高精度动画角色
- `ghibli` **必须**禁 `photorealistic` / `3d render` / `visible pores`——写实的那些细节在这里全是反效果
- `inkwash` **必须**禁 `photorealistic` / `3d render` / 写实皮肤纹理——体积靠墨色浓淡与留白，不靠摄影高光和皮肤微细节

`surface` 同理。写实要毛孔、皮下散射、根根分明的碎发、布料织纹；吉卜力明确要
**无毛孔、无皮肤纹理、成簇的发丝、平涂无织纹的布料**。把写实那段带进吉卜力，
出来就是个四不像。

`validate` 会检查这一条：风格与反向提示词搞反了直接报错。

## 光照的差别

- `realistic` **分区打光**：左栏半身像给方向主光 + 环境遮蔽（要体积），右侧三视图
  和细节条平光正交（要抠图和量比例）
- `cinematic` **分区电影布光**：左栏半身像用大面积柔光、负补光与克制轮廓光，右侧三视图保持中性正交光
- `naturalistic` **现实现场光**：左栏使用窗光、阴天光或可信实用灯，不加美容主光和轮廓光；右侧保留自然落地感，不做戏剧塑形
- `ghibli` **全图平光**：均匀日光 + 单层柔和阴影。平光本来就是这个风格的一部分，
  不需要分区
- `inkwash` **全图高调漫射光**：用墨色层次表现体积，保持宣纸白底和清晰轮廓

## 版面不随风格变

16:9 三区、34%/66% 比例、人物比例协调、细节让位不是人物让位——这些是**版面规则**，
两个风格都一样。变的只有渲染质感。

## 加新预设

往 `STYLE_PRESETS` 里加一个键，五块写全，`label` 给齐三语。自测会检查完整性。
