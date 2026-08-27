[中文](README.md) · **English**

# novel-characters

Feed it a novel or a short story, and get a complete design bible for every character:

- **Cast list** — who appears, how central they are, with every name a character is called by folded into one person
- **Profile** — gender, age, standing, appearance, temperament, motivation, arc, relationships, each backed by **verbatim quotes from the source**
- **Design prompts** — semi-realistic painterly direction, bilingual image prompt + negative prompt + style tags, ready for Midjourney / SD / GPT-Image
- **Ensemble visual identity** — build a design matrix first, then assign 1–5 signature anchors by importance; leads remain identifiable at silhouette, medium and close range while major characters contrast deliberately
- **Voice prompts** — timbre, pitch, pace, accent, emotion, plus a voice-design prompt for Qwen3-TTS / ElevenLabs Voice Design
- **A character model sheet** — **one per character**: a 16:9 image in three zones: an ID-photo-style bust on the left (~34%, the reference for the face design), a full-body turnaround top-right, and a strip of key-detail close-ups bottom-right. White background for clean cut-out, generated through codex's built-in image tool (optional)
- **Cinematic live-action screen test** — a separate single-frame casting/wardrobe photograph for storyboard reference, so the white technical turnaround does not leak catalogue or animated-concept styling downstream
- **Relationship map** — a whole-cast view inside the report: who is tied to whom, and how. Hover a character to light up every link they are part of, click to jump to their profile

Outputs `cast.json`, a Markdown report, and a self-contained `report.html` you can just double-click.

**Any output language**, Chinese by default:

```
/novel-characters ./book.txt --lang en
/novel-characters ./book.txt --lang ja
```

Chinese, English and Japanese UI strings ship built in. **Other languages work too** — the skill translates the UI labels on the fly into the target language and stores them in `cast.json` under `ui`, so French, Korean or Spanish reports come out fully localized rather than half-English.

![report.html](assets/report.webp)

A character model sheet (Shen Zhiwei, from the bundled sample story):

![model sheet](assets/sheet.jpg)

## Upstream

In the pipeline the **outline sits upstream of the character bible**:

```
novel-outline    → outline.json (what: structure & episodes, who is in)
novel-characters → cast.json    (who: character assets)
```

If you have an `outline.json`, start with `seed` — its `characters` block already settles the roster:

```bash
node scripts/novel-characters.mjs seed outline.json > seed.json
```

What comes across is what the outline already decided (character id, name, tier, arc, merged source roles); what is left blank is this layer's work (aliases, profile, visualIdentity, design and voice prompts). New seeds enable `designMode: "ensemble-signature"`.

**Do not overturn the outline's tiers here**; if a tier looks wrong, go fix the outline. Splitting *within* the lead group is fine — `lead` covers leads plus the main antagonist, so `seed` assigns protagonist to all of them and you demote the non-leads to major using the `role` recorded in `seedNote`.

**It runs fine without one** — this skill does not depend on it. Skip `seed`, feed it a raw novel, and it builds the roster from the text itself.

## Use

For installation see the [repository README](../../README.en.md). Then:

```
/novel-characters ./your-novel.txt
```

Or just say "break this book down into characters" and give it the path.

### Report language

Chinese by default. Use `--lang`, or just ask in words:

```
/novel-characters ./book.txt --lang en
/novel-characters ./book.txt --lang ja
```

Chinese, English and Japanese UI strings ship built in. **Any other language works too** — the skill translates the UI labels into the target language on the fly and stores them in `cast.json` under `ui`, so French, Korean or Spanish reports come out fully localized rather than half-English.

Two things never follow the language: **image and TTS prompts stay English** (those engines work best that way), and **source quotes stay in the original language** (translate them and they stop being evidence).

### Image style

`realistic` by default (semi-realistic painterly). For an animation look:

```
/novel-characters ./book.txt --style ghibli
```

| id | What it is |
| --- | --- |
| `realistic` | Semi-realistic painterly — skin with pores and texture, fabric with weave and wear. Default |
| `cinematic` | Cinematic photorealism — natural skin, feature-film portrait lighting, physically grounded wardrobe and restrained filmic colour |
| `naturalistic` | Naturalistic reality — ordinary people and clothes, real environments, available light, neutral colour and minimal styling |
| `ghibli` | Ghibli-like hand-painted cel — even ink linework, a single soft shadow tone, flat colour |
| `inkwash` | Chinese ink-wash — xuan-paper negative space, calligraphic linework and restrained mineral-colour accents |

They combine: `--lang ja --style ghibli`.

```bash
node scripts/novel-characters.mjs styles          # list all presets
node scripts/novel-characters.mjs styles ghibli   # dump one in full
```

**Switching style swaps the whole set**, not just one line — each preset carries its own rendering clause, surface treatment, lighting, negative prompt and tags. See [`references/style-presets.md`](references/style-presets.md).

## What the report looks like

A three-column workbench: search on top, synopsis plus a prominence-ordered cast list on the left, one character at a time in the main area.

The **relationship map** sits at the top of the left rail and takes over the main area. Its edges come straight from each character's `relationships` — no extra model pass:

- Edges resolve by **name *and* alias**, so a relationship written as "老伯" still lands on 老周's node
- Two one-directional accounts of the same pair collapse into one edge, keeping both wordings
- Each chord carries a short label (6 characters, full text in the tooltip and the side list). Labels get noisy on a large cast, so they are on by default up to 14 edges and off above that, with a toggle in the header
- Hover a character to light up every link they are part of, hover a row to isolate one link, click either to open that character

