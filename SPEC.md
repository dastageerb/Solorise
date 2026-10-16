# Dayline — Local Task Board

**Status:** Build-ready specification
**Owner:** single local user (no server, no accounts in the cloud)
**Audience:** an implementing agent that has NOT seen the design discussion. Everything needed is in this file. Nothing may be inferred, improved, or "made prettier."

---

## 0. How to use this document (read this first, agent)

1. Build exactly what is specified here. This file is the single source of truth.
2. If something is not specified, choose the boring option and write the choice down in `DECISIONS.md`. Do not invent visual language.
3. Do not redesign, restyle, add flourishes, or swap tokens. The visual result is meant to be plain, quiet and consistent — that is the point, not a limitation to overcome.
4. Recommended first action: create `tokens.css` in which every value in §5 is copy-pasted verbatim. Every other file must consume those variables. A raw hex value outside `tokens.css` is a defect.
5. When done, run §13 (Definition of Done) top to bottom and §11 (Anti-slop lint) as a pass/fail gate.

Priority words in this document: **MUST** = a defect if missing, **MUST NOT** = a defect if present, **SHOULD** = do it unless it breaks something.

---

## 1. Product statement

A single-user, offline, browser-based daily task board. It replaces the clutter of a full Jira instance with three questions the user answers every morning:

1. What is everything I own? (Inbox / All)
2. What am I doing today? (Today)
3. Where does each thing stand? (Board)

No teams, no sprints, no epics, no notifications, no cloud, no analytics.

**Deliberately out of scope (v1):** sharing, multiplayer, attachments, comments, rich text, recurring tasks, subtasks, timers, calendars, email reminders, import/export from Jira, mobile apps, server sync, third-party libraries, build tooling.

---

## 2. Non-negotiable constraints

| # | Constraint |
|---|---|
| C1 | Runs by opening `index.html` from the file system (`file://`). No dev server required to use it. |
| C2 | No network calls of any kind, at any time. No CDNs, no Google Fonts, no telemetry. |
| C3 | No build step, no package manager, no bundler, no framework. Plain HTML + CSS + ES modules. |
| C4 | All data lives in IndexedDB in the user's browser profile. Nothing leaves the machine. |
| C5 | Local login + registration are required and are real (hashed passwords, real session handling) but are a **local gate**, not security against an attacker with the machine. Document that honestly in the README. |
| C6 | Status MUST NOT change any color. See §6. |
| C7 | The entire palette is monochrome + exactly one accent. See §5. |
| C8 | Total first-party source under 2,000 lines, excluding this document. |

**Note on C2/C5 and `file://`:** ES modules are blocked by CORS on `file://` in Chromium. Therefore ship two entry modes with the same code:
- `index.html` uses classic scripts (`<script src="...">` with an IIFE per file, attaching to one `window.DL` namespace). This MUST work from `file://`.
- Document `python -m http.server` as the optional nicer path.
Pick ONE and make it consistent; do not ship a broken module-based `index.html`.

---

## 3. Deliverables (exact file tree)

```
/index.html          # app shell, static markup for all views
/styles/tokens.css   # ONLY file allowed to contain raw color/number values
/styles/app.css      # layout + components, consumes tokens only
/scripts/db.js       # IndexedDB open/upgrade, typed CRUD helpers
/scripts/auth.js     # register, login, logout, session, password hashing
/scripts/store.js    # in-memory state, selectors (Today/Inbox/Board), undo stack
/scripts/ui.js       # render functions, event wiring, keyboard handling
/scripts/main.js     # bootstrap: session check -> render auth or app
/README.md           # how to run, where data lives, how to reset, honest limits
/DECISIONS.md        # any unspecified choice the implementer made
```

No other files. No `node_modules`, no `dist`, no images (use inline SVG only, and only for the two icons in §7.9).

---

## 4. Data model (IndexedDB)

Database name: `dayline`. Version: `1`.

| Store | keyPath | Indexes |
|---|---|---|
| `users` | `id` | `email` (unique) |
| `tasks` | `id` | `userId`, `status`, `order`, `dueDate` |
| `meta` | `key` | — |

**User**

