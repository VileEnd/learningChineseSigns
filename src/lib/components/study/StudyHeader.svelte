<script lang="ts">
	import type { WordRecord } from '$lib/storage/db';

	export let headerExpanded: boolean;
	export let isMobileViewport: boolean;
	export let matchingModeActive: boolean;
	export let matchingLoading: boolean;
	export let matchingRecording: boolean;
	export let togglingMode: boolean;
	export let loading: boolean;
	export let primaryLibraryLabel: string;
	export let matchingTargetWordCount: number;
	export let matchingCardCount: number;
	export let collapsedLibrarySummary: string;
	export let libraryHeaderLabel: string;
	export let totalSelectedChapters: number;
	export let totalSelectedWords: number;
	export let searchOpen: boolean;
	export let searchLoading: boolean;
	export let searchQuery: string;
	export let searchResults: WordRecord[];
	export let klettChapterFromWordId: (id: string) => number | null;
	export let exporting: boolean;
	export let showLibraryPicker: boolean;

	export let toggleMatchingMode: () => void | Promise<void>;
	export let openLibraryPicker: () => void;
	export let openSettings: () => void;
	export let openImportHelp: () => void;
	export let handleExport: () => void | Promise<void>;
	export let handleImport: (event: Event) => void | Promise<void>;
	export let handleSearchSubmit: () => void | Promise<void>;
	export let handleSearchInput: (event: Event) => void;
	export let handleSearchFocus: () => void;
	export let handleSearchKeydown: (event: KeyboardEvent) => void;
	export let clearSearchField: () => void;
	export let selectSearchResult: (word: WordRecord) => void | Promise<void>;
	export let setHeaderExpanded: (value: boolean) => void;

	export let searchContainer: HTMLDivElement | null = null;

	const headerActionClass =
		'inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/70 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 md:gap-2 md:px-4 md:py-2 md:text-sm';
	const headerPrimaryActionClass =
		'inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-60 md:gap-2 md:px-4 md:py-2 md:text-sm';
	const matchingModeButtonBase =
		'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-60 md:px-4 md:py-2 md:text-sm';
	const matchingModeInactiveClass = 'bg-amber-400 text-slate-900 hover:bg-amber-300';
	const matchingModeActiveClass = 'bg-emerald-600 text-white hover:bg-emerald-500';
	const importActionLabel = 'Vokabeln oder Sicherungen importieren';
</script>

