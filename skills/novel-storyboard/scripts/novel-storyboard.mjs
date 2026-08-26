#!/usr/bin/env node
// novel-storyboard — deterministic helpers for the novel-storyboard skill (分镜).
// Zero dependencies on purpose: the skill must work in any directory
// without an npm install. Node 18+ (stdlib only).

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */
/*
 * AI 短剧的前提刻在骨子里，三层结构也由此而来：
 *
 *   段（segment）＝ 一次视频生成调用，上限就是模型单段时长（默认 15 秒）
 *   分镜（cut）  ＝ 段内的一次剪切，2–5 秒——短剧观众的注意力节奏
 *   分镜图       ＝ 每个分镜一张关键帧：第 1 个分镜的是主分镜图（钉在
 *                  0.00 秒），其余是子分镜图（各钉在自己的切点时刻）
 *
 * 一段的画面由这串分镜图 + 一条 H3 提示词共同控制：多图对齐指令
 * 把每张图钉在对应秒数上，[Shot k] 的切点时刻和分镜秒数逐一对账。
 * 多切一刀的成本几乎为零，所以不心疼分镜数量，只守节奏。
 */

export const DEFAULT_PARAMS = {
  minSegmentSeconds: 0,  // 旧 JSON 兼容：0 表示只守上限；新 seed 会显式写 5 秒
  maxSegmentSeconds: 15, // 视频模型单段生成上限（秒）
  minCutSeconds: 2,      // 单个分镜下限
  maxCutSeconds: 5,      // 单个分镜上限——3 秒左右是短剧的呼吸
  maxOnScreen: 3,        // 单个分镜同框人数上限，超了必须带拆解说明
  tolerance: 0.15,       // 每集总时长对剧本目标的容差
};

export function paramsOf(doc) {
  return { ...DEFAULT_PARAMS, ...(doc?.params ?? {}) };
}

/** 景别枚举：英文短语必须出现在该分镜的分镜图提示词里。 */
export const SHOT_SIZES = {
  'extreme-wide': { zh: '大远景', phrase: 'extreme wide shot' },
  wide: { zh: '全景', phrase: 'wide shot' },
  medium: { zh: '中景', phrase: 'medium shot' },
  close: { zh: '特写', phrase: 'close-up' },
  'extreme-close': { zh: '大特写', phrase: 'extreme close-up' },
};

/** 运镜枚举：直接用 H3 官方词表，原样写进该分镜的 [Shot k] 段落。 */
export const CAMERA_MOVES = {
  'Static Shot': '固定',
  'Push In': '推',
  'Pull Out': '拉',
  'Zoom In': '变焦推',
  'Zoom Out': '变焦拉',
  'Pan Left': '左摇',
  'Pan Right': '右摇',
  'Truck Left': '左移',
  'Truck Right': '右移',
  'Tilt Up': '仰摇',
  'Tilt Down': '俯摇',
  'Pedestal Up': '升',
  'Pedestal Down': '降',
  'Arc Shot': '环绕',
  'Tracking Shot': '跟拍',
  'Shake Slightly': '轻微晃动',
  'Shake Strongly': '强烈晃动',
  'POV': '主观视角',
  'Roll Clockwise': '顺旋',
  'Roll Counterclockwise': '逆旋',
};

/** 克制电影感运镜执行计划：新 seed 默认开启，旧 JSON 未声明时保持兼容。 */
export const CAMERA_PLAN_MODE = 'cinematic-controlled';
export const CAMERA_PLAN_PACES = ['static', 'slow', 'steady', 'fast'];
export const CAMERA_PLAN_MAGNITUDES = ['none', 'subtle', 'moderate', 'large'];
export const CAMERA_PLAN_FIELDS = ['start', 'target', 'end', 'focus', 'intent'];
/** 投产级丰富提示词：视觉逐切，声景与配乐逐段；新 seed 默认开启。 */
export const PROMPT_DETAIL_MODE = 'production-rich';
export const VISUAL_PLAN_FIELDS = ['environment', 'lighting', 'subject', 'action', 'effects', 'continuity'];
export const SOUND_PLAN_FIELDS = ['baseline', 'build', 'events', 'aftermath'];
export const MUSIC_PLAN_FIELDS = ['style', 'instrumentation', 'arc', 'sync'];
/** 分镜图自适应密度：镜头功能决定内容预算，最终 imagePrompt 由脚本确定性组装。 */
export const FRAME_PLAN_MODE = 'adaptive-density';
export const FRAME_ROLES = ['establishing', 'dialogue', 'reaction', 'action', 'reveal', 'insert', 'atmosphere'];
export const FRAME_DENSITIES = ['sparse', 'balanced', 'rich'];
export const FRAME_PLAN_TEXT_FIELDS = ['keyMoment', 'composition', 'atmosphere'];
export const FRAME_PLAN_ARRAY_FIELDS = ['foreground', 'background', 'storyCues', 'exclude'];
/** 段首 f1 的时间语义：必须展示动作前入口态，动作只在 0.00 秒之后发生。 */
export const FRAME_ENTRY_MODE = 'start-boundary';
export const FRAME_MOMENTS = ['entry', 'transition', 'impact', 'result'];
export const FRAME_ENTRY_FIELDS = ['position', 'pose', 'gaze', 'prop', 'effect'];
export const FRAME_ENTRY_TOKENS = {
  en: 'motion begins only after the 0.00-second entry frame',
  zh: '动作仅在 0.00 秒入口帧之后开始',
};
/** 单次粗略九宫格 → 人工顺序选择 → 高清终稿与边运镜。 */
export const CANDIDATE_MODE = 'single-grid-rough';
export const SELECTION_MODE = 'human-ordered';
export const EDGE_PLAN_MODE = 'edge-driven';
export const CANDIDATE_GRID_SPEC = [
  { id: 'G1', moment: 'entry', size: 'wide' },
  { id: 'G2', moment: 'entry', size: 'medium' },
  { id: 'G3', moment: 'entry', size: 'close' },
  { id: 'G4', moment: 'transition', size: 'wide' },
  { id: 'G5', moment: 'transition', size: 'medium' },
  { id: 'G6', moment: 'transition', size: 'close' },
  { id: 'G7', moment: 'result', size: 'wide' },
  { id: 'G8', moment: 'result', size: 'medium' },
  { id: 'G9', moment: 'result', size: 'close' },
];
export const EDGE_PLAN_FIELDS = ['target', 'focus', 'intent'];
/** 镜头连续性：状态链 + 切内动作桥 + 段间交接；新 seed 默认开启。 */
export const CONTINUITY_MODE = 'state-linked';
export const CONTINUITY_STATE_FIELDS = [
  'location', 'subjectPosition', 'bodyPose', 'gaze',
  'propState', 'lightState', 'effectState', 'screenDirection',
];
export const TRANSITION_PLAN_FIELDS = ['cutPoint', 'motionCarry', 'lightCarry', 'audioCarry', 'axisCarry'];
export const HANDOFF_FIELDS = ['visualCarry', 'motionCarry', 'audioCarry'];
export const HANDOFF_KINDS = ['episode-start', 'continuous', 'scene-change', 'time-jump'];
export const CONTINUITY_TOKENS = {
  en: {
    cut: (k) => `continue directly from Shot ${k} at the same instant`,
    segment: (id) => `continue directly from segment ${id} at the same instant`,
  },
  zh: {
    cut: (k) => `在同一时刻直接承接镜头 ${k}`,
    segment: (id) => `在同一时刻直接承接段 ${id}`,
  },
};
export const TRANSITION_TOKENS = {
  'straight-cut': { en: 'straight cut', zh: '直接切入' },
  'cut-on-action': { en: 'cut-on-action', zh: '动作中切入' },
  'reaction-cut': { en: 'reaction cut', zh: '反应切入' },
  'match-cut': { en: 'match cut', zh: '匹配剪辑切入' },
  'reveal-cut': { en: 'reveal cut', zh: '揭示切入' },
};
const CAMERA_PACE_TOKENS = {
  en: { slow: 'slow', steady: 'steady', fast: 'fast' },
  zh: { slow: '缓慢', steady: '平稳', fast: '快速' },
};
const CAMERA_MAGNITUDE_TOKENS = {
  en: { subtle: 'subtle', moderate: 'moderate', large: 'large' },
  zh: { subtle: '轻微', moderate: '中等', large: '大幅' },
};
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const FRAME_DENSITY_INSTRUCTIONS = {
  sparse: 'Keep the image intentionally restrained with one dominant focal point, controlled negative space and no decorative clutter.',
  balanced: 'Keep a balanced narrative composition with a clear subject plane, one supporting spatial layer and one legible story cue.',
  rich: 'Build a narratively dense but controlled composition with legible foreground, subject plane and background; every detail must support the beat.',
};

/**
 * 单切结构化 framePlan → 真正交给 imagegen 的完整英文提示词。
 * 旧 JSON 没有 framePlan 时原样返回 cut.frame，保证兼容；新模式由质量门保证结构完整。
 */
export function buildFrameImagePrompt(cut, { cutIndex = 0, segmentContinuous = false } = {}) {
  const base = String(cut?.frame ?? '').trim();
  const plan = cut?.framePlan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return base;

  const list = (field) => Array.isArray(plan[field])
    ? plan[field].filter(hasText).map((x) => String(x).trim())
    : [];
  const lines = [
    'Treat the attached environment reference as the exact location, material and lighting standard.',
  ];
  if ((cut?.characters ?? []).length) {
    lines.push('Match every on-screen subject exactly to the attached character reference images.');
  }
  if ((cut?.props ?? []).length) {
    lines.push('Match every narrative prop exactly to the attached prop reference images.');
  }
  lines.push(FRAME_DENSITY_INSTRUCTIONS[plan.density] ?? 'Keep the composition narratively clear and controlled.');
  if (plan.moment === 'entry') {
    lines.push('This is the exact action-entry state at 0.00 seconds; motion begins only after this still frame.');
    const entry = plan.entryStatePrompt;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      if (hasText(entry.position)) lines.push(`Entry position: ${entry.position.trim()}.`);
      if (hasText(entry.pose)) lines.push(`Entry pose: ${entry.pose.trim()}.`);
      if (hasText(entry.gaze)) lines.push(`Entry gaze: ${entry.gaze.trim()}.`);
      if (hasText(entry.prop)) lines.push(`Entry prop state: ${entry.prop.trim()}.`);
      if (hasText(entry.effect)) lines.push(`Entry effect state: ${entry.effect.trim()}.`);
    }
  }
  if (base) lines.push(base);
  if (hasText(plan.keyMoment)) lines.push(`Keyframe moment: ${plan.keyMoment.trim()}.`);
  if (hasText(plan.composition)) lines.push(`Composition: ${plan.composition.trim()}.`);
  const foreground = list('foreground');
  const background = list('background');
  const storyCues = list('storyCues');
  const exclude = list('exclude');
  if (foreground.length) lines.push(`Foreground: ${foreground.join('; ')}.`);
  if (background.length) lines.push(`Background: ${background.join('; ')}.`);
  if (storyCues.length) lines.push(`Narrative cues that must remain legible: ${storyCues.join('; ')}.`);
  if (hasText(plan.atmosphere)) lines.push(`Visible atmosphere and physical feedback: ${plan.atmosphere.trim()}.`);
  if (cutIndex > 0) {
    lines.push('Preserve the exact subject pose, position, screen direction, prop state, light level and physical event from the previous-cut reference. Continue from the same instant; change only the shot size and camera composition required by this frame.');
  } else if (segmentContinuous) {
    lines.push('Preserve the exact subject pose, position, screen direction, prop state, light level and physical event from the previous-segment final-frame reference. Continue from the same instant; change only the shot size and camera composition required by this frame.');
  }
  if (exclude.length) lines.push(`Do not add: ${exclude.join('; ')}.`);
  lines.push('No text, no watermark, no borders — a single clean full-bleed 16:9 frame.');
  return lines.join('\n');
}

/** 一次 imagegen 调用使用的粗略九宫格提示词；编号由报告叠加，不让图像模型画字。 */
export function buildCandidateGridPrompt(seg) {
  const cells = Array.isArray(seg?.candidateBoard?.cells) ? seg.candidateBoard.cells : [];
  const lines = [
    'Create ONE rough 3-by-3 storyboard contact sheet on a single 16:9 canvas.',
    'Exactly nine equal 16:9 panels arranged in three columns and three rows with narrow clean gutters.',
    'This is a low-detail composition board for human selection: prioritize readable staging, shot size, screen direction, prop ownership and action phase over facial or material detail.',
    'Use the attached environment, character and prop references as rough identity and continuity standards; do not spend detail budget on polish.',
    'Keep the same characters, costume blocks, location geometry, lighting direction and narrative props consistent across all nine panels.',
    'Row 1 is the pre-action entry state; row 2 is action development; row 3 is the visible result or exit state.',
  ];
  for (const spec of CANDIDATE_GRID_SPEC) {
    const cell = cells.find((x) => x?.id === spec.id);
    lines.push(`[Cell ${spec.id} — ${spec.moment} / ${spec.size}] ${String(cell?.prompt ?? '').trim()}`);
  }
  lines.push('Do not draw cell numbers, captions, text, watermark or decorative borders inside the image; the review report overlays G1–G9 labels deterministically.');
  if (seg?.id) lines.push(`Copy the final selected image to ./${seg.id}/candidate-grid.png.`);
  return lines.join('\n');
}

export function candidateSelectionBounds(seg, params = DEFAULT_PARAMS) {
  const seconds = segSeconds(seg);
  return {
    min: Math.max(2, Math.ceil(seconds / params.maxCutSeconds) + 1),
    max: Math.min(5, Math.floor(seconds / params.minCutSeconds) + 1),
  };
}

/** 报告导出的 selection.json 写回 storyboard；后续模型按 selected 顺序重排 cuts/edgePlans。 */
export function applyCandidateSelection(board, selectionDoc) {
  if (selectionDoc?.mode !== SELECTION_MODE) throw new Error(`selection.mode 必须是「${SELECTION_MODE}」`);
  const next = JSON.parse(JSON.stringify(board));
  const selections = Array.isArray(selectionDoc?.selections) ? selectionDoc.selections : [];
  const bySegment = new Map(selections.map((x) => [x?.segment, x]));
  const known = new Set((next?.episodes ?? []).flatMap((ep) => (ep?.segments ?? []).map((seg) => seg?.id)));
  for (const id of bySegment.keys()) if (!known.has(id)) throw new Error(`selection 引用了不存在的段「${id}」`);
  for (const ep of next?.episodes ?? []) {
    for (const seg of ep?.segments ?? []) {
      const picked = bySegment.get(seg?.id);
      if (!picked) continue;
      if (!seg.candidateBoard || typeof seg.candidateBoard !== 'object') seg.candidateBoard = { mode: CANDIDATE_MODE, cells: [] };
      seg.candidateBoard.selected = Array.isArray(picked.selected) ? [...picked.selected] : [];
      seg.candidateBoard.needsReplan = true;
    }
  }
  return next;
}

/** 分镜图风格预设：与 novel-characters / novel-art 同名对齐（realistic / cinematic / ghibli / inkwash）。
 *  短语必须出现在每条分镜图提示词里——同一部剧的分镜图不许画风漂。 */
export const STYLE_PRESETS = {
  realistic: { zh: '半写实电影感', phrase: 'cinematic film still' },
  cinematic: { zh: '电影级真人写实', phrase: 'photorealistic feature-film frame' },
  ghibli: { zh: '吉卜力手绘', phrase: 'hand-painted anime film still' },
  inkwash: { zh: '国风水墨', phrase: 'chinese ink-wash cinematic frame' },
};
export const DEFAULT_STYLE = 'realistic';

const CJK = /[㐀-鿿぀-ヿ가-힯]/;
const r1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* H3 提示词的确定性骨架                                                 */
/* ------------------------------------------------------------------ */
/*
 * 结构由 H3 官方规范（h3-prompt-writing skill）定死，而且对齐指令和
 * 切点时刻都能从分镜结构推导出来——所以逐字设门，一个字符都不许漂。
 */

export const H3_I2VA_LINE =
  'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
export const H3_FIELDS = ['integrated_multimodal_description:', 'overall_soundscape:', 'non_diegetic_music:'];

/** 骨架 token 按语言取：默认英文（官方规范口径）；'zh' 整条中文（只保留 <d>[Chinese] 和 (S1) 两个模型级 token）。 */
export const H3_TOKENS = {
  zh: {
    i2va: '目标视频在 0.00 秒处完全参照图 1（来自镜头 1）。',
    alignHead: '参考图与目标视频的对齐——',
    alignItem: (k, t) => `图 ${k}（来自镜头 ${k}）对齐目标视频 ${t} 秒处`,
    alignTail: '。',
    fields: ['整体视听描述：', '整体音景：', '非叙事配乐：'],
    shot: (k) => `[镜头 ${k}]`,
    cutMark: (k, time) => `[镜头 ${k}] 于 ${time}，`,
  },
  en: {
    i2va: H3_I2VA_LINE,
    alignHead: 'How the reference pictures align with the target video — ',
    alignItem: (k, t) => `Picture ${k} (from Shot ${k}) aligns with the ${t}-second mark of the target video`,
    alignTail: '.',
    fields: H3_FIELDS,
    shot: (k) => `[Shot ${k}]`,
    cutMark: (k, time) => `[Shot ${k}] At ${time},`,
  },
};

/** 段内切点时刻表：[0, c1, c1+c2, …]（不含结尾）。 */
export function cutStarts(cuts) {
  const starts = [];
  let t = 0;
  for (const c of cuts ?? []) {
    starts.push(r1(t));
    t += c?.seconds ?? 0;
  }
  return starts;
}

/** [Shot k] 的切点时刻格式：00:03.000（分:秒.毫秒）。 */
export function h3CutTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * 首行对齐指令：单分镜的段用 I2VA 固定句式；多分镜的段把每张分镜图
 * 钉在自己的切点秒数上。整行由分镜结构推导，validate 逐字对账。
 */
export function h3AlignmentLine(cuts, lang = 'en') {
  const tk = H3_TOKENS[lang] ?? H3_TOKENS.zh;
  if (!cuts || cuts.length <= 1) return tk.i2va;
  const starts = cutStarts(cuts);
  const parts = cuts.map((c, i) => tk.alignItem(i + 1, starts[i].toFixed(2)));
  return `${tk.alignHead}${parts.join(lang === 'en' ? '; ' : '；')}${tk.alignTail}`;
}

/** 台词/画面文字之外的部分——H3 要求它全英文，人名也只许出现在 <d> 里。 */
export function h3Remainder(prompt) {
  return String(prompt ?? '')
    .replace(/<d>[\s\S]*?<\/d>/g, ' ')
    .replace(/"[^"\n]*"/g, ' ');
}

/** 把 h3Prompt 的描述正文按 [镜头 k] / [Shot k] 切成每个分镜自己的段落。 */
export function h3CutSlices(prompt, cutCount, lang = 'en') {
  const tk = H3_TOKENS[lang] ?? H3_TOKENS.zh;
  const h3 = String(prompt ?? '');
  const bodyStart = h3.indexOf(tk.fields[0]);
  const bodyEnd = h3.indexOf(tk.fields[1]);
  if (bodyStart < 0) return [];
  const body = h3.slice(bodyStart, bodyEnd < 0 ? undefined : bodyEnd);
  const slices = [];
  for (let k = 1; k <= cutCount; k++) {
    const a = body.indexOf(tk.shot(k));
    if (a < 0) {
      slices.push(null);
      continue;
    }
    const b = body.indexOf(tk.shot(k + 1));
    slices.push(body.slice(a, b < 0 ? undefined : b));
  }
  return slices;
}