```js
{
  id: "u_" + crypto.randomUUID(),
  email: "you@local",          // stored lowercased + trimmed
  displayName: "You",
  passwordHash: "<base64>",    // PBKDF2-SHA256, 310_000 iterations, 16-byte salt
  salt: "<base64>",            // 16 random bytes
  createdAt: "2025-01-01T09:00:00.000Z"
}
```

**Task**

```js
{
  id: "t_" + crypto.randomUUID(),
  userId: "u_...",             // owner; every query filters on this
  title: "string, 1..160",     // trimmed, required
  notes: "string, 0..2000",    // plain text only, newlines preserved
  status: "todo" | "doing" | "done",
  priority: 1 | 2 | 3 | 4,     // 1 = highest, 4 = none
  project: "string|null",      // free text, single value, no hierarchy
  tags: ["string"],            // 0..5, lowercased, no '#'
  dueDate: "YYYY-MM-DD" | null,
  order: 1024,                 // number, ascending = top of list
  createdAt: ISO,
  updatedAt: ISO,
  completedAt: ISO | null      // set when status becomes "done", cleared otherwise
}
```

**meta keys:** `session` → `{ userId, token, createdAt, expiresAt }`, `lastView` → string, `theme` → `"light" | "dark"` (optional, see §5.4).

**Rules**

- M1 — Every read and write is scoped to the session `userId`. A task from another user MUST NOT be renderable or reachable.
- M2 — `dueDate` is a local calendar date string, never a UTC timestamp. Today is computed from local `Date` parts, not `toISOString()`.
- M3 — `order` values are spaced 1024 apart on insert and on move. If two neighbours differ by less than 2, renormalize the whole list to 1024, 2048, 3072… and persist once.
- M4 — Derived views are computed, never stored:
  - **Today** = `status !== "done"` AND (`dueDate === today` OR `dueDate < today` OR `dueDate === null` is NOT included — untriaged work belongs to Inbox).
  - **Inbox** = `dueDate === null` AND `status !== "done"`.
  - **Overdue** = `dueDate < today` AND `status !== "done"`.
  - **Board** = all non-archived tasks grouped by `status`.
  - **Done** = `status === "done"`, newest `completedAt` first, capped for render at 50 with a "Show all" control.
- M5 — Sorting inside a view: `priority` ascending, then `dueDate` ascending (nulls last), then `order` ascending.
- M6 — All mutations go through one function so undo can be generic: `applyCommand(cmd)` where `cmd = { kind: "create"|"update"|"move"|"delete", before, after }`. Keep the last 20 commands in memory for undo. No undo persistence across reloads.

**Schema upgrade:** `onupgradeneeded` creates the stores/indexes above based on `oldVersion`. Never delete data on upgrade. A separate explicit user action ("Reset local data" in Settings, behind a confirm dialog) may wipe.

---

## 5. Design tokens (`styles/tokens.css`)

This exact block is the design. Copy it verbatim.

```css
:root {
  /* ---- surfaces ---- */
  --bg:            #F7F7F8;
  --surface:       #FFFFFF;
  --surface-2:     #F0F0F1;
  --border:        #E3E3E5;
  --border-strong: #C9C9CD;

  /* ---- text ---- */
  --text:       #1A1A1C;
  --text-muted: #63636A;
  --text-faint: #8A8A90;

  /* ---- the single accent (interaction only) ---- */
  --accent:      #3A5A9B;
  --accent-hover:#31507F;   /* manual, do not use color-mix/filter */
  --accent-weak: #E9EDF5;   /* selected nav / active toggle fill */
  --focus-ring:  #3A5A9B;

  /* ---- type ---- */
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --fs-11: 11px; --fs-12: 12px; --fs-13: 13px; --fs-14: 14px;
  --fs-16: 16px; --fs-20: 20px; --fs-28: 28px;
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600;
  --lh-tight: 1.25; --lh-base: 1.5;
  --tracking-caps: 0.06em;

  /* ---- space (4px base) ---- */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px; --sp-12: 48px;

  /* ---- radii ---- */
  --r-sm: 4px;   /* chips, tags, keys */
  --r-md: 8px;   /* buttons, inputs, rows, cards, columns */
  --r-full: 999px; /* avatars and progress track only */

  /* ---- elevation: exactly one shadow in the whole app ---- */
  --shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.10);

  /* ---- motion: exactly one duration, one easing ---- */
  --dur: 120ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);

  /* ---- layout ---- */
  --rail-w: 232px;
  --content-max: 1200px;
  --row-h: 56px;
  --header-h: 56px;

  /* ---- status chip opacity steps (NOT colors) ---- */
  --chip-todo-bg:  transparent; --chip-todo-border:  var(--border-strong);
  --chip-doing-bg: var(--surface-2); --chip-doing-border: var(--border-strong);
  --chip-done-bg:  var(--surface-2); --chip-done-border:  var(--border);
}

[data-theme="dark"] {
  --bg:            #131316;
  --surface:       #1A1A1E;
  --surface-2:     #232329;
  --border:        #2E2E35;
  --border-strong: #45454E;
  --text:          #EDEDEF;
  --text-muted:    #9A9AA2;
  --text-faint:    #74747B;
  --accent:        #8FAEE8;
  --accent-hover:  #A6C0F0;
  --accent-weak:   #232B3A;
  --focus-ring:    #8FAEE8;
  --shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.45);
}
```

