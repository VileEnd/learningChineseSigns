<script lang="ts">
	import type { LessonHistoryEntry } from '$lib/types';
	import { onMount } from 'svelte';

	export let entries: LessonHistoryEntry[] = [];

	const bucketLabels: Record<LessonHistoryEntry['bucket'], string> = {
		learning: 'Lernphase',
		reinforce: 'Festigen',
		known: 'Langzeit'
	};

	const stageLabels: Record<LessonHistoryEntry['stageReached'], string> = {
		pinyin: 'Pinyin',
		writing: 'Schriftzeichen',
		'writing-guided-half': 'Geführte Hälfte',
		'writing-guided-full': 'Geführte Ganzschrift',
		complete: 'Abgeschlossen'
	};

	const DAY_MS = 86_400_000;

	function stateLabel(entry: LessonHistoryEntry): string {
		return entry.success ? 'Erfolg' : 'Wiederholen';
	}

	function qualityLabel(entry: LessonHistoryEntry): string {
		const quality = Math.round(entry.sm2LastQuality ?? 0);
		return `Qualität ${quality}`;
	}

	function bucketLabel(entry: LessonHistoryEntry): string {
		return bucketLabels[entry.bucket] ?? entry.bucket;
	}

	function stageLabel(entry: LessonHistoryEntry): string {
		return stageLabels[entry.stageReached] ?? entry.stageReached;
	}

	function nextDueLabel(entry: LessonHistoryEntry): string {
		const diff = entry.nextDueAt - Date.now();
		if (!Number.isFinite(diff) || diff <= 0) {
			return 'fällig';
		}
		const days = Math.ceil(diff / DAY_MS);
		return days <= 1 ? 'in 1 Tag' : `in ${days} Tagen`;
	}
</script>

{#if entries.length === 0}
	<p class="mt-2 text-sm text-slate-500">Noch keine Einträge.</p>
{:else}
	<ul class="mt-2 space-y-3 text-sm text-slate-600">
		{#each entries as entry (entry.timestamp + entry.wordId)}
			<li class="rounded-lg border border-slate-100 px-3 py-3">
				<div class="flex flex-col gap-2">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-sm font-semibold text-slate-900">{entry.prompt}</p>
							{#if entry.pinyin}
								<p class="text-xs text-slate-600">{entry.pinyin}</p>
							{/if}
							{#if entry.characters.length}
								<p class="text-lg text-slate-900">{entry.characters.join('')}</p>
							{/if}
						</div>
						<div class="flex flex-col items-end gap-1 text-xs text-slate-500">
							<span class={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${entry.success ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
								{stateLabel(entry)}
							</span>
							<span>{qualityLabel(entry)}</span>
							<span>Phase: {bucketLabel(entry)}</span>
							<span>Stufe: {stageLabel(entry)}</span>
							<span>Nächste Wiederholung: {nextDueLabel(entry)}</span>
						</div>
					</div>
					<div class="flex flex-wrap justify-between text-[0.7rem] text-slate-400">
						<span>{new Date(entry.timestamp).toLocaleString()}</span>
						<span>Intervall: {entry.sm2Interval} Tag{entry.sm2Interval === 1 ? '' : 'e'}</span>
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