/** 取 H3 三个核心字段中某一段的正文（0=描述、1=声景、2=配乐）。 */
export function h3FieldValue(prompt, fieldIndex, lang = 'en') {
  const tk = H3_TOKENS[lang] ?? H3_TOKENS.zh;
  const h3 = String(prompt ?? '');
  const token = tk.fields[fieldIndex];
  const start = h3.indexOf(token);
  if (start < 0) return '';
  const bodyStart = start + token.length;
  const nextToken = tk.fields[fieldIndex + 1];
  const end = nextToken ? h3.indexOf(nextToken, bodyStart) : -1;
  return h3.slice(bodyStart, end < 0 ? undefined : end).trim();
}

/* ------------------------------------------------------------------ */
/* 剧本节拍展开                                                          */
/* ------------------------------------------------------------------ */
/*
 * 与 novel-script 相同的计秒规则，这里刻意重新实现而不是跨目录
 * import——每个 skill 必须自包含、可以单独拷走。参数从 script.json
 * 的 params 里读，两边天然一致。
 */

const SCRIPT_DEFAULTS = { charsPerSecond: 4.5, actionSeconds: 2.5 };
const lineChars = (line) => String(line ?? '').replace(/\s+/g, '').length;
const sourcePlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const sourceClone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const stableSourceValue = (value) => {
  if (Array.isArray(value)) return value.map(stableSourceValue);
  if (!sourcePlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSourceValue(value[key])]));
};

/** 比较从剧本复制来的剧情状态，忽略 JSON 属性顺序。 */
export function sourceStateEqual(left, right) {
  return JSON.stringify(stableSourceValue(left)) === JSON.stringify(stableSourceValue(right));
}

const sourceStateReady = (state) => sourcePlainObject(state)
  && sourcePlainObject(state.characters)
  && sourcePlainObject(state.props)
  && typeof state.effectState === 'string'
  && typeof state.unfinishedAction === 'string';

function applySourceStatePatch(state, patch) {
  const next = sourceClone(sourcePlainObject(state) ? state : {}) ?? {};
  next.characters = sourcePlainObject(next.characters) ? next.characters : {};
  next.props = sourcePlainObject(next.props) ? next.props : {};
  if (!sourcePlainObject(patch)) return next;
  if (sourcePlainObject(patch.characters)) {
    for (const [id, delta] of Object.entries(patch.characters)) {
      if (!sourcePlainObject(delta)) continue;
      next.characters[id] = { ...(sourcePlainObject(next.characters[id]) ? next.characters[id] : {}), ...sourceClone(delta) };
    }
  }
  if (sourcePlainObject(patch.props)) {
    for (const [id, delta] of Object.entries(patch.props)) {
      if (!sourcePlainObject(delta)) continue;
      next.props[id] = { ...(sourcePlainObject(next.props[id]) ? next.props[id] : {}), ...sourceClone(delta) };
    }
  }
  if (Object.hasOwn(patch, 'effectState')) next.effectState = patch.effectState;
  if (Object.hasOwn(patch, 'unfinishedAction')) next.unfinishedAction = patch.unfinishedAction;
  return next;
}

function sourceSceneTimeline(scene) {
  let current = sourceClone(scene?.continuity?.entryState ?? {});
  const beats = (scene?.flow ?? []).map((beat) => {
    const stateBefore = sourceClone(current);
    if (typeof beat?.action === 'string') current = applySourceStatePatch(current, beat.statePatch);
    return { stateBefore, stateAfter: sourceClone(current) };
  });
  return { entryState: sourceClone(scene?.continuity?.entryState ?? {}), exitState: sourceClone(current), beats };
}

/** 把 script.json 展开成分镜要认领的节拍清单：ep → scenes → beats。 */
export function expandScript(script) {
  const p = { ...SCRIPT_DEFAULTS, ...(script?.params ?? {}) };
  const sourceStateRequired = script?.continuityMode === CONTINUITY_MODE;
  const eps = new Map();
  for (const ep of script?.episodes ?? []) {
    const scenes = (ep?.scenes ?? []).map((sc, i) => {
      const timeline = sourceStateRequired ? sourceSceneTimeline(sc) : null;
      return {
        sceneIndex: i + 1,
        sceneId: sc.sceneId,
        lighting: sc.lighting ?? '',
        characters: sc.characters ?? [],
        props: sc.props ?? [],
        ...(timeline ? {
          continuityKind: sc?.continuity?.kind ?? '',
          entryState: timeline.entryState,
          exitState: timeline.exitState,
        } : {}),
        beats: (sc.flow ?? []).map((b, j) => {
          const isLine = typeof b?.line === 'string';
          return {
            n: j + 1,
            kind: isLine ? 'line' : 'action',
            seconds: r1(isLine ? lineChars(b.line) / p.charsPerSecond : p.actionSeconds),
            speaker: isLine ? b.speaker : undefined,
            delivery: isLine ? (b.delivery ?? '') : undefined,
            text: isLine ? b.line : b.action,
            ...(timeline ? {
              stateBefore: timeline.beats[j]?.stateBefore,
              stateAfter: timeline.beats[j]?.stateAfter,
            } : {}),
          };
        }),
      };
    });
    eps.set(ep.ep, { ep: ep.ep, targetSeconds: ep.targetSeconds, scenes });
  }
  return eps;
}

export const segSeconds = (segment) => r1((segment?.cuts ?? []).reduce((n, c) => n + (c?.seconds ?? 0), 0));

/* ------------------------------------------------------------------ */
/* 镜头配方卡库（可选挂载）                                               */
/* ------------------------------------------------------------------ */
/*
 * shot-recipes 是可选挂载的卡库：给了 --shots <卡片目录> 才有 shot-recipe
 * 这道门。两个 skill 必须各自独立、谁没有谁都能跑，所以这里刻意不
 * import shot-recipes.mjs，自己写一份受限 frontmatter 解析——与
 * expandScript 同一个先例（跨目录 import 会让 skill 拷不走）。
 *
 * 只取门要用的机器字段，正文一概不读；语法受限到只认 `key: 标量` 与
 * `key: [a, b, c]` 行内数组——受限就没有歧义，25 行足够。卡片格式的合法性
 * 由 shot-recipes 自己的 lint 负责，这边只管读得懂的部分。
 */

const RECIPE_FIELDS = new Set(['id', 'name', 'name_en', 'cuts', 'must_phrases', 'sizes', 'cameras']);
const unquote = (s) => String(s).replace(/^['"](.*)['"]$/, '$1').trim();

/** 受限 frontmatter 解析：只回机器字段，没有 id 就当不是卡片。 */
export function parseCardFields(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''));
  if (!m) return null;
  const card = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv || !RECIPE_FIELDS.has(kv[1])) continue;
    const v = kv[2].trim();
    if (v.startsWith('[')) {
      const inner = v.replace(/^\[/, '').replace(/\]$/, '').trim();
      card[kv[1]] = inner
        ? inner.split(',').map(unquote).filter((x) => x !== '').map((x) => (/^-?\d+$/.test(x) ? Number(x) : x))
        : [];
    } else {
      card[kv[1]] = unquote(v);
    }
  }
  return card.id ? card : null;
}

/** 读卡片目录 → Map<id, 机器字段>。只吃顶层 .md（en/ 是正文翻译，机器字段只有一份）。 */
export function loadRecipes(dir) {
  const root = resolve(dir);
  const cards = new Map();
  if (!existsSync(root)) return cards;
  for (const f of readdirSync(root).filter((x) => x.endsWith('.md')).sort()) {
    const card = parseCardFields(readFileSync(join(root, f), 'utf8'));
    if (card) cards.set(card.id, card);
  }
  return cards;
}

/*
 * 建议景别 / 运镜**刻意不设门**，只在报告里提示偏离，理由三条：
 *   1. 配方是语汇不是法条——同一张卡在竖屏与横屏、两人与三人、有台词
 *      与无台词的情况下，景别会合理偏移（卡库那边把它们存成集合而不是
 *      序列，就是从结构上杜绝升级成硬门）
 *   2. 可选挂载的东西一旦变严就没人挂——挂了反而被拦，下次就不挂了
 *   3. 仓库已有明文判例：误拦的门比没有门更糟，门的信用比数量重要
 */
export function recipeDrift(cut, card) {
  const sizes = Array.isArray(card?.sizes) ? card.sizes : [];
  const cameras = Array.isArray(card?.cameras) ? card.cameras : [];
  return {
    sizes: sizes.length && !sizes.includes(cut?.size) ? sizes : [],
    cameras: cameras.length && !cameras.includes(cut?.camera) ? cameras : [],
  };
}

/* ------------------------------------------------------------------ */
/* 门失败累积                                                           */
/* ------------------------------------------------------------------ */
/*
 * 每次 validate / checkup 的结果本来跑完就没了，于是「模型最常违反哪条规则」
 * 只能靠印象。这里把每次运行与每条失败追加到工作目录的 .gates.jsonl，
 * stats 子命令再读回来，回答三个问题：
 *   哪道门最常响   → 那条规则模型最常无视，措辞该改
 *   哪道门从没响过 → 可能是死门，或者规则已经被模型内化了
 *   失败详情长什么样 → 反复出现却没有门的那类问题，只能靠人看这些自由文本
 *
 * 刻意做成纯函数 + CLI 负责 IO：自测不落盘也能验。
 * 写不进去就静默跳过——日志是附加价值，不能让它挡住主流程。
 */

export const GATE_LOG = '.gates.jsonl';

/** 一次运行产生的日志行（对象数组，CLI 负责序列化落盘）。 */
export function gateLogEntries(gates, { doc = '', at = '' } = {}) {
  const list = Array.isArray(gates) ? gates : [];
  if (!list.length) return [];
  const failed = list.filter((g) => !g.ok);
  const rows = [{ kind: 'run', at, doc, gates: list.length, failed: failed.length }];
  for (const g of failed) {
    rows.push({ kind: 'fail', at, doc, gate: g.id, label: g.label, detail: g.detail ?? '' });
  }
  return rows;
}

/** 汇总日志行。allGates 给全量门 id，用来找出「从没响过」的那些。 */
export function summarizeGateLog(entries, allGates = []) {
  const rows = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object');
  const runs = rows.filter((e) => e.kind === 'run');
  const fails = rows.filter((e) => e.kind === 'fail');
  const byGate = new Map();
  for (const f of fails) {
    if (!byGate.has(f.gate)) byGate.set(f.gate, { gate: f.gate, label: f.label ?? f.gate, count: 0, samples: [] });
    const rec = byGate.get(f.gate);
    rec.count += 1;
    if (rec.samples.length < 3 && f.detail) rec.samples.push(f.detail);
  }
  const ranked = [...byGate.values()].sort((a, b) => b.count - a.count || a.gate.localeCompare(b.gate));
  const silent = allGates.filter((id) => !byGate.has(id));
  return {
    runs: runs.length,
    cleanRuns: runs.filter((r) => !r.failed).length,
    fails: fails.length,
    ranked,
    silent,
  };
}

/* ------------------------------------------------------------------ */
/* stats                                                               */
/* ------------------------------------------------------------------ */