### 5.1 Rules that make this a system

- T1 — `tokens.css` is the ONLY file containing hex, `rgb()`, or `hsl()` literals. Everywhere else uses `var(--…)`.
- T2 — Font sizes, weights, spacings, radii and durations MUST come from the lists above. No `13.5px`, no `10px`, no `6px`, no `padding: 14px`, no `0.15s`.
- T3 — `border-radius` is only `var(--r-sm)`, `var(--r-md)`, or `var(--r-full)`.
- T4 — `box-shadow` is only `var(--shadow-overlay)`, and only on: the command palette/modal layer and the toasts layer. Nothing else, ever — not on cards, not on rows, not on hover.
- T5 — Gradients are forbidden (`linear-gradient`, `radial-gradient`, `conic-gradient`) with no exceptions.
- T6 — Accent color is permitted on exactly four things: (1) primary button fill, (2) active nav item, (3) focus ring, (4) horizontal progress fill in the Today header. Nothing else.
- T7 — Every interactive element has a visible `:focus-visible` outline: `2px solid var(--focus-ring)` with `outline-offset: 2px`. Never `outline: none` without a replacement.

### 5.2 Theme

- Light is the default. `data-theme` is set on `<html>`.
- If `prefers-color-scheme: dark` matches and no stored `theme` key exists, set `data-theme="dark"`. A Settings toggle persists the choice to `meta.theme`.
- Both themes MUST be tested; contrast rules in §5.3 apply to both.

### 5.3 Contrast floors

| Pair | Minimum |
|---|---|
| `--text` on `--surface` / `--bg` | 7:1 |
| `--text-muted` on `--surface` / `--bg` | 4.5:1 |
| `--text-faint` on `--surface` (non-essential labels only) | 3:1 |
| white on `--accent` (button) | 4.5:1 |

Do not encode meaning in `--text-faint` alone.

### 5.4 Spacing and sizing are not free-form

| Element | Exact value |
|---|---|
| Left rail width | `var(--rail-w)` = 232px |
| App header height | `var(--header-h)` = 56px |
| Task row min-height | `var(--row-h)` = 56px |
| Content max width | `var(--content-max)` = 1200px, centered, page padding `var(--sp-8)` |
| Vertical gap between rows | `var(--sp-2)` (8px) via `gap`, not margins |
| Card/column padding | `var(--sp-4)` (16px) |
| Control height | 32px (default), 28px (`size="sm"`), 36px (primary "New task") |
| Board column width | `minmax(0, 1fr)` inside a 3-column grid, `gap: var(--sp-4)` |

---

## 6. Status, priority and color (the anti-slop core)

The user explicitly rejected color-coded statuses. This section is the rule that keeps the UI calm.

**S1 — Status is three states:** `todo` → "Not started", `doing` → "In progress", `done` → "Done". No other statuses. No custom columns in v1.

**S2 — Status MUST NOT change hue.** All three chips use the same text color (`--text-muted`), the same font size (11px), the same weight (500), the same uppercasing and letter-spacing. They may differ ONLY by fill and border, using exactly the four variables in §5's chip block. The forbidden approach (`red/yellow/green`, `#ef4444/#f59e0b/#22c55e`, tinted row backgrounds, colored left borders) is a **build failure**.

