# Decisions

Choices made during implementation that were not fixed by `SPEC.md` or
`DESIGN.md`. Newest last. Keep this file honest — if it is not written here, it
was not decided.

---

### D1 — Framework: Next.js 14 App Router supersedes the no-build constraint

`SPEC.md` §2 required plain files that open from `file://` with no build step. The
direct instruction was to build in Next.js, which cannot run from `file://`.

**Decision:** Next.js 14 (App Router) + TypeScript, `npm run dev`. Everything else
in §2 holds: no network calls at runtime, no CDNs, no external fonts, no
analytics, all data local. Accepted cost: an install step and a dev server.

### D2 — App Router over Pages Router

App Router is the current default and gives route segments for free. React 18
`useSyncExternalStore` covers the one piece of cross-tree state (search) without
adding a state library.

### D3 — Conventional global CSS + CSS Modules, no framework

`globals.css` holds tokens and primitives; each component owns a `*.module.css`
for layout. Rejected: Tailwind (utility soup obscures the design contract and
makes review by grep impossible), styled-components (runtime cost, no benefit
here), and a component library (would import someone else's visual language,
which is the exact failure mode `DESIGN.md` exists to prevent).

### D4 — The shell lives in the root layout

Putting `AppShell` in a page would remount the rail, dialogs and scroll position on
every navigation. The shell is in `layout.tsx` and picks the view body from
`usePathname()`. Route files therefore render `null` — they exist to make the URL
real. Cost: a one-line comment is required in each route file so nobody "fixes" it
by adding markup.

### D5 — Search state in a module store

The search field is in the persistent top bar; the results are in the routed body.
Neither can own the value. `src/lib/uiState.ts` is a 30-line store read through
`useSyncExternalStore`. Rejected: URL query param (pollutes history on every
keystroke), context in the layout (would force the routed body into the same
client tree for no gain).

Search clears when the route changes, and is never persisted.

### D6 — Storage: a `TaskStore` interface with a localStorage implementation

IndexedDB is the target (`SPEC.md` §4), but the design layer needed to run first.
`src/lib/taskStore.ts` exposes `list` / `upsert` / `remove`; the current body uses
`localStorage` with seed content. **This is a deliberate temporary seam**, not an
architecture: replacing the factory with IndexedDB must not change any component.

The seed data deliberately includes a long title, 2 tags, a note, an overdue item
and a P1 item, so the layout is judged against realistic density rather than tidy
placeholder text.

### D7 — One-level undo instead of a command log

`SPEC.md` M6 describes a 20-command undo stack. Implemented as a snapshot stack of
previous task arrays capped at 20. Simpler, and correct for a single-user local
dataset of this size. Revisit only if per-field undo is ever wanted.

### D8 — `--ring-inset` added as a second elevation token

`SPEC.md` allowed exactly one shadow. The selected row needs a 1px accent hairline;
a real border would shift content by a pixel on selection. A tokenized inset ring
is the honest fix. It is used in exactly one place.

### D9 — Destructive actions are neutral, not red

