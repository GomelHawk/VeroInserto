# VeroInserto - working notes

Context for continuing work on this repository. The current version is whatever
`plugins/vero-inserto/.claude-plugin/plugin.json` says; no other file states one. The
plugin's name is always written **VeroInserto** (display) or `vero-inserto` (key); the slogan
is *From tree to prompt.*

## Working rules

- **A question gets an answer, nothing else.** When the owner asks for information -
  "how does X work", "what about Y", "why is Z" - reply with the information and change
  no files. Do not edit, stage, create or delete anything as a side effect of answering.
- **Ask before changing anything that was not asked for.** If you spot something worth
  changing - wrong documentation, a bug, a stale reference, an obvious improvement - say
  what it is and why it should change, then wait for a yes. Noticing a problem while
  doing something else is a reason to report it, not a licence to fix it. Approval for
  one change never extends to the next thing you notice.
- **Never commit.** Do not run `git commit`, `git push`, `git tag`, `git rebase` or
  anything else that writes history - not even when the work is finished, the tree is
  clean and the change is obviously correct. Editing files and staging them is fine;
  creating a commit is the repo owner's call, always.
- **Finish with a really short commit description.** When an implementation is done, hand
  back a one-line commit message for the owner to use. One line, no body, no explanation
  wrapped around it.
- **Documentation describes the plugin as it is, not its history.** No "was decided",
  "replaced", "earlier design" or similar in any published file; a section that moves a
  user from an older release is the one exception.

## What this is

A Claude Code plugin - a **mod**: one TypeScript hooks module - that turns `@@` in the
prompt into a pane with the project tree. A pick puts `@path ` where the `@@` was, the
mention Claude Code reads, and closes the pane. While the pane is up the plugin keeps the
draft and the box is empty, because the engine gives a pane the keys only over an empty
box; the draft goes back with the pick, or as it was. The tree is read with `$.fs.list`,
kept in `$.state` for the session and gone with it; the plugin writes no file anywhere,
runs no process, and never submits a prompt in the person's name. The engine's own `@`
typeahead is untouched: one `@` is the engine's, `@@` is ours, `@@@` stays as typed.

Repository `GomelHawk/VeroInserto`, plugin `vero-inserto`, display name `VeroInserto`, command
`/vero-inserto`, MIT. English only, by the owner's decision. Installed only from
[VeroPlugins](https://github.com/GomelHawk/VeroPlugins) (marketplace `vero-plugins`), the
one catalog for every Vero plugin; that repository's CLAUDE.md has the catalog rules and
the canonical source check, and its STANDARD.md the rules every Vero plugin follows.

## Repository layout

```
VeroInserto/                                      the plugin's repository (the catalog is VeroPlugins)
├── .gitattributes                          * text=auto eol=lf
├── .github/workflows/ci.yml                manifests + plugin test, shell lint, smoke, endings
├── .github/workflows/release.yml           a v* tag tells VeroPlugins' CI to re-check the entry
├── .github/dependabot.yml                  watches the CI actions; there are no deps
├── assets/                                 logo.png (1024×1024), horizontal-logo.png (1024×368)
├── tests/smoke.sh                          repo invariants: bash + grep + python3
├── install.sh / uninstall.sh               (--scope project|local DIR for a project)
├── CLAUDE.md                               this file
├── CONTRIBUTING.md                         testing, CI, publishing: for maintainers
├── README.md                               user-facing docs; byte-identical copy in the plugin
└── plugins/vero-inserto/                         the plugin, name "vero-inserto"
    ├── .claude-plugin/plugin.json          manifest: version, userConfig, "types" contract
    ├── hooks/hooks.json                    { "modules": ["./register.tsx"] }, nothing else
    ├── hooks/register.tsx                  the mod: the source check, /vero-inserto, the band, the @@ trigger, the pane
    ├── hooks/tree.ts                       pure rules: the trigger, a folder's order, the rows, the mention; no `$`
    ├── hooks/source-check.ts               the shared source check: a byte-identical copy of VeroPlugins/shared/hooks/
    ├── types/index.d.ts                    $.state contract: PluginState['vero-inserto'] - `view` and `tree`
    ├── tests/tree.test.ts                  the pure rules' table
    ├── tests/pane.test.tsx                 `claude plugin test`: the trigger, the pane, the filter, the option, both surfaces
    ├── tests/stopped.test.tsx              `claude plugin test`: stopped mode on both surfaces
    └── tests/source-check.test.ts          the source check's table: a copy of VeroPlugins/shared/tests/
```

## How it works

**The trigger.** `prompt.edit` fires for every edit of the main prompt box with the draft
before it and the splice (`start`, `end`, `inputText`). `trigger(e, what)` (hooks/tree.ts)
recognises the trigger's last character typed right after the rest of it (`@@` by
default, the `trigger` option through `triggerOf()`: two to four characters, no
whitespace, else the default; a trigger of one repeated character typed once more, `@@@`,
is left alone) and returns the draft on either side (`Draft`: `before`, `after`). The hook keeps it as
`tree.draft` and answers the box itself - empty, cursor 0 - which consumes the key:
neither `@` lands and the box is blank. Everything else is `next(e)`, the engine's own
edit, so its `@` typeahead works as before. The hook has a `.catch` to `next(e)`: a
failure is a normal edit. The pane is opened after `$.clock.sleep(OPEN_AFTER_MS)`, not
from inside the hook: the editor applies the hook's answer once it has returned, and
`$.ui.open`'s `focus` is granted only over an empty composer, so a pane opened from
inside the hook never takes the keys, while one opened a moment later, over the emptied
box, does. While a draft is kept, any other `prompt.edit` means the person typed in the
box instead: the hook answers `before + inputText + after` with the cursor after the
key, drops the draft and closes the pane.

