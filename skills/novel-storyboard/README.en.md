[中文](README.md) · **English**

# novel-storyboard

Storyboarding for AI short drama: turns novel-script's beat flow into a worklist you can hand straight to a video model. This is the first layer in the pipeline that talks directly to that model, and the premise is baked in: **shots are generated, so one more cut costs almost nothing** — and the short-drama attention span runs on ~3-second cuts. Hence a three-level structure:

```
segment = one video-generation call, new seeds default to 5–10s, never crosses scenes
 ├─ cuts × 3–5 = intra-segment edits, 2–5s each (hard gate), each claiming script beats
 ├─ frames    = one keyframe per cut: a pre-action entry frame pinned at 0.00s,
 │              sub-frames pinned at their own cut marks
 └─ H3 prompt = one per segment; multi-picture alignment + [Shot k] cut times audited verbatim
```

- **A dialogue's shot–reverse-shot lives inside one segment, one generation** — wide, close on A, close on B are separate 2–5s cuts, each composition controlled by its own storyboard frame instead of gambling on prose
- **The alignment instruction is derived, not written** — the multi-picture line (`Picture 2 aligns with the 3.00-second mark…`) and every `[Shot k] At 00:0X.XXX` cut time are computed from cut durations, and validate audits them **character for character**: change a duration without updating the prompt and it blocks
- **Prompts follow the official spec: English by default, one shot per line** — each shot on its own line with its cut time; dialogue, lyrics and on-screen text keep their original language per the official rules (`<d>[Chinese] …</d>` verbatim). `promptLang: 'zh'` switches the whole prompt to Chinese. The writing spec is internalized as `references/h3-prompt.md` — **this skill is self-contained and depends on no external skill**
- **Every cut carries an executable camera plan** — new seeds enable `cameraPlanMode: "cinematic-controlled"`: start position, pace/magnitude, target, focus, end composition, intent and transition are copied into that cut's own `[Shot k]`; static is the default and each cut gets one primary move
- **Final prompts carry production-level detail** — `promptDetailMode: "production-rich"` requires environment, lighting, subject, action, effects and continuity per cut, plus four-layer soundscape and scored music style/instrumentation/arc/sync per segment
- **Storyboard frames receive role-driven visual density** — `framePlanMode: "adaptive-density"` selects sparse / balanced / rich by shot function; reports and export deterministically compile the full image prompt instead of sending the thin base `frame` to the image model
- **Every segment starts from a true initial frame** — `frameEntryMode: "start-boundary"` forces f1 to show the pre-action entry state; motion begins only after 0.00s and later sub-frames may carry impact/result moments
- **One rough grid, then human shot selection** — `candidateMode: "single-grid-rough"` uses one image call per segment; the report exports click-order selection.json, selected cells are regenerated in detail, and edgePlans own their transitions
- **Strict live-action cinematic** — both rough grids and final frames require real performers, physical costumes/sets, optical lens and sensor response while rejecting illustration, concept art, anime/cel and 3D/CGI/game signals
- **Adjacent shots share one exact state boundary** — `continuityMode: "state-linked"` audits eight start/end state fields, five transition-plan bridges and continuous-segment handoffs; Shot 2 first continues the same instant before changing composition
- **Inherit the drama before designing the camera** — when the script enables state linking, every cut copies its claimed first/last beat into `sourceState.before/after`; the cross-layer gate blocks a storyboard that is internally consistent but not faithful to the script
- **Frames are asset composition, not invention** — generation feeds the scene / character / prop sheets as references; with codex installed the frames are actually generated (optional)

Outputs `storyboard.json`, a Markdown shot list, and a self-contained `storyboard-report.html`:

![storyboard-report.html](assets/report.webp)

## Twenty-three quality gates, all code

Same stance as the other four skills in this repo: **a checklist the model grades itself on is worthless.**

