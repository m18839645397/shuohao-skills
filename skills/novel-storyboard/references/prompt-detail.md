# 投产级丰富视频提示词

本规则用于 `promptDetailMode: "production-rich"`。它解决的是“结构正确但内容太薄”：只有景别、动作和运镜，缺空间材质、光线、人物识别、动作过程、物理反馈、镜头连续性与声音动态。

丰富不等于堆形容词。每个字段只写视频模型能看见或听见、并能在本切时长内完成的内容。

## 每切 visualPlan 六层

```json
{
  "visualPlan": {
    "environment": "A cavernous starship bridge with metallic consoles and a massive curved observation window",
    "lighting": "Cool starlight silhouettes the captain while amber console displays add restrained edge reflections",
    "subject": "A female captain in her late forties wears a structured dark navy military tunic with silver insignias",
    "action": "She stands perfectly still with both hands clasped tightly behind her back as the fleet powers up",
    "effects": "Blue engine light intensifies across the glass and produces growing reflections on the bridge surfaces",
    "continuity": "The escalating blue light and her rigid posture carry directly into the next close-up"
  }
}
```

- `environment`：空间体量、结构、材质、前中后景和关键背景资产。
- `lighting`：光源、方向、色温、明暗关系、反射与曝光变化。
- `subject`：通用身份、年龄段、体型、服装和当前站位；英文模式禁人名。
- `action`：本切 2–5 秒内动作如何开始、发展和结束，不只写一个动词。
- `effects`：雾、风、尘、水、衣摆、震动、闪光、碎屑或环境物理反馈；平静场景也要写可见的细微反馈。
- `continuity`：承接上一切的状态，并明确留给下一切的运动、光线、视线或姿态。

六个值都是跟随 `promptLang` 的 prompt-ready 原句，必须逐字进入自己的 `[Shot k]`。英文模式每项至少 24 个字符，中文模式至少 10 个字符，避免退化成 “dark room” / “she moves” 这种标签。

## 每段 audioPlan

### overall_soundscape 四层

```json
{
  "soundscape": {
    "baseline": "A low resonant life-support hum and distant ventilation establish the bridge room tone",
    "build": "A high electronic whine rises steadily as the fleet charges its hyperdrives",
    "events": "A bass-heavy boom, sharp electrical crackle and metallic bulkhead rattles strike with the jump",
    "aftermath": "The impact collapses into hollow room tone with only the isolated life-support hum remaining"
  }
}
```

- `baseline`：场景持续存在的环境底噪。
- `build`：随画面升级的声响层；平静段可以写保持稳定或逐渐减弱。
- `events`：与动作或切点同步的可定位声响，不复述台词。
- `aftermath`：事件后的余响、衰减或突然抽空。

四项逐字进入 `overall_soundscape:`。声音也是动作指令：没发生的撞击不要为了丰富而写。

### non_diegetic_music

有配乐：

```json
{
  "music": {
    "mode": "scored",
    "style": "A cinematic space-opera orchestral score at a slow, grave tempo",
    "instrumentation": "A solitary French horn over low sustained strings and restrained percussion",
    "arc": "The harmony begins sparse, swells with the charging fleet and reaches one controlled orchestral peak",
    "sync": "The score cuts to silence immediately after the hyperspace jump"
  }
}
```

- `style`：类型、速度和情绪。
- `instrumentation`：主导乐器与层次。
- `arc`：本段内部从弱到强、保持或衰减的曲线。
- `sync`：和动作、台词、闪光、切点或段尾同步的位置。

四项逐字进入 `non_diegetic_music:`。

明确无配乐时只写：

```json
{ "music": { "mode": "none" } }
```

对应字段写 `non_diegetic_music: N/A`；中文模式写「无」。不要为了通过丰富度门给每段硬塞配乐。

## integrated_multimodal_description 顺序

每个 `[Shot k]` 使用自然段，不显示 JSON 字段名，顺序固定：

1. 切点时刻、转场与 `<Picture k>` 构图锚定。
2. 景别、`visualPlan.environment`、`visualPlan.lighting`。
3. `visualPlan.subject` 和当前站位。
4. `visualPlan.action`，再接 cameraPlan 的速度/幅度、主运镜和目标。
5. cameraPlan 焦点、`visualPlan.effects` 与结束构图。
6. `visualPlan.continuity` 和导演意图。
7. 台词、音色和口型规则。

示例：

```text
[Shot 1] Cinematic, medium wide shot. A straight cut fully anchors the framing
of <Picture 1>. A cavernous starship bridge with metallic consoles and a massive
curved observation window. Cool starlight silhouettes the captain while amber
console displays add restrained edge reflections. A female captain in her late
forties wears a structured dark navy military tunic with silver insignias. She
stands perfectly still with both hands clasped tightly behind her back as the
fleet powers up. Use a slow, subtle Push In centred on her rigid silhouette.
Keep the captain sharp while the fleet remains legible through the glass. Blue
engine light intensifies across the glass and produces growing reflections on
the bridge surfaces. End in a tighter composition as the blue light reaches her
shoulders. The escalating blue light and her rigid posture carry directly into
the next close-up. The intent is to build pressure before the fleet disappears.
```

## 长度与取舍

- 2 秒切：优先主体、单一动作、光线变化和结尾状态；不要塞多阶段事件。
- 3–4 秒切：完整写六层，但每层一句，动作最多一次转折。
- 5 秒切：允许一次明确的动作发展或物理反馈，例如充能→闪光→震动。
- 参考图已经锁定长相与主材质，提示词描述识别特征和当前光照，不重复整份角色/场景设定。
- 同一事实只写一次；环境、人物、动作、运镜、声音各自承担自己的信息。

## 禁止项

- 只有 “cinematic, medium shot, pushing in slowly” 而没有空间、光线、主体和动作过程。
- 写角色不可见的心理活动；改写成姿态、视线、呼吸或动作。
- 在 2–5 秒内安排多个复杂动作、精密物理交互或连续大场面变化。
- 声景描述画面没有发生的撞击、爆炸、开门或物体运动。
- 每段都使用史诗配乐和高潮；配乐强度必须服务剧情节拍。
- 后一切重新发明人物服装、位置、光线或环境状态，破坏前后连续性。
