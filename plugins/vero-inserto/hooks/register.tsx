import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, Tree, View } from '../types'
import {
  MOVE_LABELS,
  REMOVE_LABELS,
  REPLACE_NO,
  REPLACE_QUESTION,
  REPLACE_YES,
  RESTART_NOTE,
  fillRefusedToast,
  legacyBand,
  legacyCopies,
  legacyMarkdown,
  legacyToast,
  moveSteps,
  removeSteps,
  sourceOf,
  stoppedBand,
  stoppedMarkdown,
  stoppedToast,
} from './source-check'
import type { LegacyCopy, ScopeSettings, Source } from './source-check'
import { DEFAULT_IGNORE, chainOf, draftLine, filterRows, ignoredNames, join, listed, mention, parentOf, treeRows, trigger, triggerOf } from './tree'
import type { Draft, Row } from './tree'

// VeroInserto - From tree to prompt.
// Type @@ in the prompt, pick a file or folder from your project tree, and its @path lands at the cursor.
//
// The second @ of @@ (the `trigger` option) opens a pane with the project tree; a pick
// puts `@path ` where the @@ was, the mention Claude Code reads, and closes the pane. The
// folder of the pick is open, its row under the focus, the next time. While the pane is up the
// draft is kept by the plugin and the box is empty: the engine gives a pane the keys only
// over an empty box. Nothing is written anywhere: the tree is read with `$.fs.list`, kept
// in `$.state` for the session, and gone with it.
//
// The first part of this module is what every Vero plugin shares: the source check and
// its stopped mode, the command, the band above the prompt. The plugin's own hooks follow
// "the plugin's own hooks"; every one of them starts with the stopped check.

const PLUGIN = 'vero-inserto'
const DISPLAY = 'VeroInserto'
// What the move leaves in place, for the stopped message: a phrase such as
// "VeroInserto's cache lives in ~/.cache/vero-inserto". `undefined` when the plugin keeps nothing.
const KEEPS: string | undefined = undefined

const PANE = 'vero-inserto'
const TITLE = 'VeroInserto'
// Rows drawn at most: the engine scrolls the pane, and a tree past this is cut and counted.
const MAX_ROWS = 400
// Entries read at most when the filter needs the whole tree; past it the filter searches
// what was read and the pane says so.
const MAX_ENTRIES = 20_000
// The pane's height while it sits above the prompt, in rows.
const PANE_ROWS = 20
// How long after the @@ edit the pane opens. The editor applies the hook's answer (the
// emptied box) once the hook has returned, and only then may a pane take the keys; opened
// from inside the hook it never could.
const OPEN_AFTER_MS = 50

const TOAST = {
  error: 'VeroInserto could not do that.',
  noRoom: (reason: string) => `VeroInserto: no room for the tree pane (${reason}). Type /vero-inserto to open it anyway.`,
}

const EMPTY_TREE: Tree = { root: '', folders: {}, expanded: [], filter: '', isWhole: false, isCapped: false, isLoading: false }
const tree = atom({ plugin: 'vero-inserto', key: 'tree' } as const, EMPTY_TREE)

const INITIAL: View = { source: { kind: 'dev' } }
const view = atom({ plugin: 'vero-inserto', key: 'view' } as const, INITIAL)

// A new session or turn starts from nothing, except where this copy came from: that is
// re-read, never forgotten.
const reset = ($: EngineInterface) => update($, view, cur => ({ ...INITIAL, source: cur.source, legacy: cur.legacy }))

// --- the source check -------------------------------------------------------------------
// VeroInserto works only when installed from VeroPlugins (the `vero-plugins` marketplace) or
// loaded as a development copy. A copy from any other marketplace is stopped: every hook
// passes through, and the band above the prompt holds the commands that move it. A home
// copy beside an older copy of itself (enabled in the settings under another marketplace)
// stops too, so two copies never act together.

async function checkSource($: EngineInterface): Promise<{ source: Source; legacy?: LegacyCopy }> {
  try {
    let source = sourceOf($.plugin.root)
    if (source.kind === 'dev') {
      // the test seam: only a development copy consults it, so no installed copy can opt out
      const testRoot = await $.env.get('VERO_TEST_ROOT')
      if (testRoot) source = sourceOf(testRoot)
    }
    if (source.kind !== 'home') return { source }
    const sources: ScopeSettings[] = []
    for (const scope of ['user', 'project', 'local'] as const) {
      sources.push({ scope, settings: await $.settings.read({ source: scope }).catch(() => undefined) })
    }
    return { source, legacy: legacyCopies(PLUGIN, sources)[0] }
  } catch {
    return { source: { kind: 'dev' } }
  }
}

