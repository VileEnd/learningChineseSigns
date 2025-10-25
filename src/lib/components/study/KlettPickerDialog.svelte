<script lang="ts">
	type KlettChapterSummary = {
		chapter: number;
		wordCount: number;
	};

	export let dialogPaddingTop: string;
	export let dialogHeight: string;
	export let klettChapterSummaries: KlettChapterSummary[];
	export let selectedKlettChapters: number[];
	export let selectedKlettWordCount: number;
	export let selectedKlettChapterCount: number;
	export let allKlettChaptersSelected: boolean;
	export let klettImporting: boolean;
	export let selectAllKlettChapters: () => void;
	export let clearKlettChapterSelection: () => void;
	export let toggleKlettChapter: (chapter: number) => void;
	export let handleKlettImport: () => Promise<boolean>;
	export let close: () => void;
</script>

<div
	class="fixed inset-0 z-[80] isolate flex flex-col bg-white/80 backdrop-blur-sm md:items-center md:px-4"
	style={`padding-top: ${dialogPaddingTop};`}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	on:keydown={(event) => {
		if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			close();
		}
	}}
>
	<button
		type="button"
		class="absolute inset-0 z-0 h-full w-full cursor-pointer"
		aria-label="Klett-Auswahl schließen"
		on:click={close}
	></button>
	<div
		data-state="open"
		class="relative z-10 flex w-full flex-1 min-h-0 flex-col translate-y-6 overflow-hidden rounded-t-3xl bg-white p-6 opacity-0 shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ease-out data-[state=open]:translate-y-0 data-[state=open]:opacity-100 md:mt-0 md:max-w-2xl md:flex-none md:rounded-2xl md:p-8"
		style={`height: ${dialogHeight}; max-height: ${dialogHeight};`}
	>
		<header class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-semibold text-slate-900">Klett Kapitel wählen</h2>
			<button class="text-sm text-slate-500" type="button" on:click={close}>Schließen</button>
		</header>
		<form
			class="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden"
			on:submit|preventDefault={async () => {
				const imported = await handleKlettImport();
				if (imported) {
					close();
				}
			}}
		>
			<div class="flex items-center justify-between text-sm text-slate-600">
				<button type="button" class="rounded border border-slate-200 px-3 py-1" on:click={selectAllKlettChapters}>
					Alle auswählen
				</button>
				<button type="button" class="rounded border border-slate-200 px-3 py-1" on:click={clearKlettChapterSelection}>
					Zurücksetzen
				</button>
			</div>
			<div class="grid flex-1 min-h-0 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 pr-2">
				{#each klettChapterSummaries as item}
					<label class="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm cursor-pointer transition hover:bg-slate-50">
						<span>Kapitel {item.chapter}</span>
						<span class="text-xs text-slate-500">{item.wordCount} Wörter</span>
						<input
							type="checkbox"
							class="h-5 w-5"
							checked={selectedKlettChapters.includes(item.chapter)}
							on:change={() => toggleKlettChapter(item.chapter)}
						/>
					</label>
				{/each}
			</div>
			<p class="text-sm text-slate-600">
				Auswahl: {selectedKlettChapterCount} Kapitel · {selectedKlettWordCount} Wörter
				{#if allKlettChaptersSelected}
					<span class="ml-1 text-xs text-emerald-600">(alle Kapitel aktiv)</span>
				{/if}
			</p>
			<div class="flex justify-end gap-3">
				<button type="button" class="rounded-md border border-slate-300 px-4 py-2" on:click={close}>
					Abbrechen
				</button>
				<button type="submit" class="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60" disabled={klettImporting}>
					{klettImporting ? 'Import läuft …' : 'Kapitel übernehmen'}
				</button>
			</div>
		</form>
	</div>
</div>