**S3 — Priority MUST NOT be a color.** Render priority as text only: `P1`, `P2`, `P3`. Priority 4 (none) renders an empty string and no element at all. No dots, no bars, no flames, no icons, no background tint.

**S4 — Overdue MUST NOT introduce a new color.** Overdue is expressed typographically: the due-date string becomes `--text` (from `--text-muted`) and gains `--fw-medium`, and the row shows `Overdue · 3 days` in the same muted style. That is the entire overdue treatment.

**S5 — Affordances use neutral surfaces only.** Hover fills `--surface-2`. Selection fills `--accent-weak` and adds a `1px solid var(--accent)` inset ring. Dragging uses `opacity: 0.6` on the source row plus a `1px dashed var(--border-strong)` drop placeholder of the same height.

**S6 — The only permitted state colors in the entire product** are `--accent` and its two derivatives. If a proposed color is not in §5, it does not go in the codebase.

---

## 7. Screens, layout and components

### 7.1 App shell

```
┌───────────────────────────────────────────────────────────────┐
│ header (56px): current view title ·· search ·· [New task]      │
├──────────────┬────────────────────────────────────────────────┤
│ left rail    │ main (max 1200px, centered, padding 32px)      │
│ 232px        │                                                │
│ nav          │                                                │
│ ──────       │                                                │
│ theme toggle │                                                │
│ account menu │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

Below 1024px viewport width, the rail collapses to a 56px icon rail; below 720px it becomes a top tab row (Inbox / Today / Board / Done) and the header hides the search field into a toggle. No hamburger drawer, no off-canvas animation.

### 7.2 Header

- Left: view title, 16px / 600, `--text`.
- Center-right: search input, 240px fixed, placeholder `Search tasks`, magnifier icon inline.
- Right: primary button `New task` (accent fill, white text, 36px, `--r-md`), shortcut hint `N` shown as a `kbd` chip inside the button on non-touch.
- Header bottom border: `1px solid var(--border)`. No shadow.

### 7.3 Left rail

- Nav items, 32px tall, `--r-md`, gap `var(--sp-1)`, each: 16px inline SVG icon + label (13px / 500).
- Items: **Inbox**, **Today**, **Board**, **Done** — with live counts right-aligned in `--text-faint`, 12px, tabular numerals.
- Active item: `background: var(--accent-weak)`, text `--text`, icon `--accent`.
- Inactive: text `--text-muted`, icon `--text-faint`; hover fills `--surface-2`.
- Bottom of rail, separated by a `1px solid var(--border)` rule and `var(--sp-4)` of space: theme toggle (segmented, two options: Light / Dark) and an account row showing display name + email (both 12px, email truncated with ellipsis) with a text button `Sign out`.

### 7.4 Task row (the main repeatable unit)

One row component used by every list view. Height `--row-h` minimum, grid:

```
[ 24px status toggle ] [ flexible: title / meta ] [ due date ] [ ⋯ ]
```

- Status toggle: 16px circle, `1.5px solid var(--border-strong)`, transparent fill. Clicking advances `todo → doing → done → todo`. When `done`, the circle fills `--surface-2` and shows a 1.5px `--text-muted` check path. It never becomes green. It is a real `<button>` with `aria-label` = current status + action, and `aria-pressed` where meaningful.
- Title: 14px / 500, `--text`, single line, `text-overflow: ellipsis`. When `done`, `text-decoration: line-through` and color `--text-muted`. No opacity tricks on the whole row.
- Meta line (second line, only when non-empty): 12px `--text-muted`, joined with `·`: project, then `P1/P2/P3`, then tags as `--r-sm` neutral chips, then `notes` presence as `Note`. Missing parts are omitted, never rendered empty.
- Due date: 12px. Future = `--text-muted`. Today = `--text` + `--fw-medium`. Overdue = `--text` + `--fw-medium` and the string `Overdue · Nd`.
- Overflow `⋯` button (28px, icon only, `--text-faint`): reveals on row hover/focus only. Menu items: `Edit`, `Move to today`, `Move to inbox`, `Mark done`/`Reopen`, `Delete` (delete is last and is separated by a rule). Menu is a plain overlay panel: `--surface`, `1px solid var(--border)`, `--r-md`, `--shadow-overlay`, 180px wide, 28px items, hover `--surface-2`.
- Row hover: `--surface-2`. Row focus-visible: focus ring on the row. Selected row: `--accent-weak` + inset accent ring.
- Row separators: none. Rows are separated by the `gap` from §5.4. No zebra striping.

### 7.5 Views

**Inbox** — flat list of untriaged (`dueDate === null`, not done) tasks, sorted per M5, with a section header `Inbox · N`. Empty state per §7.8. First row is always an inline **quick-add** row: 14px input, placeholder `Add a task`, plus a date field and a project field that appear only after the first keystroke.

**Today** — the default view after login.
- Top block: date as `Tuesday, 14 January`, 20px / 600; to its right the counts `3 open · 2 done` in 12px `--text-muted`.
- Below it a progress bar: track 2px, `--surface-2`, `--r-full`; fill `--accent`, width = `done / total`, no transition longer than `--dur`, and `role="progressbar"` with `aria-valuenow`.
- Then three groups separated by `var(--sp-6)`: **Overdue** (only if non-empty), **Today**, **Done today**. Group headers: 11px / 500, `--tracking-caps`, uppercase, `--text-faint`, with a right-aligned count.
- No charts, no rings, no gauges, no emoji, no motivational copy. Not one celebratory state.

**Board** — 3 columns: `Not started`, `In progress`, `Done`, each a `--surface` card with `1px solid var(--border)`, `--r-md`, `var(--sp-4)` padding, header row (title 13px/600 + count chip), then rows.
- Rows inside a column are the same task row at reduced density: min-height 44px, `notes` hidden, one meta line maximum.
- Drag and drop with the native HTML5 API is permitted and optional; if implemented, the drop target shows a 2px `--accent` top/bottom indicator line, and the dragged row goes to `opacity: 0.6`. Keyboard alternative MUST exist: `Ctrl/⌘ + ←/→` moves a focused row between columns, announced via `aria-live`.
- Columns scroll independently; the page itself scrolls.

**Done** — flat list, newest `completedAt` first, now line-through titles muted. Row overflow offers `Reopen` and `Delete`. Cap at 50 with a plain text button `Show all`.
- Done tasks older than 30 days are NOT auto-deleted; a Settings action `Clear done older than 30 days` does it behind a confirm dialog.

### 7.6 Dialogs and menus

- Task edit opens a centered modal: max-width 560px, `--surface`, `--r-md`, `--shadow-overlay`, no visible backdrop blur (a flat `rgba(0,0,0,0.32)` scrim in light, `rgba(0,0,0,0.6)` in dark is acceptable).
- Fields, in order, each with a 12px `--text-muted` label above a 32px control: `Title` (required, focus on open), `Notes` (textarea, `min-height: 96px`, resize vertical), `Status` (segmented 3-up), `Priority` (segmented 4-up: P1 P2 P3 None), `Project` (text, with datalist of existing projects), `Tags` (text, comma separated), `Due date` (`<input type="date">`).
- Footer: right-aligned `Cancel` (quiet/ghost) and `Save` (accent). `Esc` closes and discards; `Ctrl/⌘ + Enter` saves.
- Focus is trapped in the modal while open and returned to the invoking element on close.
- Destructive actions use a small confirm dialog with a plain sentence and `Cancel` + `Delete` (Delete is a quiet button in `--text`, NOT red — see S6).

### 7.7 Command palette (`Ctrl/⌘ + K`)

Optional but recommended, and if built it MUST follow §5 exactly. Overlay panel, top-aligned 96px from top, 560px wide, `--surface`, `--r-md`, `--shadow-overlay`. Input row + up to 8 result rows. Commands: the four view jumps, `New task`, `Toggle theme`, `Sign out`, plus task search. Arrow keys move, `Enter` runs, `Esc` closes. No fuzzy-match highlighting, no colored icons.

### 7.8 Empty states

One pattern, everywhere: 20px vertical gap, a 12px `--text-muted` sentence, and — where an action exists — a quiet text button. Exact copy:

- Inbox: `Nothing waiting to be triaged.`
- Today, nothing due: `Nothing due today.` + `Plan from Inbox`
- Today, all done: `All done for today.` (this is the ONLY acknowledgement; no confetti, no illustration, no emoji)
- Board column: `No tasks here.`
- Done: `Nothing completed yet.`
- Search, no results: `No tasks match "…".`

No illustrations, no mascots, no lottie, no empty-state SVG art.

### 7.9 Icons

Exactly five allowed, all 16px, `stroke-width: 1.5`, `stroke: currentColor`, `fill: none`, `stroke-linecap: round`, inline SVG: `inbox`, `calendar`, `columns`, `check`, `search`. Plus a text-only `⋯` glyph for overflow (the character, not an SVG). No icon fonts, no emoji, no filled icons, no third-party icon sets.

### 7.10 Toasts

Bottom-right, 320px, `--surface`, `1px solid var(--border)`, `--r-md`, `--shadow-overlay`, 8px gap, stack max 3, auto-dismiss 4000ms, no colored accent bar. Every toast that follows a mutation offers an inline text button `Undo`. Container is `aria-live="polite"`. Messages are plain, e.g. `Task deleted.`, `Task moved to Today.`

---

## 8. Authentication (local)

**Storage:** users in IndexedDB. No cookies. No `localStorage` for anything but nothing at all — IndexedDB only.

**Register** (`#/register`, or the auth card toggled state)
- Fields: `Display name`, `Email`, `Password`, `Confirm password`.
- Validation, all client-side, all messages plain and specific:
  - display name 1–60 chars, trimmed
  - email: trimmed, lowercased, must match a simple `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - email must not already exist (case-insensitive) → `That email is already registered on this computer.`
  - password ≥ 10 chars, must not equal the email, must not be in a 20-entry list of obvious values (`password123`, `qwertyuiop`, …) → tell the user which rule failed
  - confirm must match
- On success: create user, immediately create a session and enter the app.
- First registered user is the only user in practice; multi-user is supported by the schema but the UI must not advertise account switching. Do not build a user switcher.

**Login**
- Fields: `Email`, `Password`. One generic failure message: `Email or password is incorrect.` (no user enumeration).
- Throttle: after 5 consecutive failures, disable submit for 30 seconds with a visible countdown; counter lives in `meta`, resets on success.
- `Stay signed in on this computer` checkbox, checked by default: when checked, session expiry is 30 days; unchecked, 12 hours.

**Password hashing**
- `crypto.subtle.importKey("raw", …)` → `deriveBits` with PBKDF2, SHA-256, 310,000 iterations, 16-byte random salt from `crypto.getRandomValues`, 256-bit output, stored base64.
- Compare with a constant-time loop over bytes (not `===` on strings). Note honestly in the README that this protects the local file store, not a machine-level attacker.

**Session**
- `meta.session = { userId, token: crypto.randomUUID(), createdAt, expiresAt }`.
- On boot: read session, check `expiresAt` against `Date.now()`, verify the user record still exists, then render the app; otherwise render auth.
- `Sign out` deletes `meta.session` only. It MUST NOT delete any task data.
- Expired session → auth screen with `Your session expired. Sign in again.`
- No "password reset" flow via email. Offer `Reset local data` in Settings that wipes everything behind a typed confirmation (`DELETE`).

**Auth screen layout:** centered card, 380px, `--surface`, `--r-md`, `1px solid var(--border)`, padding `var(--sp-8)`, no shadow. Wordmark `Dayline` 20px/600, one 12px `--text-muted` subline (`Everything stays on this computer.`), the fields, a full-width accent primary button, and a text link to switch Login/Register. No social buttons, no hero art, no marketing copy.

---

## 9. Behavior and interactions (exact)

| # | Trigger | Result |
|---|---|---|
| B1 | `N` (when no input focused) | Focus quick-add in Inbox or open the New task modal; focus `Title`. |
| B2 | `Enter` in quick-add title | Create task with `status: todo`, `priority: 4`, `dueDate` = current view's date rule (Today view → today, Inbox → null), keep focus in the input for the next entry. |
| B3 | `Enter` | Save the open modal. |
| B4 | `Esc` | Close modal/menu/palette; if a row is in inline edit, revert. |
| B5 | Click status circle | Advance status; on `done` set `completedAt` and show toast `Task completed.` + `Undo`. |
| B6 | Click title | Open the edit modal. |
| B7 | `Ctrl/⌘ + Z` | Undo the last command from M6; toast `Undone.` |
| B8 | Search input | Filters the current view's tasks live on `title`, `notes`, `project`, `tags` (case-insensitive substring), debounced 120ms. Search never changes the view. |
| B9 | Empty title on save | Inline field error, no toast. |
| B10 | Any mutation | Update in-memory state, persist to IndexedDB, re-render only the affected view/group. Full re-render is acceptable at this scale; visual flicker is not — do not re-mount the focused input. |
| B11 | `Tab` from the last element of a modal | Wraps to the first (focus trap). |
| B12 | Reload | Same view, same theme, same tasks, session honored. No flash of the auth screen while IndexedDB loads — render a neutral `--bg` placeholder first. |

---

## 10. Accessibility requirements

- A11y-1 — Every icon-only button has `aria-label`. Every input has a real `<label for>`; the label is visible, 12px, `--text-muted`.
- A11y-2 — Full keyboard operation: create, edit, complete, move between board columns, delete, undo, navigate views (`1`–`4` or `G then I/T/B/D`).
- A11y-3 — Focus visible everywhere per T7; focus never lost after a mutation.
- A11y-4 — Modals: `role="dialog"`, `aria-modal="true"`, labelled by their heading, focus trapped, `Esc` closes, focus restored.
- A11y-5 — Toasts in `aria-live="polite"`; the Today progress bar has `role="progressbar"` with `aria-valuenow/min/max`.
- A11y-6 — Status and priority are conveyed by text, never by color alone (this is already true by §6 — keep it that way).
- A11y-7 — All text/UI pairs meet §5.3 in both themes.
- A11y-8 — Respect `prefers-reduced-motion: reduce` by setting transitions to none.
- A11y-9 — Zoom to 200% with no clipped content and no horizontal scrollbar; hit targets ≥ 28px, primary controls 32px.

---

## 11. Anti-slop lint (pass/fail gate before "done")

Run these as greps over the source. Each hit is a defect to fix, not to justify.

| # | Forbidden | Required instead |
|---|---|---|
| L1 | Hex/`rgb()`/`hsl()` outside `tokens.css` | `var(--token)` |
| L2 | `linear-gradient` / `radial-gradient` / `conic-gradient` | flat `--surface` / `--surface-2` |
| L3 | `box-shadow` other than `var(--shadow-overlay)` | borders per §5.4 |
| L4 | `border-radius` values outside the three tokens | the tokens |
| L5 | Emoji anywhere in the UI or source | plain text or the five icons |
| L6 | Green/red/amber/yellow literals, `success`/`danger`/`warning` color classes | neutral surfaces; §6 text treatment |
| L7 | More than one accent hue, or a second accent for hover | `--accent` and `--accent-hover` |
| L8 | Font sizes/weights not in the §5 lists | the tokens |
| L9 | `outline: none` without a `:focus-visible` replacement | T7 |
| L10 | Third-party CSS/JS/fonts, `<link href="https://…">` | first-party only |
| L11 | Uppercase headings with tracking used as decoration beyond §7.5 group headers | plain sentence-case microcopy |
| L12 | Decorative illustrations, mascots, empty-state art, animated lottie | §7.8 copy only |
| L13 | Oversized hero numbers, KPI cards, "dashboard" tiles | the specified header line |
| L14 | `!important` (except a single documented reason in `DECISIONS.md`) | specificity by structure |
| L15 | `transition: all` | explicit properties with `var(--dur) var(--ease)` |
| L16 | Copy like "Oops!", "Let's get started!", "Awesome!", "You crushed it!" | plain, factual sentences |

Self-check before declaring done: open the app and read it as a stranger. If any screen looks like a template, a Tailwind demo, or a generic SaaS dashboard, it fails — even if every rule above passes.

---

## 12. Reference render target (ASCII wireframe, light theme)

This is what a correct build looks like. Distances are in px from §5.4.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Today                              [ ⌕ Search tasks ]      [ + New task  N ]│ 56
├──────────────┬─────────────────────────────────────────────────────────────┤
│ ▸ Inbox   4  │  Tuesday, 14 January              3 open · 2 done           │
│ ▸ Today   5  │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬──────────────  (2px, --accent fill)          │
│ ▸ Board      │                                                             │
│ ▸ Done   12  │  OVERDUE                                          1         │
│              │  ○  Draft Q1 handoff notes        Overdue · 2d         ⋯    │ 56
│ ──────────── │                                                             │
│ Light│Dark   │  TODAY                                            3         │
│ You          │  ○  Review invoice #221           Today                 ⋯    │ 56
│ you@local    │  ◐  Rebuild index mapping         P1 · home            ⋯    │ 56
│ Sign out     │  ○  Reply to Dana                 P3 · Email           ⋯    │ 56
│              │                                                             │
│              │  DONE TODAY                                       2         │
│              │  ●  Book dentist                  (line-through)       ⋯    │ 56
│              │  ●  Pay electricity bill          (line-through)       ⋯    │ 56
└──────────────┴─────────────────────────────────────────────────────────────┘
   232                                    max 1200, padding 32
```

