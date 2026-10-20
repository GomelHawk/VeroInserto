// What the plugin draws from, for this session only. The three fields the source check
// needs, then the tree; the engine checks every `$.state` write against this.
export type View = {
  // where this copy was installed from: `home` is VeroPlugins, `dev` a --plugin-dir or
  // test copy, `foreign` any other marketplace - that copy is stopped
  source: { kind: 'home' } | { kind: 'dev' } | { kind: 'foreign'; marketplace: string }
  // an older copy of this plugin still enabled under another marketplace; a home copy
  // beside one is stopped until it is removed
  legacy?: { marketplace: string; scope: 'user' | 'project' | 'local' }
  // the move command waiting for "Replace your draft?" to be answered
  confirmingFill?: string
}

// One entry of a folder as the tree shows it: a file or a folder, nothing else.
export type Entry = { name: string; kind: 'file' | 'dir' }

// The folders read so far, by their path relative to the project ('' is the root), each
// as the tree shows it: folders first, then files, A to Z.
export type Folders = Record<string, Entry[]>

// The project tree as the pane shows it, kept for the session: what was read, what is
// open, what the filter says. A new session starts from nothing.
export type Tree = {
  // the project folder every path is relative to: `cwd` at session.start
  root: string
  folders: Folders
  // the open folders' paths, in the order they were opened
  expanded: string[]
  // what the box at the top of the pane holds
  filter: string
  // every folder is read (the filter searches them all), up to the cap
  isWhole: boolean
  // the cap was reached: the filter searches only what was read
  isCapped: boolean
  // the whole tree is being read right now
  isLoading: boolean
  // the prompt's draft while the pane holds the keys: what stood before the @@ and after
  // it; the box is empty meanwhile (a pane takes the keys only over an empty box) and the
  // draft goes back with the pick between the two, or as it was
  draft?: { before: string; after: string }
  // the folder of the last pick (a picked folder itself): open, with the focus on its
  // row, the next time the pane opens
  lastDir?: string
}

declare module 'claude-code' {
  interface PluginState {
    'vero-inserto': { view: View; tree: Tree }
  }
}
