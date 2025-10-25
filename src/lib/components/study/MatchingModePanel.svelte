<script lang="ts">
	import MatchingDrill from '$lib/components/MatchingDrill.svelte';
	import type { MatchingRoundWord } from '$lib/types';
	import type { LibraryType } from '$lib/data/libraries';

	type LibrarySummary = {
		libraryId: LibraryType;
		name: string;
		chapterCount: number;
		wordCount: number;
		chapterLabels: string[];
	};

	export let matchingWords: MatchingRoundWord[];
	export let matchingRoundId: number;
	export let matchingLoading: boolean;
	export let matchingError: string;
	export let matchingComplete: boolean;
	export let matchingRecording: boolean;
	export let matchingFeedback: string;
	export let matchingTargetWordCount: number;
	export let matchingCardCount: number;
	export let lastMatchedWords: MatchingRoundWord[];
	export let librarySummaries: LibrarySummary[];
	export let loadMatchingRound: () => void | Promise<void>;
	export let completeMatchingRound: (wordIds: string[]) => void | Promise<void>;
</script>

<article class="grid gap-8 md:grid-cols-[2fr,1fr]">
	<section class="flex flex-col gap-6">
		<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			<h2 class="text-2xl font-bold text-slate-900">Dreier-Matching</h2>
			<p class="mt-2 text-sm text-slate-600">
				Finde zu jedem Wort das passende Deutsch, Pinyin und Schriftzeichen.
			</p>
		</div>
		<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
			{#if matchingLoading}
				<p class="text-sm text-slate-500">Matching-Runde wird geladen …</p>
			{:else if matchingError}
				<p class="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					{matchingError}
				</p>
				<div class="mt-4 flex gap-3">
					<button
						type="button"
						class="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
						on:click={() => loadMatchingRound()}
						disabled={matchingLoading}
					>
						Erneut versuchen
					</button>
				</div>
			{:else}
				<MatchingDrill
					words={matchingWords}
					roundId={matchingRoundId}
					disabled={matchingComplete || matchingRecording}
					on:complete={(event) => completeMatchingRound(event.detail.wordIds)}
				/>
				<div class="mt-4 flex flex-wrap gap-3">
					<button
						type="button"
						class="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
						on:click={() => loadMatchingRound()}
						disabled={matchingLoading || matchingRecording}
					>
						{matchingComplete ? 'Neue Runde starten' : 'Neu mischen'}
					</button>
				</div>
				{#if matchingFeedback}
					<p class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						{matchingFeedback}
					</p>
				{/if}
			{/if}
		</div>
	</section>

	<aside class="flex flex-col gap-4">
		<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Rundenstatus</h3>
			<ul class="mt-3 space-y-2 text-sm text-slate-700">
				<li>Aktive Wörter: {matchingWords.length} ({matchingWords.length * 3} Karten)</li>
				<li>Ziel pro Runde: {matchingTargetWordCount} Wörter ({matchingCardCount} Karten)</li>
				<li>Abgeschlossen: {matchingComplete ? 'Ja' : 'Nein'}</li>
			</ul>
		</section>
		<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Letzte Treffer</h3>
			{#if lastMatchedWords.length === 0}
				<p class="mt-2 text-sm text-slate-500">Noch keine abgeschlossene Runde.</p>
			{:else}
				<ul class="mt-2 space-y-2 text-sm text-slate-600">
					{#each lastMatchedWords as word}
						<li class="rounded-md border border-slate-100 px-3 py-2">
							<p class="font-semibold text-slate-900">{word.prompt}</p>
							<p class="text-sm text-slate-600">{word.pinyin}</p>
							<p class="text-lg text-slate-900">{word.characters.join('')}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Aktive Bibliotheken</h3>
			{#if librarySummaries.length === 0}
				<p class="mt-2 text-sm text-slate-500">Noch keine Auswahl getroffen.</p>
			{:else}
				<ul class="mt-2 space-y-2 text-sm text-slate-600">
					{#each librarySummaries as summary}
						<li class="rounded-md border border-slate-100 px-3 py-2">
							<p class="font-semibold text-slate-900">{summary.name}</p>
							<p class="text-xs text-slate-500">{summary.chapterCount} Kapitel · {summary.wordCount} Wörter</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</aside>
</article>