**The pane.** `openPane()` reads the root once (`loadFolder('')`) and calls
`$.ui.open({ id: 'vero-inserto', focus: true, closeOnEscape: true, rows: 20 })`: dialog
manners, Esc closes. An open from `@@` is unasked in the engine's eyes and waits undrawn
below 144 terminal columns (110 once the person opened that id themselves); `isPlaced:
false` then toasts `TOAST.noRoom` with the engine's reason and names the command, whose
open is the person's own and is placed at any width. The `ui.render` hook on
`{ component: 'Pane', requestId: 'vero-inserto' }` draws: an `Input` (`filter`,
`autoFocus`, `onInput` → `setFilter()`, `onSubmit` → the first row's press) where the
surface has one (mobile has none, so it is taken from the resolved table only if there);
a dim line while `!e.props.isFocused` saying how to move the keys; the rows as `plain`
Buttons keyed `dir:<path>`, `paste:<path>`, `file:<path>`; `… n more` past `MAX_ROWS`; the
key line; and on the terminal a `Close` button (the desktop has its own close mark). A
stopped copy draws an empty Box.

**The rows.** With an empty filter, `treeRows()`: the root's entries, each expanded
folder's beneath it one level in, with a `@ name/` paste row first. A `dir` row toggles
(`toggleFolder()`: read once, then `expanded` in or out), a `paste` row pastes the folder,
a `file` row pastes the file. With a filter, `filterRows()`: every loaded path whose text
(a folder with its slash) holds each word of the filter, in any case, flat, A to Z, every
row a paste. A folder's entries are `listed()`: files and folders only, the `ignore`
names dropped, folders first, then files, A to Z regardless of case.

**The filter.** `setFilter()` stores the text and, once it is not blank, `loadWhole()`:
breadth-first `$.fs.list` over every folder not yet read, until `MAX_ENTRIES` (20,000)
entries are in, then `isWhole` (never again this session) and `isCapped` (the pane says
the filter searches only what was read). `isLoading` draws a line and makes a second
call return at once. A folder that cannot be read is stored empty.

**The pick.** `paste()`: with a draft kept, `restoreDraft($, mention)` fills
`before + mention + after` with `mode: 'replace'` and drops the draft; with none (the
command's pane), `$.prompt.fill({ text: mention, mode: 'insert' })` at the cursor. Then
the pick's folder (`parentOf(path)`, or the picked folder itself) becomes `tree.lastDir`
and it and every folder above it (`chainOf()`) join `expanded`; then `$.ui.close({ id })`.
A refused fill (a dialog is up) toasts `fillRefusedToast()`, keeps the draft and leaves
the pane open. A `replace` puts the cursor at the text's end, which is where it was
unless the `@@` stood mid-draft; no fill mode places it elsewhere.

**The focus.** The pane's `ui.render` gives `autoFocus` to one element: the `dir:` row of
`tree.lastDir` while the filter is empty and that row is in the tree, else the `Input`.
The engine starts the focus ring there when the pane takes the keys ("of several in one
site the first drawn wins", so the Input gets it only when no row does) and leaves a ring
the person moved alone.

**The draft's way back.** `restoreDraft($, '')` on every road out but a pick: the
`ui.close` hook for the pane's id (Esc, the desktop's close mark; the plugin's own close
does not pass through it), the terminal's Close button, an open that is not placed, and
the `prompt.edit` case above (with the key in the middle). `draftLine()` draws the kept
draft on the pane's first line, a `▮` where the `@@` was, cut to the pane's width.

**State.** `tree` in `$.state` (`types/index.d.ts`, `Tree`): `root` (the `cwd` of
`session.start`), `folders` by relative path (`''` the root), `expanded`, `filter`,
`isWhole`, `isCapped`, `isLoading`, `draft`, `lastDir`. Kept across turns (the
`turn.start` reset touches `view` only), reset at `session.start` and `session.end`.
Nothing is in `$.store`.

**Options** (`userConfig`): `trigger` (string, default `@@`, `triggerOf()`) and `ignore`
(string, default `.git, node_modules`), split on commas and whitespace by
`ignoredNames()`; a blank value is the default. Any new option is put to the owner item
by item before it is written.

**The command.** `/vero-inserto`, registered in `session.start`, answers `command.run` with
`{ text }`: the name, the slogan, how the pane works, the options' values; while the copy
works it also opens the pane, asked, so it is placed at any width.

**Source check.** VeroInserto works only when installed from VeroPlugins or loaded as a
development copy. `refreshSource()` runs first in `session.start` and again on
`turn.start` - every turn while stopped, at most every 10 s (`RECHECK_MS`,
`$.clock.now()`) while working: `sourceOf($.plugin.root)` reads the marketplace off the
root (`<config dir>/plugins/cache/<marketplace>/<plugin>/<version>`; no such segment means
`dev`), and a `home` copy then reads `$.settings.read({ source })` for `user`, `project`
and `local` and asks `legacyCopies()` whether an older copy of `vero-inserto` is still enabled
under another marketplace. `foreign`, or a legacy copy, means **stopped** (`view.source`,
`view.legacy`): every hook's first line is the engine's own behaviour; `session.start`
registers the command and shows one toast; `/vero-inserto` answers `stoppedMarkdown()` /
`legacyMarkdown()`; and the `AbovePrompt` hook, otherwise `next(e)`, draws the stopped
row - `stoppedBand()` with the four `MOVE_LABELS` buttons (`vero-inserto-move:1..4`), or
`legacyBand()` with the two `REMOVE_LABELS` buttons (`vero-inserto-move:remove-1..2`), then
`RESTART_NOTE`, then what `next(e)` drew beneath - with no ×. A button puts its command
(`moveSteps()` / `removeSteps()`) into the prompt box with `$.prompt.fill({ mode: 'replace' })` for the
person to press Enter on. A draft in the box (`$.prompt.read()`) is asked about first
(`view.confirmingFill`, `REPLACE_QUESTION`, `vero-inserto-move:replace` / `vero-inserto-move:cancel`);
a refused fill toasts `fillRefusedToast()`. All texts, keys and rules come from
`hooks/source-check.ts`, the byte-identical copy of VeroPlugins' canonical file; its table
is `tests/source-check.test.ts`. The test seam: a `dev` copy reads
`$.env.get('VERO_TEST_ROOT')` and, when set, takes its source from that path; only a dev
copy consults it, so no installed copy can opt out.

## Gotchas discovered the hard way

- **Never declare `hooks` in `plugin.json`.** `hooks/hooks.json` is auto-discovered;
  naming it in the manifest loads it twice and the plugin fails to load.
- **`hooks.json` names the module and nothing else.** `tests/smoke.sh` asserts the content.
- **Never add a top-level `bin/`.** claude.ai organization distribution rejects it.
- **`version` in `plugin.json` pins the plugin.** The catalog is VeroPlugins; never put
  `version` in its entry.
- **`name` is the user-visible key** in `enabledPlugins`. Renaming needs `renames` in
  VeroPlugins' catalog.
- **`$.plugin` has `name` and `root` only, no provenance.** `<name>@<marketplace>` exists
  on the `plugin.register` event, which a plugin cannot hook for itself; the path is the
  source check.
- **`$.settings.read({ source: 'user' | 'project' | 'local' })`** returns that one file's
  object, `enabledPlugins` included, with no permission prompt; a scope with no file is
  `{}`. In a test it is an op answered with `{ value }`.
- **`$.env.get` takes a string literal**; `claude plugin validate` lists the names read.
  `mock.env` answers it in a test from a fixed set; a test that changes the environment
  between turns answers `env.get` itself.
- **The command name must be a literal** in both `$.command.register` and the
  `command.run` matcher. Through a `const`, `claude plugin validate` lists the hook as a
  gate without `.catch` instead of "answers its own command".
- **Give a gating hook a `.catch`.** `claude plugin validate` flags `ui.close`, `tool.call`
  and a render that replaces the engine's drawing without one: a hook that throws there
  would keep a pane open, fail the model's call or leave a blank reply.
- **A test answers every event the plugin's hooks call `next` on** - `ui.render`,
  `turn.start`, `session.end` - or the kit fails with "no implementation".
- **`$.fs` has no delete.** Anything written to disk stays. VeroInserto writes nothing.
- **`$.ui.open`'s `focus` is a request the engine refuses over a non-empty composer.**
  Seen live: the first `@@` in an empty prompt took the keys, a second one after a pick
  did not. Hence the kept draft: the hook empties the box, the pane opens over it and
  takes the keys, and the draft goes back with the pick. A band button or another pane
  holding the keys still refuses it; the pane's dim line says what to press.
- **`$.prompt.fill` places the cursor only at the end** (`replace`, `append`) or after
  the inserted text (`insert`), never elsewhere, so a draft put back around a pick has
  its cursor at the end. The README says so.
- **A pane opened from inside `prompt.edit` cannot take the keys**: the box still holds
  the `@` the hook is about to cut. Hence `OPEN_AFTER_MS` and the test's
  `clock.advance(50)` before anything about the pane is asserted.
- **`prompt.edit` is a gate**: answering without `next` consumes the key. The engine's
  own editor is the bottom of the chain, so a test answers it beneath the plugin (the
  splice applied) or every pass-through edit fails with "no implementation".
- **The kit raises `prompt.edit` through `$.prompt.edit`** at run time, but its types list
  no such call (`EventCalls` has `submit`, `fill`, `suggest`, ... and not `edit`), so
  `tests/pane.test.tsx` casts `$.prompt` once, in `editor()`. A build that types the call
  makes the cast unnecessary.
- **The kit raises no `ui.close`** (`$.ui.close` is not on a test's `$`), so the person's
  Esc and close mark are a live check; the terminal's Close button, which calls
  `restoreDraft()` itself, is what the test presses.
- **Mobile has no `Input`.** The table `$.ui.resolve(e)` answers has no such element
  there; the pane reads it off the table (`'Input' in table`) rather than destructuring.
- **Two panes are tabs.** Open panes share one frame; opening ours beside VeroDiff's adds a
  tab, and which one shows is the surface's call. Esc with the keys in ours closes ours.
- **The mod API is early access.** Re-run `claude plugin validate` and `claude plugin test`
  against each new Claude Code release before cutting one of ours.

## Testing

```bash
tests/smoke.sh                                   # repo invariants
claude plugin test ./plugins/vero-inserto              # stopped mode, the source check's table, your tests

claude plugin validate ./plugins/vero-inserto          # manifest, hooks module, state contract
claude plugin validate ./plugins/vero-inserto --strict # for CI
```

Loading the plugin once with `--plugin-dir` makes the engine write its declarations into
`plugins/vero-inserto/.claude-plugin/types/` (self-ignored) and a `tsconfig.json` beside
`plugin.json` (in `.gitignore`); after that, `npx -p typescript tsc -p plugins/vero-inserto`
type-checks the module and the tests.

Live, in a scratch repository:

```bash
claude --plugin-dir /path/to/VeroInserto/plugins/vero-inserto
```

Then, in that session: type `see @@` → the box empties, the pane opens with the keys and
shows `see ▮` on its first line; Down to a file, Enter → the prompt reads `see @path `
with the cursor at the end, the pane closed; `@@` again right after → the pane again
(the draft now holds the first pick), Enter on a folder → it opens with an `@ name/` row
first; type in the box → a flat list, Enter → the first row pasted; `@@`, then Esc → the
draft back as it was; `@@`, then a letter typed in the prompt → the draft back with the
letter where `@@` was, the pane closed; `@@@` → stays as typed; one `@` → the engine's
own list; after a pick in `src/lib`, `@@` → `src` and `lib` open and the focus ring on
`▾ lib/`; `trigger` set to `@#` in `/config` → `@#` opens the pane and `@@` stays. In a fullscreen terminal with VeroDiff's pane open, `@@` → a second tab beside
it; after the pick, VeroDiff's pane as before. On a terminal under 144 columns, `@@` →
the draft back and the "no room" toast; `/vero-inserto` → the pane.

Add a case to the tests for anything you fix in the module, and to `smoke.sh` for
anything in the scripts.

## Cutting a release

**Trigger.** The owner says "update version", "bump the version", "prepare a release" or
anything equivalent. Run the whole procedure; do not start it unprompted, and do not skip
steps because the change looks small.

### 1. Collect every change since the last release

```bash
# tags are plain `v<version>`, e.g. v1.0.0. A pattern that matches nothing fails silently
# and rebuilds a changelog for work already shipped, so keep these two in step.
LAST="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null)"
[ -n "$LAST" ] || LAST="$(git log -1 --format=%H \
    -S'"version"' -- plugins/vero-inserto/.claude-plugin/plugin.json)"

git log --no-merges --format='%h %s' "$LAST..HEAD"
git diff --stat "$LAST..HEAD"
git diff "$LAST..HEAD" -- plugins/vero-inserto
```

Read the diff, not only the subjects. Keep CI, tests and internal refactors out of the
user-facing notes.

### 2. Propose a number

| What changed | Bump |
| :-- | :-- |
| a command, option or key removed or renamed | major - `2.0.0` |
| a new option, button or capability | minor - `1.1.0` |
| fixes, wording, docs, CI, tests only | patch - `1.0.1` |

### 3. Ask before editing anything

Put it to the owner with `AskUserQuestion`: the computed number first, the neighbouring
ones as alternatives, each labelled with why it fits. Their answer wins. Never bump
without a reply.

### 4. Make the edits

- **`plugins/vero-inserto/.claude-plugin/plugin.json`** - `version`. The only place a
  version has any effect. Never also in the marketplace entry.
- **`plugins/vero-inserto/CHANGELOG.md`** - a new `## <version> - <YYYY-MM-DD>` at the top,
  user-facing, grouped, never raw commit subjects.
- Anything the release makes untrue in `README.md`, `plugins/vero-inserto/README.md` (keep
  them byte-identical) or this file.
- Run `tests/smoke.sh`, `claude plugin test ./plugins/vero-inserto` and both
  `claude plugin validate` commands, and report the result.

### 5. Hand back - never execute

No commit, no push, no tag. Stage the edits and hand the owner:

1. The one-line commit message.
2. **Release notes** for the GitHub Release body: the changelog entry as a standalone
   note, opening with one sentence on why anyone should care.
3. The commands:

```bash
git add -A && git commit -m "VeroInserto <version>" && git push
git tag v<version> && git push origin v<version>
gh release create v<version> --title "VeroInserto <version>" --notes-file notes.md
```

### What a release actually is

Users' marketplace is VeroPlugins, whose `vero-inserto` entry follows this repository's
**`main`** (a `git-subdir` source, no ref), so pushing a bumped `version` to `main` **is**
the release; the tag and the GitHub Release announce it. The `v<version>` tag also runs
`.github/workflows/release.yml`, which sends `plugin-released` to VeroPlugins (secret
`VEROPLUGINS_DISPATCH_TOKEN`), whose CI then re-checks the entry against this repository.
A fix pushed without a version bump reaches nobody (the cache is keyed by version, at
`~/.claude/plugins/cache/vero-plugins/vero-inserto/<version>/`), and unfinished work on
`main` ships the moment the version changes - keep it on a branch. Users update with
`/plugin marketplace update vero-plugins`, then `/plugin update vero-inserto@vero-plugins`,
and a restart.

## Open ideas, not implemented

None.
