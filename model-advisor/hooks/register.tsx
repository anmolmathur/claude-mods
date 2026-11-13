import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Advice, AdvisorStatus, Effort, ModelAlias } from '../types'

const IDLE: AdvisorStatus = { kind: 'idle' }
// Change the tag when AdvisorStatus changes: it declines what an earlier
// version stored, which outlives a reload.
const status = atom({ plugin: 'model-advisor', key: 'status' } as const, IDLE, { shape: 'status-2' })
const lastDraft = atom({ plugin: 'model-advisor', key: 'lastDraft' } as const, '')

const NAMES: Record<ModelAlias, string> = {
  haiku: 'Haiku 5.5',
  sonnet: 'Sonnet 5.5',
  opus: 'Opus 5.5',
  fable: 'Fable 5.2',
}
const MODELS = Object.keys(NAMES) as ModelAlias[]
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'max']

const SYSTEM = `You pick the right Claude model for a task a person is about to give an AI coding agent (Claude Code). You do NOT do the task.

Models, cheapest/fastest first:
- haiku (Haiku 5.5): quick, cheap. Simple lookups, one-line fixes, renames, formatting, explaining a small snippet, short factual questions, running a known command.
- sonnet (Sonnet 5.5): the everyday default. Normal feature work, bug fixes in a few files, writing tests, docs, scripts, code review of a modest diff, data wrangling, investigating a reported UI or deploy issue.
- opus (Opus 5.5): hard work. Multi-file refactors, subtle debugging, architecture/design trade-offs, security review, migrations, long multi-step agentic tasks, ambiguous requirements.
- fable (Fable 5.2): the most capable and most expensive. Only for the hardest problems: novel algorithms, deep research-grade reasoning, very large system redesigns, problems where opus is likely to fail.

Effort (how hard the model thinks): low, medium, high, max.

Prefer the cheapest model that will do the task well. Do not over-recommend fable.

Reply with ONLY a JSON object, no prose, no code fence:
{"model": "haiku|sonnet|opus|fable", "effort": "low|medium|high|max", "reason": "<one short sentence, max 20 words, naming what about the task drives the choice>"}`

const isCommand = (text: string) => text.trimStart().startsWith('/')

function parseAdvice(text: string, current: string): Advice | undefined {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return undefined
  try {
    const j = JSON.parse(m[0]) as { model?: unknown; effort?: unknown; reason?: unknown }
    const model = String(j.model ?? '').toLowerCase() as ModelAlias
    const effort = String(j.effort ?? '').toLowerCase() as Effort
    if (!MODELS.includes(model)) return undefined
    return {
      model,
      effort: EFFORTS.includes(effort) ? effort : 'medium',
      reason: String(j.reason ?? '').slice(0, 200),
      current,
    }
  } catch {
    return undefined
  }
}

function aliasOf(model: string): ModelAlias | undefined {
  const lower = model.toLowerCase()
  return MODELS.find(alias => lower.includes(alias))
}

