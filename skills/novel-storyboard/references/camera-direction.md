# 克制电影化运镜

本规则用于 `cameraPlanMode: "cinematic-controlled"`。目标不是增加炫技运镜，而是让每切都能回答：镜头从哪里开始、朝什么移动、为什么移动、最后停在哪里，以及怎样接入这一切。

## 默认策略

- 一切只用一个 `camera` 主运镜；`Static Shot` 是默认。
- 动态运镜最多附带一次焦点变化，不同时写推、拉、摇、移、环绕等冲突动作。
- 对话以固定机位、正反打和缓推为主；人物移动才用跟拍或横移。
- 反转、爽点、关键动作可以短促加速，但动作结束后回到稳定镜头。
- `cameraPlan` 的五个文本字段是 **prompt-ready 原句**，必须逐字进入该切自己的 `[Shot k]`。

## cameraPlan

```json
{
  "camera": "Tracking Shot",
  "cameraPlan": {
    "pace": "slow",
    "magnitude": "subtle",
    "start": "waist-high rear medium shot two metres behind the subject",
    "target": "the woman and the suitcase held against her chest",
    "end": "her silhouette entering the dense fog",
    "focus": "keep the subject sharp while the background falls out of focus",
    "intent": "create urgency while withholding the destination"
  },
  "transition": "cut-on-action"
}
```

- `pace`：`static` / `slow` / `steady` / `fast`
- `magnitude`：`none` / `subtle` / `moderate` / `large`
- `start`：起始机位、景别、角度和距离；不要复述人物长相。
- `target`：镜头锁定的主体或关键细节。
- `end`：这一切结束时的可见构图，给下一切留下连续状态。
- `focus`：焦点与景深变化；不需要转焦也要写保持谁清晰。
- `intent`：导演意图，说明这个运镜服务于定场、跟随、施压、揭示、释放或重音。
- `transition`：这一切如何从上一切进入；第一切通常用 `straight-cut`。

`Static Shot` 使用 `pace: "static"`、`magnitude: "none"`。POV 可以固定或移动，但固定时这两个值必须成对出现；其他动态运镜不得使用这两个值。

## 转场枚举

| id | 使用场景 |
| --- | --- |
| `straight-cut` | 普通切入、第一切、稳定叙事 |
| `cut-on-action` | 在动作进行中切入，保持动势连续 |
| `reaction-cut` | 重台词或动作之后切听者/旁观者反应 |
| `match-cut` | 用相近形状、姿态或运动方向衔接 |
| `reveal-cut` | 切入后揭示此前被遮挡的信息 |

## 按节拍自动选择

| 剧情节拍 | 默认摄影处理 |
| --- | --- |
| 进入新空间 | 跟随运动主体 → 大远景定场 → 关键局部；`Tracking Shot` / `Static Shot` |
| 普通对话 | 固定正反打或过肩构图；信息加重时才 `Push In` |
| 重台词之后 | `reaction-cut` 切听者近景，固定或轻微缓推 |
| 人物移动 | 稳定 `Tracking Shot` 或 `Truck Left/Right`，保持银幕运动方向 |
| 关键动作 | `cut-on-action` 切动作插入特写，幅度小、速度快、迅速回稳 |
| 悬疑揭示 | 遮挡构图、缓慢 `Push In`、焦点从前景转向线索；结尾停在可识别信息上 |
| 情绪升高 | 从固定镜头转轻微缓推；不要突然环绕或强震 |
| 爽点兑现 | 快速但单一的推近/跟拍/轻微震动，结束构图必须清楚展示结果 |
| 收场或释放 | `Pull Out` 或固定远景，幅度克制，给下一段留空间 |

## 写进 h3Prompt 的顺序

每个 `[Shot k]` 按以下顺序写成自然句，不使用额外字段标题：

1. 转场 + `<Picture k>` 构图锚定。
2. `start` 起始机位。
3. 主体的常见动作。
4. 速度 + 幅度 + `camera` + `target`。
5. `focus`。
6. `end`。
7. `intent`。
8. 台词与音色信息。

英文示例：

```text
[Shot 1] A straight cut enters <Picture 1>. Begin in a waist-high rear medium
shot two metres behind the subject. She runs through the wet path with the
suitcase held to her chest. Use a slow, subtle Tracking Shot centred on the
woman and the suitcase held against her chest. Keep the subject sharp while
the background falls out of focus. End with her silhouette entering the dense
fog. The intent is to create urgency while withholding the destination.
```

## 禁止项

- 同一切出现两个或更多主运镜。
- 为“电影感”无理由加入环绕、旋转、强震或快速变焦。
- `start` 与分镜图构图冲突，或 `end` 跳到下一场景。
- 把人物长相、服装材质重复塞进 `cameraPlan`；这些由参考图负责。
- 使用否定式堆砌其他运镜，例如 “no zoom, no pan, no orbit”——模型仍可能执行这些词。
- 只写 “camera follows” 或 “cinematic movement”，没有速度、幅度、目标和结束构图。