| Gate | Rule |
| --- | --- |
| **Full beat coverage** | every script beat claimed exactly once, in order, contiguous, cut-level |
| Segment duration | new seeds use 5–10s; legacy JSON without a minimum keeps the default 15s cap |
| **Cut duration** | every cut 2–5s — the ~3s rhythm is a **hard gate**, not advice |
| Dialogue fits | dialogue seconds of claimed beats ≤ cut seconds, per cut |
| Episode total | Σ segments within ±15% of the script's `targetSeconds` |
| On-screen cap | ≤ 3 characters per cut, more requires a breakdown note |
| Segment ID discipline | `E01-01` format, sequential — the segment ID is the asset filename |
| Size phrase | the English shot-size phrase must appear in the cut's frame prompt |
| Camera execution | the H3 camera term appears inside its own `[Shot k]`; in cinematic mode the five prompt-ready camera-plan fields, pace/magnitude and transition are audited verbatim, static/dynamic settings must agree, and conflicting moves in one cut fail |
| **H3 structure** | the alignment line is **derived from the cut structure and audited verbatim**; three fields in order; every `[Shot k]` cut time equals the running sum of prior cut durations |
| **H3 dialogue verbatim** | every claimed line appears verbatim inside a `<d>` block — one changed punctuation mark fails |
| **Prompt language consistency** | prose audited both ways against `promptLang`: Chinese drama written in English fails, English mode mixing Chinese fails |
| **Production prompt richness** | six visual-plan layers per cut, four soundscape layers per segment and four scored-music layers appear verbatim in the correct H3 fields with language-aware minimum detail; no music is explicit N/A/无 |
| **Adaptive frame density** | `framePlan` assigns sparse / balanced / rich content budgets by establishing / dialogue / reaction / action / reveal / insert / atmosphere role; structured counts, sensible role pairings and the compiled image prompt are audited deterministically |
| **Cut and segment continuity** | eight end/start state fields match across adjacent cuts; cut point, motion, light, audio and axis bridges enter the right fields; continuous segments audit state and handoff while explicit scene/time jumps may break it |
| **Style phrase** | realistic / cinematic / naturalistic / ghibli / inkwash stay name-aligned across the pipeline; naturalistic uses ordinary people, real locations, available light and observational framing |
| Frame-prompt hygiene | English-only, non-empty |
| No character names | frame prompts always; the H3 prompt only in English mode (Chinese prompts allow names — identity is anchored by the frames). Checked with `--outline` / `--cast`; skipping is **announced** |
| Reference integrity | scene index / characters / props all audited against the script scene |
| **Shot recipe** (optional mount) | only checked with `--shots <cards dir>`: a cut's `recipe` id exists in the library, every must-phrase of that card appears in the compiled image prompt, and a multi-cut recipe runs long enough. Without `--shots` the skip is **announced**; so is "no cut references a recipe" |
| **Script-state inheritance** | with a state-linked script, every cut's `sourceState.before/after` exactly matches the computed state of its first/last claimed beat |

The selftest **defeats every gate on purpose** to prove each one actually blocks.

**Shot recipes are an optional vocabulary layer.** A cut may carry an optional `recipe` — a card id from an external optional card library, **per cut, not per segment**, with **multi-cut recipes expressed as a run of consecutive cuts sharing the id** rather than an array. Without an external card library installed everything still runs: this skill is self-contained, down to its own 25-line restricted frontmatter parser instead of a cross-directory import. A card's suggested sizes and cameras are **deliberately not gated** — the report's Recipe column marks deviations with `≠` (hover for the suggestion) and `checkup` prints a note. A recipe is vocabulary, not law; make an optional mount stricter and nobody mounts it, and **a gate that blocks wrongly is worse than no gate**.

## Gate failures accumulate, and `stats` tells you which rule the model breaks most

Every `validate` and `checkup` appends the gate outcome to `.gates.jsonl` in the **current directory**. After a few dozen runs:

```bash
node scripts/novel-storyboard.mjs stats
```

It answers three questions:

| Question | What it tells you |
| --- | --- |
| **Which gate fires most** | That rule is the one the model ignores — **the wording is what needs fixing, not the model** |
| **Which gate never fires** | Either a dead gate, or a rule the model has internalised |
| **What the failure details look like** | Problems that recur without a gate of their own only surface by reading this free text |

This is the one idea worth borrowing from SkillOpt's "the skill document is trainable state": **a document is not a spec written once, it is something you iterate from feedback** — but the iteration needs evidence rather than impressions. The log only accumulates evidence; what to change stays a human call.

