import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

// The source check's stopped mode, driven through the engine on both surfaces. Hooks
// beneath the plugin stand for the environment, the settings files, the prompt box and
// the toasts: every fill and toast is recorded. Nothing here is specific to what the
// plugin does: keep this file as it is and add the plugin's own tests beside it.

type World = {
  // the environment the module reads: VERO_TEST_ROOT stands in for the plugin's root
  env?: Record<string, string>
  // what each settings file holds; read on every call, so a test can change it
  settings?: Partial<Record<'user' | 'project' | 'local', Record<string, unknown>>>
  // the draft in the prompt box
  draft?: string
  // a prompt box that refuses fills (a dialog is open)
  cannotFill?: boolean
}

function fakeWorld(on: On, world: World = {}) {
  const seen = {
    toasts: [] as string[],
    commands: [] as string[],
    filled: [] as { text: string; mode: string }[],
  }
  mock.store(on, {})
  // read on every call, so a test can move the copy between two turns
  on('env.get', ($, e) => ({ value: world.env?.[e.name] }))
  const clock = mock.clock(on)
  on('settings.read', ($, e) => ({ value: (e.source && world.settings?.[e.source as 'user']) ?? {} }))
  on('prompt.read', () => ({ value: { text: world.draft ?? '', cursor: 0 } }))
  on('prompt.fill', ($, e) => {
    if (world.cannotFill) return { isFilled: false, text: world.draft ?? '' }
    seen.filled.push({ text: e.text, mode: e.mode ?? 'replace' })
    return { isFilled: true, text: e.text }
  })
  // the engine's own band: one Text, so a test can tell it from the plugin's row
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine: band</Text>
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 'S1' }))
  on('turn.start', () => ({ turnId: 'T1' }))
  on('command.register', ($, e) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  return { ...seen, clock }
}

type T = Parameters<TestBody>[0]
type Surface = 'terminal' | 'desktop'

const start = ($: T, surface: Surface) => $.session.start({ cwd: '/repo', surface, isInteractive: true })

const BAND = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 }, view: {} } as const
const mountBand = ($: T, surface: Surface) => $.ui.mount({ plugin: 'vero-inserto', surface, component: 'AbovePrompt', props: BAND })

