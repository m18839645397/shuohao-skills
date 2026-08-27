# 分镜图出图 · codex `$imagegen`

出图走 codex 内置的 `$imagegen` 系统 skill，**不需要任何 API key**——用本机 codex 登录态。**没有 codex 就整步跳过**，只交提示词，报告显示「未生成」占位，其余产出照常。

## 分镜图是什么

一个分镜一张 16:9 关键帧，**每段一个文件夹**：`<段号>/f<切序>.png`（f1 = 主分镜图）。`export` 同时写出 H3 的 `prompt.md` 和每切完整的 `f1.prompt.md`、`f2.prompt.md`……。第 1 切钉在 0.00 秒，其余子分镜图钉在各自切点。

**它是受控资产合成，不是凭空画，也不是只把人摆进空背景。** 场景、角色、道具长什么样由上游设定图锁定；`framePlan` 决定这一格该用多少空间层次和叙事线索。完整规则见 `frame-density.md`。

正式出图前，每段先按 `candidate-grid.md` 用一次调用生成 `candidate-grid.png`。九宫格允许粗糙，只用于人工选择；选中的格子必须分别重生成高清 f1..fN，不能直接裁切九宫格当终稿。

## 提示词来源

- `frame`：基础英文提示词，只保存景别、主体、基础构图和统一风格短语。
- `framePlan`：时间语义、五项入口态、镜头功能、sparse/balanced/rich 密度、关键瞬间、前后景、叙事线索、气氛和排除项。
- `buildFrameImagePrompt()`：确定性合并参考图职责、`frame`、`framePlan`、链式连续性和固定负面约束。

报告里的「完整分镜图提示词」复制按钮和 `export` 的 `fN.prompt.md` 都使用组装结果。**不要再直接复制 JSON 里的薄 `frame` 去出图。**

每段 f1 必须 `moment=entry`：人物、姿态、视线、道具和效果均处于动作前状态，动作只在0.00秒之后开始。具体契约见 `frame-entry.md`。

## 参考图挂载（命根子）

每一格的 `-i` 清单：

1. **场景参考**：cinematic 优先 `images/<场景名>-master.png`，其他风格或缺 master 时才回退 sheet
2. **角色参考**：cinematic 优先 `images/<角色名>-screen-test.png`，sheet 只补服装背面、比例和细节
3. **叙事道具参考**：cinematic 优先道具主状态 `master.png`，有就挂；避免把多面板技术版式传进最终镜头
4. **链式参考是硬要求**：f2 起始终挂本段 f1 + 立即上一切；标准场景/角色/道具资产继续全部挂上。f1 锁世界观和光线，上一切锁姿势、动作阶段、道具、闪光/雾/震动状态，标准资产防止错误沿链漂移
5. **挂图按「画面里有什么」，不按「段属于哪个场」**：段在栈桥场，但画面里出现了渡船，就必须把渡船的设定图也挂上——不挂 = 每帧发明一条新船（踩过）。船、马车、宅门这类「会入画的大资产」都同理
6. **提示词必须写明人物此刻的位置状态**：已上船 / 在舱内 / 站在桥头——切镜时人物位置是连续的剧情状态，只写构图不写状态，模型会把上了船的人又画回岸上（踩过）
7. **连续段的 f1 挂上一段最后一帧**：`handoff.kind=continuous` 时，下一段 f1 除标准资产外必须挂上一段最后一张分镜图；`scene-change` / `time-jump` 不挂

完整 imagePrompt 开头已经声明环境、角色和道具参考图的职责；实际调用时仍要按附件顺序明确哪张是环境、谁的角色图、哪件道具图，别让模型猜。

f2 起固定追加：`Preserve the exact subject pose, position, screen direction, prop state, light level and physical event from the previous-cut reference. Continue from the same instant; change only the shot size and camera composition required by this frame.` 连续段 f1 把 `previous-cut` 改成 `previous-segment final-frame`。

## 调用契约

- **跑在 codex 里**：直接用 `$imagegen`，不要再 shell 出去调 `codex exec`
- **跑在 Claude Code**：shell 调本机 codex，**先探测版本最高的 binary**（旧版直接报错），探测脚本抄 `novel-characters/references/sheet.md` 的 `find_codex`
- 所有调用套 `env -u NODE_OPTIONS`（codex 继承坏的 NODE_OPTIONS 会启动即崩）
- **一镜一次调用，绝不批量**（PNG 字节会撑爆 rollout）
- 用了 `-i/--image` 这类变长参数时 **prompt 必须走 stdin**
- 提示词里明写「copy to ./<段号>/f<切序>.png」，别让图留在 codex 默认目录
- 提示词末尾固定加：`No text, no watermark, no borders — a single clean full-bleed frame.`（分镜图是干净的一帧，不是设定图，不要格子边框）
- 单个失败跳过不阻断，最后汇总说明
- **不碰 CLI fallback**（要 `OPENAI_API_KEY`）

## 出图范围

**默认先出三张代表图**：一张 rich 定场/高潮、一张 balanced 对话/移动、一张 sparse 反应/道具特写。三档都确认信息量、视觉中心和资产一致性后再补整批。一集约 30–40 格就是同样次数的调用，方向错了整批重来。用户明确说全出再全出。

## 拿到图先扫一眼

- 和场景设定图是不是同一个世界（材质、光、旧化程度）
- 角色的脸和衣服对不对得上角色设定图
- 景别对不对（提示词写 close-up 出来却是全景 → 重生成）
- f1 是否真的处于动作前入口态，而不是已经奔跑、拍中、转身或打开
- rich 镜头是否有清楚的前中后景和至少两条叙事线索，而不是只多了无关摆件
- sparse 镜头是否保持单一视觉中心、材质和光影细节，而不是低质量空白
- 有没有多出来的人（背景围观群众是最常见污染）——多人就重生成