const isStopped = (v: View) => v.source.kind === 'foreign' || v.legacy !== undefined

// While a copy works, its source is re-read at most this often: another copy appearing
// beside it mid-session is rare, and the band tells the person to restart anyway. A
// stopped copy re-reads on every turn, so the old copy's removal is seen at the next Enter.
const RECHECK_MS = 10_000
let checkedAt = -Infinity

async function refreshSource($: EngineInterface, isForced: boolean): Promise<{ source: Source; legacy?: LegacyCopy }> {
  const v = await read($, view)
  const now = await $.clock.now()
  if (!isForced && !isStopped(v) && now - checkedAt < RECHECK_MS) return { source: v.source, legacy: v.legacy }
  checkedAt = now
  return checkSource($)
}

// The stopped message: the command's answer.
function stoppedMessage(v: View): string {
  if (v.legacy !== undefined) return legacyMarkdown(DISPLAY, PLUGIN, v.legacy)
  return stoppedMarkdown(DISPLAY, PLUGIN, v.source.kind === 'foreign' ? v.source.marketplace : '', KEEPS)
}

// Puts one move command into the prompt box, for the person to press Enter on. A draft
// already there is never overwritten without asking.
async function fillCommand($: EngineInterface, command: string, isConfirmed = false) {
  if (!isConfirmed) {
    const { text } = await $.prompt.read()
    if (text.trim() !== '' && text !== command) {
      await update($, view, cur => ({ ...cur, confirmingFill: command }))
      return
    }
  }
  await update($, view, cur => ({ ...cur, confirmingFill: undefined }))
  const filled = await $.prompt.fill({ text: command, mode: 'replace' })
  if (!filled.isFilled) $.ui.toast(fillRefusedToast(DISPLAY))
}

// Every press runs through here, so a failure is a toast rather than an unhandled
// rejection.
const pressed = ($: EngineInterface, work: () => Promise<unknown>) => () => {
  void work().catch(() => $.ui.toast(TOAST.error))
}

// --- the tree ---------------------------------------------------------------------------

// One folder as the tree shows it, read from the project.
async function listFolder($: EngineInterface, root: string, path: string, ignored: ReadonlySet<string>): Promise<Entry[]> {
  const entries = await $.fs.list(path === '' ? root : `${root}/${path}`)
  return listed(entries, ignored)
}

// One folder, read once: a folder already in the tree is left as it is.
async function loadFolder($: EngineInterface, path: string, ignored: ReadonlySet<string>) {
  const t = await read($, tree)
  if (t.folders[path] !== undefined) return
  const entries = await listFolder($, t.root, path, ignored)
  await update($, tree, cur => ({ ...cur, folders: { ...cur.folders, [path]: entries } }))
}

// Every folder, for the filter: breadth first from what is read already, until the cap.
// A folder that cannot be read is shown empty. One read at a time; a second call while
// one runs does nothing.
async function loadWhole($: EngineInterface, ignored: ReadonlySet<string>) {
  const t = await read($, tree)
  if (t.isWhole || t.isLoading) return
  await update($, tree, cur => ({ ...cur, isLoading: true }))
  try {
    const folders = { ...t.folders }
    if (folders[''] === undefined) folders[''] = await listFolder($, t.root, '', ignored)
    let count = Object.values(folders).reduce((n, entries) => n + entries.length, 0)
    let isCapped = false
    const queue: string[] = []
    for (const dir of Object.keys(folders)) {
      for (const entry of folders[dir] ?? []) {
        if (entry.kind === 'dir' && folders[join(dir, entry.name)] === undefined) queue.push(join(dir, entry.name))
      }
    }
    for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
      if (count >= MAX_ENTRIES) {
        isCapped = true
        break
      }
      const entries = await listFolder($, t.root, dir, ignored).catch(() => [] as Entry[])
      folders[dir] = entries
      count += entries.length
      for (const entry of entries) if (entry.kind === 'dir') queue.push(join(dir, entry.name))
    }
    await update($, tree, cur => ({ ...cur, folders: { ...cur.folders, ...folders }, isWhole: true, isCapped, isLoading: false }))
  } catch (error) {
    await update($, tree, cur => ({ ...cur, isLoading: false }))
    throw error
  }
}