Note what is absent: no colored chips, no progress rings, no avatars, no gradients, no badges with counts in pills, no per-status hue, no card shadows, no rounded-2xl blobs.

---

## 13. Definition of Done (test each, record pass/fail in `DECISIONS.md`)

| # | Check |
|---|---|
| D1 | Opening `index.html` from disk shows the auth card; no console errors. |
| D2 | Register → lands in Today, session persists across reload. |
| D3 | Duplicate email registration is refused with the exact copy in §8. |
| D4 | Wrong password 5× triggers the 30s throttle with a countdown. |
| D5 | Create a task from quick-add with `Enter`, then add three more without touching the mouse. |
| D6 | Status circle cycles three states; the chip text changes; **no color changes anywhere** (compare screenshots). |
| D7 | Priority renders as `P1/P2/P3` text only; `None` renders nothing. |
| D8 | Overdue task shows `Overdue · Nd` with no new color. |
| D9 | Today view shows Overdue / Today / Done today groups and the 2px progress fill matches the counts. |
| D10 | Board moves a row between columns by keyboard and announces it via `aria-live`. |
| D11 | Delete a task → toast with `Undo` → `Undo` restores it with the same id, order and fields. |
| D12 | Modal traps focus, `Esc` closes, focus returns to the invoker, `Ctrl/⌘+Enter` saves. |
| D13 | Search filters across title/notes/project/tags and leaving search restores the full view. |
| D14 | Reload preserves view, theme, search-clear state, and all tasks. |
| D15 | Dark theme: toggle both ways, verify §5.3 contrast in both. |
| D16 | `./` the §11 lint greps return zero hits. |
| D17 | DevTools Network tab shows zero requests after load. |
| D18 | 200% zoom and a 720px-wide window: no clipping, no horizontal scroll, rail collapses per §7.1. |
| D19 | `Sign out` returns to auth and leaves every task intact after signing back in. |
| D20 | Screenshot the four views in both themes (8 images). Compared side by side, they read as one system: same border color, same gaps, same type scale, one accent. |