<nav class="flex flex-col gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200/70 backdrop-blur md:rounded-3xl md:p-5">
	{#if !headerExpanded}
		<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
			<div class="flex items-center gap-3">
				<button
					type="button"
					class={`${matchingModeButtonBase} ${matchingModeActive ? matchingModeActiveClass : matchingModeInactiveClass}`}
					on:click={() => void toggleMatchingMode()}
					aria-pressed={matchingModeActive}
					aria-label={matchingModeActive ? 'Zettelkasten starten' : 'Matching starten'}
					disabled={togglingMode || matchingLoading || matchingRecording || loading}
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h2a3 3 0 006 0h2a2 2 0 012 2v2h-1a2 2 0 100 4h1v2a2 2 0 01-2 2h-2a3 3 0 10-6 0H7a2 2 0 01-2-2v-2h1a2 2 0 100-4H5v-2a2 2 0 012-2z" />
					</svg>
					<span>{matchingModeActive ? 'Zettelkasten' : 'Matching'}</span>
				</button>
				<button
					type="button"
					class="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
					on:click={openLibraryPicker}
					aria-label="Bibliotheksauswahl öffnen"
				>
					Kap. {totalSelectedChapters} / W {totalSelectedWords}
				</button>
				<button
					type="button"
					class="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-700 ring-1 ring-slate-200 transition hover:bg-white md:h-9 md:w-9"
					on:click={openSettings}
					aria-label="Einstellungen öffnen"
				>
					<svg class="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</button>
			</div>
			<div class="flex items-center justify-between gap-2 md:justify-end">
				<span class="text-xs font-semibold text-slate-600 md:text-sm">{primaryLibraryLabel}</span>
				<button
					type="button"
					class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 md:h-9 md:w-9"
					on:click={() => setHeaderExpanded(true)}
					aria-label="Header erweitern"
				>
					<svg class="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
			</div>
		</div>
		{#if !isMobileViewport}
			<div class="flex items-center justify-between text-xs text-slate-500 md:text-sm">
				<span>Matching: {matchingTargetWordCount} Wörter · {matchingCardCount} Karten</span>
				{#if collapsedLibrarySummary}
					<span>{collapsedLibrarySummary}</span>
				{/if}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col gap-3">
			<div class="flex items-start justify-between gap-3 md:items-center">
				<div>
					<h1 class="text-2xl font-semibold text-slate-900 md:text-3xl">Chinesischer Zettelkasten</h1>
					<p class="text-sm text-slate-600">Deutsch - zu Pinyin & Schrift</p>
				</div>
				<button
					type="button"
					class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 md:h-9 md:w-9"
					on:click={() => setHeaderExpanded(false)}
					aria-label="Header minimieren"
				>
					<svg class="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
					</svg>
				</button>
			</div>

			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
				<div class="relative w-full md:w-72" bind:this={searchContainer}>
					<form class="relative" on:submit|preventDefault={() => void handleSearchSubmit()}>
						<input
							class="w-full rounded-full border border-slate-300 bg-white/90 px-3 py-2 pr-9 text-sm text-slate-800 shadow-inner focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 md:px-4 md:py-2 md:pr-10 md:text-sm"
							type="search"
							placeholder="Wort suchen"
							autocomplete="off"
							spellcheck={false}
							on:input={handleSearchInput}
							on:focus={handleSearchFocus}
							on:keydown={handleSearchKeydown}
							value={searchQuery}
						/>
						{#if searchQuery}
							<button
								type="button"
								class="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600 transition hover:bg-slate-300 md:right-2 md:h-6 md:w-6"
								on:click={clearSearchField}
							>
								✕
							</button>
						{/if}
					</form>
					{#if searchOpen}
						<div class="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
							{#if searchLoading}
								<p class="px-4 py-3 text-sm text-slate-500">Suche läuft …</p>
							{:else if searchResults.length === 0}
								<p class="px-4 py-3 text-sm text-slate-500">Keine Treffer für „{searchQuery.trim()}“.</p>
							{:else}
								<ul class="max-h-64 overflow-y-auto text-sm text-slate-700">
									{#each searchResults as word (word.id)}
										<li class="border-b border-slate-100 last:border-b-0">
											<button
												type="button"
												on:mousedown|preventDefault
												on:click={() => void selectSearchResult(word)}
												class="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
											>
												<span>
													<span class="block font-semibold text-slate-900">{word.prompt}</span>
													<span class="block text-xs text-slate-500">{word.pinyin}</span>
													{#if word.characters?.length}
														<span class="block text-xs text-slate-400">{word.characters.join('')}</span>
													{/if}
												</span>
												<span class="text-xs font-medium text-slate-500">
													{#if klettChapterFromWordId(word.id)}Kapitel {klettChapterFromWordId(word.id)}{/if}
												</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
				<div class="flex flex-wrap items-center justify-center gap-2 md:justify-end">
					<button
						type="button"
						class={`${matchingModeButtonBase} ${matchingModeActive ? matchingModeActiveClass : matchingModeInactiveClass}`}
						on:click={() => void toggleMatchingMode()}
						aria-pressed={matchingModeActive}
						aria-label={matchingModeActive ? 'Zettelkasten starten' : 'Matching starten'}
						disabled={togglingMode || matchingLoading || matchingRecording || loading}
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h2a3 3 0 006 0h2a2 2 0 012 2v2h-1a2 2 0 100 4h1v2a2 2 0 01-2 2h-2a3 3 0 10-6 0H7a2 2 0 01-2-2v-2h1a2 2 0 100-4H5v-2a2 2 0 012-2z" />
						</svg>
						<span>{matchingModeActive ? 'Zettelkasten starten' : 'Matching starten'}</span>
					</button>
					<button
						class={headerActionClass}
						type="button"
						on:click={openSettings}
						aria-label="Einstellungen öffnen"
					>
						<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						<span class="hidden md:inline">Einstellungen</span>
					</button>
					<button
						class={headerActionClass}
						type="button"
						on:click={openImportHelp}
						aria-label="Importhilfe anzeigen"
					>
						<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="hidden md:inline">Hilfe</span>
					</button>
					<label class={`${headerActionClass} cursor-pointer`} aria-label={importActionLabel}>
						<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
						</svg>
						<span class="hidden md:inline">Import</span>
						<input class="hidden" type="file" accept="application/json" on:change={handleImport} />
					</label>
					<button
						type="button"
						class={`${headerActionClass} justify-between`}
						on:click={openLibraryPicker}
						aria-expanded={showLibraryPicker}
						aria-label="Bibliotheksauswahl öffnen"
					>
						<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
						</svg>
						<span class="hidden md:inline">Bibliothek</span>
						<span class="flex items-center gap-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white md:px-2 md:text-xs">
							Kap. {totalSelectedChapters}
							<span class="hidden sm:inline">W {totalSelectedWords}</span>
						</span>
					</button>
					<button
						type="button"
						class={headerPrimaryActionClass}
						on:click={() => void handleExport()}
						disabled={exporting}
						aria-label={exporting ? 'Export läuft' : 'Daten exportieren'}
					>
						<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
						<span class="hidden md:inline">{exporting ? 'Export läuft …' : 'Export'}</span>
					</button>
				</div>
			</div>
			<div class="hidden text-xs font-medium text-slate-500 md:block">
				{libraryHeaderLabel}
			</div>
		</div>
	{/if}
</nav>
