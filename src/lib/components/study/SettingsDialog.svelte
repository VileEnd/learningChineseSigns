<script lang="ts">
	import type { LearningMode, Settings } from '$lib/types';

	export let settings: Settings;
	export let settingsPreferredMode: Exclude<LearningMode, 'matching-triplets'>;
	export let handleSettingsSave: (event: SubmitEvent) => void;
	export let close: () => void;
</script>

<div class="fixed inset-0 z-20 flex items-center justify-center bg-black/50">
	<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
		<header class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-slate-900">Einstellungen</h2>
			<button class="text-slate-500" type="button" on:click={close}>Schließen</button>
		</header>
		<form class="space-y-4" on:submit={handleSettingsSave}>
			<label class="flex items-center justify-between text-sm text-slate-700">
				<span>Töne streng prüfen</span>
				<input type="checkbox" name="tones" checked={settings.enforceTones} />
			</label>
			<label class="flex items-center justify-between text-sm text-slate-700">
				<span>Schriftzeichen immer anzeigen</span>
				<input type="checkbox" name="outline" checked={settings.showStrokeOrderHints} />
			</label>
			<label class="flex flex-col gap-2 text-sm text-slate-700">
				<span>Lernmodus</span>
				<select name="mode" class="rounded-md border border-slate-300 px-3 py-2" bind:value={settingsPreferredMode}>
					<option value="prompt-to-pinyin">Deutsch → Pinyin</option>
					<option value="prompt-to-character">Deutsch → Schriftzeichen</option>
					<option value="pinyin-to-character">Pinyin → Schriftzeichen</option>
				</select>
				<p class="text-xs text-slate-500">Matching-Modus über den Button in der Kopfzeile starten.</p>
			</label>
			<label class="flex flex-col gap-2 text-sm text-slate-700">
				<span>Matching-Karten pro Runde</span>
				<select
					name="matchingWordCount"
					class="rounded-md border border-slate-300 px-3 py-2"
					value={settings.matchingWordCount ?? 3}
				>
					<option value="3">9 Karten (3 Wörter)</option>
					<option value="4">12 Karten (4 Wörter)</option>
					<option value="5">15 Karten (5 Wörter)</option>
					<option value="6">18 Karten (6 Wörter)</option>
				</select>
				<p class="text-xs text-slate-500">Mehr Karten passen besonders gut auf größere Displays.</p>
			</label>
			<label class="flex flex-col gap-2 text-sm text-slate-700">
				<span>Schreib-Lenienz</span>
				<input type="number" step="0.1" min="0.2" max="2" name="leniency" value={settings.leniency} />
			</label>
			<div class="flex justify-end gap-3">
				<button type="button" class="rounded-md border border-slate-300 px-4 py-2" on:click={close}>
					Abbrechen
				</button>
				<button type="submit" class="rounded-md bg-slate-900 px-4 py-2 text-white">Speichern</button>
			</div>
		</form>
	</div>
</div>