// Opens the pane over the project tree, the root read first. Opened on the person's @@
// it is unasked in the engine's eyes and waits undrawn on a narrow terminal; the draft
// then goes straight back and the toast names the command, whose open is placed at any
// width.
async function openPane($: EngineInterface, ignored: ReadonlySet<string>) {
  await loadFolder($, '', ignored)
  const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true, rows: PANE_ROWS })
  if (!opened.isPlaced) {
    await restoreDraft($, '')
    $.ui.toast(TOAST.noRoom(opened.reason))
  }
}

// The kept draft goes back into the box with `middle` where the @@ was, and is kept no
// more. Nothing kept: nothing done. The box's cursor lands at the end of the text: a
// fill places it nowhere else, which is where it was unless the @@ stood mid-draft.
async function restoreDraft($: EngineInterface, middle: string): Promise<boolean> {
  const t = await read($, tree)
  const draft = t.draft
  if (draft === undefined) return true
  await update($, tree, cur => ({ ...cur, draft: undefined }))
  const filled = await $.prompt.fill({ text: draft.before + middle + draft.after, mode: 'replace' })
  if (!filled.isFilled) await update($, tree, cur => ({ ...cur, draft }))
  return filled.isFilled
}

// A pick: the mention goes where the @@ was (the kept draft around it) or, with no draft
// kept (the command's pane), at the cursor; then the pane closes. The pick's folder (a
// picked folder itself) is remembered: open, under the focus, next time. A box that
// takes no fill (a dialog is up) says so, and the pane stays for a second try.
async function paste($: EngineInterface, path: string, isDir: boolean) {
  const t = await read($, tree)
  const isFilled =
    t.draft !== undefined ? await restoreDraft($, mention(path, isDir)) : (await $.prompt.fill({ text: mention(path, isDir), mode: 'insert' })).isFilled
  if (!isFilled) {
    $.ui.toast(fillRefusedToast(DISPLAY))
    return
  }
  const lastDir = isDir ? path : parentOf(path)
  await update($, tree, cur => ({
    ...cur,
    lastDir,
    expanded: [...cur.expanded, ...chainOf(lastDir).filter(dir => !cur.expanded.includes(dir))],
  }))
  await $.ui.close({ id: PANE })
}

// A folder row: closes an open folder, reads and opens a closed one.
async function toggleFolder($: EngineInterface, path: string, ignored: ReadonlySet<string>) {
  const t = await read($, tree)
  if (t.expanded.includes(path)) {
    await update($, tree, cur => ({ ...cur, expanded: cur.expanded.filter(one => one !== path) }))
    return
  }
  await loadFolder($, path, ignored)
  await update($, tree, cur => ({ ...cur, expanded: [...cur.expanded, path] }))
}

// The filter box: its text, and the whole tree once there is something to search for.
async function setFilter($: EngineInterface, text: string, ignored: ReadonlySet<string>) {
  await update($, tree, cur => ({ ...cur, filter: text }))
  if (text.trim() !== '') await loadWhole($, ignored)
}

// What `/vero-inserto` answers while the plugin works: the name, the slogan, what it does,
// and the options' values.
function statusText(what: string, ignore: string): string {
  return [
    '**VeroInserto** - *From tree to prompt.*',
    '',
    `Type \`${what}\` in the prompt: a pane shows your project tree and takes the keys; your draft is ` +
      'kept meanwhile and shown in the pane. The arrows walk it, Enter opens a folder or pastes ' +
      "a file, an open folder's first row pastes the folder, and the box at the top filters the " +
      `whole tree. The pick goes where the \`${what}\` was, as \`@path\`, the way Claude Code reads a file ` +
      'mention, the draft comes back around it, and the pane closes. Esc closes it with the draft ' +
      "back as it was. Next time, the last pick's folder is open with the focus on it. `/vero-inserto` " +
      'opens the same pane.',
    '',
    'Options (change them in `/config`):',
    `- \`trigger\`: **${what}** - what opens the pane; two to four characters`,
    `- \`ignore\`: **${ignore}** - folder and file names the tree leaves out`,
  ].join('\n')
}

