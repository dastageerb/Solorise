# Dayline — Design Contract

**Read this before touching any class, colour, or size.**

> **This document was rewritten after the first version was rejected.** The v1
> language (light grey, monochrome, three columns, no colour) is gone. The current
> language is modelled on a reference the user supplied: a dense board with a
> purple accent and coloured classification chips. If an older revision of this
> file is in your context, discard it — this one is authoritative.

Companion documents: `DECISIONS.md` (why each choice was made), `SPEC.md` (data
model + storage), `README.md` (run instructions).

---

## 1. The brief

A local, offline issue board for one person, styled like a modern issue tracker.
Dense, calm, information-first. Nothing decorative.

**One screen.** The Board. There is no Today/Inbox/Done list view — those were
built and then deleted as unnecessary (`DECISIONS.md` D20). Do not add them back
without being asked.

---

## 2. Colour rules (the part that changed)

The v1 rule was "no colour anywhere except one accent". **That is no longer the
rule.** The current rule separates two kinds of information:

**Colour is allowed on classification, never on status.**

| Use | Colour allowed? |
|---|---|
| Tag / label chips (Product, Engineering, Design…) | **Yes** — six fixed hues, below |
| Avatars | Yes — from the same six hues |
| Primary action, active states, focus ring | Yes — the single purple accent |
| Lane status glyph (10px dot in a lane header) | Yes — a small status dot |
| Card status, priority, overdue, done-state | **No.** Neutral and typographic |

So a card may be colourful because of its labels, but a task being overdue,
high-priority, or finished never introduces a hue. No red overdue badge, no green
"done" chip, no coloured card edge.

### Tag hues

Six pairs of `--tag-*-bg` / `--tag-*-fg` in `globals.css`. Every hue has a
contrast ratio ≥ 4.5:1 between its background and foreground. Assign a tone in
`TAGS` (`src/lib/types.ts`); an unknown tag falls back to the neutral pair.

### Status glyphs

Four dots: backlog (hollow grey ring), in progress (filled purple), review
(filled amber), done (filled green). They appear **only** in lane headers and in
the move-to menu — never on a card.

### Everything else

- One accent: `--accent` purple, for primary buttons, active nav/tab, focus ring,
  progress fill.
- Surfaces: `--bg` → `--surface-2` (lane) → `--surface` (card). A card is
  *lighter* than the lane it sits in.
- Two shadows only: `--shadow-card` (cards) and `--shadow-overlay` (menus,
  dialogs, toasts).

---

## 3. Tokens

All tokens live in `src/app/globals.css`. **That file is the only file allowed to
contain a colour literal.**

- Surfaces; text (`--text`, `--text-muted`, `--text-faint`)
- Accent: `--accent`, `--accent-hover`, `--accent-weak`, `--focus-ring`
- Tags: `--tag-{purple,amber,green,blue,red,neutral}-{bg,fg}`
- Status: `--status-{backlog,progress,review,done}`
- Type: `--fs-11…28`, `--fw-regular|medium|semibold`
- Space: `--sp-1|2|3|4|6|8|12` (4 · 8 · 12 · 16 · 24 · 32 · 48)
- Radii: `--r-sm` 4 · `--r-md` 8 · `--r-lg` 12 · `--r-full`
- Motion: `--dur` 120ms, `--ease`
- Layout: `--rail-w` 248px, `--content-max` 1600px, `--header-h` 56px

Rules: no sizes, radii or durations outside these lists; colour only through
tokens; the dark palette in `[data-theme="dark"]` is kept correct but unused.

---

## 4. Screen anatomy (Board)

```
rail 248px  │  top bar 56px: breadcrumb · save state · search · presence
            │  page header: eyebrow · H1 + count · subtitle · [New issue]
            │  overview bar: OPEN count │ progress ── done count · date
            │  tabs: Board N issues ──────── [Label ▾] [Assignee ▾]
            │  four lanes: Backlog · In progress · Review · Done
```

| Element | Rule |
|---|---|
| Rail | Brand, workspace switcher, project list, team list, then `New issue` / `Commands` / `Saved on this device` pinned to the bottom. Hidden below 1024px. |
| Top bar | 56px, bottom border. Breadcrumb left; "All changes saved locally" with a green dot; 300px search with a `⌘K` chip; overlapping avatar stack right. |
| Page title | 28px/600, tight leading, with a small bordered count chip beside it. The eyebrow above is 11px uppercase with a purple dot. |
| Overview bar | One bordered surface: label + `n issues in motion` + a 4px progress bar + `n completed` + date pushed right. |
| Lanes | Equal width (`flex: 1 1 0`, 268–400px) **and equal height**. Lanes occupy exactly `calc(100vh - 342px)` so the board fits the window with a 16px gutter and the **page never scrolls** — only lane bodies do. The subtrahend is measured, not guessed: run `node scripts/measure-lane-height.mjs` if you change anything above the board. `--surface-2` fill, `--r-lg`, 1px border. Header (dot · label · count · `+`), independently scrolling body. |
| Lane scrollbars | **Hidden** (`scrollbar-width: none` + `::-webkit-scrollbar`), scrolling preserved. A visible 15px gutter inside a 310px lane made cards in different lanes stop lining up. Because the affordance is gone, a partly-visible card at the lane's lower edge is the only cue that more exists — do not remove that by rounding lane heights. |
| Cards | `--surface`, 1px border, `--r-md`, `--shadow-card`. Anatomy: key + `⋯` · title · 2-line description · tag chips · footer (checklist `n/m` · due date · avatar). |
| Editor | 860px dialog. Wide main column (title, description, checklist) + 264px metadata rail (status, priority, assignee, due, labels). |

