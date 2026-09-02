# 分镜图人物因果调度

本规则用于：

```json
{ "frameBehaviorMode": "causal-blocking" }
```

画面密度解决“放多少信息”，入口状态解决“停在哪个时刻”，但它们不能保证人物真的像在做事。有人物的分镜还必须把表演翻译为六项可观察调度，写入 `framePlan.behavior`。空镜不需要该对象；旧 JSON 未声明模式时整门跳过。

## 六项结构

```json
{
  "behavior": {
    "primaryFocus": "The investigator and her immediate evidence task dominate while the anonymous mover remains a small peripheral edge shape",
    "bodyMechanics": "Her weight transfers onto the front foot with the rear heel lifted and the shoulders counterbalancing the step",
    "handPurpose": "Her left hand braces the folding frame while the right hand turns the card toward the practical ceiling light",
    "eyeline": "Her eyes track the card surface below the ceiling panel rather than the camera",
    "expression": "Tightened lower eyelids and a brief jaw set reveal alarm held under professional control",
    "propInteraction": "The card stays between her eyes and the practical light with its broad face angled away from the lens"
  }
}
```

| 字段 | 回答的问题 | 写法 |
| --- | --- | --- |
| `primaryFocus` | 谁是画面主语，匿名/辅助人物能占多大权重 | 明确主任务和主次层级；匿名人物默认边缘、较小、无可读面孔，除非本拍就是群众/陌生人揭示 |
| `bodyMechanics` | 人物处于哪个精确动作阶段，重心和受力怎样 | 移动必须出现至少一个不可误读的相位信号：后跟抬起、重心转移、骨盆/肩膀反向补偿、衣物或物件反馈 |
| `handPurpose` | 每只可见的手为什么在那里 | 逐只说明任务、承重、接触或自然垂落；禁止用无剧情原因的整理袖口、摸领口、抱臂替代缺失动作 |
| `eyeline` | 人物正在看谁或什么 | 对齐剧本 `gaze`、对话轴或任务对象；不写抽象的“专注”，不让人物无理由看镜头 |
| `expression` | 当前情绪怎样被观众看见 | 只给 1–2 个克制、可观察信号，如下眼睑收紧、嘴唇压住、吞咽停顿、鼻翼变化；不用 `sad / guilty / tense` 代替表演，也不把克制写成空白脸 |
| `propInteraction` | 道具由谁持有、怎样接触、朝向哪里、当前有几件 | 对齐 holder、唯一数量、支撑、重力和实际用途；卡片/手机/信件朝人物视线或光源，不为观众可读性正对镜头。道具被摘下、转交、消耗或毁坏后，原位置必须清空，不能同时保留一份复制品 |

六项都是英文 prompt-ready 原句，每项至少 24 字符。`buildFrameImagePrompt()` 以明确标签逐字写入完整 imagePrompt；第 24 道 `frame-behavior` 门逐项检查。

## 按关键帧时刻取状态

- `entry`：只翻译 `startState` / `sourceState.before`，本切新动作尚未开始；上游已有搬运、受力和接触仍保持当前相位。
- `transition`：写切点处唯一的动作中段，不把动作起点和结果同时塞进一张图。
- `impact`：写接触或揭示发生的那个瞬间，手、物件、身体和环境反馈必须属于同一时刻。
- `result`：翻译 `endState` / `sourceState.after`，不继续保留已经完成前的手势或视线。

## 常见失败

| 失败 | 原因 | 修复 |
| --- | --- | --- |
| 辅助人物成为最大前景黑块 | 只写“前景有人”，没有主次面积与清晰度 | `primaryFocus` 明确匿名人物边缘化、较小、无可读面孔 |
| 提示词说人物正在走，图里仍双脚站平 | 只给动作动词，没有动作相位 | `bodyMechanics` 明写哪只脚承重、哪只后跟抬起、肩胯如何补偿 |
| 模型让人物整理袖口或摸领口 | 手部没有剧情任务，模型用常见姿势补空 | `handPurpose` 逐只分配任务；无任务就明确自然垂落或受支撑 |
| 反应特写只有中性脸 | 情绪只写成抽象名词，或“克制”被模型理解成无表情 | `expression` 写 1–2 个短暂生理信号，不写情绪总结 |
| 证物继续朝镜头展示 | 只要求线索可读，没有说明人物用途与方向 | `propInteraction` 写人物视线、光源、持有手和相对镜头角度 |
| 转移后的道具在新旧位置各出现一份 | 只写新 holder，没有声明唯一数量与原位置清空 | `propInteraction` 明写 the only prop、当前持有人以及 former location remains empty |

## 质量门与人工验图

质量门只能保证“调度已经被写明并进入提示词”，不能证明模型真的执行。代表图仍须人工检查：主次面积、脚步相位、手部任务、视线落点、微表情和道具朝向。任一关键项偏离就重生成，不得用 24/24 静态门代替视觉证明。
