import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'model-advisor',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10,
    bodyColumns: 80, view: {}, scroll: { offset: 0, bodyRows: 10 },
  },
} as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function advice(json: string) {
  return () => ({ value: { isAnswered: true as const, text: json, usage: USAGE } })
}

test('one click picks the model, switches model and effort, and never touches the draft', async ($, on) => {
  const ran: string[] = []
  let filled = 0
  let submitted = 0
  on('prompt.read', () => ({ value: { text: 'Refactor the auth module across 12 files and redesign token refresh', cursor: 0 } }))
  let model = 'claude-sonnet-5-5'
  on('session.model', () => ({ value: model }))
  on('model.complete', advice('{"model":"opus","effort":"high","reason":"Multi-file refactor with design decisions."}'))
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`)
    if (e.command === 'model') model = `claude-${e.args}-5-5`
    return {}
  })
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.fill', () => { filled += 1; return { isFilled: true, text: '', cursor: 0 } })
  on('prompt.submit', (_, e) => { submitted += 1; return { text: e.text } })

  for (const surface of ['terminal', 'desktop'] as const) {
    ran.length = 0
    model = 'claude-sonnet-5-5'
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'advise' })
    expect(ran).toEqual(['model opus', 'effort high'])
    expect((await ui.find({ type: 'Text', text: /Switched to/ }))?.text).toContain('Opus 5.5 · high effort')
    expect((await ui.find({ type: 'Text', text: /Multi-file refactor/ }))?.text).toBeDefined()

    // Undo puts the previous model back.
    await ui.press({ key: 'undo' })
    expect(ran.at(-1)).toBe('model sonnet')
    await ui.unmount()
  }
  expect(filled).toBe(0)
  expect(submitted).toBe(0)
})

test('already on the suggested model: only the effort is set', async ($, on) => {
  const ran: string[] = []
  on('prompt.read', () => ({ value: { text: 'rename foo to bar in utils.py', cursor: 0 } }))
  on('session.model', () => ({ value: 'claude-haiku-5-5' }))
  on('model.complete', advice('{"model":"haiku","effort":"low","reason":"Single trivial rename."}'))
  on('command.run', (_, e) => { ran.push(`${e.command} ${e.args}`); return {} })
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'advise' })
  expect(ran).toEqual(['effort low'])
  expect((await ui.find({ type: 'Text', text: /Already on the right model/ }))?.text).toContain('Haiku 5.5')
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.unmount()
})

test('a switch that does not take is reported, not claimed', async ($, on) => {
  on('prompt.read', () => ({ value: { text: 'design a new billing system', cursor: 0 } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('model.complete', advice('{"model":"opus","effort":"high","reason":"System design."}'))
  on('command.run', () => ({}))
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'advise' })
  expect((await ui.find({ type: 'Text', text: /still on claude-sonnet-5-5/ }))?.text).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Switched to/ })).toBeUndefined()
  await ui.unmount()
})

test('a refused switch is shown, not swallowed', async ($, on) => {
  on('prompt.read', () => ({ value: { text: 'design a new billing system', cursor: 0 } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('model.complete', advice('{"model":"opus","effort":"high","reason":"System design."}'))
  on('command.run', () => { throw new Error('model not allowed') })
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'advise' })
  expect((await ui.find({ type: 'Text', text: /failed/ }))?.text).toBeDefined()
  await ui.unmount()
})
