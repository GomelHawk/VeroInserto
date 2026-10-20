<p align="center">
  <img src="https://raw.githubusercontent.com/GomelHawk/VeroInserto/main/assets/horizontal-logo.png"
       alt="VeroInserto - From tree to prompt."
       width="600">
</p>

<p align="center">
  <a href="https://github.com/GomelHawk/VeroInserto/actions/workflows/ci.yml"><img src="https://github.com/GomelHawk/VeroInserto/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/GomelHawk/VeroInserto/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-8a63d2.svg" alt="Claude Code plugin">
</p>

To point Claude at a file you type `@` and its path. The built-in list that opens on `@`
finds a file by name, but when you only know roughly where something is, or want a whole
folder, you end up typing paths from memory.

VeroInserto adds a second way: type `@@` and a pane shows your project as a tree. Open
folders, walk it with the arrow keys or type a few letters to filter, press Enter on a
file or a folder, and `@its/path` lands in your prompt right where you were typing. The
pane closes and you go on writing.

## What you get

- **`@@` opens the tree**, wherever you are in the prompt, and the keys go to it. Your
  draft waits meanwhile, shown in the pane, and comes back with the path you picked where
  the `@@` was, as `@path`, the form Claude Code reads.
- **A real tree.** Folders first, then files, A to Z. Open a folder to see inside; its
  first row pastes the folder itself, as `@folder/`.
- **A filter.** Type in the box at the top and every matching path in the project is
  listed; Enter pastes the first one.
- **Keyboard first.** Up and Down walk the rows, Enter picks, Esc closes with nothing
  pasted. The mouse works too.
- **It remembers where you were.** The next time the pane opens, the folder of your last
  pick is open and the focus is on it.
- **Nothing written anywhere.** The tree is read from your project and forgotten when the
  session ends.

## Install

Two commands, typed inside Claude Code. Type the first, press Enter and wait for
`✔ Successfully added marketplace: vero-plugins`, then type the second:

```
/plugin marketplace add GomelHawk/VeroPlugins
```

```
/plugin install vero-inserto@vero-plugins
```

Then restart Claude Code. If you already added VeroPlugins for another Vero plugin, only
the second command is needed. There is nothing to configure and no API key involved.

> Type each line on its own. If a panel appears asking for a `marketplace source`, it
> wants only `GomelHawk/VeroPlugins` and nothing else on the line.

Prefer a terminal? The same two commands work there, back to back:

```bash
claude plugin marketplace add GomelHawk/VeroPlugins
claude plugin install vero-inserto@vero-plugins
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `GomelHawk/VeroPlugins`, then **Add plugin**.

To check it took, type `/vero-inserto`: it describes the plugin.

**Only from VeroPlugins.** VeroInserto works only when installed from VeroPlugins. A copy
installed from anywhere else pauses and shows, above the prompt, four buttons that move
it here: press them one after another, pressing Enter after each, then restart Claude
Code. VeroInserto keeps no data of its own, so nothing is lost on the way.

<details>
<summary>Installing from a copy of this repository</summary>

```bash
git clone https://github.com/GomelHawk/VeroInserto
cd VeroInserto
./install.sh                                    # for you, in every project
./install.sh --scope project ~/work/our-app     # for everyone who works in our-app
```

`install.sh` checks the plugin and installs it from VeroPlugins. `--scope project DIR`
writes VeroInserto into `DIR/.claude/settings.json` - VeroPlugins and the plugin, never the
path of your copy - so once that file is committed, everyone who trusts the folder gets
VeroInserto without installing anything themselves. `--scope local DIR` does the same in
`DIR/.claude/settings.local.json`, for you alone. Without a copy of the repository, the
same team install is two commands run inside that project:

```bash
claude plugin marketplace add GomelHawk/VeroPlugins --scope project
claude plugin install vero-inserto@vero-plugins --scope project
```
</details>

## Using it

**Type `@@`** anywhere in the prompt. Your draft leaves the prompt box for a moment and the
pane opens above the prompt (beside the conversation in a wide fullscreen terminal), with
the keys and with your draft on its first line, a mark where the `@@` was:

```
╭ VeroInserto ──────────────────────────────────────────────╮
│ type to filter the whole tree                             │
│ your draft, back with the pick: fix the test in ▮         │
│ ▸ src/                                                    │
│ ▸ tests/                                                  │
│   package.json                                            │
│   README.md                                               │
│ Enter: open a folder, paste a file · Esc: close           │
╰───────────────────────────────────────────────────────────╯
```

**Walk it** with Up and Down. Enter on a folder opens it; its first row pastes the folder
itself, the rows under it are its files and folders:

```
│ ▾ src/                                                    │
│   @ src/                                                  │
│   ▸ lib/                                                  │
│     app.ts                                                │
```

**Enter on a file**, or on an `@ folder/` row, puts your draft back with the path where the
`@@` was, and closes the pane. A file becomes `@src/app.ts `, a folder `@src/ `, with a
space after it so you can keep typing. Claude Code reads these the same way as a path you
typed after `@` yourself: the file is given to Claude, a folder is listed for it. The
cursor lands at the end of the prompt; with `@@` typed mid-sentence, move it back.

**Filter** instead of walking: type a few letters in the box at the top. Every path in the
project that holds them is listed, folders with a slash after them. Enter in the box
pastes the first row; Up and Down reach the others. Several words match paths holding all
of them (`lib ts`). Clear the box to get the tree back.

**Esc closes** the pane and puts your draft back as it was. On the terminal there is also
a **Close** button at the bottom. Typing in the prompt box while the pane is up does the
same: the draft comes back with that key where the `@@` was, and the pane closes.

**Next time** the pane opens with the folder of your last pick open and the focus on its
row, so a second file from the same place is a few keys away. After a pick at the top
level, the focus starts in the filter box as at first. Open folders and the filter stay as
you left them for the rest of the session; a new session starts afresh.

**Another trigger.** `@@` is the default. If you type `@@` in your prompts for other
reasons, set the `trigger` option to another two to four characters, `@#` say; the pane
then opens on those, and `@@` is left alone.

