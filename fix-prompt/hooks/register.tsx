import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FixStatus } from '../types'

const IDLE: FixStatus = { kind: 'idle' }
const status = atom({ plugin: 'fix-prompt', key: 'status' } as const, IDLE)
// The newest draft that is not a slash command: typing `/fix-prompt` (or a
// key bound to it) replaces the box, so the command fixes this one instead.
const lastDraft = atom({ plugin: 'fix-prompt', key: 'lastDraft' } as const, '')

const SYSTEM = `You rewrite a draft prompt that a person is about to send to an AI coding assistant.

Do:
- Fix spelling, grammar and punctuation.
- Make it clearer and more specific: tighten vague wording, order the asks logically, and make implicit requirements explicit only where the draft already implies them.
- Keep the person's voice, intent, scope and every requirement, constraint, name, path, code snippet, command, URL and number exactly as given.

Do not:
- Answer, act on, or comment on the request.
- Add new requirements, assumptions, features, or questions the person did not ask.
- Change what is being asked for, or shorten it by dropping details.
- Wrap the result in quotes, code fences, or add any preamble or explanation.

Reply with the rewritten prompt only.`

const isCommand = (text: string) => text.trimStart().startsWith('/')

async function fix($: EngineInterface, fallback?: string): Promise<string | undefined> {
  if ((await read($, status)).kind === 'busy') return 'A fix is already running.'

  const box = await $.prompt.read()
  let draft = box.text.trim()
  if (!draft || isCommand(draft)) draft = (fallback ?? '').trim() || (await read($, lastDraft)).trim()
  if (!draft) {
    $.ui.toast('Fix prompt: type a draft first.')
    return 'Nothing to fix: the prompt box is empty.'
  }

  await update($, status, () => ({ kind: 'busy' }) as FixStatus)
  $.ui.status('Fixing prompt…')
  try {
    const r = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: `<draft>\n${draft}\n</draft>`,
      maxTokens: 4096,
      effort: 'low',
      timeoutMs: 60000,
    })
    if (!r.isAnswered || !r.text.trim()) {
      const message = r.isAnswered ? 'empty reply' : r.reason
      await update($, status, () => ({ kind: 'error', message }) as FixStatus)
      $.ui.toast(`Fix prompt failed (${message}); your draft is unchanged.`)
      return `Fix prompt failed (${message}).`
    }
    const fixed = r.text.trim()
    // Fill only: never submit. The person reviews and sends it themselves.
    const filled = await $.prompt.fill({ text: fixed, mode: 'replace' })
    await update($, lastDraft, () => fixed)
    await update($, status, () => IDLE)
    if (!filled.isFilled) {
      $.ui.toast('Fix prompt: could not write to the input box.')
      return `Could not fill the prompt box. Improved prompt:\n\n${fixed}`
    }
    $.ui.toast('Prompt fixed. Review it, then press Enter to send.')
    return undefined
  } finally {
    $.ui.status(undefined)
    if ((await read($, status)).kind === 'busy') await update($, status, () => IDLE)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fix-prompt',
      description: 'Fix spelling/grammar and clarify your draft prompt, then put it back in the input (never sends)',
      argumentHint: '[text]',
    })
    return next(e)
  })

  on('command.run', { command: 'fix-prompt' }, async ($, e) => {
    const text = await fix($, e.args)
    return text ? { text } : {}
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (r.text.trim() && !isCommand(r.text)) await update($, lastDraft, () => r.text)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Keep whatever other mods draw here (the model advisor) beside ours.
    const others = await next(e)
    if (e.props.hasSurvey) return others
    const s = await read($, status)

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box key="fixer" flexDirection="column">
        {others}
        <Box key="fix-row">
        <Button
          key="fix"
          hotkey="f"
          variant="primary"
          label={s.kind === 'busy' ? 'Fixing…' : 'Fix prompt'}
          onPress={() => void fix($)}
        />
        <Text dimColor>
          {s.kind === 'error' ? ` failed: ${s.message}` : ' ctrl+x ctrl+f · or /fix-prompt'}
        </Text>
        </Box>
      </Box>
    )
  })
}
