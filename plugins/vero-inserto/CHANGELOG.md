# Changelog

## 1.0.1 - 2026-10-20

### Fixed

- **The tree is indented in the desktop app too.** Folders and files sat flush left there;
  the terminal was fine.
- **The icon's frame matches the other Vero logos**, slate grey instead of white.

## 1.0.0 - 2026-10-20

From tree to prompt.

### New

- **`@@` opens your project tree** in a pane, with the keys. Walk it with the arrows, open
  folders, or type a few letters to filter every path in the project. Enter on a file or
  on a folder's `@` row puts `@path` into the prompt where the `@@` was, and the pane
  closes. Your draft waits in the pane meanwhile and comes back with the pick, or as it
  was on Esc.
- **It remembers where you were.** The next time the pane opens, the folder of your last
  pick is open and the focus is on its row.
- **`/vero-inserto`** opens the same pane and describes the plugin. Two options: `trigger`
  (what opens the pane, `@@` by default) and `ignore` (what the tree never shows,
  `.git, node_modules` by default).
- Nothing is written anywhere: the tree is read from the project and forgotten with the
  session.
- Installs from [VeroPlugins](https://github.com/GomelHawk/VeroPlugins), the one
  marketplace for every Vero plugin. A copy installed from anywhere else pauses and shows,
  above the prompt, the buttons that move it there.
