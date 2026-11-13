# claude-mods

This is for all my claude features: mods that change Claude Code's own interface and behaviour.

## Mods

**fix-prompt** adds a "Fix prompt" button above the chat input. It takes your draft, corrects spelling and grammar, and makes it clearer and more specific without changing what you are asking for, then puts the improved version back in the input box for you to review. It never sends anything. Also available as `/fix-prompt`.

**model-advisor** adds a "Which model?" button above the chat input. It reads your draft and recommends which Claude model (Haiku, Sonnet, Opus or Fable) and effort level fit the task, with a one-line reason, preferring the cheapest model that will do the job well. If the suggestion differs from the model you are on, a "Switch to …" button runs `/model` for you and leaves your draft untouched. Also available as `/model-advice`.

The buttons appear in Claude Code's terminal and desktop app. On the mobile app, use the slash commands.

## Install

At the prompt of a Claude Code session:

```
/plugin install fix-prompt --marketplace anmolmathur/claude-mods
/plugin install model-advisor --marketplace anmolmathur/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install fix-prompt --marketplace anmolmathur/claude-mods
claude plugin install model-advisor --marketplace anmolmathur/claude-mods
```

## Optional keyboard shortcuts

Add to `~/.claude/keybindings.json`:

```json
{
  "bindings": [
    { "context": "Chat", "bindings": { "ctrl+x ctrl+f": "command:fix-prompt", "ctrl+x m": "command:model-advice" } }
  ]
}
```

With the band focused (`ctrl+x tab`), `f` fixes the prompt and `m` asks for model advice.
