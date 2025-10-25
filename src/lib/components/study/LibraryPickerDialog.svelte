<script lang="ts">
	import type { LibraryType } from '$lib/data/libraries';

	type LibraryChapter = {
		id: string;
		label: string;
		wordCount: number;
	};

	type LibraryCatalogEntry = {
		id: LibraryType;
		name: string;
		chapters: LibraryChapter[];
	};

	type DraftSummary = {
		chapterCount: number;
		wordCount: number;
	};

	export let dialogPaddingTop: string;
	export let dialogHeight: string;
	export let libraryCatalog: LibraryCatalogEntry[];
	export let draftSummaryMap: Map<LibraryType, DraftSummary>;
	export let draftSelection: Record<LibraryType, string[]>;
	export let selectAllLibraryChapters: (libraryId: LibraryType) => void;
	export let clearLibraryChapterSelection: (libraryId: LibraryType) => void;
	export let toggleLibraryChapter: (libraryId: LibraryType, chapterId: string) => void;
	export let handleLibraryImport: () => Promise<boolean>;
	export let libraryImporting: boolean;
	export let draftActiveLibraries: number;
	export let draftTotalChapters: number;
	export let draftTotalWords: number;
	export let close: () => void;
</script>

<div
	class="fixed inset-0 z-[80] isolate flex flex-col bg-white/80 backdrop-blur-sm md:items-center md:px-4"
	style={`padding-top: ${dialogPaddingTop};`}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}}
>
	<button
		type="button"
		class="absolute inset-0 z-0 h-full w-full cursor-pointer"
		aria-label="Bibliotheksauswahl schließen"
		on:click={close}
	></button>
	<div
		data-state="open"
		class="relative z-10 flex w-full flex-1 min-h-0 flex-col translate-y-6 overflow-hidden rounded-t-3xl bg-white p-6 opacity-0 shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ease-out data-[state=open]:translate-y-0 data-[state=open]:opacity-100 md:mt-0 md:max-w-2xl md:flex-none md:rounded-2xl md:p-8"
		style={`height: ${dialogHeight}; max-height: ${dialogHeight};`}
	>
		<header class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-slate-900">Bibliothek & Kapitel wählen</h2>
			<button class="text-sm text-slate-500" type="button" on:click={close}>Schließen</button>
		</header>
		<form
			class="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden"
			on:submit|preventDefault={async () => {
				const imported = await handleLibraryImport();
				if (imported) {
					close();
				}
			}}
		>
			<div class="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
				{#each libraryCatalog as library (library.id)}
					<section class="rounded-xl border border-slate-200 bg-slate-50">
						<header class="flex flex-col gap-2 border-b border-slate-200/70 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h3 class="text-sm font-semibold text-slate-900">{library.name}</h3>
								<p class="text-xs text-slate-500">
									Kapitel: {draftSummaryMap.get(library.id)?.chapterCount ?? 0} · Wörter: {draftSummaryMap.get(library.id)?.wordCount ?? 0}
								</p>
							</div>
							<div class="flex items-center gap-2 text-xs">
								<button
									type="button"
									class="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:border-slate-300"
									on:click={() => selectAllLibraryChapters(library.id)}
								>
									Alle
								</button>
								<button
									type="button"
									class="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:border-slate-300"
									on:click={() => clearLibraryChapterSelection(library.id)}
								>
									Keine
								</button>
							</div>
						</header>
						{#if library.chapters.length === 0}
							<p class="px-4 py-4 text-sm text-slate-500">Keine Kapitel verfügbar.</p>
						{:else}
							<div class="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto px-4 py-3 md:grid-cols-2">
								{#each library.chapters as chapter}
									<label class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300">
										<span class="font-medium">{chapter.label}</span>
										<span class="text-xs text-slate-500">{chapter.wordCount} Wörter</span>
										<input
											type="checkbox"
											class="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
											checked={(draftSelection[library.id] ?? []).includes(chapter.id)}
											on:change={() => toggleLibraryChapter(library.id, chapter.id)}
										/>
									</label>
								{/each}
							</div>
						{/if}
					</section>
				{/each}
			</div>

			<div class="mt-auto flex flex-col gap-2 border-t border-slate-200/70 pt-3 text-sm text-slate-600">
				<span>Aktiv: {draftActiveLibraries} Bibliothek(en) · {draftTotalChapters} Kapitel · {draftTotalWords} Wörter</span>
				<button type="submit" class="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60" disabled={libraryImporting}>
					{libraryImporting ? 'Wird übernommen …' : 'Auswahl anwenden'}
				</button>
			</div>
		</form>
	</div>
</div>
