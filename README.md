# MTG Collection Manager

Free, browser-based Magic: The Gathering collection manager focused on **card scanning, exact printing identification, collection management, and export**.

This project started from the open-source scanner [`IgorLikesAnime/mtg-card-scanner`](https://github.com/IgorLikesAnime/mtg-card-scanner) and is being developed independently as `mtg-collection-manager`.

## Goals

- Scan MTG cards with a phone camera.
- Identify the **exact printing**, not only the card name.
- Prioritize **set code + collector number**.
- Support special treatments and alternate scripts.
- Resolve canonical card data through Scryfall.
- Maintain a persistent personal collection.
- Track quantity, condition, finish, purchase data and notes.
- Mark cards **For Sale** or **For Trade**.
- Export collection data to CSV/JSON.
- Keep the project free wherever possible.

## Architecture

```text
Phone / Browser
      |
      v
   MTG Scanner
      |
      v
Cloudflare Worker
      |
      v
Gemini Vision
      |
      v
Set Code + Collector Number
      |
      v
Scryfall API
      |
      v
Exact Card Printing
      |
      v
Collection Storage
```

The frontend is currently a static HTML/JavaScript application. The Gemini API key remains server-side in the Cloudflare Worker.

## Identification strategy

The application should **not trust the card name alone**.

Preferred order:

1. Set code + collector number
2. Exact Scryfall printing lookup
3. Language / finish / treatment validation
4. Card name as secondary confirmation
5. Manual set + collector number lookup when automatic recognition fails

This is especially important for cards with alternate languages, special treatments, unusual typography, or non-Latin card names.

## Technology

- HTML5
- Vanilla JavaScript
- Browser Camera API
- Cloudflare Workers
- Gemini Vision
- Scryfall API
- GitHub Pages

## Development status

**V1 — Early development**

Current priorities:

- Improve exact-printing recognition.
- Prioritize `set + collector number`.
- Add manual exact-printing search.
- Add persistent collection storage.
- Add quantity and card-management controls.
- Add CSV/JSON export.
- Add sale/trade management.
- Add batch scanning.
- Add backup/import.

## Repository structure

```text
mtg-collection-manager/
├── .github/
├── worker/
│   ├── worker.js
│   ├── wrangler.toml
│   └── README.md
├── .gitignore
├── .nojekyll
├── app.js
├── index.html
└── README.md
```

## Local development

The frontend is static and can be served with any static web server.

Example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

Camera access normally requires HTTPS or localhost.

## Cloudflare Worker

The Worker communicates with Gemini without exposing the Gemini API key in the browser.

Before deployment:

1. Create/configure your Cloudflare Worker.
2. Store the Gemini credential as a Worker secret.
3. Configure the allowed frontend origin.
4. Deploy the Worker.
5. Point the frontend to your Worker URL.

**Never put the Gemini API key in `app.js` or `index.html`.**

See [`worker/README.md`](worker/README.md).

## Data and privacy

The planned V1 collection system uses browser-local IndexedDB with JSON backup/import. Optional cloud synchronization may be added later.

Do not commit API keys, credentials, Cloudflare secrets, or private collection exports containing sensitive information.

## Data sources

- [Scryfall](https://scryfall.com/)
- Gemini Vision for image recognition

Scryfall should be treated as the canonical source for card-printing metadata whenever possible.

## Roadmap

### V1
- [x] Base scanner
- [x] Reliable set/collector identification
- [x] Special-language/treatment handling
- [x] Manual exact-printing search
- [ ] Persistent collection
- [x] Quantity management
- [x] Condition
- [x] Foil/nonfoil
- [x] CSV export
- [ ] JSON backup/import

### V2
- [ ] Search and filters
- [ ] For Sale list
- [ ] For Trade list
- [ ] Purchase price
- [ ] Sale price
- [ ] Collection statistics
- [ ] Batch scanning

### V3
- [ ] Optional cloud synchronization
- [ ] Price tracking
- [ ] Better duplicate detection
- [ ] Deck integration
- [ ] Advanced inventory/location management

## Disclaimer

Magic: The Gathering is a trademark of Wizards of the Coast. This is an independent fan/developer project and is not affiliated with or endorsed by Wizards of the Coast.
