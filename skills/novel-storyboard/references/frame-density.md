# 分镜图自适应画面密度

本规则用于 `framePlanMode: "adaptive-density"`。它只管**静态分镜图**：让该丰富的镜头有空间层次和叙事线索，让反应、停顿和道具特写保持克制。H3 视频内部的动作过程仍由 `visualPlan` 管。

丰富不是增加群众和摆件。画面信息只能来自剧本状态、场景锚点、角色设定和叙事道具；没有上游依据的内容必须进 `exclude`，不能为了“丰富”临时发明。

## 每切 framePlan

```json
{
  "framePlan": {
    "role": "reveal",
    "density": "rich",
    "keyMoment": "The woman's palm has just struck the suitcase lid while the reaching hand stops at the frame edge",
    "composition": "The suitcase clasp holds the centre plane, the woman's hand enters from above and the intruding hand remains separated at frame right",
    "atmosphere": "Cold cabin light catches the worn leather grain while a faint fog glow holds the distant doorway",
    "foreground": ["The intruding hand stays slightly soft at the right edge as a controlled threat cue"],
    "background": ["The dim ferry cabin doorway remains legible behind the suitcase without adding passengers"],
    "storyCues": ["The green-tarnished brass clasp remains fully visible", "Both hands freeze before touching each other"],
    "exclude": ["extra passengers, invented cargo or decorative objects"]
  }
}
```

- `role`：`establishing` / `dialogue` / `reaction` / `action` / `reveal` / `insert` / `atmosphere`。
- `density`：`sparse` / `balanced` / `rich`。
- `keyMoment`：这一切**开始时**的定格瞬间，只写一个动作阶段，不能把 2–5 秒过程压成连环画。
- `composition`：主体放在哪、空间怎样分层、留白在哪里；不复述人物长相。
- `atmosphere`：静态画面可见的雾、风、尘、水、反射、衣摆或动作余势。
- `foreground` / `background`：辅助空间层；画面主体天然位于中层，不单独重复存。
- `storyCues`：观众必须读到的剧情线索，不是普通陈设。
- `exclude`：明确禁止额外人物、无关陈设和模型容易自作主张的内容。

所有提示词文本使用英文。`frame` 继续保存景别、主体与风格的基础英文提示词；脚本用 `buildFrameImagePrompt()` 将 `framePlan`、参考图职责、链式连续性和固定负面约束组装成真正交给 `$imagegen` 的完整 `imagePrompt`。报告复制按钮与 `export` 都输出这条完整提示词，不再让模型只吃到薄的 `frame`。

## 自动选档

| 镜头功能 | 默认密度 | 内容预算 |
| --- | --- | --- |
| 新空间定场 | `rich` | wide/extreme-wide；前景 + 主体层 + 背景，至少两条叙事线索 |
| 普通对话 | `balanced` | 主体关系 + 一层环境语境 + 一条线索 |
| 重台词后的反应 | `sparse` | 一张脸或一个身体反应 + 克制留白；不得 `rich` |
| 动作进行 | `balanced` | 主体动作阶段 + 一项环境反馈；高潮可升 `rich` |
| 悬念揭示 | 按对象 | 空间秘密用 `rich`；眼神、口袋、铜扣等近景用 `sparse/balanced` |
| 手部／道具插入 | `sparse` | close/extreme-close；核心材质 + 一条上下文线索，不得 `rich` |
| 气氛空镜 | `balanced` | 空间线索与光效服务情绪，不用无关陈设填满画面 |

同一个剧情强度在不同景别里的“丰富”不同：大远景靠空间层次，近景靠材质、光影和状态细节。不要把近景误解成必须塞更多物体。

## 确定性质量门

- `sparse`：前景 + 背景最多 2 项，`storyCues` 1–2 项。
- `balanced`：至少 1 项前景或背景，至少 1 项 `storyCue`。
- `rich`：前景和背景各至少 1 项，至少 2 项 `storyCues`。
- 三档都必须有 `keyMoment` / `composition` / `atmosphere`，并至少写 1 项 `exclude`。
- 前景、背景各最多 3 项，线索最多 4 项；超过不是更丰富，是失焦。
- `establishing` 强制 wide/extreme-wide + rich；`insert` 强制 close/extreme-close + sparse/balanced；`reaction` 禁 rich。

## 首批验图

不要只验证第一段。首批从本批分镜里各挑一张：

1. `rich` 的定场、群体关系或动作高潮；
2. `balanced` 的普通对话或移动；
3. `sparse` 的反应、停顿或道具特写。

三档都确认“信息量正确、视觉中心清楚、没有额外人物和发明道具”后，再批量出图。
