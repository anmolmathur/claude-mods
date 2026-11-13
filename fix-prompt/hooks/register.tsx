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
- Keep every word that is a correctly spelled real word, even if a similar word seems more likely. Technical terms, product names, jargon and short forms stay as written: "mod" stays "mod" (never "model"), "repo" stays "repo", "env" stays "env", "PR" stays "PR". Only correct a word when it is clearly a misspelling of one specific word.

Do not:
- Answer, act on, or comment on the request.
- Add new requirements, assumptions, features, or questions the person did not ask.
- Change what is being asked for, or shorten it by dropping details.
- Swap a word for a different word with a different meaning.
- Wrap the result in quotes, code fences, or add any preamble or explanation.

Reply with the rewritten prompt only.`

const isCommand = (text: string) => text.trimStart().startsWith('/')

/**
 * Puts the fixed prompt in front of the person without sending it: in the
 * input box when it takes the text (retrying while a slash command still holds
 * the box), else as the box's Tab-to-take suggestion.
 */
async function deliver($: EngineInterface, text: string): Promise<'filled' | 'suggested' | 'none'> {
  // Never submit: the person reviews and sends it themselves.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const filled = await $.prompt.fill({ text, mode: 'replace' })
    if (filled.isFilled) return 'filled'
    await $.clock.sleep(500)
  }
  const shown = await $.prompt.suggest({ text })
  return shown.isShown ? 'suggested' : 'none'
}

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
    await update($, lastDraft, () => fixed)
    await update($, status, () => IDLE)
    const how = await deliver($, fixed)
    if (how === 'filled') {
      $.ui.toast('Prompt fixed. Review it, then press Enter to send.')
      return undefined
    }
    if (how === 'suggested') {
      $.ui.toast('Prompt fixed: press Tab to put it in the input, then review and send.')
      return undefined
    }
    $.ui.toast('Fix prompt could not reach the input box. Improved prompt: ' + fixed)
    return `Could not fill the prompt box. Improved prompt:\n\n${fixed}`
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
    // The input box is busy until this command finishes: fix in the
    // background so the fill lands once the box is free again.
    // fix() raises its own toasts, the improved text included when it cannot
    // reach the box.
    void fix($, e.args).catch(() => undefined)
    return { text: 'Fixing your draft… it will appear in the input box for review.' }
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