/** 报告与质量门共用的确定性统计。script 是硬前提——分镜离开剧本没有意义。 */
export function computeStats(board, script) {
  const params = paramsOf(board);
  const expanded = expandScript(script);
  const episodes = [];
  const batches = new Map(); // sceneId|lighting → 生成批次
  const dialogue = [];       // 配音对齐单：段 × 分镜 × 说话人 × 台词

  for (const ep of board?.episodes ?? []) {
    const sEp = expanded.get(ep.ep);
    let total = 0;
    let cutCount = 0;
    let withLines = 0;
    for (const seg of ep?.segments ?? []) {
      const scene = sEp?.scenes?.[seg.sceneIndex - 1];
      const secs = segSeconds(seg);
      total += secs;
      let segHasLine = false;
      (seg?.cuts ?? []).forEach((cut, ci) => {
        cutCount++;
        if (!scene) return;
        const [from, to] = cut.beats ?? [];
        for (const b of scene.beats.slice((from ?? 1) - 1, to ?? 0)) {
          if (b.kind !== 'line') continue;
          segHasLine = true;
          dialogue.push({ segment: seg.id, cut: ci + 1, ep: ep.ep, speaker: b.speaker, line: b.text, seconds: b.seconds });
        }
      });
      if (segHasLine) withLines++;
      if (scene) {
        const key = `${scene.sceneId}|${scene.lighting}`;
        if (!batches.has(key)) {
          batches.set(key, { sceneId: scene.sceneId, lighting: scene.lighting, segments: [], characters: new Set(), props: new Set() });
        }
        const batch = batches.get(key);
        batch.segments.push(seg.id);
        for (const cut of seg?.cuts ?? []) {
          for (const c of cut.characters ?? []) batch.characters.add(c);
          for (const pr of cut.props ?? []) batch.props.add(pr);
        }
      }
    }
    episodes.push({
      ep: ep.ep,
      target: sEp?.targetSeconds ?? 0,
      segments: (ep?.segments ?? []).length,
      cuts: cutCount,
      totalSeconds: r1(total),
      avgCutSeconds: cutCount ? r1(total / cutCount) : 0,
      withLines,
    });
  }

  const totals = {
    segments: episodes.reduce((n, e) => n + e.segments, 0),
    cuts: episodes.reduce((n, e) => n + e.cuts, 0),
    seconds: r1(episodes.reduce((n, e) => n + e.totalSeconds, 0)),
    targetSeconds: episodes.reduce((n, e) => n + e.target, 0),
    withLines: episodes.reduce((n, e) => n + e.withLines, 0),
    avgCutSeconds: 0,
  };
  totals.avgCutSeconds = totals.cuts ? r1(totals.seconds / totals.cuts) : 0;

  return {
    params,
    episodes,
    totals,
    dialogue,
    batches: [...batches.values()].map((b) => ({
      sceneId: b.sceneId, lighting: b.lighting, segments: b.segments,
      characters: [...b.characters], props: [...b.props],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 质量门                                                               */
/* ------------------------------------------------------------------ */

export function gateReport(board, ctx = {}) {
  const gates = [];
  const add = (id, label, ok, detail = '') => gates.push({ id, label, ok, detail });
  const params = paramsOf(board);
  const script = ctx.script ?? null;
  const expanded = script ? expandScript(script) : null;
  const eps = Array.isArray(board?.episodes) ? board.episodes : [];
  const bad = {
    coverage: [], segCap: [], cutLen: [], fit: [], duration: [], crowd: [],
    id: [], size: [], camera: [], english: [], names: [], refs: [],
    h3s: [], h3d: [], h3e: [], style: [], recipe: [], cameraPlan: [], promptDetail: [], framePlan: [], frameEntry: [], candidate: [], continuity: [], scriptState: [],
  };
  // 配方卡库是可选挂载：ctx.recipes 为空就整门跳过（不是「没有 cut 带 recipe」就跳过）
  const recipes = ctx.recipes ?? null;
  let recipeRefs = 0;
  const styleId = board?.style ?? DEFAULT_STYLE;
  const style = STYLE_PRESETS[styleId];
  if (!style) bad.style.push(`style「${styleId}」不在预设里（${Object.keys(STYLE_PRESETS).join(' / ')}）`);
  // 提示词语言：默认英文——官方规范的口径（台词仍在 <d> 里保留原文）；'zh' 可切整条中文
  const promptLang = board?.promptLang ?? 'en';
  const cameraPlanRequired = board?.cameraPlanMode === CAMERA_PLAN_MODE;
  if (board?.cameraPlanMode && !cameraPlanRequired) {
    bad.cameraPlan.push(`cameraPlanMode「${board.cameraPlanMode}」不支持，应为「${CAMERA_PLAN_MODE}」`);
  }
  const promptDetailRequired = board?.promptDetailMode === PROMPT_DETAIL_MODE;
  if (board?.promptDetailMode && !promptDetailRequired) {
    bad.promptDetail.push(`promptDetailMode「${board.promptDetailMode}」不支持，应为「${PROMPT_DETAIL_MODE}」`);
  }
  const framePlanRequired = board?.framePlanMode === FRAME_PLAN_MODE;
  if (board?.framePlanMode && !framePlanRequired) {
    bad.framePlan.push(`framePlanMode「${board.framePlanMode}」不支持，应为「${FRAME_PLAN_MODE}」`);
  }
  const frameEntryRequired = board?.frameEntryMode === FRAME_ENTRY_MODE;
  if (board?.frameEntryMode && !frameEntryRequired) {
    bad.frameEntry.push(`frameEntryMode「${board.frameEntryMode}」不支持，应为「${FRAME_ENTRY_MODE}」`);
  }
  const candidateRequired = board?.candidateMode === CANDIDATE_MODE;
  if (board?.candidateMode && !candidateRequired) bad.candidate.push(`candidateMode「${board.candidateMode}」不支持，应为「${CANDIDATE_MODE}」`);
  if (candidateRequired && board?.selectionMode !== SELECTION_MODE) bad.candidate.push(`selectionMode 必须是「${SELECTION_MODE}」`);
  if (candidateRequired && board?.edgePlanMode !== EDGE_PLAN_MODE) bad.candidate.push(`edgePlanMode 必须是「${EDGE_PLAN_MODE}」`);
  const detailMinChars = promptLang === 'en' ? 24 : 10;
  const checkPromptFields = (obj, fields, owner, text) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      bad.promptDetail.push(`${owner} 缺结构化计划`);
      return false;
    }
    let ready = true;
    const haystack = promptLang === 'en' ? String(text ?? '').toLowerCase() : String(text ?? '');
    for (const field of fields) {
      const value = typeof obj[field] === 'string' ? obj[field].trim() : '';
      if (!value) {
        bad.promptDetail.push(`${owner}.${field} 为空`);
        ready = false;
        continue;
      }
      if (value.length < detailMinChars) {
        bad.promptDetail.push(`${owner}.${field} 太短（${value.length} 字符，至少 ${detailMinChars}）`);
        ready = false;
      }
      const needle = promptLang === 'en' ? value.toLowerCase() : value;
      if (!haystack.includes(needle)) {
        bad.promptDetail.push(`${owner}.${field} 没有逐字进入对应提示词`);
        ready = false;
      }
    }
    return ready;
  };
  const continuityRequired = board?.continuityMode === CONTINUITY_MODE;
  const sourceStateRequired = script?.continuityMode === CONTINUITY_MODE;
  if (board?.continuityMode && !continuityRequired) {
    bad.continuity.push(`continuityMode「${board.continuityMode}」不支持，应为「${CONTINUITY_MODE}」`);
  }
  const validateState = (state, owner) => {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      bad.continuity.push(`${owner} 缺状态对象`);
      return false;
    }
    let ok = true;
    for (const field of CONTINUITY_STATE_FIELDS) {
      if (!hasText(state[field])) {
        bad.continuity.push(`${owner}.${field} 为空`);
        ok = false;
      }
    }
    return ok;
  };
  const compareStates = (from, to, owner) => {
    for (const field of CONTINUITY_STATE_FIELDS) {
      if (hasText(from?.[field]) && hasText(to?.[field]) && from[field] !== to[field]) {
        bad.continuity.push(`${owner} 的 ${field} 不连续：「${from[field]}」→「${to[field]}」`);
      }
    }
  };

  // 提示词禁人名：outline 的名字 + cast 的名字与别名
  const banned = [];
  for (const c of ctx.outline?.characters ?? []) if (c?.name) banned.push(c.name);
  for (const c of ctx.cast?.characters ?? []) {
    if (c?.name) banned.push(c.name);
    for (const a of c?.aliases ?? []) banned.push(a);
  }

  for (const ep of eps) {
    const label = `E${String(ep?.ep).padStart(2, '0')}`;
    const sEp = expanded?.get(ep?.ep);
    if (expanded && !sEp) bad.refs.push(`${label} 在剧本里不存在`);

    // 段号纪律：格式、集号一致、连号
    (ep?.segments ?? []).forEach((seg, i) => {
      const want = `${label}-${String(i + 1).padStart(2, '0')}`;
      if (seg?.id !== want) bad.id.push(`第 ${i + 1} 段应为 ${want}，实际「${seg?.id}」`);
    });

    let prevSceneIndex = 0;
    const episodeSegments = ep?.segments ?? [];
    for (let segIndex = 0; segIndex < episodeSegments.length; segIndex++) {
      const seg = episodeSegments[segIndex];
      const prevSeg = segIndex > 0 ? episodeSegments[segIndex - 1] : null;
      const sid = seg?.id ?? '?';
      const cuts = seg?.cuts ?? [];
      const total = segSeconds(seg);

      if (candidateRequired) {
        const boardPlan = seg?.candidateBoard;
        if (!boardPlan || typeof boardPlan !== 'object' || Array.isArray(boardPlan)) {
          bad.candidate.push(`${sid} 缺 candidateBoard`);
        } else {
          if (boardPlan.mode !== CANDIDATE_MODE) bad.candidate.push(`${sid}.candidateBoard.mode 必须是「${CANDIDATE_MODE}」`);
          const cells = Array.isArray(boardPlan.cells) ? boardPlan.cells : [];
          if (cells.length !== 9) bad.candidate.push(`${sid}.candidateBoard.cells 必须恰好 9 格，实际 ${cells.length}`);
          for (const spec of CANDIDATE_GRID_SPEC) {
            const cell = cells.find((x) => x?.id === spec.id);
            if (!cell) {
              bad.candidate.push(`${sid} 缺候选格 ${spec.id}`);
              continue;
            }
            if (cell.moment !== spec.moment || cell.size !== spec.size) {
              bad.candidate.push(`${sid}.${spec.id} 必须是 ${spec.moment}/${spec.size}`);
            }
            const prompt = typeof cell.prompt === 'string' ? cell.prompt.trim() : '';
            if (prompt.length < 24) bad.candidate.push(`${sid}.${spec.id}.prompt 太短（至少 24 个英文字符）`);
            if (CJK.test(prompt)) bad.candidate.push(`${sid}.${spec.id}.prompt 必须英文`);
            for (const name of banned) if (prompt.includes(name)) bad.candidate.push(`${sid}.${spec.id}.prompt 出现角色名「${name}」`);
          }
          const selected = Array.isArray(boardPlan.selected) ? boardPlan.selected : [];
          const bounds = candidateSelectionBounds(seg, params);
          if (selected.length < bounds.min || selected.length > bounds.max) {
            bad.candidate.push(`${sid}.candidateBoard.selected 应选 ${bounds.min}–${bounds.max} 格（段长 ${total}s），实际 ${selected.length}`);
          }
          if (new Set(selected).size !== selected.length) bad.candidate.push(`${sid}.candidateBoard.selected 不能重复选择同一格`);
          const specById = new Map(CANDIDATE_GRID_SPEC.map((x, i) => [x.id, { ...x, index: i }]));
          const chosenSpecs = selected.map((id) => specById.get(id));
          for (const id of selected) if (!specById.has(id)) bad.candidate.push(`${sid}.candidateBoard.selected 含未知格「${id}」`);
          if (chosenSpecs[0] && chosenSpecs[0].moment !== 'entry') bad.candidate.push(`${sid} 第一张必须从 G1–G3 entry 行选择`);
          if (chosenSpecs.length && chosenSpecs[chosenSpecs.length - 1]?.moment !== 'result') bad.candidate.push(`${sid} 最后一张必须从 G7–G9 result 行选择`);
          for (const spec of chosenSpecs.slice(1, -1)) {
            if (spec && spec.moment !== 'transition') bad.candidate.push(`${sid} 中间选择只能来自 G4–G6 transition 行`);
          }
          for (let i = 1; i < chosenSpecs.length; i++) {
            if (chosenSpecs[i - 1] && chosenSpecs[i] && chosenSpecs[i].index < chosenSpecs[i - 1].index) {
              bad.candidate.push(`${sid}.candidateBoard.selected 顺序必须从入口行向结果行推进`);
              break;
            }
          }
          if (boardPlan.needsReplan) bad.candidate.push(`${sid} 已更新人工选择但尚未按 selected 重排 cuts/edgePlans`);
          if (selected.length && cuts.length !== selected.length) bad.candidate.push(`${sid} 选了 ${selected.length} 格，但最终 cuts 是 ${cuts.length} 个`);
          cuts.forEach((cut, i) => {
            if (selected[i] && cut?.candidateId !== selected[i]) bad.candidate.push(`${sid}#${i + 1}.candidateId 应为「${selected[i]}」`);
            const cell = cells.find((x) => x?.id === cut?.candidateId);
            if (cell?.prompt && !String(cut?.frame ?? '').toLowerCase().includes(String(cell.prompt).toLowerCase())) {
              bad.candidate.push(`${sid}#${i + 1} 的 frame 没有保留所选 ${cut.candidateId} 候选描述`);
            }
          });
          const edges = Array.isArray(seg?.edgePlans) ? seg.edgePlans : [];
          if (selected.length && edges.length !== Math.max(0, selected.length - 1)) {
            bad.candidate.push(`${sid}.edgePlans 应为 ${Math.max(0, selected.length - 1)} 条，实际 ${edges.length}`);
          }
          edges.forEach((edge, i) => {
            const wantFrom = selected[i]; const wantTo = selected[i + 1];
            if (edge?.from !== wantFrom || edge?.to !== wantTo) bad.candidate.push(`${sid}.edgePlans[${i}] 应连接 ${wantFrom} → ${wantTo}`);
            if (!CAMERA_MOVES[edge?.camera]) bad.candidate.push(`${sid}.edgePlans[${i}].camera「${edge?.camera}」不合法`);
            if (!TRANSITION_TOKENS[edge?.transition]) bad.candidate.push(`${sid}.edgePlans[${i}].transition「${edge?.transition}」不合法`);
            if (!CAMERA_PLAN_PACES.includes(edge?.pace)) bad.candidate.push(`${sid}.edgePlans[${i}].pace「${edge?.pace}」不合法`);
            if (!CAMERA_PLAN_MAGNITUDES.includes(edge?.magnitude)) bad.candidate.push(`${sid}.edgePlans[${i}].magnitude「${edge?.magnitude}」不合法`);
            for (const field of EDGE_PLAN_FIELDS) if (!hasText(edge?.[field])) bad.candidate.push(`${sid}.edgePlans[${i}].${field} 为空`);
            const toCut = cuts[i + 1];
            if (toCut && edge?.camera !== toCut.camera) bad.candidate.push(`${sid}.edgePlans[${i}].camera 必须等于目标 cut 的 camera`);
            if (toCut && edge?.transition !== toCut.transition) bad.candidate.push(`${sid}.edgePlans[${i}].transition 必须等于目标 cut 的 transition`);
          });
        }
      }

      if (!(total > 0) || total > params.maxSegmentSeconds || (params.minSegmentSeconds > 0 && total < params.minSegmentSeconds)) {
        bad.segCap.push(`${sid} 共 ${total} 秒`);
      }

      const h3 = String(seg?.h3Prompt ?? '');
      // H3 结构：首行对齐指令逐字对账（由分镜结构按 promptLang 推导），三字段按序，切点时刻逐个对
      const tk = H3_TOKENS[promptLang] ?? H3_TOKENS.zh;
      const wantLine = h3AlignmentLine(cuts, promptLang);
      if (!h3.trimStart().startsWith(wantLine)) {
        bad.h3s.push(`${sid} 首行对齐指令和分镜结构对不上（promptLang=${promptLang}）`);
      } else {
        const idx = tk.fields.map((f) => h3.indexOf(f));
        if (idx.some((i) => i < 0) || !(idx[0] < idx[1] && idx[1] < idx[2])) {
          bad.h3s.push(`${sid} 三个核心字段缺失或顺序不对`);
        } else {
          const starts = cutStarts(cuts);
          if (h3.indexOf(tk.shot(1), idx[0]) < 0) bad.h3s.push(`${sid} 描述正文缺 ${tk.shot(1)}`);
          for (let k = 2; k <= cuts.length; k++) {
            const mark = tk.cutMark(k, h3CutTime(starts[k - 1]));
            if (h3.indexOf(mark, idx[0]) < 0) bad.h3s.push(`${sid} 缺「${mark}」——切点时刻必须等于前面分镜秒数的累计`);
          }
        }
      }
      const rest = h3Remainder(h3);
      if (promptLang === 'en') {
        if (CJK.test(rest)) bad.h3e.push(`${sid} 的 h3Prompt 设定英文却在 <d> 台词之外混入了中文`);
        // 英文提示词禁人名（图像/视频模型对英文语境的人名有偏见）；中文提示词人名放行——身份靠分镜图锚定
        for (const name of banned) {
          if (rest.includes(name)) bad.names.push(`${sid} 的 h3Prompt 在台词之外出现角色名「${name}」`);
        }
      } else if (!CJK.test(rest)) {
        bad.h3e.push(`${sid} 设定中文提示词（promptLang=${promptLang}），正文却写成了英文`);
      }

      const slices = h3CutSlices(h3, cuts.length, promptLang);
      const soundscapeText = h3FieldValue(h3, 1, promptLang);
      const musicText = h3FieldValue(h3, 2, promptLang);
      if (frameEntryRequired) {
        const firstSlice = slices[0];
        const token = FRAME_ENTRY_TOKENS[promptLang === 'zh' ? 'zh' : 'en'];
        const haystack = promptLang === 'en' ? String(firstSlice ?? '').toLowerCase() : String(firstSlice ?? '');
        const needle = promptLang === 'en' ? token.toLowerCase() : token;
        const tokenAt = haystack.indexOf(needle);
        if (tokenAt < 0) {
          bad.frameEntry.push(`${sid} 的 [Shot 1] 缺「${token}」——动作必须从 0.00 秒入口帧之后开始`);
        } else if (tokenAt > 240) {
          bad.frameEntry.push(`${sid} 的 [Shot 1] 把入口帧起动边界写得太晚；必须在前 240 字符内先声明「${token}」`);
        }
      }
      if (promptDetailRequired) {
        const audio = seg?.audioPlan;
        if (!audio || typeof audio !== 'object' || Array.isArray(audio)) {
          bad.promptDetail.push(`${sid} 缺 audioPlan`);
        } else {
          checkPromptFields(audio.soundscape, SOUND_PLAN_FIELDS, `${sid}.audioPlan.soundscape`, soundscapeText);
          const music = audio.music;
          if (!music || typeof music !== 'object' || Array.isArray(music)) {
            bad.promptDetail.push(`${sid}.audioPlan 缺 music`);
          } else if (music.mode === 'none') {
            const noneToken = promptLang === 'en' ? 'N/A' : '无';
            if (!musicText.includes(noneToken)) bad.promptDetail.push(`${sid} 配乐 mode=none，但 non_diegetic_music 缺「${noneToken}」`);
          } else if (music.mode === 'scored') {
            checkPromptFields(music, MUSIC_PLAN_FIELDS, `${sid}.audioPlan.music`, musicText);
          } else {
            bad.promptDetail.push(`${sid}.audioPlan.music.mode「${music.mode}」必须是 scored 或 none`);
          }
        }
      }
      if (continuityRequired) {
        const handoff = seg?.handoff;
        if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
          bad.continuity.push(`${sid} 缺 handoff`);
        } else if (!HANDOFF_KINDS.includes(handoff.kind)) {
          bad.continuity.push(`${sid}.handoff.kind「${handoff.kind}」不合法`);
        } else if (segIndex === 0) {
          if (handoff.kind !== 'episode-start') bad.continuity.push(`${sid} 是本集第一段，handoff.kind 必须是 episode-start`);
        } else {
          if (handoff.fromSegment !== prevSeg?.id) {
            bad.continuity.push(`${sid}.handoff.fromSegment 应为「${prevSeg?.id}」，实际「${handoff.fromSegment}」`);
          }
          if (handoff.kind === 'episode-start') bad.continuity.push(`${sid} 不是本集第一段，不能使用 episode-start`);
          if (handoff.kind === 'continuous') {
            if (prevSeg?.sceneIndex !== seg?.sceneIndex) {
              bad.continuity.push(`${sid} 标记 continuous，却从场 ${prevSeg?.sceneIndex} 切到场 ${seg?.sceneIndex}`);
            }
            const prevCut = prevSeg?.cuts?.[prevSeg.cuts.length - 1];
            const firstCut = cuts[0];
            compareStates(prevCut?.endState, firstCut?.startState, `${prevSeg?.id} → ${sid}`);
            for (const field of HANDOFF_FIELDS) {
              if (!hasText(handoff[field])) bad.continuity.push(`${sid}.handoff.${field} 为空`);
            }
            const firstSlice = slices[0];
            if (firstSlice != null) {
              const haystack = promptLang === 'en' ? firstSlice.toLowerCase() : firstSlice;
              const token = CONTINUITY_TOKENS[promptLang === 'en' ? 'en' : 'zh'].segment(prevSeg.id);
              const needle = promptLang === 'en' ? token.toLowerCase() : token;
              if (!haystack.includes(needle)) bad.continuity.push(`${sid} 的 [Shot 1] 缺段间承接句「${token}」`);
              for (const field of ['visualCarry', 'motionCarry']) {
                if (hasText(handoff[field])) {
                  const value = handoff[field].trim();
                  const part = promptLang === 'en' ? value.toLowerCase() : value;
                  if (!haystack.includes(part)) bad.continuity.push(`${sid}.handoff.${field} 没有逐字进入 [Shot 1]`);
                }
              }
            }
            if (hasText(handoff.audioCarry)) {
              const haystack = promptLang === 'en' ? soundscapeText.toLowerCase() : soundscapeText;
              const value = handoff.audioCarry.trim();
              const needle = promptLang === 'en' ? value.toLowerCase() : value;
              if (!haystack.includes(needle)) bad.continuity.push(`${sid}.handoff.audioCarry 没有逐字进入 overall_soundscape`);
            }
          }
        }
      }
      const scene = sEp ? sEp.scenes[seg?.sceneIndex - 1] : null;
      if (sEp && !scene) bad.refs.push(`${sid} 的 sceneIndex ${seg?.sceneIndex} 在剧本第 ${ep.ep} 集里不存在`);
      if (scene) {
        if (seg.sceneIndex < prevSceneIndex) bad.coverage.push(`${sid} 场次顺序倒退`);
        prevSceneIndex = Math.max(prevSceneIndex, seg.sceneIndex);
      }

      cuts.forEach((cut, ci) => {
        const cid = `${sid}#${ci + 1}`;

        if (!(cut?.seconds >= params.minCutSeconds) || cut.seconds > params.maxCutSeconds) {
          bad.cutLen.push(`${cid} ${cut?.seconds ?? '?'} 秒`);
        }
        if ((cut?.characters ?? []).length > params.maxOnScreen && !String(cut?.note ?? seg?.note ?? '').trim()) {
          bad.crowd.push(`${cid} 同框 ${cut.characters.length} 人且没有拆解说明`);
        }
        if (!SHOT_SIZES[cut?.size]) {
          bad.size.push(`${cid} 景别「${cut?.size}」不在枚举里`);
        } else if (!String(cut?.frame ?? '').toLowerCase().includes(SHOT_SIZES[cut.size].phrase)) {
          bad.size.push(`${cid} 分镜图提示词缺景别短语「${SHOT_SIZES[cut.size].phrase}」`);
        }
        if (!CAMERA_MOVES[cut?.camera]) {
          bad.camera.push(`${cid} 运镜「${cut?.camera}」不在 H3 词表里`);
        } else {
          const slice = slices[ci];
          const term = promptLang === 'en' ? String(cut.camera).toLowerCase() : CAMERA_MOVES[cut.camera];
          if (slice == null) {
            bad.camera.push(`${cid} 在 h3Prompt 里找不到对应的 [Shot ${ci + 1}] 段落`);
          } else if (!(promptLang === 'en' ? slice.toLowerCase() : slice).includes(term)) {
            bad.camera.push(`${cid} 的 [Shot ${ci + 1}] 段落缺运镜词「${term}」`);
          }
        }

        // 运镜执行计划：新 seed 开启。字段是 prompt-ready 片段，必须逐字落进自己的 [Shot k]。
        if (cameraPlanRequired) {
          const plan = cut?.cameraPlan;
          const slice = slices[ci];
          let stationary = cut?.camera === 'Static Shot';
          let ready = plan && typeof plan === 'object' && !Array.isArray(plan);
          if (!ready) {
            bad.cameraPlan.push(`${cid} 缺 cameraPlan`);
          } else {
            if (!CAMERA_PLAN_PACES.includes(plan.pace)) {
              bad.cameraPlan.push(`${cid} 的 cameraPlan.pace「${plan.pace}」不合法`);
              ready = false;
            }
            if (!CAMERA_PLAN_MAGNITUDES.includes(plan.magnitude)) {
              bad.cameraPlan.push(`${cid} 的 cameraPlan.magnitude「${plan.magnitude}」不合法`);
              ready = false;
            }
            for (const field of CAMERA_PLAN_FIELDS) {
              if (!hasText(plan[field])) {
                bad.cameraPlan.push(`${cid} 的 cameraPlan.${field} 为空`);
                ready = false;
              }
            }
            if (cut?.camera === 'Static Shot' && (plan.pace !== 'static' || plan.magnitude !== 'none')) {
              bad.cameraPlan.push(`${cid} 的 ${cut.camera} 必须 pace=static、magnitude=none`);
            }
            if (cut?.camera === 'POV') {
              const paceStatic = plan.pace === 'static';
              const magnitudeNone = plan.magnitude === 'none';
              if (paceStatic !== magnitudeNone) bad.cameraPlan.push(`${cid} 的 POV 若固定，必须同时 pace=static、magnitude=none`);
              stationary = paceStatic && magnitudeNone;
            } else if (cut?.camera !== 'Static Shot' && (plan.pace === 'static' || plan.magnitude === 'none')) {
              bad.cameraPlan.push(`${cid} 的动态运镜必须给非 static 的速度和非 none 的幅度`);
            }
          }

          const transition = TRANSITION_TOKENS[cut?.transition];
          if (!transition) bad.cameraPlan.push(`${cid} 的 transition「${cut?.transition}」不在允许列表里`);

          if (ready && slice != null) {
            const haystack = promptLang === 'en' ? slice.toLowerCase() : slice;
            for (const field of CAMERA_PLAN_FIELDS) {
              const value = String(plan[field]).trim();
              const needle = promptLang === 'en' ? value.toLowerCase() : value;
              if (!haystack.includes(needle)) {
                bad.cameraPlan.push(`${cid} 的 [Shot ${ci + 1}] 缺 cameraPlan.${field} 原文「${value}」`);
              }
            }
            if (!stationary) {
              const lang = promptLang === 'en' ? 'en' : 'zh';
              const paceToken = CAMERA_PACE_TOKENS[lang][plan.pace];
              const magnitudeToken = CAMERA_MAGNITUDE_TOKENS[lang][plan.magnitude];
              if (!paceToken || !haystack.includes(paceToken)) bad.cameraPlan.push(`${cid} 的提示词缺速度词「${paceToken ?? plan.pace}」`);
              if (!magnitudeToken || !haystack.includes(magnitudeToken)) bad.cameraPlan.push(`${cid} 的提示词缺幅度词「${magnitudeToken ?? plan.magnitude}」`);
            }
            if (transition) {
              const token = transition[promptLang === 'en' ? 'en' : 'zh'];
              const needle = promptLang === 'en' ? token.toLowerCase() : token;
              if (!haystack.includes(needle)) bad.cameraPlan.push(`${cid} 的提示词缺转场词「${token}」`);
            }
            // 英文模式能可靠逐词检查冲突；中文单字词（推/拉/升/降）误报率太高，不做猜测。
            if (promptLang === 'en' && CAMERA_MOVES[cut?.camera]) {
              for (const move of Object.keys(CAMERA_MOVES)) {
                if (move !== cut.camera && haystack.includes(move.toLowerCase())) {
                  bad.cameraPlan.push(`${cid} 同时出现主运镜「${cut.camera}」和冲突运镜「${move}」`);
                }
              }
            }
          }
        }
        if (promptDetailRequired) {
          checkPromptFields(cut?.visualPlan, VISUAL_PLAN_FIELDS, `${cid}.visualPlan`, slices[ci]);
        }
        if (framePlanRequired) {
          const plan = cut?.framePlan;
          let ready = plan && typeof plan === 'object' && !Array.isArray(plan);
          if (!ready) {
            bad.framePlan.push(`${cid} 缺 framePlan`);
          } else {
            if (!FRAME_ROLES.includes(plan.role)) {
              bad.framePlan.push(`${cid}.framePlan.role「${plan.role}」不合法`);
              ready = false;
            }
            if (!FRAME_DENSITIES.includes(plan.density)) {
              bad.framePlan.push(`${cid}.framePlan.density「${plan.density}」不合法`);
              ready = false;
            }
            for (const field of FRAME_PLAN_TEXT_FIELDS) {
              const value = hasText(plan[field]) ? plan[field].trim() : '';
              if (!value) {
                bad.framePlan.push(`${cid}.framePlan.${field} 为空`);
                ready = false;
              } else {
                if (value.length < 24) bad.framePlan.push(`${cid}.framePlan.${field} 太短（${value.length} 字符，至少 24）`);
                if (CJK.test(value)) bad.framePlan.push(`${cid}.framePlan.${field} 必须使用英文`);
              }
            }
            for (const field of FRAME_PLAN_ARRAY_FIELDS) {
              const values = plan[field];
              if (!Array.isArray(values)) {
                bad.framePlan.push(`${cid}.framePlan.${field} 必须是数组`);
                ready = false;
                continue;
              }
              const max = field === 'storyCues' ? 4 : field === 'exclude' ? 6 : 3;
              if (values.length > max) bad.framePlan.push(`${cid}.framePlan.${field} 最多 ${max} 项，避免堆砌`);
              values.forEach((value, i) => {
                if (!hasText(value)) bad.framePlan.push(`${cid}.framePlan.${field}[${i}] 为空`);
                else {
                  if (value.trim().length < 12) bad.framePlan.push(`${cid}.framePlan.${field}[${i}] 太短（至少 12 字符）`);
                  if (CJK.test(value)) bad.framePlan.push(`${cid}.framePlan.${field}[${i}] 必须使用英文`);
                }
              });
            }
            if (ready) {
              const foregroundN = plan.foreground.length;
              const backgroundN = plan.background.length;
              const storyCueN = plan.storyCues.length;
              if (!plan.exclude.length) bad.framePlan.push(`${cid}.framePlan.exclude 至少 1 项，防止额外人物或无关陈设污染`);
              if (plan.density === 'sparse') {
                if (foregroundN + backgroundN > 2) bad.framePlan.push(`${cid} 是 sparse，但前后景辅助元素超过 2 项`);
                if (storyCueN < 1 || storyCueN > 2) bad.framePlan.push(`${cid} 是 sparse，storyCues 应为 1–2 项`);
              } else if (plan.density === 'balanced') {
                if (foregroundN + backgroundN < 1) bad.framePlan.push(`${cid} 是 balanced，至少需要 1 项前景或背景支撑`);
                if (storyCueN < 1) bad.framePlan.push(`${cid} 是 balanced，至少需要 1 项 storyCue`);
              } else if (plan.density === 'rich') {
                if (foregroundN < 1 || backgroundN < 1) bad.framePlan.push(`${cid} 是 rich，前景和背景都至少需要 1 项`);
                if (storyCueN < 2) bad.framePlan.push(`${cid} 是 rich，至少需要 2 项 storyCues`);
              }
              if (plan.role === 'establishing' && (plan.density !== 'rich' || !['extreme-wide', 'wide'].includes(cut?.size))) {
                bad.framePlan.push(`${cid} 是 establishing，必须使用 wide/extreme-wide + rich`);
              }
              if (plan.role === 'insert' && (!['close', 'extreme-close'].includes(cut?.size) || plan.density === 'rich')) {
                bad.framePlan.push(`${cid} 是 insert，必须使用 close/extreme-close + sparse/balanced`);
              }
              if (plan.role === 'reaction' && plan.density === 'rich') {
                bad.framePlan.push(`${cid} 是 reaction，应使用 sparse/balanced，避免背景内容抢情绪`);
              }
            }
          }
        }
        if (frameEntryRequired) {
          const plan = cut?.framePlan;
          if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
            bad.frameEntry.push(`${cid} 缺 framePlan，无法建立入口帧`);
          } else {
            if (!FRAME_MOMENTS.includes(plan.moment)) {
              bad.frameEntry.push(`${cid}.framePlan.moment「${plan.moment}」不合法（${FRAME_MOMENTS.join(' / ')}）`);
            }
            if (ci === 0) {
              if (plan.moment !== 'entry') {
                bad.frameEntry.push(`${cid} 是段首 f1，framePlan.moment 必须是 entry，不能从 ${plan.moment ?? '空值'} 开始`);
              }
              const entry = plan.entryStatePrompt;
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                bad.frameEntry.push(`${cid} 缺 framePlan.entryStatePrompt`);
              } else {
                for (const field of FRAME_ENTRY_FIELDS) {
                  const value = hasText(entry[field]) ? entry[field].trim() : '';
                  if (!value) bad.frameEntry.push(`${cid}.framePlan.entryStatePrompt.${field} 为空`);
                  else {
                    if (value.length < 12) bad.frameEntry.push(`${cid}.framePlan.entryStatePrompt.${field} 太短（至少 12 个英文字符）`);
                    if (CJK.test(value)) bad.frameEntry.push(`${cid}.framePlan.entryStatePrompt.${field} 必须英文`);
                  }
                }
              }
              const keyMoment = String(plan.keyMoment ?? '');
              const baseFrame = String(cut?.frame ?? '');
              const resultState = /\b(?:has|have)\s+(?:just\s+|already\s+)?(?:struck|slammed|turned|landed|stopped|opened|closed|finished|completed|reached)\b|\balready\s+(?:running|turned|seated|open|closed)\b|\b(?:caught\s+)?mid-(?:stride|run|turn|swing|action)\b/i;
              const activeSubject = /\b(?:man|woman|boy|girl|subject|figure|captain|person|traveller)\b[^.!]{0,80}\b(?:running|sprinting|striking|slamming|turning|jumping|falling)\b/i;
              if (resultState.test(keyMoment) || resultState.test(baseFrame) || activeSubject.test(baseFrame)) {
                bad.frameEntry.push(`${cid} 的段首 f1 描述了动作中段或结果；必须改成动作发生前的 entry state`);
              }
              if (!/\b(?:before|poised|ready|at rest|remains|holds|stands|sits|waits|prepares|about to)\b/i.test(keyMoment)) {
                bad.frameEntry.push(`${cid}.framePlan.keyMoment 缺动作入口语义（before／poised／ready／remains／holds／stands／sits／waits／prepares／about to）`);
              }
            }
          }
        }
        if (continuityRequired) {
          validateState(cut?.startState, `${cid}.startState`);
          validateState(cut?.endState, `${cid}.endState`);
          if (ci > 0) {
            const prevCut = cuts[ci - 1];
            compareStates(prevCut?.endState, cut?.startState, `${sid}#${ci} → ${cid}`);
            const plan = cut?.transitionPlan;
            if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
              bad.continuity.push(`${cid} 缺 transitionPlan`);
            } else {
              for (const field of TRANSITION_PLAN_FIELDS) {
                if (!hasText(plan[field])) bad.continuity.push(`${cid}.transitionPlan.${field} 为空`);
              }
              const slice = slices[ci];
              if (slice != null) {
                const haystack = promptLang === 'en' ? slice.toLowerCase() : slice;
                const token = CONTINUITY_TOKENS[promptLang === 'en' ? 'en' : 'zh'].cut(ci);
                const needle = promptLang === 'en' ? token.toLowerCase() : token;
                if (!haystack.includes(needle)) bad.continuity.push(`${cid} 缺镜间承接句「${token}」`);
                for (const field of ['cutPoint', 'motionCarry', 'lightCarry', 'axisCarry']) {
                  if (hasText(plan[field])) {
                    const value = plan[field].trim();
                    const part = promptLang === 'en' ? value.toLowerCase() : value;
                    if (!haystack.includes(part)) bad.continuity.push(`${cid}.transitionPlan.${field} 没有逐字进入自己的 [Shot ${ci + 1}]`);
                  }
                }
              }
              if (hasText(plan.audioCarry)) {
                const haystack = promptLang === 'en' ? soundscapeText.toLowerCase() : soundscapeText;
                const value = plan.audioCarry.trim();
                const needle = promptLang === 'en' ? value.toLowerCase() : value;
                if (!haystack.includes(needle)) bad.continuity.push(`${cid}.transitionPlan.audioCarry 没有逐字进入 overall_soundscape`);
              }
            }
          }
        }
        const frame = String(cut?.frame ?? '');
        const imagePrompt = buildFrameImagePrompt(cut, {
          cutIndex: ci,
          segmentContinuous: ci === 0 && seg?.handoff?.kind === 'continuous',
        });
        if (!frame.trim()) bad.english.push(`${cid} 的分镜图提示词为空`);
        if (CJK.test(imagePrompt)) bad.english.push(`${cid} 的完整分镜图提示词混入了非英文`);
        if (style && !imagePrompt.toLowerCase().includes(style.phrase.toLowerCase())) {
          bad.style.push(`${cid} 的分镜图提示词缺风格短语「${style.phrase}」`);
        }
        for (const name of banned) {
          if (imagePrompt.includes(name)) bad.names.push(`${cid} 的完整分镜图提示词出现角色名「${name}」`);
        }

        // 镜头配方：id 在卡库里 + 每条必备短语进了本切组装后的完整 imagePrompt
        // 判定与 shot-recipes 的 checkRecipes 完全一致：两边小写化后 includes，逐条全中才算过
        if (recipes && typeof cut?.recipe === 'string' && cut.recipe) {
          recipeRefs += 1;
          const card = recipes.get(cut.recipe);
          if (!card) {
            bad.recipe.push(`${cid} 引用的配方「${cut.recipe}」不在配方库里`);
          } else {
            const lower = imagePrompt.toLowerCase();
            for (const ph of card.must_phrases ?? []) {
              if (!lower.includes(String(ph).toLowerCase())) {
                bad.recipe.push(`${cid} 的分镜图提示词缺配方「${card.name}」的必备短语「${ph}」`);
              }
            }
          }
        }

        // 引用对账 + 台词装得下 + 台词逐字进 <d>
        if (scene) {
          const cast = new Set(scene.characters);
          for (const c of cut?.characters ?? []) {
            if (!cast.has(c)) bad.refs.push(`${cid} 的 ${c} 不在剧本该场人物里`);
          }
          const propSet = new Set(scene.props);
          for (const pr of cut?.props ?? []) {
            if (!propSet.has(pr)) bad.refs.push(`${cid} 的 ${pr} 不在剧本该场道具里`);
          }
          const [from, to] = cut?.beats ?? [];
          if (Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to <= scene.beats.length && from <= to) {
            if (sourceStateRequired) {
              const expectedBefore = scene.beats[from - 1]?.stateBefore;
              const expectedAfter = scene.beats[to - 1]?.stateAfter;
              const sourceState = cut?.sourceState;
              if (!sourceStateReady(expectedBefore) || !sourceStateReady(expectedAfter)) {
                bad.scriptState.push(`${cid} 认领的剧本节拍缺完整 stateBefore / stateAfter；先通过 novel-script 连续性门`);
              } else if (!sourcePlainObject(sourceState) || !sourceStateReady(sourceState.before) || !sourceStateReady(sourceState.after)) {
                bad.scriptState.push(`${cid} 缺 sourceState.before / sourceState.after`);
              } else {
                if (!sourceStateEqual(sourceState.before, expectedBefore)) {
                  bad.scriptState.push(`${cid}.sourceState.before 没有继承认领首拍的 stateBefore`);
                }
                if (!sourceStateEqual(sourceState.after, expectedAfter)) {
                  bad.scriptState.push(`${cid}.sourceState.after 没有继承认领末拍的 stateAfter`);
                }
              }
            }
            let dlg = 0;
            for (const b of scene.beats.slice(from - 1, to)) {
              if (b.kind !== 'line') continue;
              dlg += b.seconds;
              const re = new RegExp(`<d>\\[[^\\]]+\\]\\s*${b.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</d>`);
              if (!re.test(h3)) bad.h3d.push(`${sid} 的 h3Prompt 缺台词「${b.text.slice(0, 12)}…」的 <d> 块`);
            }
            if (dlg > cut.seconds) bad.fit.push(`${cid} 台词 ${r1(dlg)} 秒装不进 ${cut.seconds} 秒`);
          }
        }
      });

      // 多格配方靠「连续同 id 的 run」表达（不引入新结构）：卡片 cuts 下限 ≥ 2 时，
      // 连续段的长度不得小于该下限——单独挂一格的两格配方是没兑现的配方
      if (recipes) {
        for (let i = 0; i < cuts.length; ) {
          const rid = cuts[i]?.recipe;
          if (typeof rid !== 'string' || !rid) {
            i += 1;
            continue;
          }
          let j = i;
          while (j + 1 < cuts.length && cuts[j + 1]?.recipe === rid) j += 1;
          const card = recipes.get(rid);
          const min = Array.isArray(card?.cuts) ? card.cuts[0] : 0;
          const run = j - i + 1;
          if (min >= 2 && run < min) {
            bad.recipe.push(`${sid}#${i + 1} 的配方「${card.name}」要 ${min} 格连排，这里只有 ${run} 格——多格配方靠连续同 recipe 的分镜表达`);
          }
          i = j + 1;
        }
      }
    }

    // 节拍全覆盖：每场的节拍被恰好一次、按顺序、连续认领（分镜级）
    if (sEp) {
      for (const scene of sEp.scenes) {
        const claims = [];
        for (const seg of ep?.segments ?? []) {
          if (seg?.sceneIndex !== scene.sceneIndex) continue;
          (seg?.cuts ?? []).forEach((cut, ci) => {
            const [from, to] = cut?.beats ?? [];
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > scene.beats.length || from > to) {
              bad.coverage.push(`${seg.id}#${ci + 1} 的节拍区间 [${from}, ${to}] 不合法（该场共 ${scene.beats.length} 拍）`);
              return;
            }
            claims.push([from, to, `${seg.id}#${ci + 1}`]);
          });
        }
        let cursor = 1;
        for (const [from, to, id] of claims) {
          if (from !== cursor) {
            bad.coverage.push(`${label} 第 ${scene.sceneIndex} 场第 ${cursor} 拍${from > cursor ? '没人认领' : `被 ${id} 重复认领`}`);
          }
          cursor = Math.max(cursor, to + 1);
        }
        if (claims.length && cursor <= scene.beats.length) {
          bad.coverage.push(`${label} 第 ${scene.sceneIndex} 场第 ${cursor}–${scene.beats.length} 拍没人认领`);
        }
        if (!claims.length && scene.beats.length) {
          bad.coverage.push(`${label} 第 ${scene.sceneIndex} 场整场没有分镜`);
        }
      }

      // 每集总时长对齐剧本目标
      if (sEp.targetSeconds > 0) {
        const total = (ep?.segments ?? []).reduce((n, s) => n + segSeconds(s), 0);
        const lo = sEp.targetSeconds * (1 - params.tolerance);
        const hi = sEp.targetSeconds * (1 + params.tolerance);
        if (total < lo) bad.duration.push(`${label} 欠 ${r1(lo - total)} 秒（${r1(total)}s / 目标 ${sEp.targetSeconds}s）`);
        if (total > hi) bad.duration.push(`${label} 超 ${r1(total - hi)} 秒（${r1(total)}s / 目标 ${sEp.targetSeconds}s）`);
      }
    }
  }

  const SKIP_SCRIPT = '未提供 script.json，本门跳过（视为通过）';
  const SKIP_NAMES = '未提供 outline/cast，本门跳过（视为通过）';
  const SKIP_SHOTS = '未挂载配方卡库（--shots <卡片目录>），本门跳过（视为通过）';
  const SKIP_SOURCE_STATE = script
    ? `剧本未启用 continuityMode=${CONTINUITY_MODE}，跨层剧情状态检查跳过`
    : SKIP_SCRIPT;
  const NO_RECIPE = '本批分镜没有引用配方';

  add('coverage', '剧本节拍被恰好一次、按顺序、连续认领（分镜级）', bad.coverage.length === 0, script ? bad.coverage.join('；') : SKIP_SCRIPT);
  const segmentRangeLabel = params.minSegmentSeconds > 0
    ? `每段 ${params.minSegmentSeconds}–${params.maxSegmentSeconds} 秒（一次生成）`
    : `每段 0 < 总秒数 ≤ ${params.maxSegmentSeconds}（一次生成的上限）`;
  add('segment-cap', segmentRangeLabel, eps.length > 0 && bad.segCap.length === 0, bad.segCap.join('；'));
  add('cut-length', `每个分镜 ${params.minCutSeconds}–${params.maxCutSeconds} 秒——短剧的注意力节奏`, eps.length > 0 && bad.cutLen.length === 0, bad.cutLen.join('；'));
  add('dialogue-fit', '认领节拍的台词装得进分镜秒数', bad.fit.length === 0, script ? bad.fit.join('；') : SKIP_SCRIPT);
  add('ep-duration', `每集总时长在剧本目标 ±${Math.round(params.tolerance * 100)}% 内`, bad.duration.length === 0, script ? bad.duration.join('；') : SKIP_SCRIPT);
  add('crowd', `单个分镜同框 ≤ ${params.maxOnScreen} 人，超了必须带拆解说明`, bad.crowd.length === 0, bad.crowd.join('；'));
  add('segment-id', '段号 E01-01 格式、按顺序连号', bad.id.length === 0, bad.id.join('；'));
  add('size-phrase', '景别短语写进分镜图提示词', bad.size.length === 0, bad.size.join('；'));
  const cameraProblems = [...bad.camera, ...bad.cameraPlan];
  add(
    'camera-phrase',
    '运镜用 H3 官方词表；启用电影化模式时，执行计划与转场完整且逐字进入自己的 [Shot k]',
    cameraProblems.length === 0,
    cameraProblems.length ? cameraProblems.join('；') : cameraPlanRequired ? '' : `未启用 cameraPlanMode=${CAMERA_PLAN_MODE}，执行计划检查跳过`,
  );
  add(
    'continuity',
    '相邻 cut 状态链一致、动作／光线／声音／轴线有桥；连续 segment 有可对账 handoff',
    bad.continuity.length === 0,
    bad.continuity.length ? bad.continuity.join('；') : continuityRequired ? '' : `未启用 continuityMode=${CONTINUITY_MODE}，连续性检查跳过`,
  );
  add('h3-structure', 'H3 首行对齐指令由分镜结构推导逐字对账，切点时刻逐个对', eps.length > 0 && bad.h3s.length === 0, bad.h3s.join('；'));
  add('h3-dialogue', '认领节拍的台词逐字进 H3 提示词的 <d> 块', bad.h3d.length === 0, script ? bad.h3d.join('；') : SKIP_SCRIPT);
  add('h3-lang', `H3 提示词语言与设定一致（promptLang=${promptLang}，正文${promptLang === 'en' ? '全英文' : '中文'}、骨架 token 官方英文格式）`, bad.h3e.length === 0, bad.h3e.join('；'));
  add(
    'prompt-detail',
    '投产级提示词逐切包含环境／光线／主体／动作／效果／连续性，逐段包含分层声景与配乐动态',
    bad.promptDetail.length === 0,
    bad.promptDetail.length ? bad.promptDetail.join('；') : promptDetailRequired ? '' : `未启用 promptDetailMode=${PROMPT_DETAIL_MODE}，丰富度检查跳过`,
  );
  add(
    'frame-density',
    '分镜图按镜头功能分配 sparse／balanced／rich，结构化内容进入最终 imagePrompt',
    bad.framePlan.length === 0,
    bad.framePlan.length ? bad.framePlan.join('；') : framePlanRequired ? '' : `未启用 framePlanMode=${FRAME_PLAN_MODE}，分镜图密度检查跳过`,
  );
  add(
    'frame-entry-state',
    '每段 f1 是动作前 entry state，人物／姿态／视线／道具／效果完整，动作仅在 0.00 秒后开始',
    bad.frameEntry.length === 0,
    bad.frameEntry.length ? bad.frameEntry.join('；') : frameEntryRequired ? '' : `未启用 frameEntryMode=${FRAME_ENTRY_MODE}，入口帧检查跳过`,
  );
  add(
    'candidate-grid-selection',
    '每段单次粗九宫格恰好 9 格；人工选择从 entry 到 result，cuts 与 edgePlans 完整对账',
    bad.candidate.length === 0,
    bad.candidate.length ? bad.candidate.join('；') : candidateRequired ? '' : `未启用 candidateMode=${CANDIDATE_MODE}，九宫格候选检查跳过`,
  );
  add('style-phrase', `分镜图风格短语统一（${style ? `${styleId}：${style.phrase}` : '预设无效'}）——同剧不许画风漂`, bad.style.length === 0, bad.style.join('；'));
  add('prompt-english', '完整分镜图提示词全英文且基础 frame 非空', bad.english.length === 0, bad.english.join('；'));
  add('prompt-no-names', '英文提示词不含角色名（分镜图提示词恒查；中文 H3 提示词放行）', bad.names.length === 0, banned.length ? bad.names.join('；') : SKIP_NAMES);
  add('refs', '场次／人物／道具对账剧本', bad.refs.length === 0, script ? bad.refs.join('；') : SKIP_SCRIPT);
  // 可选挂载的门放最后：没给 --shots 就跳过；给了但全篇没引用配方也算通过，但要明说，不静默
  add(
    'shot-recipe',
    '引用的配方存在、必备短语进了完整 imagePrompt、多格配方连排够格数',
    bad.recipe.length === 0,
    recipes ? (bad.recipe.length ? bad.recipe.join('；') : recipeRefs ? '' : NO_RECIPE) : SKIP_SHOTS,
  );
  add(
    'script-state-link',
    '每切 sourceState 精确继承所认领剧本节拍的前态与后态',
    bad.scriptState.length === 0,
    bad.scriptState.length ? bad.scriptState.join('；') : sourceStateRequired ? '' : SKIP_SOURCE_STATE,
  );

  return gates;
}

