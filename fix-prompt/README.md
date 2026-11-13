# fix-prompt

Adds a **Fix prompt** button in the band above the chat input. Press it and your current draft is rewritten — spelling and grammar corrected, wording made clearer and more specific, intent and every detail kept — and put back in the input box for you to review. It never sends anything; you press Enter yourself.

Ways to trigger it: click the button; focus the band (ctrl+x tab) and press `f`; run `/fix-prompt` (fixes your last draft, or `/fix-prompt <text>`); or the key binding ctrl+x ctrl+f, set in `~/.claude/keybindings.json` (Chat context) as `"ctrl+x ctrl+f": "command:fix-prompt"`.

It keeps technical terms and short forms as you wrote them ("mod" stays "mod", "repo" stays "repo") and only corrects clear misspellings. With `/fix-prompt`, the fixed text lands in the input once the command finishes; if the input is busy it appears as a dim suggestion you take with Tab.
