export type FixStatus = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }

declare module 'claude-code' {
  interface PluginState {
    'fix-prompt': { status: FixStatus; lastDraft: string }
  }
}
