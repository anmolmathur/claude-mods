import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Advice, AdvisorStatus, Effort, ModelAlias } from '../types'

const IDLE: AdvisorStatus = { kind: 'idle' }
const status = atom({ plugin: 'model-advisor', key: 'status' } as const, IDLE)
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
- sonnet (Sonnet 5.5): the everyday default. Normal feature work, bug fixes in a few files, writing tests, docs, scripts, code review of a modest diff, data wrangling.
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

function onModel(current: string, model: ModelAlias): boolean {
  return current.toLowerCase().includes(model)
}

function describe(a: Advice): string {
  const here = onModel(a.current, a.model) ? ' (you are already on it)' : ` (you are on ${a.current})`
  return `Suggested: ${NAMES[a.model]}, ${a.effort} effort${here}. ${a.reason}`
}

async function advise($: EngineInterface, fallback?: string): Promise<string | undefined> {
  if ((await read($, status)).kind === 'busy') return 'Already checking.'

  const box = await $.prompt.read()
  let draft = box.text.trim()
  if (!draft || isCommand(draft)) draft = (fallback ?? '').trim() || (await read($, lastDraft)).trim()
  if (!draft) {
    $.ui.toast('Model advisor: type a draft first.')
    return 'Nothing to assess: the prompt box is empty.'
  }

  await update($, status, () => ({ kind: 'busy' }) as AdvisorStatus)
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
      await update($, status, () => ({ kind: 'error', message }) as AdvisorStatus)
      return `Model advisor failed (${message}).`
    }
    await update($, status, () => ({ kind: 'advice', advice }) as AdvisorStatus)
    return describe(advice)
  } finally {
    if ((await read($, status)).kind === 'busy') await update($, status, () => IDLE)
  }
}

async function switchTo($: EngineInterface, model: ModelAlias): Promise<void> {
  // Runs `/model <alias>` as if typed; the draft in the box is left alone.
  await $.command.run({ command: 'model', args: model })
  await update($, status, () => ({ kind: 'switched', model }) as AdvisorStatus)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'model-advice',
      description: 'Recommend which Claude model and effort fit the task in your draft prompt',
      argumentHint: '[task]',
    })
    return next(e)
  })

  on('command.run', { command: 'model-advice' }, async ($, e) => {
    const text = await advise($, e.args)
    return text ? { text } : {}
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (r.text.trim() && !isCommand(r.text)) await update($, lastDraft, () => r.text)
    return r
  })

  // A sent (or cleared) prompt makes the advice stale.
  on('prompt.change', { origin: { kind: 'clear' } }, async ($, e, next) => {
    const s = await read($, status)
    if (s.kind === 'advice' || s.kind === 'switched') await update($, status, () => IDLE)
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
          label={s.kind === 'busy' ? 'Checking…' : 'Which model?'}
          onPress={() => void advise($)}
        />
        {s.kind === 'advice' && !onModel(s.advice.current, s.advice.model) && (
          <Button
            key="switch"
            hotkey="s"
            variant="primary"
            label={`Switch to ${NAMES[s.advice.model]}`}
            onPress={() => void switchTo($, s.advice.model)}
          />
        )}
        {s.kind === 'idle' && <Text dimColor> ctrl+x m · or /model-advice</Text>}
        {s.kind === 'error' && <Text dimColor> failed: {s.message}</Text>}
        {s.kind === 'switched' && <Text dimColor> switched to {NAMES[s.model]}; your draft is untouched</Text>}
      </Box>
    )

    return (
      <Box key="advisor" flexDirection="column">
        {others}
        {row}
        {s.kind === 'advice' && <Text wrap="wrap">{describe(s.advice)}</Text>}
      </Box>
    )
  })
}
