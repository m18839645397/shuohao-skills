# 镜头与段间连续性

本规则用于 `continuityMode: "state-linked"`。目标是把“连续”从一句自由文本变成可机械对账的状态链：相邻镜头可以换景别和机位，但切点两侧必须是同一剧情瞬间。

## 每切 startState / endState

```json
{
  "startState": {
    "location": "starship bridge centre",
    "subjectPosition": "captain facing the observation window",
    "bodyPose": "hands clasped tightly behind her back",
    "gaze": "fixed on the fleet beyond the glass",
    "propState": "no handheld prop",
    "lightState": "blue hyperdrive light nearing peak intensity",
    "effectState": "the bridge remains stable",
    "screenDirection": "captain remains oriented away from camera"
  },
  "endState": {
    "location": "starship bridge centre",
    "subjectPosition": "captain facing the observation window",
    "bodyPose": "hands clasped as her shoulders begin to tense",
    "gaze": "fixed on the fleet beyond the glass",
    "propState": "no handheld prop",
    "lightState": "blue hyperdrive light at peak intensity",
    "effectState": "the first bridge tremor reaches her shoulders",
    "screenDirection": "captain remains oriented away from camera"
  }
}
```

八项都必须非空。相邻 cut 强制：

```text
Shot k.endState == Shot k+1.startState
```

比较的是剧情状态，不是构图。下一镜可以从中景切特写，但不能让人物瞬间换位置、换手、转身，或让尚未发生的闪光提前出现。

## Shot 2 起的 transitionPlan

```json
{
  "transitionPlan": {
    "cutPoint": "cut precisely as the first bridge tremor reaches her shoulders",
    "motionCarry": "the same shoulder jolt continues into the close-up",
    "lightCarry": "the peak blue-white light remains continuous across the cut",
    "audioCarry": "the rising hyperdrive whine continues without interruption",
    "axisCarry": "the camera remains on the same side of the captain screen axis"
  }
}
```

- `cutPoint`：上一镜动作在哪个瞬间切断。
- `motionCarry`：当前镜头从哪个动作阶段继续。
- `lightCarry`：光线强度、方向和颜色怎样跨切保持。
- `audioCarry`：跨切不断的声音，逐字进入 `overall_soundscape`。
- `axisCarry`：银幕运动方向、视线和 180 度轴线。

Shot 2 起必须先写：

```text
continue directly from Shot 1 at the same instant
```

中文模式写「在同一时刻直接承接镜头 1」。随后逐字写入 cutPoint、motionCarry、lightCarry、axisCarry；audioCarry 进入声景字段。

## 段间 handoff

每段都有 `handoff`：

```json
{
  "handoff": {
    "kind": "continuous",
    "fromSegment": "E01-01",
    "visualCarry": "the same captain posture and peak blue-white light continue into the next segment",
    "motionCarry": "the shoulder jolt continues from the previous segment without resetting",
    "audioCarry": "the hyperdrive whine crosses the segment boundary without a break"
  }
}
```

类型：

| kind | 规则 |
| --- | --- |
| `episode-start` | 本集第一段，只能用一次 |
| `continuous` | 同场连续动作；前段末切 endState 必须等于本段首切 startState |
| `scene-change` | 明确换场，允许状态断开 |
| `time-jump` | 明确时间跳跃，允许状态断开 |

除第一段外，`fromSegment` 必须等于上一段 id。连续段的 `[Shot 1]` 必须写：

```text
continue directly from segment E01-01 at the same instant
```

并逐字写入 visualCarry、motionCarry；audioCarry 进入声景。

## H3 写法

Shot 1 负责完整建立空间。Shot 2 起先承接再描述变化，不重新发明一套状态：

```text
[Shot 2] At 00:04.500, continue directly from Shot 1 at the same
instant. Cut precisely as the first bridge tremor reaches her shoulders.
The same shoulder jolt continues into the close-up. The peak blue-white
light remains continuous across the cut. The camera remains on the same
side of the captain screen axis. The framing changes to a close-up, but her
position, posture and the physical event remain the same...
```

`visualPlan.continuity` 负责把这次承接写成自然画面句；状态对象负责机械对账，两者缺一不可。

## 分镜图链式参考

为了避免“文字连续、图却跳变”，分镜图按以下顺序生成：

```text
f1：标准场景/角色/道具资产
f2：标准资产 + 本段 f1（它同时就是立即上一切）
f3 起：标准资产 + 本段 f1 + 立即上一切
```

也就是每张子分镜图始终挂：

1. 标准场景、角色、道具设定图——防止链式漂移。
2. 本段 f1——锁定世界观、光线和总体空间。
3. 立即上一切——锁定人物姿势、动作阶段、道具与效果状态。

连续 segment 的下一段 f1 还必须挂上一段最后一帧；`scene-change` / `time-jump` 不挂。

出图提示词明确：继承上一切的状态，只改变当前 `frame` 规定的景别和机位。不要只挂上一切而丢掉标准资产，否则错误会沿链放大。

## 常见病

| 病 | 原因 | 修复 |
| --- | --- | --- |
| 人物瞬移 | 只描述当前构图，没有状态边界 | 对账 endState → startState |
| 动作重新开始 | 下一镜重新写完整动作 | transitionPlan 明确 cutPoint 和 motionCarry |
| 正反打越轴 | 没记录银幕方向和视线 | screenDirection + axisCarry |
| 闪光或烟雾跳变 | 光效各镜独立描述 | lightState + effectState + lightCarry |
| 声音硬断 | 声景只按段写，没有跨切桥 | audioCarry 逐字进入 overall_soundscape |
| 段间重置 | 独立生成调用没有 handoff | continuous handoff + 上一段末帧作为下一段 f1 参考 |