/* ------------------------------------------------------------------ */
/* validate                                                            */
/* ------------------------------------------------------------------ */

export function validateStoryboard(board, ctx = {}) {
  const problems = [];
  const p = (msg) => problems.push(msg);
  if (!board || typeof board !== 'object') return ['storyboard.json 不是对象'];

  if (!String(board.source ?? '').trim()) p('缺少 source（剧名）');
  const eps = board.episodes;
  if (!Array.isArray(eps) || eps.length === 0) {
    p('episodes 为空');
    return problems;
  }
  const seen = new Set();
  for (const ep of eps) {
    const label = `第 ${ep?.ep ?? '?'} 集`;
    if (!Number.isInteger(ep?.ep) || ep.ep < 1) p(`${label}的 ep 必须是正整数`);
    if (seen.has(ep?.ep)) p(`集号 ${ep.ep} 重复`);
    seen.add(ep?.ep);
    if (!Array.isArray(ep?.segments) || ep.segments.length === 0) {
      p(`${label}没有段`);
      continue;
    }
    for (const seg of ep.segments) {
      const sid = seg?.id ?? '?';
      if (typeof seg?.id !== 'string') p(`${label}有段缺 id`);
      if (!Number.isInteger(seg?.sceneIndex) || seg.sceneIndex < 1) p(`${sid} 缺 sceneIndex（剧本里第几场）`);
      if (typeof seg?.h3Prompt !== 'string') p(`${sid} 缺 h3Prompt（H3 视频提示词，写法见 references/h3-prompt.md）`);
      if (!Array.isArray(seg?.cuts) || seg.cuts.length === 0) {
        p(`${sid} 没有分镜`);
        continue;
      }
      seg.cuts.forEach((cut, ci) => {
        const cid = `${sid}#${ci + 1}`;
        if (!Array.isArray(cut?.beats) || cut.beats.length !== 2) p(`${cid} 的 beats 必须是 [起, 止] 两个数`);
        if (typeof cut?.seconds !== 'number') p(`${cid} 缺 seconds`);
        if (!Array.isArray(cut?.characters)) p(`${cid} 缺 characters（空镜给空数组）`);
        if (typeof cut?.frame !== 'string') p(`${cid} 缺 frame（分镜图英文提示词）`);
      });
    }
  }

  for (const g of gateReport(board, ctx)) {
    if (!g.ok) p(`质量门未过：${g.label}${g.detail ? `（${g.detail}）` : ''}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* seed — 从 script.json 确定性预填                                      */
/* ------------------------------------------------------------------ */

export function seedFromScript(script, epRange = null) {
  const expanded = expandScript(script);
  const inRange = (n) => !epRange || (n >= epRange[0] && n <= epRange[1]);
  const episodes = [];
  for (const [epNo, sEp] of expanded) {
    if (!inRange(epNo)) continue;
    episodes.push({
      ep: epNo,
      segments: [],
      seedScenes: sEp.scenes.map((sc) => ({
        sceneIndex: sc.sceneIndex,
        sceneId: sc.sceneId,
        lighting: sc.lighting,
        characters: sc.characters,
        props: sc.props,
        ...(sc.continuityKind ? {
          continuityKind: sc.continuityKind,
          entryState: sc.entryState,
          exitState: sc.exitState,
        } : {}),
        beats: sc.beats.map((b) => ({
          n: b.n,
          kind: b.kind,
          seconds: b.seconds,
          ...(b.speaker ? { speaker: b.speaker } : {}),
          ...(b.delivery ? { delivery: b.delivery } : {}),
          ...(b.stateBefore ? { stateBefore: b.stateBefore, stateAfter: b.stateAfter } : {}),
          text: b.text,
        })),
      })),
    });
  }
  return {
    source: script?.source ?? '',
    params: { minSegmentSeconds: 5, maxSegmentSeconds: 10 },
    cameraPlanMode: CAMERA_PLAN_MODE,
    promptDetailMode: PROMPT_DETAIL_MODE,
    framePlanMode: FRAME_PLAN_MODE,
    frameEntryMode: FRAME_ENTRY_MODE,
    candidateMode: CANDIDATE_MODE,
    selectionMode: SELECTION_MODE,
    edgePlanMode: EDGE_PLAN_MODE,
    continuityMode: CONTINUITY_MODE,
    episodes,
  };
}

/* ------------------------------------------------------------------ */
/* export — H3 投产包                                                   */
/* ------------------------------------------------------------------ */
/*
 * 固定投产结构：每段一个文件夹——E01-01/f1.png … fN.png、逐切
 * f1.prompt.md … fN.prompt.md（完整 imagePrompt）+ prompt.md（h3Prompt 原样）。
 * 根部 manifest 按 Picture 序列出图片、分镜图提示词、秒数和缺图标注。
 * 纯函数返回文件清单，落盘在 CLI 层——可测性。
 */
export function exportPack(board, script, { imageExists = () => false, dir = '.' } = {}) {
  const prefix = dir === '.' ? '' : `${dir}/`;
  const files = [];
  const manifest = [];
  let missingTotal = 0;
  for (const ep of board?.episodes ?? []) {
    for (const seg of ep?.segments ?? []) {
      // prompt.md 头部先说清哪个文件是首帧、每张图钉在第几秒——
      // 分隔线以下是 h3Prompt 原样，整段复制就能用
      const starts = cutStarts(seg.cuts);
      const mapping = (seg.cuts ?? [])
        .map((_, i) => `- Picture ${i + 1} = f${i + 1}.png${i === 0 ? '（**首帧**，钉 0.00 秒）' : `（钉 ${starts[i].toFixed(2)} 秒）`}`)
        .join('\n');
      const promptMd = `# ${seg.id} · H3 提示词\n\n首帧 = **f1.png**。图片按 Picture 序号挂载：\n\n${mapping}\n\n---\n\n${seg.h3Prompt ?? ''}\n`;
      files.push({ path: `${prefix}${seg.id}/prompt.md`, content: promptMd });
      const pictures = (seg.cuts ?? []).map((_, i) => `${prefix}${seg.id}/f${i + 1}.png`);
      let candidateGrid = null;
      if (seg?.candidateBoard) {
        const candidatePromptPath = `${prefix}${seg.id}/candidate-grid.prompt.md`;
        const candidateImagePath = `${prefix}${seg.id}/candidate-grid.png`;
        const selectionPath = `${prefix}${seg.id}/candidate-selection.template.json`;
        files.push({ path: candidatePromptPath, content: `# ${seg.id} · 粗略九宫格提示词\n\n${buildCandidateGridPrompt(seg)}\n` });
        files.push({
          path: selectionPath,
          content: JSON.stringify({ mode: SELECTION_MODE, selections: [{ segment: seg.id, selected: seg.candidateBoard.selected ?? [] }] }, null, 2) + '\n',
        });
        candidateGrid = {
          prompt: candidatePromptPath,
          image: candidateImagePath,
          selection: selectionPath,
          selected: seg.candidateBoard.selected ?? [],
          missing: !imageExists(candidateImagePath),
        };
      }
      const imagePrompts = (seg.cuts ?? []).map((cut, i) => {
        const path = `${prefix}${seg.id}/f${i + 1}.prompt.md`;
        const prompt = buildFrameImagePrompt(cut, {
          cutIndex: i,
          segmentContinuous: i === 0 && seg?.handoff?.kind === 'continuous',
        });
        files.push({
          path,
          content: `# ${seg.id} · Picture ${i + 1} · 分镜图提示词\n\n${prompt}\n`,
        });
        return path;
      });
      const missing = pictures.filter((rel) => !imageExists(rel));
      missingTotal += missing.length;
      manifest.push({
        segment: seg.id,
        seconds: segSeconds(seg),
        cuts: (seg.cuts ?? []).length,
        cutStarts: cutStarts(seg.cuts),
        prompt: `${prefix}${seg.id}/prompt.md`,
        pictures,
        imagePrompts,
        ...(candidateGrid ? { candidateGrid } : {}),
        edgePlans: seg?.edgePlans ?? [],
        missing,
      });
    }
  }
  files.push({ path: `${prefix}manifest.json`, content: JSON.stringify(manifest, null, 2) + '\n' });
  return { files, manifest, missingTotal };
}

