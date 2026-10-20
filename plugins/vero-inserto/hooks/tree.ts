// VeroInserto's pure rules: what @@ looks like in an edit, what a folder lists and in what
// order, which rows the pane draws, and what a pick pastes. No `$` here: everything is a
// function of its arguments, table-tested in tests/tree.test.ts.

import type { Entry, Folders } from '../types'

// What `$.fs.list` answers, as much of it as the tree reads.
export type Listed = { name: string; kind: 'file' | 'dir' | 'other' }

// One row of the pane: a folder to open or close, a folder to paste, or a file to paste.
// `label` is the row's text; `indent` the cells before it, as layout, never as spaces in
// the text (a desktop's proportional font collapses those); `path` is relative to the
// project.
export type Row =
  | { kind: 'dir'; path: string; label: string; depth: number; indent: number; isExpanded: boolean }
  | { kind: 'paste'; path: string; label: string; depth: number; indent: number }
  | { kind: 'file'; path: string; label: string; depth: number; indent: number }

// The `ignore` option's default: names the tree never shows.
export const DEFAULT_IGNORE = '.git, node_modules'

// The `trigger` option's default: what opens the pane.
export const DEFAULT_TRIGGER = '@@'

// The `trigger` option as the module uses it: two to four characters with no whitespace;
// anything else is the default.
export function triggerOf(option: unknown): string {
  if (typeof option !== 'string') return DEFAULT_TRIGGER
  const text = option.trim()
  return text.length >= 2 && text.length <= 4 && !/\s/.test(text) ? text : DEFAULT_TRIGGER
}

// The folder a path lies in: '' for one at the root.
export const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

// A folder and every folder above it, the root left out: `src/lib` is `src`, `src/lib`.
export function chainOf(dir: string): string[] {
  if (dir === '') return []
  const parts = dir.split('/')
  return parts.map((part, i) => parts.slice(0, i + 1).join('/'))
}

// The `ignore` option as a set of names: split on commas and whitespace, empties dropped.
export function ignoredNames(option: unknown): Set<string> {
  const text = typeof option === 'string' && option.trim() !== '' ? option : DEFAULT_IGNORE
  return new Set(text.split(/[\s,]+/).filter(Boolean))
}

// A to Z regardless of case, then by code point so two names never tie.
const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)

// One folder's entries as the tree shows them: folders first, then files, each A to Z;
// links and other kinds left out, and every ignored name.
export function listed(entries: readonly Listed[], ignored: ReadonlySet<string>): Entry[] {
  const kept: Entry[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' && entry.kind !== 'dir') continue
    if (ignored.has(entry.name)) continue
    kept.push({ name: entry.name, kind: entry.kind })
  }
  const dirs = kept.filter(entry => entry.kind === 'dir').sort((a, b) => byName(a.name, b.name))
  const files = kept.filter(entry => entry.kind === 'file').sort((a, b) => byName(a.name, b.name))
  return [...dirs, ...files]
}

// A path under a folder; the root is ''.
export const join = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`)

// The rows of the tree: the root's entries, each open folder's beneath it with a row that
// pastes the folder first; at most `max` rows, the rest counted.
export function treeRows(folders: Folders, expanded: readonly string[], max: number): { rows: Row[]; hidden: number } {
  const open = new Set(expanded)
  const rows: Row[] = []
  let hidden = 0
  const push = (row: Row) => {
    if (rows.length < max) rows.push(row)
    else hidden++
  }
  const walk = (dir: string, depth: number) => {
    for (const entry of folders[dir] ?? []) {
      const path = join(dir, entry.name)
      if (entry.kind === 'file') {
        // two cells in, level with a folder's name after its marker
        push({ kind: 'file', path, label: entry.name, depth, indent: depth * 2 + 2 })
        continue
      }
      const isExpanded = open.has(path)
      push({ kind: 'dir', path, label: `${isExpanded ? '▾' : '▸'} ${entry.name}/`, depth, indent: depth * 2, isExpanded })
      if (isExpanded) {
        push({ kind: 'paste', path, label: `@ ${entry.name}/`, depth: depth + 1, indent: depth * 2 + 2 })
        walk(path, depth + 1)
      }
    }
  }
  walk('', 0)
  return { rows, hidden }
}

// The rows of a filter: every loaded path that holds each of the filter's words, in any
// case, as a flat list A to Z by path, a folder with its slash; at most `max` rows, the
// rest counted. Every row pastes: a folder is not opened here, it is picked.
export function filterRows(folders: Folders, filter: string, max: number): { rows: Row[]; hidden: number } {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const all: Row[] = []
  for (const dir of Object.keys(folders)) {
    for (const entry of folders[dir] ?? []) {
      const path = join(dir, entry.name)
      const label = entry.kind === 'dir' ? `${path}/` : path
      const lower = label.toLowerCase()
      if (!words.every(word => lower.includes(word))) continue
      all.push(entry.kind === 'dir' ? { kind: 'paste', path, label, depth: 0, indent: 0 } : { kind: 'file', path, label, depth: 0, indent: 0 })
    }
  }
  all.sort((a, b) => byName(a.path, b.path))
  return { rows: all.slice(0, max), hidden: Math.max(0, all.length - max) }
}

// What a pick puts into the prompt box: the mention Claude Code reads, a folder with its
// slash, and a space to go on typing after it.
export const mention = (path: string, isDir: boolean) => `@${path}${isDir ? '/' : ''} `

// The draft around a pick: what stood before the @@ and what after it.
export type Draft = { before: string; after: string }

// An edit that types the trigger's last character right after the rest of it, and
// nothing else: the draft on either side of the trigger, for the pick to go between. Any
// other edit: undefined. A trigger of one repeated character (`@@`) typed once more
// (`@@@`) is left alone, so a run of three stays typeable.
export function trigger(e: { text: string; start: number; end: number; inputText: string }, what = DEFAULT_TRIGGER): Draft | undefined {
  const head = what.slice(0, -1)
  if (e.inputText !== what.slice(-1) || e.start !== e.end) return undefined
  const from = e.start - head.length
  if (from < 0 || e.text.slice(from, e.start) !== head) return undefined
  const isRun = what.split('').every(c => c === what[0])
  if (isRun && e.text[from - 1] === what[0]) return undefined
  return { before: e.text.slice(0, from), after: e.text.slice(e.start) }
}

// The draft as the pane shows it while it holds it: the two sides around a mark, cut to
// `width` cells with an ellipsis at the far ends.
export function draftLine(draft: Draft, width: number): string {
  const room = Math.max(8, width - 1)
  const half = Math.floor(room / 2)
  const before = draft.before.length > half ? `…${draft.before.slice(-(half - 1))}` : draft.before
  const after = draft.after.length > room - before.length ? `${draft.after.slice(0, room - before.length - 1)}…` : draft.after
  return `${before}▮${after}`
}