function label(a: Advice): string {
  return `${NAMES[a.model]} · ${a.effort} effort`
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Runs a slash command as if typed; throws with its reason when refused. */
async function runCommand($: EngineInterface, command: string, args: string): Promise<void> {
  const r = (await $.command.run({ command, args })) as { deny?: string }
  if (r && typeof r.deny === 'string') throw new Error(`/${command} ${args}: ${r.deny}`)
}

async function setStatus($: EngineInterface, next: AdvisorStatus): Promise<void> {
  await update($, status, () => next)
}

/**
 * One click: read the draft, ask for advice, and apply it at once by running
 * `/model` and `/effort` as if typed. The draft stays in the box; nothing is
 * sent. Returns a line describing what happened.
 */
async function adviseAndApply($: EngineInterface, fallback?: string): Promise<string> {
  if ((await read($, status)).kind === 'busy') return 'Already checking.'

  const box = await $.prompt.read()
  let draft = box.text.trim()
  if (!draft || isCommand(draft)) draft = (fallback ?? '').trim() || (await read($, lastDraft)).trim()
  if (!draft) {
    $.ui.toast('Model advisor: type a draft first.')
    return 'Nothing to assess: the prompt box is empty.'
  }

  await setStatus($, { kind: 'busy' })
  try {
    const current = await $.session.model()
    const r = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: `<task>\n${draft.slice(0, 12000)}\n</task>`,
      maxTokens: 300,
      effort: 'low',
      timeoutMs: 30000,
    })
    const advice = r.isAnswered ? parseAdvice(r.text, current) : undefined
    if (!advice) {
      const message = r.isAnswered ? 'could not read the advice' : r.reason
      await setStatus($, { kind: 'error', message })
      $.ui.toast(`Model advisor failed (${message}).`)
      return `Model advisor failed (${message}).`
    }

    const isModelChanged = aliasOf(current) !== advice.model
    if (isModelChanged) {
      await runCommand($, 'model', advice.model)
      // Trust the session, not the command: confirm the switch took.
      const now = await $.session.model()
      if (aliasOf(now) !== advice.model) {
        throw new Error(`asked for ${NAMES[advice.model]} but the session is still on ${now}`)
      }
    }
    await runCommand($, 'effort', advice.effort)

    if (isModelChanged) {
      await setStatus($, { kind: 'applied', advice, previous: current, isModelChanged })
      $.ui.toast(`Switched to ${label(advice)}. Your draft is untouched.`)
      return `Switched to ${label(advice)} (was ${current}). ${advice.reason}`
    }
    await setStatus($, { kind: 'kept', advice })
    $.ui.toast(`Already on the right model: ${label(advice)}.`)
    return `Already on ${NAMES[advice.model]}; effort set to ${advice.effort}. ${advice.reason}`
  } catch (err) {
    const message = errorText(err)
    await setStatus($, { kind: 'error', message })
    $.ui.toast(`Model advisor could not switch: ${message}`)
    return `Model advisor could not switch: ${message}`
  } finally {
    if ((await read($, status)).kind === 'busy') await setStatus($, IDLE)
  }
}

async function undo($: EngineInterface, previous: string): Promise<void> {
  try {
    await runCommand($, 'model', aliasOf(previous) ?? previous)
    await setStatus($, { kind: 'undone', model: previous })
  } catch (err) {
    await setStatus($, { kind: 'error', message: errorText(err) })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'model-advice',
      description: 'Pick the right Claude model and effort for your draft and switch to it (never sends)',
      argumentHint: '[task]',
    })
    return next(e)
  })

  on('command.run', { command: 'model-advice' }, async ($, e) => {
    // The switch runs `/model` and `/effort`, which queue behind this command:
    // start it without waiting so the command can finish first.
    void adviseAndApply($, e.args).catch(() => undefined)
    return { text: 'Checking which model fits your draft…' }
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (r.text.trim() && !isCommand(r.text)) await update($, lastDraft, () => r.text)
    return r
  })

  // A sent (or cleared) prompt makes the result line stale.
  on('prompt.change', { origin: { kind: 'clear' } }, async ($, e, next) => {
    const s = await read($, status)
    if (s.kind !== 'idle' && s.kind !== 'busy') await setStatus($, IDLE)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Keep whatever other mods draw here (the Fix prompt button) beside ours.
    const others = await next(e)
    if (e.props.hasSurvey) return others
    const s = await read($, status)
    const { Box, Button, Text } = $.ui.resolve(e)

    const row = (
      <Box key="advisor-row">
        <Button
          key="advise"
          hotkey="m"
          variant="primary"
          label={s.kind === 'busy' ? 'Picking model…' : 'Pick model'}
          onPress={() => void adviseAndApply($)}
        />
        {s.kind === 'idle' && <Text dimColor> picks and switches model + effort · ctrl+x m · /model-advice</Text>}
        {s.kind === 'busy' && <Text dimColor> reading your draft…</Text>}
        {s.kind === 'applied' && (
          <Text>
            {' '}Switched to {label(s.advice)} <Text dimColor>(was {s.previous})</Text>
          </Text>
        )}
        {s.kind === 'applied' && (
          <Button key="undo" hotkey="u" label="Undo" onPress={() => void undo($, s.previous)} />
        )}
        {s.kind === 'kept' && <Text> Already on the right model: {label(s.advice)}</Text>}
        {s.kind === 'undone' && <Text dimColor> back on {s.model}</Text>}
        {s.kind === 'error' && <Text color="error"> failed: {s.message}</Text>}
      </Box>
    )
    const reason = s.kind === 'applied' || s.kind === 'kept' ? s.advice.reason : ''

    return (
      <Box key="advisor" flexDirection="column">
        {others}
        {row}
        {reason !== '' && <Text dimColor wrap="wrap">{reason}</Text>}
      </Box>
    )
  })
}
