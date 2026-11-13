export type ModelAlias = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'max'
export type Advice = { model: ModelAlias; effort: Effort; reason: string; current: string }
export type AdvisorStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  // One click: the advice was applied (model and effort switched).
  | { kind: 'applied'; advice: Advice; previous: string; isModelChanged: boolean }
  // The session was already on the suggested model; only the effort was set.
  | { kind: 'kept'; advice: Advice }
  | { kind: 'undone'; model: string }

declare module 'claude-code' {
  interface PluginState {
    'model-advisor': { status: Shaped<AdvisorStatus>; lastDraft: string }
  }
}
