# model-advisor

Reads the draft in your chat input and recommends which Claude model fits the task (Haiku 5.5, Sonnet 5.5, Opus 5.5 or Fable 5.2) and how much effort to use, with a one-sentence reason. It prefers the cheapest model that will do the job well. If the suggestion differs from the model you are on, a "Switch to …" button runs `/model <name>` for you; your draft stays in the box and nothing is sent.

Trigger it with the "Which model?" button above the input, `ctrl+x m` (set in `~/.claude/keybindings.json` as `"ctrl+x m": "command:model-advice"`), `ctrl+x tab` then `m`, or `/model-advice [task]`. The advice itself comes from one small Haiku call.
