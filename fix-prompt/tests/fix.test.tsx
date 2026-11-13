import { expect, test } from 'claude-code/testing'

// The test runner has timers; the mod's own lib (no DOM, no Node) does not.
declare const setTimeout: (fn: (value?: unknown) => void, ms: number) => unknown

const BAND = {
  plugin: 'fix-prompt',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, view: {}, scroll: { offset: 0, bodyRows: 10 } },
} as const

test('the button rewrites the draft into the box and never submits', async ($, on) => {
  const filled: string[] = []
  let submitted = 0
  let asked = ''
  on('prompt.read', () => ({ value: { text: 'pls fix teh bug in login its broke', cursor: 0 } }))
  on('model.complete', (_, e) => {
    asked = e.prompt
    return { value: { isAnswered: true, text: 'Please fix the bug in the login flow; it is broken.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('prompt.fill', (_, e) => { filled.push(e.text); return { isFilled: true, text: e.text, cursor: e.text.length } })
  on('prompt.submit', (_, e) => { submitted += 1; return { text: e.text } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'fix' })
    await ui.unmount()
  }
  expect(asked).toContain('pls fix teh bug')
  expect(filled).toEqual([
    'Please fix the bug in the login flow; it is broken.',
    'Please fix the bug in the login flow; it is broken.',
  ])
  expect(submitted).toBe(0)
})

test('an empty draft is left alone', async ($, on) => {
  let called = 0
  on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
  on('model.complete', () => { called += 1; return { value: { isAnswered: false, reason: 'aborted', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'fix' })
  await ui.unmount()
  expect(called).toBe(0)
})

const USAGE2 = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('the system prompt keeps real words like "mod"', async ($, on) => {
  let system = ''
  on('prompt.read', () => ({ value: { text: 'how do i view the claude mod', cursor: 0 } }))
  on('model.complete', (_, e) => {
    system = e.system ?? ''
    return { value: { isAnswered: true, text: 'How do I view the Claude mod?', usage: USAGE2 } }
  })
  on('prompt.fill', (_, e) => ({ isFilled: true, text: e.text, cursor: e.text.length }))
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'fix' })
  await ui.unmount()
  expect(system).toContain('"mod" stays "mod"')
})

test('a busy box gets the fix as a Tab suggestion, never a send', async ($, on) => {
  const suggested: string[] = []
  let fills = 0
  let submitted = 0
  on('prompt.read', () => ({ value: { text: 'fix teh popup', cursor: 0 } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Fix the popup.', usage: USAGE2 } }))
  on('prompt.fill', () => { fills += 1; return { isFilled: false, text: '', cursor: 0 } })
  on('prompt.suggest', (_, e) => { suggested.push(e.text); return { isShown: true } })
  on('prompt.submit', (_, e) => { submitted += 1; return { text: e.text } })
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'fix' })
  await ui.unmount()
  expect(fills).toBe(6)
  expect(suggested).toEqual(['Fix the popup.'])
  expect(submitted).toBe(0)
})

test('/fix-prompt answers at once and fills the box afterwards', async ($, on) => {
  const filled: string[] = []
  on('command.register', () => ({ value: { command: 'fix-prompt' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.read', () => ({ value: { text: '/fix-prompt', cursor: 0 } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Show me the mod.', usage: USAGE2 } }))
  on('prompt.fill', (_, e) => { filled.push(e.text); return { isFilled: true, text: e.text, cursor: 0 } })
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({
    command: 'fix-prompt',
    args: 'show me teh mod',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(r.text).toContain('Fixing your draft')
  for (let i = 0; i < 20 && filled.length === 0; i += 1) await new Promise(r => setTimeout(r, 10))
  expect(filled).toEqual(['Show me the mod.'])
})