const run = async ($: T) => {
  const out = await $.command.run({ command: 'vero-inserto', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  return (out as { text?: string }).text ?? ''
}

const FOREIGN = '/h/.claude/plugins/cache/some-marketplace/vero-inserto/0.1.0'
const HOME = '/h/.claude/plugins/cache/vero-plugins/vero-inserto/0.1.0'
const MOVE = [
  '/plugin marketplace add GomelHawk/VeroPlugins',
  '/plugin install vero-inserto@vero-plugins',
  '/plugin uninstall vero-inserto@some-marketplace',
  '/plugin marketplace remove some-marketplace',
]

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`the source check on ${surface}`, () => {
    test('a home copy with no old copy works: no toast, no buttons, the status text', async ($, on) => {
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: HOME } })
      await start($, surface)
      expect(seen.toasts).toEqual([])
      expect(seen.commands).toEqual(['vero-inserto'])
      const band = await mountBand($, surface)
      expect(await band.find({ type: 'Button' })).toBe(undefined)
      expect(await band.find({ type: 'Text', text: 'engine: band' })).toBeDefined()
      const text = await run($)
      expect(text).toContain('**VeroInserto** - *From tree to prompt.*')
      expect(text).toContain('Type `@@` in the prompt: a pane shows your project tree')
    })

    test('a development copy works the same', async ($, on) => {
      const seen = fakeWorld(on)
      await start($, surface)
      expect(seen.toasts).toEqual([])
      const band = await mountBand($, surface)
      expect(await band.find({ type: 'Button' })).toBe(undefined)
    })

    test('installed from another marketplace: one toast, the command still registered', async ($, on) => {
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN } })
      await start($, surface)
      expect(seen.toasts).toEqual([
        'VeroInserto is paused: installed from some-marketplace. See the band above the prompt to move it to VeroPlugins.',
      ])
      expect(seen.commands).toEqual(['vero-inserto'])
    })

    test('the command answers the stopped message', async ($, on) => {
      fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN } })
      await start($, surface)
      const text = await run($)
      expect(text).toContain('**VeroInserto is paused.** It was installed from `some-marketplace`')
      for (const step of MOVE) expect(text).toContain(`    ${step}`)
      expect(text).not.toContain('From tree to prompt.')
    })

    test('the band: the reason, four buttons, no ×, and what is drawn beneath', async ($, on) => {
      fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN } })
      await start($, surface)
      const band = await mountBand($, surface)
      expect(
        await band.find({
          type: 'Text',
          text: '⛔ VeroInserto is paused - it was installed from some-marketplace. Vero plugins install only from VeroPlugins.',
        }),
      ).toBeDefined()
      expect((await band.find({ key: 'vero-inserto-move:1' }))?.text).toBe('1 ↓ Add VeroPlugins')
      expect((await band.find({ key: 'vero-inserto-move:2' }))?.text).toBe('2 ↓ Install from VeroPlugins')
      expect((await band.find({ key: 'vero-inserto-move:3' }))?.text).toBe('3 ↓ Remove this copy')
      expect((await band.find({ key: 'vero-inserto-move:4' }))?.text).toBe('4 ↓ Remove the old marketplace')
      expect(await band.find({ type: 'Text', text: 'then restart Claude Code' })).toBeDefined()
      expect((await band.findAll({ type: 'Button' })).length).toBe(4)
      expect(await band.find({ type: 'Text', text: '×' })).toBe(undefined)
      expect(await band.find({ type: 'Text', text: 'engine: band' })).toBeDefined()
    })

    test('each button fills exactly its command, and nothing runs', async ($, on) => {
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN } })
      await start($, surface)
      const band = await mountBand($, surface)
      await band.press({ key: 'vero-inserto-move:1' })
      await band.press({ key: 'vero-inserto-move:2' })
      await band.press({ key: 'vero-inserto-move:3' })
      await band.press({ key: 'vero-inserto-move:4' })
      expect(seen.filled).toEqual(MOVE.map(text => ({ text, mode: 'replace' })))
      expect(seen.toasts.length).toBe(1)
    })

    test('a draft in the prompt box: the question first; Replace fills, Cancel does not', async ($, on) => {
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN }, draft: 'my half-typed prompt' })
      await start($, surface)
      const band = await mountBand($, surface)
      await band.press({ key: 'vero-inserto-move:2' })
      expect(seen.filled).toEqual([])
      expect(await band.find({ type: 'Text', text: 'Replace your draft?' })).toBeDefined()
      expect(await band.find({ key: 'vero-inserto-move:2' })).toBe(undefined)
      await band.press({ key: 'vero-inserto-move:cancel' })
      expect(seen.filled).toEqual([])
      expect(await band.find({ key: 'vero-inserto-move:2' })).toBeDefined()

      await band.press({ key: 'vero-inserto-move:2' })
      await band.press({ key: 'vero-inserto-move:replace' })
      expect(seen.filled).toEqual([{ text: MOVE[1], mode: 'replace' }])
      expect(await band.find({ key: 'vero-inserto-move:2' })).toBeDefined()
    })

    test('a prompt box that refuses the fill: a toast', async ($, on) => {
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: FOREIGN }, cannotFill: true })
      await start($, surface)
      const band = await mountBand($, surface)
      await band.press({ key: 'vero-inserto-move:1' })
      expect(seen.filled).toEqual([])
      expect(seen.toasts[1]).toBe('VeroInserto: close the dialog and press the button again.')
    })

    test('moved during the session: the next turn resumes normal work', async ($, on) => {
      const env = { VERO_TEST_ROOT: FOREIGN }
      fakeWorld(on, { env })
      await start($, surface)
      const band = await mountBand($, surface)
      expect((await band.findAll({ type: 'Button' })).length).toBe(4)
      delete (env as { VERO_TEST_ROOT?: string }).VERO_TEST_ROOT
      await $.turn.start({ text: 'next', turnId: 'T2' })
      expect(await band.find({ type: 'Button' })).toBe(undefined)
      expect(await run($)).toContain('**VeroInserto** - *From tree to prompt.*')
    })

    test('a home copy beside an old copy: paused, with the two Remove buttons', async ($, on) => {
      const settings = { project: { enabledPlugins: { 'vero-inserto@old-place': true } } }
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: HOME }, settings })
      await start($, surface)
      expect(seen.toasts).toEqual(['VeroInserto is paused: an old copy from old-place is still installed. See the band above the prompt.'])
      const band = await mountBand($, surface)
      expect(
        await band.find({ type: 'Text', text: '⛔ VeroInserto is paused - an old copy from old-place is still installed. Remove it, then restart.' }),
      ).toBeDefined()
      expect((await band.findAll({ type: 'Button' })).length).toBe(2)
      expect((await band.find({ key: 'vero-inserto-move:remove-1' }))?.text).toBe('1 ↓ Remove the old copy')
      expect((await band.find({ key: 'vero-inserto-move:remove-2' }))?.text).toBe('2 ↓ Remove the old marketplace')
      await band.press({ key: 'vero-inserto-move:remove-1' })
      await band.press({ key: 'vero-inserto-move:remove-2' })
      expect(seen.filled).toEqual([
        { text: '/plugin uninstall vero-inserto@old-place --scope project', mode: 'replace' },
        { text: '/plugin marketplace remove old-place', mode: 'replace' },
      ])
      expect(await run($)).toContain('    /plugin uninstall vero-inserto@old-place --scope project\n    /plugin marketplace remove old-place')

      // the old copy removed: the next turn resumes normal work
      settings.project = { enabledPlugins: {} } as typeof settings.project
      await $.turn.start({ text: 'next', turnId: 'T2' })
      expect(await band.find({ type: 'Button' })).toBe(undefined)
    })

    test('a working copy re-reads its source at most every 10 seconds', async ($, on) => {
      const settings: Partial<Record<'user', Record<string, unknown>>> = { user: { enabledPlugins: { 'vero-inserto@vero-plugins': true } } }
      const seen = fakeWorld(on, { env: { VERO_TEST_ROOT: HOME }, settings })
      await start($, surface)
      const band = await mountBand($, surface)
      // an old copy appears right away: not looked for yet, so the next turn still works
      settings.user = { enabledPlugins: { 'vero-inserto@old-place': true, 'vero-inserto@vero-plugins': true } }
      await seen.clock.advance(9_000)
      await $.turn.start({ text: 'next', turnId: 'T2' })
      expect(await band.find({ type: 'Button' })).toBe(undefined)
      // ten seconds on: looked for, found, and the copy pauses
      await seen.clock.advance(1_000)
      await $.turn.start({ text: 'next', turnId: 'T3' })
      expect((await band.findAll({ type: 'Button' })).length).toBe(2)
    })
  })
}
