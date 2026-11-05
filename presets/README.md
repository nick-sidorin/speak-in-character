# InCharacter speech presets

Each preset is a standalone UTF-8 JSON file following schema version 1. No JavaScript, plugins or recompilation required.

## Add a preset

1. Launch InCharacter, open **Settings → Speech presets → Open folder**.
2. Create or copy a `.json` file into that folder.
3. Choose **Reload presets**, then select it from the list.
4. Your selection is remembered. The optional character and situation fields still apply.

Bundled examples ship with the application. To change a built-in preset without modifying the app, put a JSON file with the **same ID** in your personal presets folder. The personal file takes precedence.

```json
{
  "schemaVersion": 1,
  "id": "mysterious-merchant",
  "name": { "en": "Mysterious merchant", "ru": "Загадочный торговец" },
  "description": {
    "en": "Soft-spoken, elusive and polite",
    "ru": "Тихая, уклончивая и вежливая речь"
  },
  "instructions": "Use a calm, courteous, slightly elusive speaking style. Never invent facts or a different message.",
  "recognitionHints": "Trader, market, wares, merchant"
}
```

Only `en` is required for `name` and `description`; optional languages: `ru`, `fr`, `es`, `de`. The `recognitionHints` field is optional and helps transcribe unfamiliar names; it does not replace the original speech.

Keep preset instructions about **style**, not what the character should decide, do or say. Presets may be setting-specific; the core translator is deliberately generic.

Custom files are stored in the application's per-user data directory and are not uploaded by InCharacter, except the selected preset's instructions and recognition hints when processing a speech request through OpenAI.
