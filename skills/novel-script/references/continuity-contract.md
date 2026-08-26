# 剧本连续性契约

本规则用于顶层 `continuityMode: "state-linked"`。剧本仍然只管戏，不写景别、机位或运镜；它只交付分镜不能重新猜的剧情事实：人物在哪里、保持什么姿态与视线、道具归谁、效果进行到哪一步、动作是否尚未完成。

## 单一事实源

每场只存一份完整 `continuity.entryState`，每个动作拍只存变化量 `statePatch`。出口状态不落盘，由脚本按节拍顺序归并计算：

```text
entryState
  → action 1.statePatch
  → line（状态不变）
  → action 2.statePatch
  → computed exitState
```

不要再手写一份 `exitState`，否则修改动作后两份状态容易互相漂移。

## 场次入口状态

```json
{
  "continuity": {
    "kind": "episode-start",
    "entryState": {
      "characters": {
        "C01": {
          "position": "供桌左侧",
          "pose": "背向南门站立",
          "gaze": "供桌",
          "emotion": "克制饥饿"
        }
      },
      "props": {
        "P01": {
          "holder": "C02",
          "position": "怀中",
          "condition": "整捆未拆"
        }
      },
      "effectState": "香烟稀薄",
      "unfinishedAction": "C02 正跨过门槛"
    }
  }
}
```

- `characters` 必须覆盖本场 `characters` 的全部 C 编号；每人都有 `position` / `pose` / `gaze` / `emotion`。
- `props` 必须覆盖本场 `props` 的全部 P 编号；每件都有 `holder` / `position` / `condition`。`holder` 只能是本场角色 id 或 `null`。
- `effectState` 写仍在持续的烟、雨、闪光、震动等；没有就明确写「无持续效果」。
- `unfinishedAction` 写场次开始瞬间尚未完成的动作；稳定状态明确写「无」。
- `kind` 只用 `episode-start` / `continuous` / `scene-change` / `time-jump`。同场同光照的直接承接才用 `continuous`。

## 动作拍状态补丁

```json
{
  "action": "少年跑到供桌右侧，把白烛递向祖父。",
  "statePatch": {
    "characters": {
      "C02": {
        "position": "供桌右侧",
        "pose": "右手递出白烛",
        "gaze": "C01"
      }
    },
    "props": {
      "P01": {
        "position": "两人之间",
        "condition": "尚未完全交接"
      }
    },
    "unfinishedAction": "C01 与 C02 同时接触 P01"
  }
}
```

只写本拍改变的字段，未出现的字段自动继承。每个动作拍都必须有非空 `statePatch`；如果动作没有留下可见变化，应重新判断它是否值得成为独立节拍。

台词拍不能携带 `statePatch`。说话时发生递物、起身、转头等物理变化，拆成紧邻的动作拍；`delivery` 只写语气、节奏和潜台词，不承担道具或位置变更。

## 连续场次

同一集内，后一场标记 `continuous` 时：

1. 场景 id 与光照必须保持一致。
2. 后一场 `entryState` 必须逐项等于前一场计算出的出口状态。
3. 若人物、道具、地点或时间发生断开，改用 `scene-change` / `time-jump`，并重新建立完整入口状态。

`novel-storyboard seed` 会把归并结果展开成每拍 `stateBefore` / `stateAfter`，分镜再按认领区间复制为 cut 的 `sourceState.before` / `sourceState.after`。

## 兼容

新 seed 默认写入 `continuityMode: "state-linked"`。旧 script.json 没有该字段时仍按旧规则通过，但质量门和报告会明确说明剧本状态链检查已跳过。
