# 群像视觉身份设计

本规则用于 `designMode: "ensemble-signature"`。目标不是让所有人奇装异服，而是让角色的重要度决定设计预算：主角在剪影、中景和特写都能认出；主要角色主动避开主角；配角职业可读且有一个记忆点；龙套保持朴素。

## 先做矩阵，再并发出卡

完成角色归并和 importance 分档后，先写 `<workdir>/design-matrix.json`：

```json
{
  "mode": "ensemble-signature",
  "principle": "民国水乡的现实质感；主角组用收拢与外张、直线与圆形建立对照，所有细节服务剧情功能。",
  "characters": [{
    "id": "C01",
    "name": "沈知微",
    "visualIdentity": {
      "designThesis": "把警觉和保护秘密翻译成始终收拢的身体结构。",
      "anchors": [
        {
          "type": "silhouette",
          "scale": "silhouette",
          "prompt": "a narrow inward-folding silhouette with both elbows protecting the torso"
        },
        {
          "type": "face",
          "scale": "close",
          "prompt": "a long oval face with a slightly higher left eyebrow and tightly focused eyes"
        },
        {
          "type": "costume",
          "scale": "medium",
          "prompt": "a plain smoke-blue qipao with one visibly repaired cuff and a severe straight collar"
        },
        {
          "type": "prop",
          "scale": "medium",
          "prompt": "a weathered leather suitcase held flat against the chest as a protective body shield"
        }
      ],
      "contrastAgainst": [{
        "target": "C02",
        "axes": ["silhouette", "costume"],
        "rule": "C01 stays narrow, closed and cool-toned while C02 stays tall, rigid and darkly vertical."
      }]
    }
  }]
}
```

`assemble` 默认读取这份文件，并按 id／名字把 `visualIdentity` 注入对应角色卡。矩阵是唯一来源；角色 worker 不得重新发明一套不同的签名锚点。

## 字段

- `designThesis`：报告语言；一句话说明剧情功能怎样转成外形，不写“漂亮、神秘、有气质”。
- `anchors[].type`：`silhouette` / `face` / `costume` / `gesture` / `prop`，同一角色不得重复 type。
- `anchors[].scale`：`silhouette` / `medium` / `close`，说明这个特征在哪个观看距离负责识别。
- `anchors[].prompt`：英文、可直接喂图像模型；必须逐字进入该角色的 `image.prompt` 和 `image.sheet`。
- `contrastAgainst[].target`：另一角色的 id、名字或别名。
- `contrastAgainst[].axes`：至少两个，取 `silhouette` / `face` / `costume` / `palette` / `gesture` / `prop`。
- `contrastAgainst[].rule`：报告语言；具体写清谁收、谁放，谁直、谁圆，谁轻、谁重。

## importance 内容预算

| importance | 锚点数 | 必须覆盖 |
| --- | ---: | --- |
| `protagonist` | 4–5 | silhouette + face + costume + gesture/prop；三个识别距离全覆盖 |
| `major` | 3–4 | silhouette + face + costume/gesture/prop；至少两个识别距离 |
| `supporting` | 2–3 | silhouette + 一个职业/行为记忆点；至少两个识别距离 |
| `minor` | 1–2 | 身份可读即可，不追求主角级复杂度 |

主角辨识度不等于更漂亮、颜色更艳、首饰更多。优先使用自然但稳定的差异：头身比例、肩背开合、脸部几何、服装外轮廓、磨损位置、持物方式和重复姿态。

## 两阶段出图

`protagonist` / `major` 不直接赌完整三视图：

1. `identity-prompt <cast.json> <角色>` 打印身份锁定提示词。
2. 用同一提示词生成 2–3 个候选，选定一版为 `images/<slug>-identity.png`。
3. 生成 `sheet.png` 时挂上该角色自己的 identity 图，要求三视图严格展开这一个身份。

`supporting` / `minor` 默认直接生成 sheet。这样额外调用只花在重要角色上。

后续角色若参考第一张成图统一画风，只能复制渲染质感、线条、明暗与版面，禁止复制脸型、体态、发型、服装轮廓、色块和配饰。更稳的方式是使用独立画风材质板，而不是某个具体角色。

## 验图

重要角色至少做四项检查：

1. 缩到 64px 并涂黑，剪影是否仍能区分。
2. 去掉颜色，脸型、姿态和服装结构是否仍不同。
3. 只看面部裁切，主角组是否还能认出。
4. 全员缩略联系表隐藏名字，是否能指出主角、主要对手和关键配角。

只能靠头发或衣服颜色辨认，仍然属于路人设计。