The circular layout is computed in Node and written straight into inline SVG — **no libraries**, so report.html stays a single file you can open offline.

### Export JSON

The **Export JSON** button in the top bar downloads exactly the `cast.json` shape — not some separate export format:

```json
{ "source": "…", "lang": "zh", "style": "realistic", "summary": "…", "characters": [ … ] }
```

So an external tool can edit it and **feed it straight back into `render`**, and it still passes `validate`. Each character keeps its `sheetImage` path (`images/<slug>-sheet.png`), so you know which sheet belongs to whom.

The data is embedded as `<script type="application/json">`; exporting just wraps it in a Blob and downloads it — **no network request**.

## How it works

Feeding a long text into one context window loses characters, so it runs in two passes:

**Pass 1 — scan** (cheap model)
The text is split on paragraph boundaries into overlapping 40k-character chunks. Each chunk is scanned in parallel for character names, aliases, concrete description, and verbatim quotes. The overlap is what keeps a character introduced right at a chunk seam visible to both sides.

**Merge**
Names and aliases are indexed together, so different forms of address across chunks converge onto one person. Where exact matching cannot reach (「陆」 and 「陆行远」 share no key), the script lists containment-based `mergeCandidates` for the model to review; confirmed merges are applied deterministically from a merges.json. Characters are ranked by how many chunks mention them — that ranking is the proxy for screen time.

**Ensemble design pass**
Create `design-matrix.json` first: 4–5 anchors for a protagonist, 3–4 for major, 2–3 for supporting and 1–2 for minor. Important characters state at least two visual axes on which they contrast. Assemble injects the matrix by id or name.

**Pass 2 — profile**
Each worker receives the complete design matrix, not merely sibling names, so it knows which silhouette, facial, costume, gesture and prop spaces are already occupied.

**Validate** (never skipped)
Four hard rules, all checked deterministically by a script rather than trusted to the model:

| Rule | Why |
| --- | --- |
| `evidence` must be a **verbatim, contiguous** span of the source | Stops invention. Dialogue split by a narration beat may not be stitched back together |
| Image prompts must **not contain character names** | Image models bias hard on names and will draw the character they remember instead of yours |
| **Language split** per field | Human-readable fields follow `--lang`, image and TTS prompts are always English — the model drifts otherwise |
| **Style matches its negative prompt** | `realistic` / `cinematic` / `naturalistic` must not ban photorealistic; animation/ink styles must |
| **Importance-driven identity budget** | protagonist 4–5, major 3–4, supporting 2–3, minor 1–2; leads cover all three recognition distances |
| **Signature anchors land in production prompts** | every anchor appears verbatim in image.prompt and image.sheet; important roles need contrastAgainst and cross-character anchor collisions fail |
| Structure and enums | `importance` is one of exactly four values |

None of these were written up front. Each one exists because real model output violated it and the validator caught it.

## Use the scripts directly

The helpers run fine without an agent — only the two model passes need one:

```bash
node scripts/novel-characters.mjs seed outline.json              # seed the roster from an outline, if you have one
node scripts/novel-characters.mjs chunk book.txt /tmp/wk        # split
node scripts/novel-characters.mjs merge /tmp/wk                 # merge roster-*.json, with merge candidates
node scripts/novel-characters.mjs merge /tmp/wk --apply m.json   # apply reviewed merges
node scripts/novel-characters.mjs assemble /tmp/wk --source Book # combine card-*.json into cast.json, prominence-ordered
node scripts/novel-characters.mjs validate cast.json book.txt   # validate
node scripts/novel-characters.mjs render cast.json --html       # build report.html
node scripts/novel-characters.mjs slug "胡二爷"                  # filesystem-safe name
```

## Limits

- Caps at 24 chunks (~930k characters net of overlap) per run. Beyond that it reports `truncated` explicitly — it does **not** silently drop the tail
- Human-readable fields follow `--lang`; image and TTS prompts are **always English**, since those engines work best that way regardless of report language
- Protagonist / major roles generate 2–3 identity candidates, lock one as `identity.png`, then expand that identity into the sheet; supporting / minor usually go straight to sheet
- Prefer a separate render-material reference for cast-wide style. If another character sheet is used, explicitly forbid copying face, body, hair, costume silhouette, palette or accessories

> ⚠️ **If you have more than one codex installed, mind the version.** An older one fails outright with `requires a newer version of Codex` instead of degrading. The skill probes for the highest version it can find; if yours is simply old, run `npm i -g @openai/codex`.

## Files

```
SKILL.md                 the workflow the agent reads
scripts/
  novel-characters.mjs   chunk / merge / assemble / validate / identity-prompt / screen-test-prompt / render / slug
  selftest.mjs           408 assertions, never calls a model
references/
  roster-pass.md         pass 1: scanning for characters
  profile-pass.md        pass 2: building a character sheet (9 hard rules)
  ensemble-design.md     ensemble matrix, importance budgets and identity locking
  schema.md              sheet structure and which language each field takes
  sheet.md               the codex contract for model-sheet generation
  report-style.md        design conventions for report.html
  style-presets.md       image style presets, including naturalistic reality
```

## Self-test

```bash
node scripts/selftest.mjs
```

408 assertions across ensemble design, cinematic, naturalistic reality, screen-test prompts, signature anchors, assembly and validation. No model calls.

Full selftest verified on Windows with Node 22.19.0; Node 18 or newer is required.