---

## 5. Banned patterns

Unchanged from v1, except that colour is now permitted per §2.

| Banned | Instead |
|---|---|
| Gradients, anywhere | Flat token fills |
| Status/priority/overdue expressed as colour | Text, weight, and the lane header dot only |
| A shadow on anything but a card, menu, dialog or toast | Borders and surface steps |
| Emoji as icons, icon fonts, icon packages | The hand-drawn set in `icons.tsx` |
| `transition: all`, animations on hover | One duration, explicit properties |
| Marketing copy, exclamation marks, empty-state illustrations | Factual sentences, one muted line |
| Hero numbers, KPI tiles, chart widgets | The single overview bar |
| More than six tag hues | Extend `TAGS`, reuse the six pairs |

---

## 6. Accessibility floor

- Visible focus everywhere: 2px `--focus-ring`, 2px offset. Never `outline: none`.
- Body text ≥ 7:1, muted ≥ 4.5:1, tag foreground on tag background ≥ 4.5:1.
- Status and priority are never colour-only (§2 guarantees this).
- Every icon-only control has an `aria-label`; every input has a real `<label>`.
- Dialogs use `<dialog>` + `showModal()`, trap focus, restore it on close.
- `prefers-reduced-motion: reduce` disables all transitions.
- Lanes stack below 1024px; the rail is hidden rather than collapsed.

---

## 7. Verification checklist

- [ ] `grep -ri gradient src/` returns comments only.
- [ ] No colour literal outside `globals.css`.
- [ ] `npx tsc --noEmit` and `npm run build` clean.
- [ ] `node scripts/visual-check.mjs` — screenshot review is **mandatory**. A green
      build proves nothing: it hid a missing stylesheet, a silently-undefined CSS
      Module class, and mojibake inside string literals (`DECISIONS.md` D14).
- [ ] Lanes are equal width and equal height; each lane header matches its body width.
- [ ] Overdue, done and P1 cards are visually quiet — no hue comes from status.
- [ ] Read the copy aloud. If a line sounds like marketing, rewrite it.

### Colour audit

```powershell
node scripts/visual-check.mjs   # prints every colour, shadow and radius in use
```

Expected: the token palette only. Any colour not traceable to a token in
`globals.css` is a defect.

---

## 8. Handoff

**Design-owned files — do not edit for storage reasons:**

```
src/app/globals.css          tokens + all shared components
src/app/layout.tsx           static light theme + providers
src/components/*.tsx         Rail, TopBar, BoardView, BoardLane, TaskCard,
                             TaskEditor, ConfirmDialog, RowMenu, Toaster, icons
src/components/*.module.css  per-component layout
```

**The one seam to implement:** `src/lib/taskStore.ts` exports
`createLocalStore(): TaskStore` with exactly three methods:

```ts
interface TaskStore {
  list(): Promise<Task[]>;
  upsert(task: Task): Promise<void>;
  remove(id: string): Promise<void>;
}
```

Replace that factory with an IndexedDB implementation (`SPEC.md` §4) and delete
the localStorage fallback. `BoardProvider` calls only those three methods, so no
component changes.

**Second seam:** `BoardProvider` owns every mutation (`moveTask`, `cycleColumn`,
`toggleChecklistItem`, `saveTask`, `removeTask`) and the undo history. Keep its
context shape identical when swapping storage.

**Auth** is unspecified and unbuilt, and the rail no longer has an account slot.
If it lands, design it to §2 and §5, or ask first.

**Do not** add a component library, CSS framework, icon package, or chart library.

---

## 9. Windows / encoding warning

Never edit these files with PowerShell `Get-Content` + `Set-Content`. PowerShell
5.1 reads UTF-8 as Windows-1252 and writes the bytes back, turning `—`, `⌘` and
`…` into mojibake **in the source** — which then ships to the browser, because the
server correctly labels the file UTF-8 (`DECISIONS.md` D21). Use the editor tools;
if you must script it, read and write with
`[System.IO.File]::ReadAllBytes` / `::WriteAllBytes`.
