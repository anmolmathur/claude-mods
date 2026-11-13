# model-advisor

One click picks the right Claude model for the task in your draft and switches to it.

Press **Pick model** above the chat input (or `ctrl+x m`, or `ctrl+x tab` then `m`, or `/model-advice [task]`). A small Haiku call reads your draft and chooses a model (Haiku 5.5, Sonnet 5.5, Opus 5.5 or Fable 5.2) and an effort level (low, medium, high, max), preferring the cheapest model that will do the job well. The mod then runs `/model` and `/effort` for you, checks that the switch took, and shows what it chose and why. **Undo** puts the previous model back. Your draft stays in the box and nothing is sent.

If you are already on the suggested model, only the effort is set. If a switch is refused or does not take, the band says so instead of claiming it worked.
