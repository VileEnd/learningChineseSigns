# Refactor TODO

- [x] Improve `MatchingDrill` accessibility and keyboard support, add tests ensuring interactions work.
- [ ] Extract study header controls from `src/routes/+page.svelte` into a dedicated component to reduce component size and aid reuse.
- [ ] Consolidate library selection/import logic into a standalone store/service to share between components.
- [x] Modularize `src/routes/+page.svelte`; extract settings form, header, library pickers, and matching mode panels into dedicated components to shrink the monolith and simplify state wiring.
- [ ] Replace imperative settings syncing logic (`subscribeToSettings`, `hydrateSession`, `loadMatchingRound`) inside `src/routes/+page.svelte` with derived stores/services to avoid duplicated JSON diffing and repeated repository calls.
- [x] Replace imperative settings syncing logic (`subscribeToSettings`, `hydrateSession`, `loadMatchingRound`) inside `src/routes/+page.svelte` with derived stores/services to avoid duplicated JSON diffing and repeated repository calls.
- [x] Wrap sequential Dexie mutations like `repository.recordMatchingRound` and `repository.recordLesson` in explicit transactions to prevent partial writes and reduce write amplification.
- [ ] Cache expensive lookups in `repository.getMatchingRound` by batching `db.progress`/`db.words` queries and avoiding repeated shuffle/filter passes per candidate.
- [ ] Move palette logic and status strings in `src/lib/components/MatchingDrill.svelte` into a config module; ensure colors cover dynamic word counts >6 and maintain keyboard accessibility affordances.
- [ ] Refactor the long form handlers (`handleLibraryImport`, `handleKlettImport`, `handleSettingsSave`) in `src/routes/+page.svelte` into reusable utilities to eliminate repeated summary assembly and error handling.
- [ ] Extract shared SM-2 utilities (quality derivation, bucket selection) from `src/lib/scheduler/spaced-repetition.ts` into pure helpers with unit coverage; expose typed enums/constants instead of magic numbers.
- [ ] Introduce a thin repository layer for library metadata (`getAvailableLibraries`, `importLibraryChapters`, `suspendLibraryChapters`) to consolidate duplicated Klett-vs-generic logic and centralize validation before persistence.
- [ ] Centralize localized copy (status messages, button labels) via a dictionary module so UI components and routes stop hard coding strings and can support future translations.
