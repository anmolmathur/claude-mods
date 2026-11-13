import { expect, test } from 'claude-code/testing'

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