export const register: Register = (on, config) => {
  const what = triggerOf(config.trigger)
  const ignore = typeof config.ignore === 'string' && config.ignore.trim() !== '' ? config.ignore : DEFAULT_IGNORE
  const ignored = ignoredNames(ignore)

  on('session.start', async ($, e, next) => {
    const { source, legacy } = await refreshSource($, true)
    await update($, view, () => ({ ...INITIAL, source, legacy }))
    // a new session starts from nothing: the tree is read again, from this project
    await update($, tree, () => ({ ...EMPTY_TREE, root: e.cwd }))
    await $.command.register({
      name: 'vero-inserto',
      description: 'VeroInserto: opens the project tree to pick a path from; describes the plugin',
    })
    // stopped: the command answers, the band says how to move; nothing else happens
    if (legacy !== undefined) $.ui.toast(legacyToast(DISPLAY, legacy), { timeoutMs: 8000 })
    else if (source.kind === 'foreign') $.ui.toast(stoppedToast(DISPLAY, source.marketplace), { timeoutMs: 8000 })
    return next(e)
  })

  // A /clear ends the conversation with no session.start after it.
  on('session.end', async ($, e, next) => {
    const done = await next(e)
    await reset($)
    await update($, tree, () => EMPTY_TREE)
    return done
  })

  // The source is read again each turn: an install or uninstall mid-session is picked up
  // here (every turn while stopped, at most every 10 s while working).
  on('turn.start', async ($, e, next) => {
    const { source, legacy } = await refreshSource($, false)
    await update($, view, () => ({ ...INITIAL, source, legacy }))
    return next(e)
  })

  // The command: stopped, the message; working, the pane (this open is the person's own,
  // so it is placed at any width) and the description.
  on('command.run', { command: 'vero-inserto' }, async ($) => {
    const v = await read($, view)
    if (isStopped(v)) return { text: stoppedMessage(v) }
    await openPane($, ignored).catch(() => $.ui.toast(TOAST.error))
    return { text: statusText(what, ignore) }
  })

  // The band above the prompt: nothing, unless this copy is stopped. Then the reason and
  // the buttons that put the move commands into the prompt box, with what the plugins
  // beneath drew kept under it. No ×: the row stays until the copy is moved.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || !isStopped(v)) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const below = await next(e)
    const legacy = v.legacy
    const marketplace = v.source.kind === 'foreign' ? v.source.marketplace : ''
    const fill = (command: string, isConfirmed = false) => pressed($, () => fillCommand($, command, isConfirmed))

    const buttons =
      v.confirmingFill !== undefined ? (
        <Box flexDirection="row" gap={1}>
          <Text>{REPLACE_QUESTION}</Text>
          <Button key="vero-inserto-move:replace" variant="primary" onPress={fill(v.confirmingFill, true)}>
            {REPLACE_YES}
          </Button>
          <Button key="vero-inserto-move:cancel" onPress={pressed($, () => update($, view, cur => ({ ...cur, confirmingFill: undefined })))}>
            {REPLACE_NO}
          </Button>
        </Box>
      ) : legacy !== undefined ? (
        <Box flexDirection="row" gap={2}>
          {removeSteps(PLUGIN, legacy).map((command, i) => (
            <Button key={`vero-inserto-move:remove-${i + 1}`} onPress={fill(command)}>
              {REMOVE_LABELS[i]}
            </Button>
          ))}
          <Text dimColor>{RESTART_NOTE}</Text>
        </Box>
      ) : (
        <Box flexDirection="row" gap={2}>
          {moveSteps(PLUGIN, marketplace).map((command, i) => (
            <Button key={`vero-inserto-move:${i + 1}`} onPress={fill(command)}>
              {MOVE_LABELS[i]}
            </Button>
          ))}
          <Text dimColor>{RESTART_NOTE}</Text>
        </Box>
      )

    return (
      <Box flexDirection="column">
        <Text>{legacy !== undefined ? legacyBand(DISPLAY, legacy) : stoppedBand(DISPLAY, marketplace)}</Text>
        {buttons}
        {below}
      </Box>
    )
  })

  // --- the plugin's own hooks ----------------------------------------------------------

  // The trigger: the second @ of @@. The draft on either side is kept, the box is emptied
  // (the hook answers the box itself, so the key is consumed), and the pane opens a moment
  // later, once the editor has drawn that answer, over an empty box that lets it take the
  // keys. While a draft is kept, any typing in the box means the person went back to the
  // prompt: the draft returns with that key where the @@ was and the pane closes. Any
  // other edit is the engine's.
  on('prompt.edit', async ($, e, next) => {
    const v = await read($, view)
    if (isStopped(v)) return next(e)
    const t = await read($, tree)
    const draft = trigger(e, what)
    if (draft !== undefined) {
      const kept: Draft = t.draft ?? draft
      await update($, tree, cur => ({ ...cur, draft: kept }))
      void $.clock
        .sleep(OPEN_AFTER_MS)
        .then(() => openPane($, ignored))
        .catch(() => $.ui.toast(TOAST.error))
      return { text: '', cursor: 0 }
    }
    if (t.draft !== undefined) {
      const { before, after } = t.draft
      await update($, tree, cur => ({ ...cur, draft: undefined }))
      void $.ui.close({ id: PANE }).catch(() => undefined)
      return { text: before + e.inputText + after, cursor: before.length + e.inputText.length }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The person closes the pane (Esc, the close mark): the kept draft goes back as it was.
  // The plugin's own close after a pick does not pass through here; `paste()` has put the
  // draft back already, with the pick in it.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await restoreDraft($, '')
    return next(e)
  }).catch(($, e, next) => next(e))

  // The pane: the filter box, the rows, a line of keys. Up and Down walk the rows, Enter
  // presses one; Esc closes the pane (`closeOnEscape`). With no filter, the tree: a
  // folder row opens or closes it, an open folder's first row pastes the folder, a file
  // row pastes the file. With a filter, every matching path, flat, each row a paste.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Input = 'Input' in table ? table.Input : undefined
    const v = await read($, view)
    if (isStopped(v)) return <Box />
    const t = await read($, tree)
    const filter = t.filter.trim()
    const { rows, hidden } = filter === '' ? treeRows(t.folders, t.expanded, MAX_ROWS) : filterRows(t.folders, filter, MAX_ROWS)
    const press = (row: Row) =>
      pressed($, () => (row.kind === 'dir' ? toggleFolder($, row.path, ignored) : paste($, row.path, row.kind === 'paste')))
    // a Close press is the person's close: the draft goes back as it was
    const close = pressed($, async () => {
      await restoreDraft($, '')
      await $.ui.close({ id: PANE })
    })
    const first = rows[0]
    // the focus starts on the last pick's folder while it is in the tree; else in the box
    const focused = filter === '' && t.lastDir !== undefined && rows.some(row => row.kind === 'dir' && row.path === t.lastDir) ? t.lastDir : undefined

    return (
      <Box flexDirection="column">
        {Input !== undefined && (
          <Input
            key="filter"
            placeholder="type to filter the whole tree"
            value={t.filter}
            submitLabel="paste the first"
            autoFocus={focused === undefined ? true : undefined}
            onInput={value => void setFilter($, value, ignored).catch(() => $.ui.toast(TOAST.error))}
            onSubmit={() => {
              if (first !== undefined) press(first)()
            }}
          />
        )}
        {t.draft !== undefined && (
          <Text dimColor>{`your draft, back with the pick: ${draftLine(t.draft, Math.max(20, e.props.bodyColumns - 30))}`}</Text>
        )}
        {!e.props.isFocused && <Text dimColor>ctrl+x tab, or a click here, moves the keys to the tree</Text>}
        {t.isLoading && <Text dimColor>Reading the tree...</Text>}
        {rows.length === 0 && !t.isLoading && <Text dimColor>{filter === '' ? 'Nothing here.' : 'Nothing matches.'}</Text>}
        {rows.map(row => (
          <Box key={`indent:${row.kind}:${row.path}`} paddingLeft={row.indent}>
            <Button
              key={`${row.kind}:${row.path}`}
              plain
              dimColor={row.kind === 'paste'}
              autoFocus={row.kind === 'dir' && row.path === focused ? true : undefined}
              onPress={press(row)}
            >
              {row.label}
            </Button>
          </Box>
        ))}
        {hidden > 0 && <Text dimColor>{`... ${hidden} more rows: type a filter`}</Text>}
        {t.isCapped && <Text dimColor>{`Only the first ${MAX_ENTRIES} entries were read; the filter searches those.`}</Text>}
        <Text dimColor>Enter: open a folder, paste a file · Esc: close</Text>
        {e.surface === 'terminal' && (
          <Button key="close" role="dismiss" onPress={close}>
            Close
          </Button>
        )}
      </Box>
    )
  })
}