**`/vero-inserto`** opens the same pane and describes the plugin. It is also the way in
when the pane has no room: on a narrow terminal a pane opened by `@@` waits unseen and a
message says so, while the command's pane is shown at any width.

| Key | In the tree | In the filter box |
| :-- | :-- | :-- |
| Up, Down | the row above or below | into the rows |
| Enter | open or close a folder; paste a file or an `@ folder/` row | paste the first row |
| letters | - | filter the whole project |
| Esc | close the pane, the draft back as it was | the same |

**What the tree shows.** Everything in the project folder, hidden files included, except
the names in the `ignore` option: `.git` and `node_modules` by default. Links are left
out. The filter reads the whole project the first time it is used, up to 20,000 entries;
past that it searches what was read and the pane says so.

## Options

Change them in `/config`. `/vero-inserto` shows their current values.

| Option | Default | What it does |
| :-- | :-- | :-- |
| `trigger` | `@@` | What opens the pane when typed in the prompt: two to four characters, no spaces |
| `ignore` | `.git, node_modules` | Folder and file names the tree never shows, separated by commas |

## Updating

Nothing updates by itself, and Claude Code will not tell you a new version exists. New
versions are announced at
[github.com/GomelHawk/VeroInserto/releases](https://github.com/GomelHawk/VeroInserto/releases);
watch the repository if you want an email.

Inside Claude Code, one command at a time, same as installing:

```
/plugin marketplace update vero-plugins
```

```
/plugin update vero-inserto@vero-plugins
```

Then restart Claude Code. From a terminal, where you can run them back to back:

```bash
claude plugin marketplace update vero-plugins
claude plugin update vero-inserto@vero-plugins
```

`claude plugin list` shows which version you have.

## Uninstalling

Inside Claude Code:

```
/plugin uninstall vero-inserto@vero-plugins
```

or, from a clone, `./uninstall.sh` (`./uninstall.sh --scope project ~/work/our-app` for a
project install). VeroInserto writes no files anywhere; nothing is left behind. The
VeroPlugins marketplace stays registered for your other Vero plugins.

## Good to know

| | |
| :-- | :-- |
| `@@` does nothing | A copy installed from another marketplace is paused: see the band above the prompt. Or a third `@` was typed: `@@@` stays as it is. Or the `trigger` option is set to something else. |
| The prompt box went empty | Your draft is in the pane's first line and comes back with the pick, or as it was on Esc. |
| The pane opened but the keys stay at the prompt | Something else held them: a button in the band above the prompt, another pane. Press `ctrl+x tab`, or click the pane. |
| "no room for the tree pane" | The terminal is too narrow for a pane opened by `@@`. Type `/vero-inserto`, or widen the terminal. |
| A folder is missing | Its name is in the `ignore` option, or it is a link. |
| The filter misses files | The project has more than 20,000 entries; the filter searches the first 20,000 read. Open the folder in the tree instead. |
| The pane shows beside another plugin's pane | Open panes share one frame as tabs; a click on a tab, or Tab and Enter, switches. Esc closes only the tree. |

## Requirements

Claude Code with plugin support, in the terminal or the desktop app. Nothing else to install.

## Contributing

How to test changes, what CI checks and how releases reach users are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
