import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'model-advisor',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, view: {}, scroll: { offset: 0, bodyRows: 10 } },
} as const

test('suggests a model and switches without touching the draft', async ($, on) => {
  const ran: string[] = []
  let filled = 0
  let submitted = 0
  on('prompt.read', () => ({ value: { text: 'Refactor the auth module across 12 files and redesign token refresh', cursor: 0 } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: '{"model":"opus","effort":"high","reason":"Multi-file refactor with design decisions."}', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  }))
  on('command.run', (_, e) => { ran.push(`${e.command} ${e.args}`); return {} })
  on('prompt.fill', () => { filled += 1; return { isFilled: true, text: '', cursor: 0 } })
  on('prompt.submit', (_, e) => { submitted += 1; return { text: e.text } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'advise' })
    const line = await ui.find({ type: 'Text', text: /Suggested/ })
    expect(line?.text).toContain('Opus 5.5, high effort')
    expect(line?.text).toContain('you are on claude-sonnet-5-5')
    await ui.press({ key: 'switch' })
    await ui.unmount()
  }
  expect(ran).toEqual(['model opus', 'model opus'])
  expect(filled).toBe(0)
  expect(submitted).toBe(0)
})

test('no switch button when already on the suggested model', async ($, on) => {
  on('prompt.read', () => ({ value: { text: 'rename foo to bar in utils.py', cursor: 0 } }))
  on('session.model', () => ({ value: 'claude-haiku-5-5' }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: '{"model":"haiku","effort":"low","reason":"Single trivial rename."}', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'advise' })
  expect((await ui.find({ type: 'Text', text: /Suggested/ }))?.text).toContain('already on it')
  expect(await ui.find({ type: 'Button', key: 'switch' })).toBeUndefined()
  await ui.unmount()
})
