# 单图粗九宫格候选与人工选择

本规则用于：

```json
{
  "candidateMode": "single-grid-rough",
  "selectionMode": "human-ordered",
  "edgePlanMode": "edge-driven"
}
```

每段先用**一次** imagegen 调用生成一张低细节3×3候选图。粗图只负责构图、动作阶段和空间方向，允许脸、手和材质不精细。人工按播放顺序选 N 格后，再分别生成 N 张高清终稿。

`cinematic` 的粗图仍必须是 `rough live-action photographic shot-selection contact sheet`：真人演员、实体服装、实景/搭景和光学镜头语义。粗糙指细节少，不代表可以变成手绘分镜、概念图或动画草稿。

## 固定九格

|  | wide | medium | close |
| --- | --- | --- | --- |
| entry | G1 | G2 | G3 |
| transition | G4 | G5 | G6 |
| result | G7 | G8 | G9 |

`candidateBoard.cells` 恰好九项，每项：

```json
{
  "id": "G2",
  "moment": "entry",
  "size": "medium",
  "prompt": "A rough medium composition showing the pre-action entry state ..."
}
```

候选提示词全部英文，不写角色名。图片里不让模型画 G1–G9；报告用 HTML 覆盖九个点击区，避免模型文字乱码。

## 人工选择

报告按点击顺序编号。再次点击取消，「清空本段」只清当前段。导出：

```json
{
  "mode": "human-ordered",
  "selections": [{
    "segment": "E01-01",
    "selected": ["G2", "G5", "G8"]
  }]
}
```

第一张必须来自 G1–G3，最后一张必须来自 G7–G9，选择顺序只能从 entry 向 result 推进。

选择数量由段长与2–5秒切镜范围决定：

```text
min = ceil(segmentSeconds / maxCutSeconds) + 1
max = min(5, floor(segmentSeconds / minCutSeconds) + 1)
```

## 写回与重排

```bash
node scripts/novel-storyboard.mjs select storyboard.json selection.json \
  --out storyboard-selected.json
```

`select` 只写回人工决定并设置 `needsReplan: true`，不会假装已经完成节拍重排。随后模型必须：

1. 让 cuts 数量等于 selected 数量；
2. 按顺序写每切 `candidateId`；
3. 在详细 `frame` 中保留所选格子的 prompt 原句并扩充高清细节；
4. 重算 beats、seconds、Picture 对齐与 H3；
5. 为相邻选择填写 N−1 条 `edgePlans`；
6. 完成后改为 `needsReplan: false`。

## edgePlans

```json
{
  "from": "G2",
  "to": "G5",
  "camera": "Static Shot",
  "transition": "cut-on-action",
  "pace": "static",
  "magnitude": "none",
  "target": "the first movement of her rear heel",
  "focus": "keep the woman and suitcase legible",
  "intent": "preserve direction before the cut"
}
```

每条边连接相邻选中格，并与目标 cut 的 camera / transition 一致。一条边只用一个主运镜；不要求所有边使用不同词汇。

推荐映射：

- wide → medium/close：Push In
- close → wide：Pull Out
- 主体横移：Tracking Shot / Truck
- 同位置、视线或道具变化：Static Shot + focus
- 对话反应：reaction-cut
- 遮挡揭示：reveal-cut
- 形状或方向呼应：match-cut
- 跨轴或机位跳变大：直接切，不强行摇移

## 出图与投产包

每段目录：

```text
E01-01/
├── candidate-grid.prompt.md
├── candidate-grid.png
├── candidate-selection.template.json
├── f1.prompt.md / f1.png
├── f2.prompt.md / f2.png
├── ...
└── prompt.md
```

高清终稿继续使用场景、角色、道具标准资产；f2 起使用上一张高清图做链式参考。粗九宫格不作为终稿参考的唯一来源。