Pass `--no-log` to skip it. If the file cannot be written the step is skipped silently and validation is unaffected. `.gates.jsonl` is already in `.gitignore`.

## The report

A single-page, 1600px-wide review document. Reports render with a Chinese UI by default; pass `--lang en` to `render` for a fully English report (zh / en built in). This only switches the UI labels — it is independent of `promptLang`, which controls the H3 prompt language (English by default). In English mode the quality-gate labels are translated too (thresholds kept as computed); failing-gate details and all data stay as authored.

- **KPI band**: segments / cuts with average length / total vs target / generation batches / segments carrying dialogue
- **Cut rhythm strip** (the signature chart): one band per episode, **thick separators = segment boundaries (one generation each)**, slice width = cut duration share, color depth = shot size; click a slice to jump to its segment card
- **Segment cards**: the master frame in 16:9 (an honest prompt placeholder when not generated), a sub-frame strip, then a **50/50 split**: cut rows on the left (start mark · seconds · size · camera · transition · full camera plan · recipe · picture summary **auto-derived from the claimed script beats**), and an H3 prompt panel on the right — one shot per line, with one-click copy
- **Generation batch list**: segments sharing a scene + lighting state form one batch around one environment reference image
- **Audio alignment list**: every dialogue line mapped to **segment#cut** — the worklist for placing TTS audio, fully computed
- **Quality gates** panel + header badge + **Export JSON** (downloads `storyboard.json` verbatim)
- All graphics inline CSS/SVG, zero external resources, opens offline

## The relay — the pipeline closes here

```
novel-outline    → outline.json    (what: structure)
novel-characters → cast.json       (who: character sheets)
novel-art        → art.json        (where: scene & prop sheets)
novel-script     → script.json     (the drama: scenes, beats, lines)
novel-storyboard → storyboard.json (how to shoot: segments, cuts, frames, H3 prompts)
```

`seed <script.json> --eps 1-3` deterministically expands beat numbers, seconds, speakers and `delivery`; state-linked scripts also carry per-beat `stateBefore/stateAfter`, while new boards receive the 5–10s segment range. `validate --script` is mandatory; `--outline` / `--cast` enable the name ban, `--art` gets scene names and sheet thumbnails into the report.

## CLI

```bash
node scripts/novel-storyboard.mjs seed script.json --eps 1
node scripts/novel-storyboard.mjs validate sb.json --script script.json --outline outline.json --cast cast.json
node scripts/novel-storyboard.mjs checkup sb.json --script script.json
node scripts/novel-storyboard.mjs validate sb.json --script script.json --shots /path/to/cards   # optional recipe gate
node scripts/novel-storyboard.mjs render sb.json --html --script script.json --outline outline.json --art art.json > storyboard-report.html
node scripts/novel-storyboard.mjs render sb.json --html --lang en --script script.json --outline outline.json --art art.json > storyboard-report.html   # English report UI
node scripts/novel-storyboard.mjs export sb.json --script script.json   # per-segment folders: f1..fN.png + f1..fN.prompt.md + H3 prompt.md
```

## Limits

- No writing or rewriting dialogue, no design sheets, no video generation or editing
- Lip-sync is out of scope for now — that belongs to the generation pipeline
- Seconds are a **generation order, not an estimate**; tune the segment cap and cut-rhythm range in `params` per your model
- Report UI ships in Chinese (default) and English — pick with `--lang`; the prompt language is controlled separately by `promptLang` (English by default)
- Generate one representative rich, balanced and sparse frame for approval before committing — one episode is ~30–40 frames, and a wrong density strategy wastes the batch

## Selftest

```bash
node scripts/selftest.mjs
```

388 assertions — cinematic and naturalistic live action, rough grids, human selection, edge plans, entry frames and all twenty-three gates. No model calls.

The bundled `examples/渡口-storyboard.json` remains the complete legacy-compatibility fixture for rhythm, alignment and recipes. New adaptive frame structure is demonstrated in `references/frame-density.md` and exercised by the selftest fixtures.

Full selftest verified on Windows with Node 22.19.0; Node 18 or newer is required.