`Delete` in the confirm dialog and the row menu uses the same quiet button style as
everything else. The sentence ("The task and its notes will be removed from this
computer.") carries the warning. This follows `DESIGN.md` §2 row 14, and is a
deliberate departure from the usual red-destructive convention.

### D10 — `flag` icon added, then removed

An early pass gave priority a small flag glyph. That invented a fifth icon that the
design system does not define and implied meaning the text already carries.
Reverted: priority is text-only (`P1`/`P2`/`P3`), and the icon set is four glyphs.

### D11 — The in-progress status circle uses a neutral fill, not a gradient

A half-filled circle via `linear-gradient` was tried for the `doing` state and
removed: `DESIGN.md` bans gradients outright, and a gradient at 16px reads as an
artefact. It is now a flat `--accent-weak` fill.

### D12 — Board column rows drop the due-date column

Board rows use the compact 44px variant with a `24px · 1fr · 28px` grid. Keeping
the due column would make right edges ragged under unequal titles in narrow
columns, which reads as broken rather than aligned. The date is still available in
the editor; the Board is for position, not scheduling.

### D13 — No auth screen was designed

Auth is specified in `SPEC.md` §8 but not built, and no visual design exists for
it. Rather than invent a screen the user has not reviewed, the rail keeps the slot
(`AppShell` passes `userName` / `userEmail` to `Rail`, hard-coded to `You` /
`you@local`). The next agent must design the auth screen to the same rules —
380px flat card, one accent, no hero art, no social buttons — or ask first.

### D14 — Verification: build passes, and it caught three real bugs

`npm install` first failed with `EPERM` on the npm cache; after approval it
succeeded. `npx tsc --noEmit` and `npm run build` both pass clean.

Getting a real browser in the loop was the point. `scripts/visual-check.mjs`
drives the locally installed Chrome and caught three defects that type-checking
and the build could never see:

1. **The whole component half of `globals.css` was missing.** During the port from
   a single stylesheet to CSS Modules, `.app`, `.main`, `.rows`, `.board`, `.menu`
   and friends were dropped. The rail stretched to full width and the main column
   had no layout at all. The rendered screenshot showed it immediately; the
   build had been perfectly green.
2. **`.content--wide` was referenced as `content.wide`.** CSS Modules are typed as
   `Record<string, string>`, so a kebab-case class name that does not exist
   resolves to `undefined` and **TypeScript cannot catch it** — the class is
   silently dropped. The Board fell back to the 920px list column. Class names in
   `*.module.css` are camelCase for exactly this reason.
3. **Board lanes had a mis-sized header.** `flex: 1 1 0` with `max-width` plus a
   1px border made each header bar ~2px narrower than its body without
   `box-sizing: border-box`.

The lesson worth keeping: a green build proves the code compiles, not that the UI
renders. Screenshot review is the only check that catches a dropped class.

### D15 — CSS Modules class names are camelCase, always

Because of the `content.wide` bug above. There is a repo-wide audit worth
re-running after any CSS Module edit:

```powershell
Get-ChildItem -Recurse -Include *.module.css |
  Select-String -Pattern '^\s*\.[a-z][a-zA-Z0-9]*-'
```

Any hit is a class no component can reach. Keep it empty.

### D16 — The Board uses `TaskCard`, not `TaskRow`

First implementation reused `TaskRow` in a "compact" 3-column variant. Feedback
was that the board was confusing, and it was: list rows stacked in narrow columns
give no boundary between one lane and the next, and the missing due column made
right edges ragged.

The Board is now lanes of tickets: 272–360px, `--surface-2` fill, equal heights,
header bar, independently scrolling body, and a `TaskCard` that carries labels,
title, notes and a footer. `TaskRow` keeps the lists. Two components, because a
board ticket and a list row are genuinely different objects.

The `compact` variant and the board CSS globals (`.board`, `.column-head`,
`.column-title`, `.column-count`, `.column-empty`, `.chip-status`) were deleted
rather than left in place — dead rules look like part of the design system and
mislead the next reader.

### D17 — Light theme only, no toggle

Requested directly. The theme toggle was removed from the rail, the
`prefers-color-scheme` boot script was removed from `layout.tsx`, and
`data-theme="light"` is now static. The dark token block stays in `globals.css`
and stays correct, so restoring dark mode means re-adding the toggle and the boot
script — not re-deriving the palette.

### D18 — `prefers-reduced-motion` uses one `!important`

`globals.css` sets `transition: none !important` under the reduce query. The
alternative is repeating the query in every component module. This is the single
sanctioned `!important` in the codebase; adding a second requires a line here.


### D19 — The design language was replaced wholesale

v1 was light grey, monochrome, three lanes, no colour, one accent used only for
interaction. The user supplied a reference board (dark, purple accent, tinted
tag chips, dense cards, four lanes) and said "I like this style, not yours".

**Decision:** adopt the reference's structure and density, keep the light theme
the user asked for earlier, and take the purple accent and coloured tag chips.
The v1 "no colour" rule is replaced by a narrower one that is easier to defend:
**colour is allowed on classification (tags, avatars), never on status.** A card
can be colourful because of its labels; being overdue, done or P1 never adds hue.
The dark palette was written into `globals.css` and left unused, so switching is a
token swap plus a toggle rather than a re-derivation.

### D20 — The Today / Inbox / Done screens were deleted

They were built and worked. Asked for scope, the user said: "I only need one
screen for now, others screens are useless."

**Decision:** delete the routes, the views, the list-row component and the shared
search store rather than leaving them unreachable. `AppShell` and `TaskProvider`
went with them, replaced by `BoardView` + `BoardProvider`. The new-issue dialog
was **kept** — a board with no way to add a card is a dead end — and the rail's
`New issue` / `Commands` rows are deliberately inert until asked otherwise.

The `TaskRow` → `TaskCard` split from D16 collapsed: with one screen there is one
card component, and the "compact variant" ambiguity is gone for good.

### D21 — PowerShell corrupted non-ASCII characters in the source

Several files were rewritten with `Get-Content` + `Set-Content -Encoding UTF8`.
PowerShell 5.1 decoded the UTF-8 bytes as Windows-1252 and re-encoded them, so the
em dash became `U+00E2 U+20AC U+201D`, the ellipsis became `U+00E2 U+20AC U+00A6`,
and `⌘` became `U+00E2 U+0152 U+02DC` **in the source files**. The build stayed
green and the server correctly served `charset=utf-8`; the corruption only showed
up in a screenshot, as `PRODUCT / ATLAS WEB` followed by three stray glyphs.

Two lessons recorded because both cost real time:

1. **Screenshot review catches what type-checking and builds cannot.** This is the
   second time (see D14).
2. **Never script text edits in PowerShell here.** PowerShell also adds a UTF-8
   BOM with `Set-Content -Encoding UTF8`, which had to be stripped from 11 files.
   If scripting is unavoidable, use
   `[System.IO.File]::ReadAllBytes` / `::WriteAllBytes`.

All mojibake was repaired by codepoint, verified with a scan for the specific
lead-byte sequences, and the intended glyphs (`U+2014`, `U+2318`, `U+22EF`,
`U+2715`) confirmed present.

### D22 — A test bug, not a product bug

The editor dialog appeared broken: clicking "New issue" opened nothing. The cause
was in `scripts/visual-check.mjs`, which found the button with
`textContent.includes('New issue')`. There are **two** such buttons — the rail's
inert one and the page header's — and the script was clicking the inert one.

The handler was in the bundle the whole time. Time was spent inspecting minified
output before checking the selector. Lesson: when a check fails, verify the check
before the product; a screenshot that shows nothing may be pointing at nothing.
The script now targets `button.btn--primary` specifically, and the dialog is
confirmed working in `.verify/board-editor.png`.

### D23 — Lane scrollbars hidden, and the lane height arithmetic fixed

Feedback: "can we hide the scroll bar it looks weird". Two separate problems sat
behind that.

1. **The visible gutter.** `scrollbar-width: thin` still reserved ~15px inside a
   310px lane, so lanes with different content lengths stopped lining up — the
   Backlog showed a scrollbar and In progress did not, which shifted their cards
   horizontally. Now `scrollbar-width: none` plus `::-webkit-scrollbar { width: 0 }`
   on lane bodies and `{ height: 0 }` on the horizontal board scroller. Scrolling
   is unchanged: wheel, trackpad and keyboard all still work.
2. **The height was wrong, not just the decoration.** Lanes were
   `calc(100vh - 300px)`. Measured at 1818x854, the board starts at y=318, so that
   made the board 26px *taller* than the viewport — the whole page scrolled —
   while still hiding 222px of cards. Corrected to `100vh - 342px` (measured chrome
   above the board plus a 16px gutter). The board now ends at 838 in an 854 window:
   nothing scrolls except the lane bodies.

`scripts/measure-lane-height.mjs` prints the geometry and the correct subtrahend,
so this stays a measurement rather than a guess. It is worth re-running whenever
the page header, overview bar or tabs change height, because the constant is only
valid for those heights.

**Trade-off accepted:** with a hidden scrollbar, a partly-visible card at a lane's
lower edge is the only cue that more content exists. That is why lane heights are
left exact rather than padded to whole cards.

### D24 — A stale screenshot nearly slipped through

`node scripts/check-scrollbars.mjs` wrote its PNG into `.verify/`, but a cleanup
step had just deleted that directory, so the write failed and the run exited
non-zero *after* printing passing numbers. The screenshot I then reviewed was from
an earlier run. Two changes: verification scripts now `mkdirSync('.verify')`
themselves, and a passing measurement is never treated as proof on its own — the
image has to be regenerated in the same run that reports it.
