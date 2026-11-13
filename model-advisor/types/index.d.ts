export type ModelAlias = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'max'
export type Advice = { model: ModelAlias; effort: Effort; reason: string; current: string }
export type AdvisorStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'advice'; advice: Advice }
  | { kind: 'switched'; model: ModelAlias }

declare module 'claude-code' {
  interface PluginState {
    'model-advisor': { status: AdvisorStatus; lastDraft: string }
  }
}
