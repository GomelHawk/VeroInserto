import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On, PromptEditInput, PromptEditResult } from 'claude-code'

import type { Listed } from '../hooks/tree'

// The plugin's own behaviour, driven through the engine on both surfaces: the @@ trigger,
// the pane's rows, what a press pastes, the filter, the option, the stopped copy. Hooks
// beneath the plugin stand for the project on disk, the prompt box, the panes, the toasts.

type World = {
  // the environment the module reads: VERO_TEST_ROOT stands in for the plugin's root
  env?: Record<string, string>
  // what each settings file holds
  settings?: Partial<Record<'user' | 'project' | 'local', Record<string, unknown>>>
  // the project on disk: each folder's entries by absolute path
  disk?: Record<string, Listed[]>
  // a prompt box that refuses fills (a dialog is open)
  cannotFill?: boolean
  // a terminal too narrow for an unasked pane
  noRoom?: boolean
}

const DISK: Record<string, Listed[]> = {
  '/repo': [
    { name: 'zeta.txt', kind: 'file' },
    { name: 'src', kind: 'dir' },
    { name: 'node_modules', kind: 'dir' },
    { name: 'README.md', kind: 'file' },
    { name: '.git', kind: 'dir' },
    { name: 'Alpha.md', kind: 'file' },
    { name: 'link', kind: 'other' },
  ],
  '/repo/src': [
    { name: 'app.ts', kind: 'file' },
    { name: 'lib', kind: 'dir' },
  ],
  '/repo/src/lib': [{ name: 'util.ts', kind: 'file' }],
  '/repo/node_modules': [{ name: 'left-pad', kind: 'dir' }],
  '/repo/.git': [{ name: 'HEAD', kind: 'file' }],
}