---

## 14. Bootstrap prompt for the implementing agent

Paste this together with `SPEC.md`:

> You are implementing a small offline web app from a frozen specification. Read `SPEC.md` completely before writing code. Treat §5 (`tokens.css`), §6 (status/priority/color rules), §7 (layout and component numbers), §11 (anti-slop lint) and §13 (Definition of Done) as contractual.
>
> Rules: do not redesign anything, do not add features from §1's out-of-scope list, do not introduce any library, do not invent colors, sizes, radii, shadows, gradients or animations. Copy the §5 token block verbatim into `styles/tokens.css` first, then build `db.js` → `auth.js` → `store.js` → `ui.js` → `main.js` in that order, then the HTML shell.
>
> When unsure, choose the most plain and quiet option and record the choice in `DECISIONS.md`. When finished, run §13 top to bottom, run the §11 greps, and report the pass/fail table with evidence (screenshots named `view-theme.png`). If any check fails, fix it before reporting done. Never declare a check passed without having run it.

---

## 15. Open decisions the implementer must record in `DECISIONS.md`

These are intentionally left to the implementer; pick, document, and stay consistent:

1. `file://` classic scripts vs. an ES-module build served over `python -m http.server` (C2/C5 note in §2).
2. Drag-and-drop on the Board: implement or keep keyboard-only.
3. Command palette (`§7.7`): implement or omit.
4. Whether quick-add appears in every list view or only Inbox and Today.
5. Whether `tags` are free text or a fixed list defined in Settings.