/* ------------------------------------------------------------------ */
/* slug                                                                */
/* ------------------------------------------------------------------ */

export function slug(name) {
  const cleaned = String(name)
    .trim()
    .replace(/[\s/\\:*?"<>|·]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'storyboard';
}

/* ------------------------------------------------------------------ */
/* render — 界面文案                                                    */
/* ------------------------------------------------------------------ */

/*
 * 界面文案表：内置 zh / en 两套。语言优先级 --lang > JSON 顶层 lang 字段 > 'zh'，
 * 经 ctx.lang 传给渲染器。只管报告界面标签——与 promptLang（H3 提示词语言）
 * 互相独立：界面切英文不改提示词，提示词切中文不改界面。
 * 数据（H3 提示词、画面摘要、台词、质量门 detail）不在此表，原样透传。
 */
/* 门标签与「跳过」提示的英文映射：质量门面板是报告的一部分，出英文报告时
 * 这里做展示层翻译——gateReport 的逻辑与中文诊断文案一行不动（CLI 仍是中文）。
 * 动态阈值由门自己算，映射里只写固定语义；未命中的 id 回落到原标签。 */
const GATE_LABELS_EN = {
  'coverage': 'Every script beat claimed exactly once, in order, contiguous (cut level)',
  'segment-cap': 'Each segment {0}–{1}s (one generation call)',
  'cut-length': 'Every cut {0}–{1}s — the short-drama attention rhythm',
  'dialogue-fit': 'Dialogue of the claimed beats fits within the cut duration',
  'ep-duration': 'Episode total within ±{0}% of the script\'s target',
  'crowd': 'At most {0} characters on screen per cut; more requires a breakdown note',
  'segment-id': 'Segment IDs in E01-01 format, sequential',
  'size-phrase': 'Shot-size phrase present in the frame prompt',
  'camera-phrase': 'Official H3 camera move; in cinematic mode, the complete camera plan and transition appear inside their own [Shot k]',
  'continuity': 'Adjacent cuts share an exact state boundary and motion/light/audio/axis bridge; continuous segments carry an audited handoff',
  'h3-structure': 'H3 alignment line derived from the cut structure, audited verbatim; cut times match',
  'h3-dialogue': 'Claimed dialogue appears verbatim inside the H3 <d> blocks',
  'h3-lang': 'Prompt language matches the promptLang setting',
  'prompt-detail': 'Production-rich prompt: visual layers per cut, layered soundscape and scored music arc per segment',
  'frame-density': 'Frame prompts use role-driven sparse / balanced / rich density and compile into the final image prompt',
  'frame-entry-state': 'Every segment f1 is a pre-action entry state; motion starts only after the 0.00-second frame',
  'candidate-grid-selection': 'Each segment has one rough nine-cell grid; human selection runs entry to result and audits cuts plus edge plans',
  'style-phrase': 'Frame-prompt style phrase consistent — one drama, one look',
  'prompt-english': 'Compiled frame prompts are English and the base frame is non-empty',
  'prompt-no-names': 'Compiled English frame prompts carry no character names',
  'refs': 'Scenes / characters / props audited against the script',
  'shot-recipe': 'Referenced recipes exist, their must-phrases are in the compiled image prompt, multi-cut recipes run long enough',
  'script-state-link': 'Every cut sourceState exactly inherits the before/after state of its claimed script beats',
};
const GATE_SKIPS_EN = {
    '未提供 outline.json，本门跳过（视为通过）': 'outline.json not provided — gate skipped (treated as passing)',
    '未提供 art.json，本门跳过（视为通过）': 'art.json not provided — gate skipped (treated as passing)',
    '未提供 script.json，本门跳过（视为通过）': 'script.json not provided — gate skipped (treated as passing)',
    '未提供 outline/cast，本门跳过（视为通过）': 'outline/cast not provided — gate skipped (treated as passing)',
    '未提供 cast.json，本门跳过（视为通过）': 'cast.json not provided — gate skipped (treated as passing)',
    '未挂载配方卡库（--shots <卡片目录>），本门跳过（视为通过）': 'no recipe card library mounted (--shots <cards dir>) — gate skipped (treated as passing)',
    '本批分镜没有引用配方': 'no cut in this batch references a recipe',
    [`未启用 cameraPlanMode=${CAMERA_PLAN_MODE}，执行计划检查跳过`]: `cameraPlanMode=${CAMERA_PLAN_MODE} not enabled — execution-plan checks skipped`,
    [`未启用 promptDetailMode=${PROMPT_DETAIL_MODE}，丰富度检查跳过`]: `promptDetailMode=${PROMPT_DETAIL_MODE} not enabled — richness checks skipped`,
    [`未启用 framePlanMode=${FRAME_PLAN_MODE}，分镜图密度检查跳过`]: `framePlanMode=${FRAME_PLAN_MODE} not enabled — frame-density checks skipped`,
    [`未启用 frameEntryMode=${FRAME_ENTRY_MODE}，入口帧检查跳过`]: `frameEntryMode=${FRAME_ENTRY_MODE} not enabled — entry-frame checks skipped`,
    [`未启用 candidateMode=${CANDIDATE_MODE}，九宫格候选检查跳过`]: `candidateMode=${CANDIDATE_MODE} not enabled — candidate-grid checks skipped`,
    [`未启用 continuityMode=${CONTINUITY_MODE}，连续性检查跳过`]: `continuityMode=${CONTINUITY_MODE} not enabled — continuity checks skipped`,
    [`剧本未启用 continuityMode=${CONTINUITY_MODE}，跨层剧情状态检查跳过`]: `script continuityMode=${CONTINUITY_MODE} not enabled — cross-layer script-state checks skipped`,
};
/** 报告里的门文案：英文界面取映射，未命中或中文界面回落原文。 */
const gateText = (g, lang) => {
  if (lang !== 'en') return { label: g.label, detail: g.detail };
  const en = GATE_LABELS_EN[g.id];
  // 阈值仍由门自己算：把中文标签里出现的数字按序填进 {0} {1}
  const nums = String(g.label).match(/\d+(?:\.\d+)?/g) ?? [];
  const label = en ? en.replace(/\{(\d)\}/g, (m, i) => nums[Number(i)] ?? m) : g.label;
  return { label, detail: GATE_SKIPS_EN[g.detail] ?? g.detail };
};

const I18N = {
  zh: {
    langCode: 'zh',
    kicker: '分镜',
    docTitle: (s, a, b) => `${s} · 分镜${a === b ? `（第 ${a} 集）` : `（第 ${a}–${b} 集）`}`,
    epRange: (a, b) => (a === b ? `第 ${a} 集` : `第 ${a}–${b} 集`),
    exportJson: '导出 JSON',
    gatesPass: '全部通过',
    gatesFail: (n) => `${n} 项未过`,
    gatePill: (okN, total) => `质量门 ${okN} / ${total}`,
    kpi: {
      segments: '生成段', segmentsSub: (cap) => `一段一次调用，上限 ${cap} 秒`,
      cuts: '分镜', cutsSub: (avg) => `平均 ${avg} 秒一切`,
      time: '预估总时长', timeSub: (t) => `目标 ${t}`,
      batches: '生成批次', batchesSub: '同场景同光照共用环境参考图',
      lines: '台词段', linesSub: '其余是纯画面段',
    },
    secRhythm: '分镜节奏带',
    secSegments: '分集分镜表',
    secBatches: '生成批次单',
    secDialogue: '配音对齐单',
    secGates: '质量门',
    rhythmNote: '粗分隔 = 生成段边界 · 段宽 = 分镜时长占比 · 颜色越深景别越近',
    segmentsNote: '一段 = 一次生成：主分镜图钉 0.00 秒，子分镜图钉各自切点',
    batchesNote: '自动汇总 · 同批段共用同一张环境参考图',
    dialogueNote: '自动汇总 · TTS 音频对到哪一段的第几切',
    epHead: (nSeg, nCut, total, target) => `${nSeg} 段 ${nCut} 切 · 共 ${total} 秒 / 目标 ${target} 秒`,
    segHead: (total, n) => `${total} 秒 · ${n} 个分镜`,
    secBadge: (secs, n) => `${secs}s · ${n} 切`,
    rhythmVal: (nSeg, nCut, secs) => `${nSeg} 段 ${nCut} 切 · ${secs}s`,
    beatsLabel: (s, from, to) => `第 ${s} 场 ${from === to ? `第 ${from} 拍` : `第 ${from}–${to} 拍`}`,
    masterLabel: '主分镜图',
    subLabel: (i) => `子分镜 ${i}`,
    frameMissing: (i) => `#${i} 未生成`,
    framePrompt: '完整分镜图提示词',
    framePlan: '画面密度',
    candidateTitle: '粗略九宫格候选',
    candidateHint: '按想要的播放顺序点击格子；第一个是开始，最后一个是结尾，再点一次取消',
    candidateMissing: '九宫格尚未生成',
    exportSelection: '导出选择',
    clearSelection: '清空本段',
    h3Prompt: 'H3 提示词',
    h3Section: 'H3 视频提示词',
    showSegs: '▾ 展开全部段',
    hideSegs: '▴ 收起',
    copy: '复制', copied: '已复制', copyFailed: '复制失败',
    dialogueCols: ['段 · 切', '说话人', '台词', '台词秒数'],
    cutCols: ['切', '起点', '秒', '景别', '运镜', '配方', '画面', '人物'],
    batchCols: ['场景', '光照', '段', '需要的角色', '道具'],
    atSec: (t) => `${t.toFixed(2)}s 起`,
    batchLabel: (num) => `批次 ${num}`,
    batchNeed: (chars, props) => `需要：${chars.length ? chars.join('、') + ' 的角色设定图' : '无角色（空镜）'}${props.length ? ' · ' + props.join('、') : ''}`,
    voiceOver: '画外音',
    listSep: '、',
    sizeName: (size) => SHOT_SIZES[size]?.zh ?? size,
    cameraLabel: (camera) => `${camera}（${CAMERA_MOVES[camera] ?? '?'}）`,
    cameraPlan: '运镜执行',
    transition: '转场',
    transitionName: (id) => TRANSITION_TOKENS[id]?.zh ?? id,
    recipeNone: '—',
    recipeName: (card, id) => card?.name ?? id,
    recipeDrift: (sizes, cameras) =>
      `配方建议${[sizes.length ? `景别 ${sizes.join(' / ')}` : '', cameras.length ? `运镜 ${cameras.join(' / ')}` : ''].filter(Boolean).join(' · ')}——只提示不设门`,
    recipeHint: (n) => `ℹ️ ${n} 处分镜的景别／运镜偏离了配方建议——配方是语汇不是法条，只提示不设门（报告的「配方」列有 ≠ 标记）`,
    speakerLine: (name, text) => `${name}：「${text}」`,
    withLighting: (name, lighting) => (lighting ? `${name}（${lighting}）` : name),
    fmtMin: (sec) => `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒`,
    unitSeg: '段',
    unitCut: '切',
    colophon: '分镜由模型依据剧本切分：新 seed 的段 = 一次 5–10 秒生成，分镜 = 段内 2–5 秒的剪切，每个分镜一张关键帧图。剧本 sourceState、对齐指令、切点时刻、台词和提示词纪律全部由脚本确定性对账。',
  },
  en: {
    langCode: 'en',
    kicker: 'Storyboard',
    docTitle: (s, a, b) => `${s} · Storyboard (${a === b ? `Episode ${a}` : `Episodes ${a}–${b}`})`,
    epRange: (a, b) => (a === b ? `Episode ${a}` : `Episodes ${a}–${b}`),
    exportJson: 'Export JSON',
    gatesPass: 'All passed',
    gatesFail: (n) => `${n} failed`,
    gatePill: (okN, total) => `Quality gates ${okN} / ${total}`,
    kpi: {
      segments: 'Segments', segmentsSub: (cap) => `one generation call each, capped at ${cap}s`,
      cuts: 'Cuts', cutsSub: (avg) => `${avg}s per cut on average`,
      time: 'Estimated total', timeSub: (t) => `target ${t}`,
      batches: 'Generation batches', batchesSub: 'same scene + lighting share one environment reference',
      lines: 'Dialogue segments', linesSub: 'the rest are picture-only',
    },
    secRhythm: 'Cut rhythm strip',
    secSegments: 'Segment cards',
    secBatches: 'Generation batches',
    secDialogue: 'Audio alignment',
    secGates: 'Quality gates',
    rhythmNote: 'thick separators = segment boundaries · slice width = cut duration share · darker = closer shot size',
    segmentsNote: 'one segment = one generation: the master frame pins 0.00s, sub-frames pin their own cut marks',
    batchesNote: 'auto-computed · segments in a batch share one environment reference image',
    dialogueNote: 'auto-computed · which segment and cut each TTS clip lands on',
    epHead: (nSeg, nCut, total, target) => `${nSeg} segments ${nCut} cuts · ${total}s total / ${target}s target`,
    segHead: (total, n) => `${total}s · ${n} cuts`,
    secBadge: (secs, n) => `${secs}s · ${n} cuts`,
    rhythmVal: (nSeg, nCut, secs) => `${nSeg} seg ${nCut} cuts · ${secs}s`,
    beatsLabel: (s, from, to) => `Scene ${s} · ${from === to ? `beat ${from}` : `beats ${from}–${to}`}`,
    masterLabel: 'master frame',
    subLabel: (i) => `sub-frame ${i}`,
    frameMissing: (i) => `#${i} not generated`,
    framePrompt: 'Full frame prompt',
    framePlan: 'Frame density',
    candidateTitle: 'Rough nine-cell candidates',
    candidateHint: 'Click cells in playback order; first becomes start and last becomes end. Click again to remove.',
    candidateMissing: 'Candidate grid not generated',
    exportSelection: 'Export selection',
    clearSelection: 'Clear segment',
    h3Prompt: 'H3 prompt',
    h3Section: 'H3 video prompt',
    showSegs: '▾ Show all segments',
    hideSegs: '▴ Collapse',
    copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed',
    dialogueCols: ['Segment · cut', 'Speaker', 'Line', 'Seconds'],
    cutCols: ['Cut', 'Start', 'Sec', 'Size', 'Camera', 'Recipe', 'Picture', 'Characters'],
    batchCols: ['Scene', 'Lighting', 'Segments', 'Characters needed', 'Props'],
    atSec: (t) => `from ${t.toFixed(2)}s`,
    batchLabel: (num) => `Batch ${num}`,
    batchNeed: (chars, props) => `Needs: ${chars.length ? `character sheets for ${chars.join(', ')}` : 'no characters (empty shot)'}${props.length ? ' · ' + props.join(', ') : ''}`,
    voiceOver: 'Voice-over',
    listSep: ', ',
    sizeName: (size) => SHOT_SIZES[size]?.phrase ?? size,
    cameraLabel: (camera) => camera,
    cameraPlan: 'Camera plan',
    transition: 'Transition',
    transitionName: (id) => TRANSITION_TOKENS[id]?.en ?? id,
    recipeNone: '—',
    recipeName: (card, id) => card?.name_en ?? card?.name ?? id,
    recipeDrift: (sizes, cameras) =>
      `Recipe suggests ${[sizes.length ? `size ${sizes.join(' / ')}` : '', cameras.length ? `camera ${cameras.join(' / ')}` : ''].filter(Boolean).join(' · ')} — advisory, not gated`,
    recipeHint: (n) => `ℹ️ ${n} cut(s) deviate from their recipe's suggested size / camera — a recipe is vocabulary, not law: advisory only (see the ≠ marks in the Recipe column)`,
    speakerLine: (name, text) => `${name}: “${text}”`,
    withLighting: (name, lighting) => (lighting ? `${name} (${lighting})` : name),
    fmtMin: (sec) => `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`,
    unitSeg: 'seg',
    unitCut: 'cuts',
    colophon: 'Cut by the model from the script: new seeds use one 5–10s generation call per segment and 2–5s cuts with one keyframe each. Script sourceState, alignment lines, cut marks, dialogue and prompt discipline are audited deterministically.',
  },
};

const tOf = (lang) => {
  if (lang && !I18N[lang]) throw new Error('报告界面语言目前内置 zh / en');
  return I18N[lang ?? 'zh'];
};

const cameraPlanSummary = (cut, t) => {
  const plan = cut?.cameraPlan;
  if (!plan || typeof plan !== 'object') return '';
  return `${t.cameraPlan}: ${plan.pace ?? '?'} / ${plan.magnitude ?? '?'} · ${plan.start ?? '?'} → ${plan.target ?? '?'} → ${plan.end ?? '?'} · ${plan.focus ?? '?'} · ${plan.intent ?? '?'} · ${t.transition}: ${t.transitionName(cut.transition)}`;
};

const framePlanSummary = (cut, t) => {
  const plan = cut?.framePlan;
  if (!plan || typeof plan !== 'object') return '';
  return `${t.framePlan}: ${plan.role ?? '?'} / ${plan.density ?? '?'} / ${plan.moment ?? '?'} · ${plan.keyMoment ?? '?'}`;
};

/* ------------------------------------------------------------------ */
/* render 公共                                                          */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function namer(ctx = {}, t = I18N.zh) {
  const charName = new Map((ctx.outline?.characters ?? []).map((c) => [c.id, c.name]));
  const sceneName = new Map((ctx.art?.scenes ?? []).map((s) => [s.id, s.name]));
  const propName = new Map((ctx.art?.props ?? []).map((p) => [p.id, p.name]));
  return {
    char: (id) => (id === 'VO' ? t.voiceOver : charName.get(id) ?? id),
    scene: (id) => sceneName.get(id) ?? id,
    prop: (id) => propName.get(id) ?? id,
  };
}

/**
 * cut 的「配方」列：卡名 + 偏离建议景别／运镜时的 ≠ 标记。
 * 偏离只提示不设门——配方是语汇不是法条（理由见 recipeDrift 上方注释）。
 */
function cutRecipe(cut, recipes, t) {
  const id = typeof cut?.recipe === 'string' ? cut.recipe : '';
  if (!id) return null;
  const card = recipes?.get(id) ?? null;
  const off = recipeDrift(cut, card);
  return {
    name: t.recipeName(card, id),
    drift: off.sizes.length || off.cameras.length ? t.recipeDrift(off.sizes, off.cameras) : '',
  };
}

/** 分镜认领的节拍 → 画面摘要（动作原文 + 台词行），模型不重写。 */
function cutBeats(cut, scene) {
  if (!scene) return [];
  const [from, to] = cut.beats ?? [];
  return scene.beats.slice((from ?? 1) - 1, to ?? 0);
}

/* ------------------------------------------------------------------ */
/* render — markdown                                                   */
/* ------------------------------------------------------------------ */

const mdRow = (cells) => `| ${cells.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
const mdHead = (cols) => [mdRow(cols), mdRow(cols.map(() => '---'))].join('\n');

export function renderMarkdown(board, ctx = {}) {
  const t = tOf(ctx.lang ?? board?.lang);
  const n = namer(ctx, t);
  const expanded = expandScript(ctx.script);
  const stats = computeStats(board, ctx.script);
  const eps = board.episodes;
  const out = [`# ${t.docTitle(board.source, eps[0]?.ep, eps[eps.length - 1]?.ep)}`, ''];

  for (const [i, ep] of eps.entries()) {
    const st = stats.episodes[i];
    const sEp = expanded.get(ep.ep);
    out.push(`## E${String(ep.ep).padStart(2, '0')}`, '', `> ${t.epHead(st.segments, st.cuts, st.totalSeconds, st.target)}`, '');
    for (const seg of ep.segments) {
      const scene = sEp?.scenes?.[seg.sceneIndex - 1];
      out.push(`### ${seg.id} · ${scene ? t.withLighting(n.scene(scene.sceneId), scene.lighting) : '?'} · ${t.segHead(segSeconds(seg), seg.cuts.length)}`, '');
      out.push(mdHead(t.cutCols));
      const starts = cutStarts(seg.cuts);
      seg.cuts.forEach((cut, ci) => {
        const summary = cutBeats(cut, scene)
          .map((b) => (b.kind === 'line' ? t.speakerLine(n.char(b.speaker), b.text) : b.text))
          .join(' ');
        // md 没有 title 属性，偏离的建议值直接写在格子里
        const rc = cutRecipe(cut, ctx.recipes, t);
        const cameraPlan = cameraPlanSummary(cut, t);
        const framePlan = framePlanSummary(cut, t);
        out.push(mdRow([
          `#${ci + 1}`, `${starts[ci].toFixed(2)}s`, cut.seconds,
          t.sizeName(cut.size), t.cameraLabel(cut.camera),
          rc ? `${rc.name}${rc.drift ? ` ≠（${rc.drift}）` : ''}` : t.recipeNone,
          `${summary}${cameraPlan ? `<br>**${cameraPlan}**` : ''}${framePlan ? `<br>**${framePlan}**` : ''}`, (cut.characters ?? []).map(n.char).join(t.listSep),
        ]));
      });
      out.push('', `**${t.h3Section}**`, '', '```text', seg.h3Prompt ?? '', '```', '');
    }
  }

  out.push(`## ${t.secBatches}`, '', mdHead(t.batchCols));
  for (const b of stats.batches) {
    out.push(mdRow([`${b.sceneId} ${n.scene(b.sceneId)}`, b.lighting, b.segments.join(t.listSep), b.characters.map(n.char).join(t.listSep), b.props.map(n.prop).join(t.listSep)]));
  }
  out.push('', `## ${t.secDialogue}`, '', mdHead(t.dialogueCols));
  for (const d of stats.dialogue) out.push(mdRow([`${d.segment}#${d.cut}`, n.char(d.speaker), d.line, d.seconds]));
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* render — html                                                       */
/* ------------------------------------------------------------------ */
/*
 * 与另外四份报告同一套视觉语言。设计约定见 references/report-style.md。
 * 分镜图从工作目录下 <段号>/f<切序>.png 找（imageExists 由 CLI 注入，
 * render 时检查相对工作目录的路径），有就内嵌显示 + 点击放大，
 * 没有就显示占位——不猜、不骗。
 */

function embedDoc(doc) {
  return JSON.stringify(doc).replace(/</g, '\\u003c');
}

export function renderHtml(board, ctx = {}) {
  const lang = ctx.lang ?? board?.lang ?? 'zh';
  const t = tOf(lang);
  const n = namer(ctx, t);
  const expanded = expandScript(ctx.script);
  const stats = computeStats(board, ctx.script);
  const gates = gateReport(board, ctx);
  const failed = gates.filter((g) => !g.ok);
  const eps = board.episodes;
  const params = stats.params;
  const fmtMin = t.fmtMin;

  const SIZE_ALPHA = { 'extreme-wide': 0.25, wide: 0.4, medium: 0.58, close: 0.78, 'extreme-close': 1 };

  // ---- 01 分镜节奏带：段是粗分隔的组，组内每个分镜一段色块 ----
  const rhythmRows = eps
    .map((ep, i) => {
      const st = stats.episodes[i];
      const groups = ep.segments
        .map((seg) => {
          const segs = seg.cuts
            .map((cut, ci) => {
              const w = st.totalSeconds ? (cut.seconds / st.totalSeconds) * 100 : 0;
              const alpha = SIZE_ALPHA[cut.size] ?? 0.5;
              return `<a class="seg" href="#seg-${esc(seg.id)}" style="width:${r1(w)}%;background:rgba(138,51,36,${alpha})" title="${esc(`${seg.id}#${ci + 1} · ${cut.seconds}s · ${t.sizeName(cut.size)} · ${cut.camera}`)}"></a>`;
            })
            .join('');
          const gw = st.totalSeconds ? (segSeconds(seg) / st.totalSeconds) * 100 : 0;
          return `<span class="rseg" style="width:${r1(gw)}%">${segs}</span>`;
        })
        .join('');
      return `<div class="rrow"><span class="rep">E${String(ep.ep).padStart(2, '0')}</span><div class="rtrack">${groups}</div><span class="rval">${esc(t.rhythmVal(st.segments, st.cuts, st.totalSeconds))}</span></div>`;
    })
    .join('\n');
  const rhythmLegend = Object.keys(SHOT_SIZES)
    .map((k) => `<i><span class="sw" style="background:rgba(138,51,36,${SIZE_ALPHA[k]})"></span>${esc(t.sizeName(k))}</i>`)
    .join('');

  // ---- 02 分集分镜表：段卡（主分镜图 + 子分镜条 + 分镜行） ----
  const epBlocks = eps
    .map((ep, i) => {
      const st = stats.episodes[i];
      const sEp = expanded.get(ep.ep);
      const cards = ep.segments
        .map((seg) => {
          const scene = sEp?.scenes?.[seg.sceneIndex - 1];
          const starts = cutStarts(seg.cuts);
          const frame = (ci) => `${seg.id}/f${ci + 1}.png`;
          const has = (ci) => (ctx.imageExists ? ctx.imageExists(frame(ci)) : false);
          const candidatePath = `${seg.id}/candidate-grid.png`;
          const hasCandidate = Boolean(seg?.candidateBoard && ctx.imageExists && ctx.imageExists(candidatePath));
          const candidatePrompt = seg?.candidateBoard ? buildCandidateGridPrompt(seg) : '';
          const candidatePanel = seg?.candidateBoard
            ? `<section class="cand" data-segment="${esc(seg.id)}" data-initial="${esc((seg.candidateBoard.selected ?? []).join(','))}">
  <header class="cand-h"><div><b>${esc(t.candidateTitle)}</b><small>${esc(t.candidateHint)}</small></div><button class="cand-clear">${esc(t.clearSelection)}</button></header>
  <div class="cand-media">
    ${hasCandidate ? `<img src="${esc(candidatePath)}" alt="${esc(`${seg.id} ${t.candidateTitle}`)}" loading="lazy">` : `<div class="cand-ph"><b>${esc(t.candidateMissing)}</b><button class="copy mini" data-copy="${esc(candidatePrompt)}">${esc(t.copy)}</button><pre>${esc(candidatePrompt)}</pre></div>`}
    ${hasCandidate ? `<div class="cand-cells">${CANDIDATE_GRID_SPEC.map((cell) => `<button type="button" data-cell="${cell.id}" title="${esc(`${cell.id} · ${cell.moment} / ${cell.size}`)}"><span>${cell.id}</span><em></em></button>`).join('')}</div>` : ''}
  </div>
</section>`
            : '';

          // 主分镜图区：图出全的段保留原 master+subs 层级；有缺图的段每切一格——
          // 有图的格显示原图，无图的格显示整宽提示词卡 + 复制按钮（混合情况按格判断）
          const hasAll = seg.cuts.every((_, ci) => has(ci));
          let master, subs;
          if (hasAll) {
            master = `<img class="frame" src="${esc(frame(0))}" alt="${esc(`${seg.id}#1`)}" loading="lazy">`;
            subs = seg.cuts.length > 1
              ? `<div class="subs">${seg.cuts
                  .slice(1)
                  .map((cut, ci) => `<img class="subf" src="${esc(frame(ci + 1))}" alt="${esc(`${seg.id}#${ci + 2}`)}" loading="lazy">`)
                  .join('')}</div>`
              : '';
          } else {
            master = `<div class="fquad">${seg.cuts
              .map((cut, ci) => {
                const label = ci === 0 ? t.masterLabel : t.subLabel(ci + 1);
                const imagePrompt = buildFrameImagePrompt(cut, {
                  cutIndex: ci,
                  segmentContinuous: ci === 0 && seg?.handoff?.kind === 'continuous',
                });
                const body = has(ci)
                  ? `<img class="frame" src="${esc(frame(ci))}" alt="${esc(`${seg.id}#${ci + 1}`)}" loading="lazy">`
                  : `<div class="frame ph fcell"><div class="fcell-h"><b>${esc(`${label} · ${t.frameMissing(ci + 1)}`)}</b><button class="copy mini" data-copy="${esc(imagePrompt)}">${esc(t.copy)}</button></div><span class="fprompt">${esc(imagePrompt)}</span></div>`;
                return body;
              })
              .join('\n')}</div>`;
            subs = '';
          }

          const cutRows = seg.cuts
            .map((cut, ci) => {
              const beats = cutBeats(cut, scene);
              const summary = beats
                .map((b) =>
                  b.kind === 'line'
                    ? `<p class="sline"><b>${esc(n.char(b.speaker))}</b>${esc(b.text)}</p>`
                    : `<p class="sact">${esc(b.text)}</p>`,
                )
                .join('');
              // 「配方」列：偏离建议景别／运镜的加 ≠ 上标，建议值写进 title——提示而已，不是门
              const rc = cutRecipe(cut, ctx.recipes, t);
              const cameraPlan = cameraPlanSummary(cut, t);
              const framePlan = framePlanSummary(cut, t);
              const imagePrompt = buildFrameImagePrompt(cut, {
                cutIndex: ci,
                segmentContinuous: ci === 0 && seg?.handoff?.kind === 'continuous',
              });
              return `<li class="cut">
  <div class="cut-h">
    <b>#${ci + 1}</b>
    <span class="cut-t">${esc(t.atSec(starts[ci]))} · ${cut.seconds}s</span>
    <span class="cut-sc">${esc(t.sizeName(cut.size))} · ${esc(cut.camera)}</span>
    ${rc ? `<span class="cut-rc">${esc(rc.name)}${rc.drift ? `<sup title="${esc(rc.drift)}">≠</sup>` : ''}</span>` : ''}
    ${(cut.characters ?? []).map((id) => `<span class="chip">${esc(n.char(id))}</span>`).join('')}
    ${(cut.props ?? []).map((id) => `<span class="chip prop">${esc(n.prop(id))}</span>`).join('')}
    <button class="copy mini" data-copy="${esc(imagePrompt)}">${esc(t.framePrompt)}</button>
  </div>
  ${summary}
  ${cameraPlan ? `<p class="cplan"><b>${esc(t.cameraPlan)}</b>${esc(cameraPlan.replace(`${t.cameraPlan}: `, ''))}</p>` : ''}
  ${framePlan ? `<p class="fplan"><b>${esc(t.framePlan)}</b>${esc(framePlan.replace(`${t.framePlan}: `, ''))}</p>` : ''}
</li>`;
            })
            .join('\n');

          return `<article class="segcard" id="seg-${esc(seg.id)}">
  <header class="seg-h">
    <b>${esc(seg.id)}</b>
    <span class="sec-badge">${esc(t.secBadge(segSeconds(seg), seg.cuts.length))}</span>
    <span class="chip">${esc(scene ? `${scene.sceneId} ${n.scene(scene.sceneId)}` : '?')}</span>
    ${scene?.lighting ? `<span class="chip lite">${esc(scene.lighting)}</span>` : ''}
    <span class="beatsref">${esc(t.beatsLabel(seg.sceneIndex, seg.cuts[0]?.beats?.[0], seg.cuts[seg.cuts.length - 1]?.beats?.[1]))}</span>
  </header>
  ${candidatePanel}
  ${master}
  ${subs}
  <div class="duo">
    <ol class="cuts">
${cutRows}
    </ol>
    <div class="ppanel">
      <div class="pp-h">
        <b>${esc(t.h3Prompt)}</b>
        <button class="copy" data-copy="${esc(seg.h3Prompt ?? '')}">${esc(t.copy)}</button>
      </div>
      <pre class="pp on">${esc(seg.h3Prompt ?? '')}</pre>
    </div>
  </div>
  ${seg.note ? `<p class="seg-note">${esc(seg.note)}</p>` : ''}
</article>`;
        })
        .join('\n');
      return `<section class="ep" id="ep-${ep.ep}">
  <header class="ep-h">
    <span class="ep-n">E${String(ep.ep).padStart(2, '0')}</span>
    <span class="ep-est">${esc(t.epHead(st.segments, st.cuts, st.totalSeconds, st.target))}</span>
  </header>
  <div class="shots clip">
    <div class="seggrid">
${cards}
    </div>
  </div>
  <button class="shmore">${esc(t.showSegs)}</button>
</section>`;
    })
    .join('\n');

  // ---- 03 生成批次单 ----
  const batchCards = stats.batches
    .map((b, i) => {
      const sheet = `images/${slug(n.scene(b.sceneId))}-sheet.png`;
      const hasSheet = ctx.imageExists ? ctx.imageExists(sheet) : false;
      return `<article class="batch">
  ${hasSheet ? `<img class="bimg" src="${esc(sheet)}" alt="${esc(n.scene(b.sceneId))}" loading="lazy">` : ''}
  <header class="batch-h"><b>${esc(t.batchLabel(String(i + 1).padStart(2, '0')))}</b><span class="chip">${esc(`${b.sceneId} ${n.scene(b.sceneId)}`)}</span>${b.lighting ? `<span class="chip lite">${esc(b.lighting)}</span>` : ''}</header>
  <div class="batch-shots">${b.segments.map((s) => `<a class="chip mono" href="#seg-${esc(s)}">${esc(s)}</a>`).join('')}</div>
  <p class="batch-need">${esc(t.batchNeed(b.characters.map(n.char), b.props.map(n.prop)))}</p>
</article>`;
    })
    .join('\n');

  // ---- 04 配音对齐单 ----
  const dlgRows = stats.dialogue
    .map((d) => `<tr><td><a href="#seg-${esc(d.segment)}">${esc(d.segment)}</a> #${d.cut}</td><td>${esc(n.char(d.speaker))}</td><td class="serif">${esc(d.line)}</td><td>${d.seconds}</td></tr>`)
    .join('\n');

  const gateList = `<ul class="gate">
  ${gates
    .map(
      // 通过的门只有跳过说明与「没有引用配方」这类备注带 detail——都要显示出来，不静默
      (g) => `<li class="${g.ok ? 'ok' : 'bad'}"><span class="m">${g.ok ? '✓' : '✗'}</span><span>${esc(gateText(g, t.langCode).label)}${
        g.detail ? `<small>${esc(gateText(g, t.langCode).detail)}</small>` : ''
      }</span></li>`,
    )
    .join('\n  ')}
</ul>`;

  return `<!doctype html>
<html lang="${esc(lang)}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.docTitle(board.source, eps[0]?.ep, eps[eps.length - 1]?.ep))}</title>
<style>
:root{
  --paper:#eceded; --panel:#f5f6f5; --side:#e4e6e3; --ink:#191d21; --ink-2:#5b636a; --ink-3:#8c9298;
  --rule:#d2d5d0; --rule-2:#c2c6bf; --seal:#8a3324; --seal-2:#c56a4e; --seal-soft:#8a332412; --ok:#3d6b4f;
  --serif:"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC",Georgia,serif;
  --sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.7 var(--sans);-webkit-font-smoothing:antialiased}
.page{max-width:1600px;margin:0 auto;padding:24px 32px 90px}
h1,h2,h3{margin:0;font-weight:400}

.hd{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:12px}
.hd h1{font:400 28px/1.1 var(--serif);letter-spacing:.06em}
.hd .sub{font-size:13px;color:var(--ink-2)}
.hd .right{margin-left:auto;display:flex;align-items:center;gap:10px}
.gatepill{display:inline-flex;align-items:center;gap:6px;font:500 12px/1 var(--sans);border-radius:99px;padding:6px 12px}
.gatepill.pass{color:var(--ok);border:1px solid var(--ok)}
.gatepill.fail{color:var(--seal);border:1px solid var(--seal);background:var(--seal-soft)}
.expo,.sel-expo{font:500 11px/1 var(--sans);color:var(--ink-2);background:var(--panel);
  border:1px solid var(--rule-2);border-radius:2px;padding:7px 11px;cursor:pointer;transition:.15s}
.expo:hover,.sel-expo:hover{border-color:var(--seal);color:var(--seal)}
.expo:focus-visible,.sel-expo:focus-visible{outline:2px solid var(--seal);outline-offset:2px}

.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:18px 0 6px}
@media(max-width:980px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:11px 14px 9px}
.kpi .l{font:500 10px/1 var(--sans);letter-spacing:.18em;color:var(--ink-3)}
.kpi .v{font:400 28px/1.15 var(--serif);margin-top:5px}
.kpi .v small{font:400 14px var(--serif);color:var(--ink-2)}
.kpi .d{font-size:11px;color:var(--ink-2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kpi.accent{border-top:2px solid var(--seal)}
.galert{margin:14px 0 0;border:1px solid var(--seal);background:var(--seal-soft);border-radius:2px;
  padding:10px 14px;font-size:13px}
.galert b{color:var(--seal)}
.galert span{display:block;font-size:12px;color:var(--ink-2)}

section.top-sec{margin-top:34px}
.sec-h{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid var(--rule-2);padding-bottom:8px;margin-bottom:16px}
.sec-h .no{font:500 12px/1 var(--mono);color:var(--seal)}
.sec-h h2{font:400 20px/1.2 var(--serif);letter-spacing:.05em}
.sec-h .note{margin-left:auto;font-size:12px;color:var(--ink-3)}

/* 01 cut rhythm strip */
.rhythm{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:16px 20px 10px}
.rrow{display:grid;grid-template-columns:44px minmax(0,1fr) 150px;gap:12px;align-items:center;padding:5px 0}
.rep{font:500 12px/1 var(--mono);color:var(--ink-2)}
.rtrack{display:flex;height:22px;border:1px solid var(--rule);border-radius:2px;overflow:hidden;background:var(--paper)}
.rseg{display:flex;border-right:2px solid var(--ink-2)}
.rseg:last-child{border-right:0}
.seg{display:block;border-right:1px solid var(--panel)}
.rseg .seg:last-child{border-right:0}
.seg:hover{outline:2px solid var(--ink);outline-offset:-2px}
.rval{font:500 12px/1.5 var(--sans);color:var(--ink-2)}
.legend{display:flex;gap:16px;font-size:12px;color:var(--ink-2);margin:8px 0 2px;flex-wrap:wrap}
.legend i{font-style:normal;display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px}

/* 02 segment cards */
.ep{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:18px 22px;margin-bottom:16px}
.ep-h{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--rule-2);padding-bottom:10px;margin-bottom:14px}
.ep-n{font:400 22px/1 var(--serif);letter-spacing:.04em;color:var(--seal)}
.ep-est{font-size:12.5px;color:var(--ink-2)}
.shots{position:relative}
.shots.clip{max-height:760px;overflow:hidden}
.shots.clip::after{content:'';position:absolute;left:0;right:0;bottom:0;height:80px;
  background:linear-gradient(180deg,transparent,var(--panel));pointer-events:none}
.shmore{display:block;width:100%;margin-top:8px;font:500 11.5px/1 var(--sans);letter-spacing:.06em;
  color:var(--ink-2);background:var(--paper);border:1px solid var(--rule-2);border-radius:2px;
  padding:7px 0;cursor:pointer;transition:.15s}
.shmore:hover{border-color:var(--seal);color:var(--seal)}
.shmore:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.seggrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
@media(max-width:1100px){.seggrid{grid-template-columns:minmax(0,1fr)}}
.segcard{background:var(--paper);border:1px solid var(--rule);border-radius:2px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.seg-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.seg-h b{font:500 14px/1 var(--mono);color:var(--seal)}
.sec-badge{font:500 11px/1 var(--mono);border:1px solid var(--seal);color:var(--seal);border-radius:99px;padding:2px 8px}
.beatsref{margin-left:auto;font-size:10.5px;color:var(--ink-3)}
.cand{border:1px solid var(--rule-2);background:var(--side);padding:9px;display:grid;gap:7px}
.cand-h{display:flex;align-items:center;justify-content:space-between;gap:10px}
.cand-h div{display:grid;gap:3px}.cand-h b{font:600 11px/1 var(--sans);color:var(--seal)}.cand-h small{font:400 10px/1.4 var(--sans);color:var(--ink-3)}
.cand-clear{border:1px solid var(--rule-2);background:var(--paper);color:var(--ink-2);font:500 10px/1 var(--sans);padding:5px 7px;cursor:pointer}
.cand-media{position:relative;aspect-ratio:16/9;background:var(--paper);overflow:hidden}.cand-media>img{width:100%;height:100%;display:block;object-fit:cover}
.cand-cells{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)}
.cand-cells button{position:relative;border:1px solid rgba(255,255,255,.52);background:transparent;cursor:pointer;color:#fff;text-shadow:0 1px 3px #000}
.cand-cells button:hover{background:rgba(138,51,36,.14)}.cand-cells button.on{background:rgba(138,51,36,.24);box-shadow:inset 0 0 0 3px var(--seal)}
.cand-cells span{position:absolute;left:5px;top:5px;font:700 10px/1 var(--mono);background:rgba(0,0,0,.58);padding:3px 4px;border-radius:2px}
.cand-cells em{position:absolute;right:6px;top:5px;min-width:20px;height:20px;border-radius:50%;background:var(--seal);font:700 11px/20px var(--mono);font-style:normal;text-align:center;display:none}.cand-cells button.on em{display:block}
.cand-ph{height:100%;padding:10px;display:flex;flex-direction:column;gap:6px}.cand-ph b{font:600 11px/1 var(--sans);color:var(--ink-3)}.cand-ph pre{margin:0;overflow:auto;white-space:pre-wrap;font:400 9px/1.45 var(--mono);color:var(--ink-2)}
.frame{width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--rule-2);border-radius:2px;
  cursor:zoom-in;display:block;background:var(--side)}
.frame.ph{display:flex;flex-direction:column;gap:6px;padding:10px 12px;cursor:default;overflow:hidden}
.frame.ph b{font:500 10px/1 var(--sans);letter-spacing:.14em;color:var(--ink-3)}
.frame.ph span{font:400 10.5px/1.55 var(--mono);color:var(--ink-2);overflow:hidden;display:-webkit-box;
  -webkit-line-clamp:5;-webkit-box-orient:vertical}
.subs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.fquad{display:grid;grid-template-columns:1fr;gap:10px;margin:10px 0}
.fquad .frame.ph{aspect-ratio:auto}
.fquad .fcell{margin:0;min-height:0}
.fcell-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.fcell-h .copy.mini{margin:0;flex:none}
.frame.ph .fprompt{font:400 10.5px/1.4 var(--mono);color:var(--ink-2);white-space:pre-wrap;word-break:break-word;display:block;
  -webkit-line-clamp:none;-webkit-box-orient:vertical;overflow:visible}
.subf{width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--rule-2);border-radius:2px;
  cursor:zoom-in;display:block;background:var(--side)}
.subf.ph{display:flex;align-items:center;justify-content:center;cursor:default;
  font:500 10px/1 var(--sans);color:var(--ink-3);letter-spacing:.08em}
.duo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;border-top:1px solid var(--rule);padding-top:4px}
@media(max-width:900px){.duo{grid-template-columns:minmax(0,1fr)}}
.ppanel{border:1px solid var(--rule);border-radius:2px;background:var(--panel);margin-top:7px}
.pp-h{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--rule)}
.pp-h b{font:500 11px/1 var(--sans);letter-spacing:.08em;color:var(--ink-2);margin-right:auto}
.pp{display:none;margin:0;padding:9px 12px;font:400 12px/1.8 var(--sans);color:var(--ink);
  white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:var(--rule-2) transparent}
.pp.on{display:block}
.pp::-webkit-scrollbar{width:6px}
.pp::-webkit-scrollbar-thumb{background:var(--rule-2);border-radius:3px}
.cuts{margin:0;padding:0;list-style:none}
.cut{padding:7px 0;border-bottom:1px solid var(--rule)}
.cut:first-child{padding-top:11px}
.cut:last-child{border-bottom:0}
.cut-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.cut-h b{font:500 12px/1 var(--mono);color:var(--seal)}
.cut-t{font:500 10.5px/1.6 var(--mono);color:var(--ink-3)}
.cut-sc{font-size:11.5px;color:var(--ink-2)}
.cplan{margin:6px 0 0;padding:7px 9px;border-left:2px solid var(--rule-2);background:var(--paper);font:400 10.5px/1.55 var(--mono);color:var(--ink-2)}
.cplan b{margin-right:7px;color:var(--ink);font-family:var(--sans)}
.fplan{margin:6px 0 0;padding:7px 9px;border-left:2px solid var(--seal-2);background:var(--side);font:400 10.5px/1.55 var(--mono);color:var(--ink-2)}
.fplan b{margin-right:7px;color:var(--seal);font-family:var(--sans)}
.cut-rc{font:400 10.5px/1.6 var(--mono);border:1px dashed var(--rule-2);border-radius:2px;padding:0 6px;color:var(--ink-2)}
.cut-rc sup{color:var(--seal-2);font-weight:700;cursor:help;margin-left:2px}
.cut-h .copy{margin-left:auto;opacity:0;transition:.15s}
.cut:hover .copy{opacity:1}
.cut p{margin:3px 0 0;font-size:12px;line-height:1.6}
.sact{color:var(--ink-2)}
.sline{font-family:var(--serif)}
.sline b{font-weight:500;margin-right:6px;color:var(--seal)}
.chip{font:400 10.5px/1.6 var(--mono);border:1px solid var(--rule-2);border-radius:2px;
  padding:0 6px;background:var(--panel);color:var(--ink-2);text-decoration:none}
.chip.lite{border-color:var(--seal-2);color:var(--seal-2)}
.chip.prop{border-color:var(--seal);color:var(--seal)}
.chip.mono{font-family:var(--mono)}
a.chip:hover{border-color:var(--seal);color:var(--seal)}
.prompts{display:flex;gap:6px}
.seg-note{margin:0;font-size:11px;color:var(--ink-3)}

/* 03 generation batches */
.batches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
@media(max-width:1100px){.batches{grid-template-columns:minmax(0,1fr)}}
.batch{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:14px 18px}
.bimg{width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--rule-2);border-radius:2px;
  cursor:zoom-in;display:block;margin-bottom:10px}
.batch-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.batch-h b{font:500 13px var(--serif);letter-spacing:.06em}
.batch-shots{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.batch-need{margin:8px 0 0;font-size:12px;color:var(--ink-2)}

/* 04 audio alignment */
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);font-size:13px}
th,td{padding:8px 12px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
th{font:500 11px/1 var(--sans);letter-spacing:.1em;color:var(--ink-3);background:var(--side)}
tr:last-child td{border-bottom:0}
td:first-child{font-family:var(--mono);font-size:12px;white-space:nowrap}
td a{color:var(--seal);text-decoration:none}
td.serif{font-family:var(--serif)}

.copy{flex:none;font:500 11px/1 var(--sans);color:var(--ink-2);background:var(--panel);
  border:1px solid var(--rule-2);border-radius:2px;padding:5px 10px;cursor:pointer;transition:.15s}
.copy:hover{border-color:var(--seal);color:var(--seal)}
.copy:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.copy[data-done]{border-color:var(--seal);color:var(--seal)}
.copy.mini{padding:3px 7px;font-size:10px}
.copy.h3{border-color:var(--seal-2);color:var(--seal-2);width:100%}
.copy.h3:hover,.copy.h3[data-done]{border-color:var(--seal);color:var(--seal)}

.gate{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:2px 28px}
@media(max-width:900px){.gate{grid-template-columns:1fr}}
.gate li{display:flex;gap:8px;padding:5px 0;font-size:12.5px;line-height:1.55}
.gate .m{flex:none;font-weight:700}
.gate li.ok .m{color:var(--ok)}
.gate li.bad .m{color:var(--seal)}
.gate li.bad{background:var(--seal-soft);border-radius:2px;padding-left:6px}
.gate small{display:block;color:var(--ink-3)}
.gsum{margin:10px 0 0;font-size:12px;color:var(--ink-2)}
.gsum b{color:var(--seal)}

.lightbox{position:fixed;inset:0;background:rgba(20,22,24,.88);display:none;align-items:center;
  justify-content:center;z-index:9;cursor:zoom-out;padding:32px}
.lightbox.on{display:flex}
.lightbox img{max-width:96%;max-height:96%;border:1px solid #555;border-radius:2px}

.foot{margin-top:40px;font-size:11px;color:var(--ink-3);border-top:1px solid var(--rule);padding-top:14px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{
  .expo,.sel-expo,.copy,.shmore,.cand-clear{display:none!important}
  .pp{max-height:none;overflow:visible}
  .duo{grid-template-columns:minmax(0,1fr)}
  .shots.clip{max-height:none}
  .shots.clip::after{display:none}
  .seggrid,.batches{grid-template-columns:minmax(0,1fr)}
  .page{max-width:none;padding:0}
  section.top-sec,.segcard,.batch{page-break-inside:avoid}
  body{background:#fff}
}
</style></head><body>
<div class="page">

<header class="hd">
  <h1>${esc(board.source)}</h1>
  <span class="sub">${esc(t.kicker)} · ${esc(t.epRange(eps[0]?.ep, eps[eps.length - 1]?.ep))}</span>
  <span class="right">
    <span class="gatepill ${failed.length ? 'fail' : 'pass'}">${failed.length ? '✗' : '✓'} ${esc(t.gatePill(gates.length - failed.length, gates.length))}</span>
    ${board?.candidateMode === CANDIDATE_MODE ? `<button class="sel-expo" data-name="${esc(slug(board.source))}-selection.json">${esc(t.exportSelection)}</button>` : ''}
    <button class="expo" data-name="${esc(slug(board.source))}-storyboard.json">${esc(t.exportJson)}</button>
  </span>
</header>

<div class="kpis">
  <div class="kpi accent"><div class="l">${esc(t.kpi.segments)}</div><div class="v">${stats.totals.segments} <small>${esc(t.unitSeg)}</small></div><div class="d">${esc(t.kpi.segmentsSub(params.maxSegmentSeconds))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.cuts)}</div><div class="v">${stats.totals.cuts} <small>${esc(t.unitCut)}</small></div><div class="d">${esc(t.kpi.cutsSub(stats.totals.avgCutSeconds))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.time)}</div><div class="v">${esc(fmtMin(stats.totals.seconds))}</div><div class="d">${esc(t.kpi.timeSub(fmtMin(stats.totals.targetSeconds)))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.batches)}</div><div class="v">${stats.batches.length}</div><div class="d">${esc(t.kpi.batchesSub)}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.lines)}</div><div class="v">${stats.totals.withLines} <small>${esc(t.unitSeg)}</small></div><div class="d">${esc(t.kpi.linesSub)}</div></div>
</div>
${failed.length ? `<div class="galert"><b>✗ ${esc(t.gatesFail(failed.length))}</b>${failed.map((g) => `<span>${esc(gateText(g, t.langCode).label)}${g.detail ? ` — ${esc(gateText(g, t.langCode).detail)}` : ''}</span>`).join('')}</div>` : ''}

<section class="top-sec" id="sec-rhythm">
  <div class="sec-h"><span class="no">01</span><h2>${esc(t.secRhythm)}</h2><span class="note">${esc(t.rhythmNote)}</span></div>
  <div class="rhythm">
    <div class="legend">${rhythmLegend}</div>
${rhythmRows}
  </div>
</section>

<section class="top-sec" id="sec-segments">
  <div class="sec-h"><span class="no">02</span><h2>${esc(t.secSegments)}</h2><span class="note">${esc(t.segmentsNote)}</span></div>
${epBlocks}
</section>

<section class="top-sec" id="sec-batches">
  <div class="sec-h"><span class="no">03</span><h2>${esc(t.secBatches)}</h2><span class="note">${esc(t.batchesNote)}</span></div>
  <div class="batches">
${batchCards}
  </div>
</section>

<section class="top-sec" id="sec-dialogue">
  <div class="sec-h"><span class="no">04</span><h2>${esc(t.secDialogue)}</h2><span class="note">${esc(t.dialogueNote)}</span></div>
  <table><thead><tr>${t.dialogueCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>
${dlgRows}
  </tbody></table>
</section>

<section class="top-sec" id="sec-gates">
  <div class="sec-h"><span class="no">05</span><h2>${esc(t.secGates)}</h2></div>
  ${gateList}
  <p class="gsum">${failed.length ? `<b>${esc(t.gatesFail(failed.length))}</b>` : esc(t.gatesPass)}</p>
</section>

<p class="foot">${esc(t.colophon)}</p>
</div>

<div class="lightbox" id="lightbox"><img alt=""></div>

<script type="application/json" id="storyboard-data">${embedDoc(board)}</script>
<script>
const L = ${JSON.stringify({ copied: t.copied, failed: t.copyFailed, show: t.showSegs, hide: t.hideSegs })};

// 分集分镜表：段卡区默认最多 760px。不超高的集直接放开；超高的集点开/收起
document.querySelectorAll('.shmore').forEach((btn) => {
  const zone = btn.previousElementSibling;
  if (zone.scrollHeight <= 780) {
    zone.classList.remove('clip');
    btn.remove();
    return;
  }
  btn.addEventListener('click', () => {
    const clipped = zone.classList.toggle('clip');
    btn.textContent = clipped ? L.show : L.hide;
    if (clipped) zone.closest('.ep').scrollIntoView({ block: 'nearest' });
  });
});

// 点图放大（主分镜图 / 子分镜图 / 批次场景图）
const lb = document.getElementById('lightbox');
document.addEventListener('click', (e) => {
  const img = e.target.closest('img.frame, img.subf, img.bimg, .cand-media>img');
  if (img) {
    lb.querySelector('img').src = img.src;
    lb.classList.add('on');
    return;
  }
  if (e.target.closest('#lightbox')) lb.classList.remove('on');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lb.classList.remove('on');
});

// 复制提示词
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  e.preventDefault();
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = L.copied;
    btn.dataset.done = '1';
  } catch {
    btn.textContent = L.failed;
  }
  setTimeout(() => { btn.textContent = label; delete btn.dataset.done; }, 1600);
});

// 粗九宫格：按点击顺序记录，第一格是 start，最后一格是 end，中间是 bridge。
const candidateSelections = new Map();
function paintCandidate(cand) {
  const order = candidateSelections.get(cand.dataset.segment) || [];
  cand.querySelectorAll('[data-cell]').forEach((btn) => {
    const i = order.indexOf(btn.dataset.cell);
    btn.classList.toggle('on', i >= 0);
    btn.querySelector('em').textContent = i >= 0 ? String(i + 1) : '';
  });
}
document.querySelectorAll('.cand').forEach((cand) => {
  const initial = (cand.dataset.initial || '').split(',').filter(Boolean);
  candidateSelections.set(cand.dataset.segment, initial);
  paintCandidate(cand);
  cand.querySelectorAll('[data-cell]').forEach((btn) => btn.addEventListener('click', () => {
    const order = candidateSelections.get(cand.dataset.segment) || [];
    const i = order.indexOf(btn.dataset.cell);
    if (i >= 0) order.splice(i, 1); else order.push(btn.dataset.cell);
    candidateSelections.set(cand.dataset.segment, order);
    paintCandidate(cand);
  }));
  cand.querySelector('.cand-clear')?.addEventListener('click', () => {
    candidateSelections.set(cand.dataset.segment, []);
    paintCandidate(cand);
  });
});

document.querySelector('.sel-expo')?.addEventListener('click', (e) => {
  const selections = [...candidateSelections.entries()].map(([segment, selected]) => ({ segment, selected }));
  const payload = JSON.stringify({ mode: '${SELECTION_MODE}', selections }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: e.currentTarget.dataset.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

// 导出：报告自己带着完整的 storyboard.json，下载的是它原样
document.querySelector('.expo').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const url = URL.createObjectURL(
    new Blob([document.getElementById('storyboard-data').textContent], { type: 'application/json' }),
  );
  const a = Object.assign(document.createElement('a'), { href: url, download: btn.dataset.name });
  a.click();
  // 别立刻回收——Safari 会抢在下载读完之前撤掉 blob
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const USAGE = `novel-storyboard.mjs — novel-storyboard skill 的确定性工具（分镜）

  seed <script.json> [--eps 1-3]              从剧本预填节拍工作底稿（打印到 stdout）
  select <sb.json> <selection.json> [--out]   写回九宫格人工选择并标记对应段需要重排
  validate <sb.json> --script <script.json>   校验；有违规逐条打印并 exit 1
           [--outline] [--cast] [--art]       outline/cast 查提示词人名；art 只管显示名字
           [--shots <卡片目录>]                挂载镜头配方卡库，开 shot-recipe 门（不给就跳过）
  checkup <sb.json> --script <script.json>    只打印质量门 ✓/✗，有未过项 exit 1
          [--shots <卡片目录>]
  render <sb.json> --script <script.json>     渲染报告到 stdout（默认 --md）
         [--html|--md] [--outline] [--art]    分镜图从 ./<段号>/f<切序>.png 找
         [--lang zh|en]                       报告界面语言（默认 zh；未指定时读取 JSON 顶层 lang 字段）
         [--shots <卡片目录>]                  报告的「配方」列显示卡名并标注建议景别／运镜的偏离
  export <sb.json> --script <script.json>     导出投产包：每段一个文件夹 <段号>/prompt.md
         [--out .]                            + candidate-grid.prompt.md / selection 模板
                                              + f1.prompt.md..fN.prompt.md（完整分镜图提示词）
                                              + 分镜图 f1..fN.png + 根部 manifest.json
  stats                                       读当前目录的 .gates.jsonl，汇总哪道门最常响、
                                              哪道门从没响过（validate/checkup 会自动累积）
  slug <name>                                 剧名转安全文件名

validate 与 checkup 每次都会把门的结果追加到当前目录的 .gates.jsonl。
积累几十次之后跑 stats，就知道模型最常违反哪条规则——那条规则的措辞该改。
不想记就加 --no-log；写不进去会静默跳过，不影响校验本身。`;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function flag(rest, name, fallback = null) {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
}

/*
 * --shots 只接受卡片目录，不接受导出的 shots.json：中间产物必然会漂，
 * 卡片 .md 才是唯一来源。目录里读不到卡片就直接报错——挂了却没生效
 * 比没挂更坏。
 */
function loadShots(dir) {
  if (/\.json$/i.test(dir)) {
    throw new Error('--shots 只接受卡片目录（shot-recipes/references/cards），不接受导出的 shots.json——中间产物必然会漂');
  }
  const cards = loadRecipes(dir);
  if (!cards.size) throw new Error(`--shots ${dir} 里没读到卡片（.md）——请指向 shot-recipes/references/cards`);
  return cards;
}

function loadCtx(rest) {
  const get = (name) => {
    const path = flag(rest, name);
    return path ? readJson(path) : null;
  };
  const shots = flag(rest, '--shots');
  return {
    script: get('--script'), outline: get('--outline'), cast: get('--cast'), art: get('--art'),
    recipes: shots ? loadShots(shots) : null,
  };
}

function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === 'seed') {
    const [path] = rest;
    if (!path) throw new Error('用法：seed <script.json> [--eps 1-3]');
    const range = flag(rest, '--eps');
    let epRange = null;
    if (range) {
      const m = String(range).match(/^(\d+)-(\d+)$/) ?? String(range).match(/^(\d+)$/);
      if (!m) throw new Error('--eps 形如 3 或 1-6');
      epRange = m[2] ? [Number(m[1]), Number(m[2])] : [Number(m[1]), Number(m[1])];
    }
    console.log(JSON.stringify(seedFromScript(readJson(path), epRange), null, 2));
    return;
  }

  if (cmd === 'select') {
    const [boardPath, selectionPath] = rest;
    if (!boardPath || !selectionPath) throw new Error('用法：select <storyboard.json> <selection.json> [--out selected-storyboard.json]');
    const board = applyCandidateSelection(readJson(boardPath), readJson(selectionPath));
    const json = JSON.stringify(board, null, 2) + '\n';
    const out = flag(rest, '--out');
    if (out) {
      writeFileSync(resolve(out), json, 'utf8');
      console.log(`✓ 九宫格选择已写入 ${resolve(out)}；按 selected 重排 cuts/edgePlans 后再 validate`);
    } else {
      process.stdout.write(json);
    }
    return;
  }

  if (cmd === 'validate' || cmd === 'checkup') {
    const [path] = rest;
    if (!path) throw new Error(`用法：${cmd} <storyboard.json> --script <script.json> [--outline] [--cast]`);
    const board = readJson(path);
    const ctx = loadCtx(rest);
    if (!ctx.script) throw new Error('分镜离开剧本没有意义——必须给 --script <script.json>');
    if (!ctx.outline && !ctx.cast) console.error('⚠️ 没给 --outline / --cast，跳过提示词人名检查');

    // 门的结果追加到 .gates.jsonl——validate 与 checkup 都记，
    // 这样「跑过多少次」这个分母才是全的
    const logGates = (gates) => {
      if (rest.includes('--no-log')) return;
      try {
        const rows = gateLogEntries(gates, { doc: basename(path), at: new Date().toISOString() });
        if (rows.length) appendFileSync(GATE_LOG, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      } catch { /* 写不进去就算了，日志不能挡住主流程 */ }
    };

    if (cmd === 'checkup') {
      const gates = gateReport(board, ctx);
      logGates(gates);
      for (const g of gates) console.log(`${g.ok ? '✓' : '✗'} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
      const failedN = gates.filter((g) => !g.ok).length;
      console.log(failedN ? `\n✗ ${failedN} 项未过` : '\n✓ 全部通过');
      // 建议景别／运镜的偏离只在这里提示，不进门——配方是语汇不是法条，
      // 而且可选挂载的东西一旦变严就没人挂了
      if (ctx.recipes) {
        const drifted = [];
        for (const ep of board?.episodes ?? []) {
          for (const seg of ep?.segments ?? []) {
            (seg?.cuts ?? []).forEach((cut, ci) => {
              const card = typeof cut?.recipe === 'string' ? ctx.recipes.get(cut.recipe) : null;
              if (!card) return;
              const d = recipeDrift(cut, card);
              if (d.sizes.length || d.cameras.length) {
                drifted.push(`  ${seg.id}#${ci + 1}「${card.name}」${I18N.zh.recipeDrift(d.sizes, d.cameras)}`);
              }
            });
          }
        }
        if (drifted.length) console.error(`\n${I18N.zh.recipeHint(drifted.length)}\n${drifted.join('\n')}`);
      }
      if (failedN) process.exit(1);
      return;
    }

    logGates(gateReport(board, ctx));
    const problems = validateStoryboard(board, ctx);
    if (problems.length) {
      console.error(`✗ ${problems.length} 处违规：\n`);
      for (const x of problems) console.error('  ' + x);
      process.exit(1);
    }
    const st = computeStats(board, ctx.script);
    console.log(`✓ ${st.episodes.length} 集 / ${st.totals.segments} 段 / ${st.totals.cuts} 个分镜全部通过校验（共 ${st.totals.seconds}s / 目标 ${st.totals.targetSeconds}s / ${st.batches.length} 个生成批次）`);
    return;
  }

  if (cmd === 'render') {
    const [path] = rest;
    if (!path) throw new Error('用法：render <storyboard.json> --script <script.json> [--html|--md] [--lang zh|en] [--outline] [--art]');
    const board = readJson(path);
    const ctx = loadCtx(rest);
    if (!ctx.script) throw new Error('分镜离开剧本没有意义——必须给 --script <script.json>');
    // 界面语言：--lang > JSON 顶层 lang 字段 > 'zh'（后两级在渲染器里兜底）
    const langFlag = flag(rest, '--lang');
    if (langFlag) ctx.lang = langFlag;
    ctx.imageExists = (rel) => existsSync(resolve(rel));
    process.stdout.write((rest.includes('--html') ? renderHtml(board, ctx) : renderMarkdown(board, ctx)) + '\n');
    return;
  }

  if (cmd === 'export') {
    const [path] = rest;
    if (!path) throw new Error('用法：export <storyboard.json> --script <script.json> [--out h3]');
    const board = readJson(path);
    const ctx = loadCtx(rest);
    if (!ctx.script) throw new Error('分镜离开剧本没有意义——必须给 --script <script.json>');
    const dir = flag(rest, '--out', '.');
    const pack = exportPack(board, ctx.script, { imageExists: (rel) => existsSync(resolve(rel)), dir });
    for (const f of pack.files) {
      mkdirSync(resolve(f.path, '..'), { recursive: true });
      writeFileSync(resolve(f.path), f.content, 'utf8');
    }
    const segN = pack.manifest.length;
    console.log(`✓ ${segN} 段投产包 → ${resolve(dir)}/（每段：分镜图 + 完整分镜图提示词 + H3 prompt.md；根部 manifest.json）`);
    if (pack.missingTotal) console.log(`⚠️ 缺 ${pack.missingTotal} 张分镜图，已在 manifest 的 missing 里标注——喂 H3 前先补齐`);
    return;
  }

  if (cmd === 'stats') {
    let entries = [];
    try {
      entries = readFileSync(GATE_LOG, 'utf8').split('\n').filter(Boolean).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch {
      console.log(`还没有 ${GATE_LOG}——先在这个目录里跑几次 validate 或 checkup，门的失败会累积到这里。`);
      return;
    }
    const allGates = gateReport({ episodes: [] }, {}).map((g) => g.id);
    const s = summarizeGateLog(entries, allGates);
    console.log(`跑过 ${s.runs} 次，其中 ${s.cleanRuns} 次全过 · 累计 ${s.fails} 条失败\n`);
    if (s.ranked.length) {
      console.log('最常响的门（那条规则模型最常无视，措辞该改）：');
      for (const r of s.ranked) {
        console.log(`  ${String(r.count).padStart(3)} 次  ${r.gate.padEnd(16)} ${r.label}`);
        for (const x of r.samples) console.log(`         ${x.length > 90 ? x.slice(0, 90) + '…' : x}`);
      }
      console.log();
    }
    if (s.silent.length) {
      console.log(`从没响过的门（${s.silent.length} / ${allGates.length}）——可能是死门，也可能规则已经被模型内化：`);
      console.log('  ' + s.silent.join(' / '));
    }
    return;
  }

  if (cmd === 'slug') {
    if (!rest[0]) throw new Error('用法：slug <name>');
    console.log(slug(rest[0]));
    return;
  }

  throw new Error(`未知命令 ${cmd}\n\n${USAGE}`);
}

// 软链安装时 argv[1] 是链接路径，两边都取 realpath 才能比得上
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // `render ... | head` 这类管道提前关闭时安静退出，别甩 EPIPE 堆栈
  process.stdout.on('error', (e) => {
    if (e.code === 'EPIPE') process.exit(0);
    throw e;
  });
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
