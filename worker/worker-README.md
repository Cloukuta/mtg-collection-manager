# MTG Collection Manager — Cloudflare Worker

This directory contains the Cloudflare Worker used by the MTG Collection Manager frontend.

The Worker acts as the secure backend between the browser and Gemini Vision.

## Architecture

```text
Browser
   |
   | card image
   v
Cloudflare Worker
   |
   | Gemini API request
   v
Gemini Vision
   |
   v
Identification JSON
   |
   v
Browser
```

The Gemini credential stays server-side.

## Files

```text
worker/
├── worker.js
├── wrangler.toml
└── README.md
```

## Identification data

The Worker should return structured data similar to:

```json
{
  "name": "Arcane Signet",
  "set_code": "HOC",
  "collector_number": "95",
  "language": "Dwarvish",
  "foil": false,
  "confidence": 0.95
}
```

The schema may evolve during development.

## Identification priority

The AI prompt should prioritize printed metadata:

1. Set code
2. Collector number
3. Language / script
4. Finish
5. Card name

The model must not invent a card name when the title is unreadable.

For special-language cards, the title can be difficult to interpret correctly. If the metadata identifies the printing, Scryfall should resolve the canonical card name.

### Example

If a Dwarvish Arcane Signet produces:

```text
set_code: HOC
collector_number: 95
name: Sol Ring
```

the name should be considered unreliable because `HOC #95` is the stronger identifier.

The frontend should resolve `HOC #95` through Scryfall.

## Secrets

Never commit API credentials.

For example:

```bash
npx wrangler secret put GEMINI_API_KEY
```

The variable name must match the one used by `worker.js`.

Local secret files such as `.dev.vars` should remain ignored by Git.

## Local development

Authenticate with Cloudflare:

```bash
wrangler login
```

Run the Worker locally:

```bash
wrangler dev
```

## Deployment

From this directory:

```bash
wrangler deploy
```

Then configure the frontend to use the deployed Worker URL.

## CORS

The Worker should allow requests from the configured frontend origin.

For local development, localhost can be allowed temporarily. Production should use the GitHub Pages origin.

## Future improvements

- Better image preprocessing.
- Dedicated crop for bottom-left metadata.
- OCR/vision retry when confidence is low.
- Validation of set + collector number against Scryfall.
- Structured error responses.
- Improved rate limiting.
- Optional caching for repeated scans.
- Batch scanning.

## Security

The frontend must never contain the Gemini API key.

Scryfall does not require a private API key for normal public API usage, but its API usage guidelines and rate limits should still be respected.