function fakeWorld(on: On, world: World = {}) {
  const seen = {
    toasts: [] as string[],
    filled: [] as { text: string; mode: string }[],
    opened: [] as Record<string, unknown>[],
    closed: [] as string[],
    listed: [] as string[],
  }
  mock.store(on, {})
  const clock = mock.clock(on)
  on('env.get', ($, e) => ({ value: world.env?.[e.name] }))
  on('settings.read', ($, e) => ({ value: (e.source && world.settings?.[e.source as 'user']) ?? {} }))
  on('fs.list', ($, e) => {
    seen.listed.push(e.path)
    const entries = (world.disk ?? DISK)[e.path]
    if (entries === undefined) throw new Error(`no such folder: ${e.path}`)
    return { value: entries.map(entry => ({ ...entry, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($, e) => {
    if (world.cannotFill) return { isFilled: false, text: '' }
    seen.filled.push({ text: e.text, mode: e.mode ?? 'replace' })
    return { isFilled: true, text: e.text }
  })
  // the engine's own editor: the splice applied, the cursor after it
  on('prompt.edit', ($, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, title: e.title, focus: e.focus, closeOnEscape: e.closeOnEscape, rows: e.rows })
    return { value: world.noRoom ? { isPlaced: false, reason: '100 columns; 144 needed' } : { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine: band</Text>
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 'S1' }))
  on('turn.start', () => ({ turnId: 'T1' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  return { ...seen, clock }
}

type T = Parameters<TestBody>[0]
type Surface = 'terminal' | 'desktop'

const start = ($: T, surface: Surface, cwd = '/repo') => $.session.start({ cwd, surface, isInteractive: true })

// The editor's edits: the kit raises `prompt.edit` through `$.prompt.edit` at run time,
// an event its types list under no noun, hence the cast.
const editor = ($: T) => $.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }

// The person types one @ at `cursor` of `text`: what the editor then shows.
const typeAt = ($: T, text: string, cursor: number) =>
  editor($).edit({ origin: { kind: 'composer' }, text, cursor, start: cursor, end: cursor, inputText: '@' })

// @@ typed at the end of `text` and the pane opened: the second @, then the moment the
// pane waits for the editor.
async function trigger($: T, seen: { clock: { advance: (ms: number) => Promise<void> } }, text = '') {
  const box = await typeAt($, `${text}@`, text.length + 1)
  await seen.clock.advance(50)
  return box
}

const PANE = { title: 'VeroInserto', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} } as const
const mountPane = ($: T, surface: Surface) => $.ui.mount({ plugin: 'vero-inserto', surface, component: 'Pane', props: PANE, requestId: 'vero-inserto' })

const labels = async (pane: Awaited<ReturnType<typeof mountPane>>) => (await pane.findAll({ type: 'Button' })).map(one => one.text).filter(text => text !== 'Close')

const run = async ($: T) => {
  const out = await $.command.run({ command: 'vero-inserto', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  return (out as { text?: string }).text ?? ''
}

const FOREIGN = '/h/.claude/plugins/cache/some-marketplace/vero-inserto/0.1.0'

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`the tree on ${surface}`, () => {
    test('@@ at the end of a draft: the box is emptied, the pane opens as a dialog over the root and shows the draft', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      expect(await trigger($, seen, 'see ')).toEqual({ text: '', cursor: 0 })
      expect(seen.opened).toEqual([{ id: 'vero-inserto', title: 'VeroInserto', focus: true, closeOnEscape: true, rows: 20 }])
      expect(seen.listed).toEqual(['/repo'])
      expect(seen.toasts).toEqual([])
      expect(seen.filled).toEqual([])
      const pane = await mountPane($, surface)
      // folders first, then files, A to Z; .git, node_modules and the link left out
      expect(await labels(pane)).toEqual(['▸ src/', '  Alpha.md', '  README.md', '  zeta.txt'])
      expect(await pane.find({ type: 'Text', text: 'your draft, back with the pick: see ▮' })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /Esc: close/ })).toBeDefined()
    })

    test('@@ in the middle of a draft: the pick goes between the two sides', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      expect(await typeAt($, 'read @ now', 6)).toEqual({ text: '', cursor: 0 })
      await seen.clock.advance(50)
      expect(seen.opened.length).toBe(1)
      const pane = await mountPane($, surface)
      expect(await pane.find({ type: 'Text', text: 'your draft, back with the pick: read ▮ now' })).toBeDefined()
      await pane.press({ key: 'file:README.md' })
      expect(seen.filled).toEqual([{ text: 'read @README.md  now', mode: 'replace' }])
      expect(seen.closed).toEqual(['vero-inserto'])
    })

    test('typing in the prompt while the pane is up: the draft comes back with the key where @@ was, the pane closes', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen, 'see ')
      expect(await editor($).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'x' })).toEqual({ text: 'see x', cursor: 5 })
      expect(seen.closed).toEqual(['vero-inserto'])
      expect(seen.filled).toEqual([])
      // and @@ again starts over from the full draft
      expect(await typeAt($, 'see x@', 6)).toEqual({ text: '', cursor: 0 })
      await seen.clock.advance(50)
      const pane = await mountPane($, surface)
      expect(await pane.find({ type: 'Text', text: 'your draft, back with the pick: see x▮' })).toBeDefined()
    })

    test('@@ again after a pick: the pick is part of the draft now', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'file:README.md' })
      expect(seen.filled).toEqual([{ text: '@README.md ', mode: 'replace' }])
      await trigger($, seen, '@README.md ')
      await pane.press({ key: 'file:zeta.txt' })
      expect(seen.filled[1]).toEqual({ text: '@README.md @zeta.txt ', mode: 'replace' })
    })

    test("the last pick's folder is open next time, its row under the focus; a root pick leaves the focus in the box", async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      expect((await pane.find({ key: 'filter' }))?.props.autoFocus).toBe(true)
      await pane.press({ key: 'dir:src' })
      await pane.press({ key: 'dir:src/lib' })
      await pane.press({ key: 'file:src/lib/util.ts' })
      await trigger($, seen, '@src/lib/util.ts ')
      expect((await labels(pane)).slice(0, 5)).toEqual(['▾ src/', '  @ src/', '  ▾ lib/', '    @ lib/', '      util.ts'])
      expect((await pane.find({ key: 'dir:src/lib' }))?.props.autoFocus).toBe(true)
      expect((await pane.find({ key: 'filter' }))?.props.autoFocus).toBe(undefined)
      expect((await pane.find({ key: 'dir:src' }))?.props.autoFocus).toBe(undefined)

      // a folder picked is the folder remembered
      await pane.press({ key: 'paste:src' })
      await trigger($, seen, '@src/lib/util.ts @src/ ')
      expect((await pane.find({ key: 'dir:src' }))?.props.autoFocus).toBe(true)
      expect((await pane.find({ key: 'dir:src/lib' }))?.props.autoFocus).toBe(undefined)

      // a pick at the root: the box has the focus again
      await pane.press({ key: 'file:README.md' })
      await trigger($, seen, '@README.md ')
      expect((await pane.find({ key: 'filter' }))?.props.autoFocus).toBe(true)
      expect(await pane.findAll({ type: 'Button' }).then(all => all.filter(one => one.props.autoFocus === true))).toEqual([])
    })

    test('a pick through the filter opens its folders in the tree', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: 'util', kind: 'change' })
      await pane.press({ key: 'file:src/lib/util.ts' })
      await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: '', kind: 'change' })
      expect((await labels(pane)).slice(0, 3)).toEqual(['▾ src/', '  @ src/', '  ▾ lib/'])
      expect((await pane.find({ key: 'dir:src/lib' }))?.props.autoFocus).toBe(true)
    })

    test('the trigger option: @# opens the pane, @@ is the engine\'s', { options: { trigger: '@#' } }, async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      expect(await typeAt($, 'see @', 5)).toEqual({ text: 'see @@', cursor: 6 })
      expect(await editor($).edit({ origin: { kind: 'composer' }, text: 'see @', cursor: 5, start: 5, end: 5, inputText: '#' })).toEqual({ text: '', cursor: 0 })
      await seen.clock.advance(50)
      expect(seen.opened.length).toBe(1)
      expect(await run($)).toContain('- `trigger`: **@#**')
    })

    test('one @, a third @, another key: the engine edits, no pane', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      expect(await typeAt($, 'see ', 4)).toEqual({ text: 'see @', cursor: 5 })
      expect(await typeAt($, '@@', 2)).toEqual({ text: '@@@', cursor: 3 })
      expect(await editor($).edit({ origin: { kind: 'composer' }, text: '@', cursor: 1, start: 1, end: 1, inputText: 'x' })).toEqual({ text: '@x', cursor: 2 })
      await seen.clock.advance(50)
      expect(seen.opened).toEqual([])
    })

    test('a file row pastes @path with a space where the @@ was, and closes the pane', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'file:README.md' })
      expect(seen.filled).toEqual([{ text: '@README.md ', mode: 'replace' }])
      expect(seen.closed).toEqual(['vero-inserto'])
      expect(seen.toasts).toEqual([])
    })

    test('a folder row opens it: a paste row, then its entries; the paste row pastes @folder/', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'dir:src' })
      expect(seen.listed).toEqual(['/repo', '/repo/src'])
      expect(await labels(pane)).toEqual(['▾ src/', '  @ src/', '  ▸ lib/', '    app.ts', '  Alpha.md', '  README.md', '  zeta.txt'])
      await pane.press({ key: 'dir:src/lib' })
      expect(await labels(pane)).toEqual(['▾ src/', '  @ src/', '  ▾ lib/', '    @ lib/', '      util.ts', '    app.ts', '  Alpha.md', '  README.md', '  zeta.txt'])
      expect(seen.filled).toEqual([])
      await pane.press({ key: 'paste:src/lib' })
      expect(seen.filled).toEqual([{ text: '@src/lib/ ', mode: 'replace' }])
      expect(seen.closed).toEqual(['vero-inserto'])
    })

    test('a folder row again closes it; a folder is read once', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'dir:src' })
      await pane.press({ key: 'dir:src' })
      expect(await labels(pane)).toEqual(['▸ src/', '  Alpha.md', '  README.md', '  zeta.txt'])
      await pane.press({ key: 'dir:src' })
      expect(seen.listed).toEqual(['/repo', '/repo/src'])
    })

    test('the tree stays open across turns, and a new session starts from nothing', async ($, on) => {
      const seen = fakeWorld(on, { disk: { ...DISK, '/other': [{ name: 'only.txt', kind: 'file' }] } })
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'dir:src' })
      await $.turn.start({ text: 'next', turnId: 'T2' })
      expect((await labels(pane))[0]).toBe('▾ src/')
      await start($, surface, '/other')
      await trigger($, seen)
      expect(await labels(pane)).toEqual(['  only.txt'])
    })

    test('the filter: the whole tree is read, every matching path is a row, each a paste', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      if (surface === 'terminal' || surface === 'desktop') {
        await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: 'lib', kind: 'change' })
      }
      expect(seen.listed).toEqual(['/repo', '/repo/src', '/repo/src/lib'])
      expect(await labels(pane)).toEqual(['src/lib/', 'src/lib/util.ts'])
      await pane.press({ key: 'paste:src/lib' })
      expect(seen.filled).toEqual([{ text: '@src/lib/ ', mode: 'replace' }])

      // Enter in the box pastes the first row (no draft kept now: at the cursor); an
      // empty filter is the tree again
      await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: 'util', kind: 'change' })
      await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: 'util' })
      expect(seen.filled[1]).toEqual({ text: '@src/lib/util.ts ', mode: 'insert' })
      await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: 'no such thing', kind: 'change' })
      expect(await pane.find({ type: 'Text', text: 'Nothing matches.' })).toBeDefined()
      await $.ui.input({ plugin: 'vero-inserto', key: 'filter', text: '', kind: 'change' })
      // the tree again, the picks' folders open
      expect((await labels(pane))[0]).toBe('▾ src/')
      // read once
      expect(seen.listed.length).toBe(3)
    })

    test('the ignore option names what the tree leaves out', { options: { ignore: 'src, zeta.txt' } }, async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      expect(await labels(pane)).toEqual(['▸ .git/', '▸ node_modules/', '  Alpha.md', '  README.md'])
      expect(await run($)).toContain('- `ignore`: **src, zeta.txt**')
      expect(await run($)).toContain('- `trigger`: **@@**')
    })

    test('a prompt box that refuses the fill: a toast, the pane stays, the draft is still kept', async ($, on) => {
      const seen = fakeWorld(on, { cannotFill: true })
      await start($, surface)
      await trigger($, seen, 'see ')
      const pane = await mountPane($, surface)
      await pane.press({ key: 'file:README.md' })
      expect(seen.toasts).toEqual(['VeroInserto: close the dialog and press the button again.'])
      expect(seen.closed).toEqual([])
      expect(await pane.find({ type: 'Text', text: 'your draft, back with the pick: see ▮' })).toBeDefined()
    })

    test('no room for the pane: the draft goes straight back, a toast names the reason and the command', async ($, on) => {
      const seen = fakeWorld(on, { noRoom: true })
      await start($, surface)
      await trigger($, seen, 'see ')
      expect(seen.filled).toEqual([{ text: 'see ', mode: 'replace' }])
      expect(seen.toasts).toEqual(['VeroInserto: no room for the tree pane (100 columns; 144 needed). Type /vero-inserto to open it anyway.'])
    })

    test("the command's pane keeps no draft: a pick goes in at the cursor", async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await run($)
      const pane = await mountPane($, surface)
      expect(await pane.find({ type: 'Text', text: /your draft/ })).toBe(undefined)
      await pane.press({ key: 'file:README.md' })
      expect(seen.filled).toEqual([{ text: '@README.md ', mode: 'insert' }])
    })

    test('a folder that cannot be read: a toast, nothing else', async ($, on) => {
      const seen = fakeWorld(on, { disk: { '/repo': [{ name: 'locked', kind: 'dir' }] } })
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'dir:locked' })
      expect(seen.toasts).toEqual(['VeroInserto could not do that.'])
      expect(await labels(pane)).toEqual(['▸ locked/'])
    })

    test('the command opens the pane and describes the plugin', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      const text = await run($)
      expect(text).toContain('**VeroInserto** - *From tree to prompt.*')
      expect(text).toContain('- `ignore`: **.git, node_modules**')
      expect(seen.opened.length).toBe(1)
      expect(seen.listed).toEqual(['/repo'])
    })

    test('the Close button on the terminal; the desktop has its own mark', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      await trigger($, seen)
      const pane = await mountPane($, surface)
      const close = await pane.find({ key: 'close' })
      if (surface === 'terminal') {
        expect(close).toBeDefined()
        await pane.press({ key: 'close' })
        expect(seen.closed).toEqual(['vero-inserto'])
        expect(seen.filled).toEqual([{ text: '', mode: 'replace' }])
        // nothing kept any more: a second close fills nothing
        await pane.press({ key: 'close' })
        expect(seen.filled.length).toBe(1)
      } else {
        expect(close).toBe(undefined)
      }
    })

    test('a stopped copy: @@ is the engine\'s, no pane, and the command answers the move', async ($, on) => {
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN } })
      await start($, surface)
      expect(await typeAt($, '@', 1)).toEqual({ text: '@@', cursor: 2 })
      await seen.clock.advance(50)
      expect(seen.opened).toEqual([])
      expect(seen.listed).toEqual([])
      expect(await run($)).toContain('**VeroInserto is paused.**')
      expect(seen.opened).toEqual([])
    })
  })
}
