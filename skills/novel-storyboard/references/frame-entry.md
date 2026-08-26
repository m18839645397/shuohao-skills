# 段首动作入口帧

本规则用于 `frameEntryMode: "start-boundary"`。每段第一个分镜图 f1 被钉在 0.00 秒，因此它必须展示**动作发生前的入口状态**，不能展示动作中段、撞击瞬间或动作结果。

不新增 f0：现有 f1 就是初始分镜头。H3 从这张静态入口帧开始，在 0.00 秒之后执行本切动作。

## framePlan 时间语义

每切增加：

```json
{
  "moment": "entry",
  "entryStatePrompt": {
    "position": "standing at the near edge of the muddy riverside path",
    "pose": "torso inclined slightly forward while both feet still hold the ground",
    "gaze": "fixed into the dense fog along the path ahead",
    "prop": "the weathered leather suitcase remains locked against her chest",
    "effect": "the puddles remain still before the first footstep lands"
  }
}
```

`moment` 枚举：

| moment | 用途 |
| --- | --- |
| `entry` | 动作前入口态；每段 f1 强制使用 |
| `transition` | 动作在切点处的承接阶段；仅后续子分镜使用 |
| `impact` | 接触、撞击、揭示等重音瞬间；仅后续子分镜使用 |
| `result` | 动作完成后的可见结果；仅后续子分镜使用 |

`entryStatePrompt` 五项全部是英文 prompt-ready 短句，分别翻译本切 `startState` / `sourceState.before` 的人物位置、姿态、视线、道具和环境效果。脚本把它们逐字写进完整 imagePrompt。

## 不同段间关系怎样取入口态

- `episode-start`：取第一场第一拍的 `sourceState.before`。
- `scene-change` / `time-jump`：取新场景的入口状态。
- `continuous`：取上一段最后一切的 `endState`；同时挂上一段最后一帧。

## 正误示例

| 错误 f1 | 正确 entry f1 |
| --- | --- |
| 人物已经跑在路中央 | 人物身体前倾、双脚仍着地，准备迈出第一步 |
| 手掌已经拍中箱盖 | 手掌悬在箱盖上方，肩肘完成蓄力 |
| 人物已经回头 | 身体未转，视线刚准备移向声源 |
| 门已经打开 | 手握门把，门仍关闭 |

段首 `keyMoment` 必须含动作入口语义，如 `before` / `poised` / `ready` / `remains` / `holds` / `stands` / `sits` / `waits` / `prepares` / `about to`。不得使用 `has just struck`、`already running`、`mid-stride` 等结果或中段语义。

## H3 起动边界

每段 `[Shot 1]` 必须逐字包含：

```text
motion begins only after the 0.00-second entry frame
```

中文模式使用：

```text
动作仅在 0.00 秒入口帧之后开始
```

随后才描述 `visualPlan.action` 从 entry state 向 endState 展开。

## 额外定场镜头不是本规则

如果需要在剧本动作前额外增加1–2秒纯空镜，那是可选 `preRoll` 能力，会改变节拍认领和集时长；本规则不创建无节拍镜头，只修正 f1 的时间位置。
