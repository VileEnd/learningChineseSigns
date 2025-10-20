# Learning Chinese Signs

Progressive Web App for practising simplified Chinese vocabulary with a two-step drill: first recall the Pinyin (including tones), then draw each character with stroke-order feedback. The app runs entirely in the browser and stores progress offline via IndexedDB.

## Tech Stack

- [SvelteKit 2](https://kit.svelte.dev/) with TypeScript
- Tailwind CSS 4 for styling
- Dexie.js for IndexedDB persistence
- hanzi-writer for handwriting validation
- pinyin utilities for tone comparison
- Vitest & Playwright for testing

## Getting Started

```bash
npm install
npm run dev
```

The app is available at http://localhost:5173 by default. Service workers are registered automatically, so you can install it as a PWA when running over HTTPS. In development you may need to allow insecure SWs in the browser devtools.

## Scripts

| Command           | Description                                   |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                      |
| `npm run build`   | Create a production build in `build/`          |
| `npm run preview` | Preview the production build locally           |
| `npm run check`   | Type-check Svelte files and run `svelte-check` |
| `npm run test`    | Execute unit tests with Vitest                 |

## Data & Storage

- No seed vocabulary is shipped; populate the deck by importing JSON packs such as the bundled Klett chapters.
- User progress, settings, and custom words sit in IndexedDB (`learning-chinese-signs` database).
- Use the **Export** button in the UI to download a JSON backup. Re-import the same file to restore state on another device.
- Additional vocabulary packs can be imported as JSON via the UI. The expected format:

```json
{
	"version": 1,
	"words": [
		{
			"id": "w-gan3xie4",
			"prompt": "Danke",
			"promptLanguage": "de",
			"pinyin": "gǎnxiè",
			"characters": ["感", "谢"],
			"alternatePinyin": ["gan3 xie4"],
			"hints": { "note": "Alternative zu 谢谢." }
		}
	]
}
```

## Handwriting Flow

1. Recall Pinyin (if the selected mode requires it). Tone mismatches are highlighted without consuming an attempt.
2. Draw each character. The quiz hides the outline during the first attempts and escalates from free drawing → half-guided → fully-guided tracing with three required repetitions. Use the in-app hint button or enable the settings toggle to reveal the outline immediately.
3. Correct words move to the “known” bucket with spaced repetition; difficult words stay in the learning queue.

## Testing

Run unit tests:

```bash
npm run test
```

Playwright end-to-end tests can be added under `tests/` (install browsers first with `npx playwright install`).

## Deployment

- **Cloudflare Pages** – The project ships with `@sveltejs/adapter-cloudflare` and a Pages-focused `wrangler.toml`. Build with `npm run build` and deploy `.svelte-kit/cloudflare` via Cloudflare Pages (framework preset: SvelteKit) or run `npm run deploy:pages` (which bundles `npm run build && wrangler pages deploy .svelte-kit/cloudflare`). For local testing run `wrangler pages dev .svelte-kit/cloudflare --local` after building.
- **Cloudflare Workers** – If you later target Workers directly, create a separate Wrangler configuration (for example `wrangler.worker.toml`) that specifies a `main` entry point and asset binding before running `wrangler deploy`.
- **Other hosts** – The generated client assets live in `build/`. Swap to a different adapter if you later target another platform.
