<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import HandwritingQuiz from '$lib/components/HandwritingQuiz.svelte';
	import { comparePinyin } from '$lib/utils/pinyin';
	import {
		initializeRepository,
		getNextLessonCandidate,
		recordLesson,
		exportSnapshot,
		importWordPack,
		importSnapshot,
		listRecentSummaries,
		getWordById,
		getProgressByWordId,
		saveSession,
		loadSession,
		getKlettChapterSummaries,
		getKlettTotalWordCount,
		importKlettChapters,
		suspendWord
	} from '$lib/storage/repository';
	import { loadSettings, saveSettings, settings } from '$lib/state/settings';
	import type { LessonStage, LessonSummary, SessionState, Settings, WordProgress, WritingMode } from '$lib/types';
	import type { WordRecord } from '$lib/storage/db';

	let loading = true;
	let errorMessage = '';
	let pinyinInput = '';
	let pinyinAttempts = 0;
	let message = '';
	let toneMessage = '';
	let currentWord: WordRecord | null = null;
	let currentProgress: WordProgress | null = null;
	let stage: LessonStage = 'pinyin';
	let pinyinSolved = false;
	let writingAttemptCounter = 0;
	let guidedRepetitions = 0;
	let totalWritingAttempts = 0;
	let attemptKey = 0;
	let sessionFinished = false;
	let summaryHistory: LessonSummary[] = [];
	let activeSettings: Settings | null = null;
	let showSettings = false;
	let exporting = false;
	let importFeedback = '';
	let writingMode: WritingMode = 'free';
	let characterIndex = 0;
	let quizComponent: InstanceType<typeof HandwritingQuiz> | null = null;
	let showImportHelp = false;
	const klettChapterSummaries = getKlettChapterSummaries();
	const klettTotalWords = getKlettTotalWordCount();
	let selectedKlettChapters: number[] = [];
	let klettImporting = false;
	let unloadingWord = false;
	$: allKlettChaptersSelected =
		klettChapterSummaries.length > 0 && selectedKlettChapters.length === klettChapterSummaries.length;
	$: selectedKlettWordCount = allKlettChaptersSelected
		? klettTotalWords
		: klettChapterSummaries
				.filter((item) => selectedKlettChapters.includes(item.chapter))
				.reduce((sum, item) => sum + item.wordCount, 0);
	const importExample = JSON.stringify(
		{
			version: 1,
			words: [
				{
					id: 'w-gan3xie4',
					prompt: 'Danke',
					promptLanguage: 'de',
					pinyin: 'gǎnxiè',
					characters: ['感', '谢'],
					alternatePinyin: ['gan3 xie4'],
					hints: { note: 'Alternative zu 谢谢.' }
				}
			]
		},
		null,
		2
	);

	function toggleKlettChapter(chapter: number) {
		selectedKlettChapters = selectedKlettChapters.includes(chapter)
			? selectedKlettChapters.filter((value) => value !== chapter)
			: [...selectedKlettChapters, chapter].sort((a, b) => a - b);
	}

	function selectAllKlettChapters() {
		selectedKlettChapters = klettChapterSummaries.map((item) => item.chapter);
	}

	function clearKlettChapterSelection() {
		selectedKlettChapters = [];
	}

	let unsubscribe: (() => void) | null = null;

	const currentLearningMode = (): Settings['learningMode'] => activeSettings?.learningMode ?? 'prompt-to-pinyin';

	onMount(async () => {
		await initializeRepository();
		const loaded = await loadSettings();
		activeSettings = loaded;
		subscribeToSettings();
		const restored = await hydrateSession();
		if (!restored) {
			await loadNextWord();
		}
		summaryHistory = await listRecentSummaries();
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
	});

	function subscribeToSettings() {
		if (unsubscribe) unsubscribe();
		unsubscribe = settings.subscribe((value) => {
			if (value) {
				activeSettings = value;
				void persistSession();
			}
		});
	}

	function serializeSession(): SessionState | null {
		if (!currentWord) {
			return null;
		}

		return {
			currentWordId: currentWord.id,
			stage,
			writingMode,
			pinyinSolved,
			pinyinAttempts,
			pinyinInput,
			message,
			toneMessage,
			writingAttemptCounter,
			guidedRepetitions,
			totalWritingAttempts,
			characterIndex,
			attemptKey,
			sessionFinished,
			updatedAt: Date.now()
		};
	}

	async function persistSession() {
		await saveSession(serializeSession());
	}

	async function hydrateSession(): Promise<boolean> {
		const snapshot = await loadSession();
		if (!snapshot) {
			return false;
		}

		const word = await getWordById(snapshot.currentWordId);
		if (!word) {
			await saveSession(null);
			return false;
		}

		const progress = await getProgressByWordId(word.id);
		if (!progress || progress.suspended) {
			await saveSession(null);
			return false;
		}

		currentWord = word;
		currentProgress = progress;
		stage = snapshot.stage;
		writingMode = snapshot.writingMode;
		pinyinSolved = snapshot.pinyinSolved;
		pinyinAttempts = snapshot.pinyinAttempts;
		pinyinInput = snapshot.pinyinInput;
		message = snapshot.message;
		toneMessage = snapshot.toneMessage;
		writingAttemptCounter = snapshot.writingAttemptCounter;
		guidedRepetitions = snapshot.guidedRepetitions;
		totalWritingAttempts = snapshot.totalWritingAttempts;
		characterIndex = snapshot.characterIndex;
		attemptKey = snapshot.attemptKey;
		sessionFinished = snapshot.sessionFinished;
		loading = false;
		return true;
	}

	async function loadNextWord() {
		loading = true;
		errorMessage = '';
		pinyinInput = '';
		pinyinAttempts = 0;
		pinyinSolved = false;
		writingAttemptCounter = 0;
		guidedRepetitions = 0;
		totalWritingAttempts = 0;
		attemptKey += 1;
		message = '';
		toneMessage = '';
		sessionFinished = false;
		writingMode = 'free';

		const candidate = await getNextLessonCandidate();
		if (!candidate) {
			errorMessage = 'Keine Lernkarten gefunden. Bitte importiere neue Wörter.';
			currentWord = null;
			loading = false;
			await persistSession();
			return;
		}

		currentWord = candidate.word;
		characterIndex = 0;
		currentProgress = candidate.progress;
		const mode = currentLearningMode();
		stage = mode === 'prompt-to-pinyin' ? 'pinyin' : 'writing';
		pinyinSolved = mode !== 'prompt-to-pinyin';
		if (stage === 'writing') {
			attemptKey += 1;
			message = mode === 'pinyin-to-character' ? 'Zeichne das Schriftzeichen zum angegebenen Pinyin.' : 'Zeichne das Schriftzeichen.';
		}
		loading = false;
		await persistSession();
	}

	async function handleHintRequest() {
		if (!quizComponent || sessionFinished) return;
		try {
			await quizComponent.revealOutline();
			message = 'Hinweis eingeblendet. Zeichne das Zeichen nach.';
			toneMessage = '';
			void persistSession();
		} catch (error) {
			console.error(error);
		}
	}

	function remainingAttempts(count: number): number {
		return Math.max(0, 3 - count);
	}

	async function handlePinyinSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!currentWord || !activeSettings || stage !== 'pinyin') return;

		const input = pinyinInput.trim();
		if (!input) {
			message = 'Bitte gib eine Pinyin-Antwort ein.';
			void persistSession();
			return;
		}

		const comparison = comparePinyin(input, currentWord, {
			enforceTone: activeSettings.enforceTones,
			allowNeutralToneMismatch: true
		});

		if (!comparison.lettersMatch) {
			pinyinAttempts += 1;
			message = `Nicht ganz richtig. Verbleibende Versuche: ${remainingAttempts(pinyinAttempts)}`;
			if (pinyinAttempts >= 3) {
				message = `Richtige Antwort: ${currentWord.pinyin}`;
				stage = 'writing';
				writingMode = 'free';
				attemptKey += 1;
			}
			toneMessage = '';
			void persistSession();
			return;
		}

		if (comparison.toneMismatch && activeSettings.enforceTones) {
			toneMessage = 'Die Buchstaben stimmen, aber der Ton ist falsch.';
			void persistSession();
			return;
		}

		toneMessage = comparison.toneMismatch ? 'Tonabweichung akzeptiert (Tonprüfung deaktiviert).' : '';
		pinyinSolved = true;
		message = 'Pinyin korrekt! Weiter geht es mit dem Schriftzeichen.';
		stage = 'writing';
		writingMode = 'free';
		attemptKey += 1;
		void persistSession();
	}

	function transitionToGuidedHalf() {
		stage = 'writing-guided-half';
		writingMode = 'guided-half';
		writingAttemptCounter = 0;
		attemptKey += 1;
		message = 'Wir zeigen dir die ersten Striche – probiere es erneut.';
		void persistSession();
	}

	function transitionToGuidedFull() {
		stage = 'writing-guided-full';
		writingMode = 'guided-full';
		guidedRepetitions = 0;
		attemptKey += 1;
		message = 'Hier ist das ganze Schriftzeichen. Zeichne es jetzt dreimal sauber nach.';
		void persistSession();
	}

	async function finishLesson(success: boolean, stageReached: LessonStage) {
		if (!currentWord) return;
		sessionFinished = true;
		stage = 'complete';
		message = success
			? 'Super gemacht! Dieses Wort wandert in „Bekannt“.'
			: 'Wir üben dieses Wort bald erneut.';
		const summary: LessonSummary = {
			wordId: currentWord.id,
			success,
			stageReached,
			pinyinAttempts,
			writingAttempts: totalWritingAttempts,
			timestamp: Date.now()
		};
		await recordLesson(summary);
		summaryHistory = [summary, ...summaryHistory].slice(0, 10);
		await saveSession(null);
	}

	function advanceCharacterOrFinish(successStage: LessonStage) {
		if (!currentWord) return;
		const hasNext = characterIndex < currentWord.characters.length - 1;
		if (hasNext) {
			characterIndex += 1;
			writingAttemptCounter = 0;
			guidedRepetitions = 0;
			writingMode = 'free';
			stage = 'writing';
			attemptKey += 1;
			message = `Weiter mit Zeichen ${characterIndex + 1} von ${currentWord.characters.length}.`;
			void persistSession();
			return;
		}
		void finishLesson(pinyinSolved, successStage);
		void persistSession();
	}

	async function handleQuizComplete(event: CustomEvent<{ mistakes: number }>) {
		if (!currentWord || sessionFinished) return;
		const mistakes = event.detail.mistakes;

		if (writingMode === 'free') {
			writingAttemptCounter += 1;
			totalWritingAttempts += 1;
			if (mistakes === 0) {
				advanceCharacterOrFinish('writing');
				return;
			}

			if (writingAttemptCounter >= 3) {
				transitionToGuidedHalf();
			} else {
				message = 'Bitte erneut versuchen. Achte auf die Reihenfolge der Striche.';
				attemptKey += 1;
			}
			void persistSession();
			return;
		}

		if (writingMode === 'guided-half') {
			writingAttemptCounter += 1;
			totalWritingAttempts += 1;
			if (mistakes === 0) {
				advanceCharacterOrFinish('writing-guided-half');
				return;
			}

			if (writingAttemptCounter >= 3) {
				transitionToGuidedFull();
			} else {
				message = 'Versuche es noch einmal mit der Teil-Vorlage.';
				attemptKey += 1;
			}
			void persistSession();
			return;
		}

		if (writingMode === 'guided-full') {
			if (mistakes <= 1) {
				guidedRepetitions += 1;
				totalWritingAttempts += 1;
				const remaining = Math.max(0, 3 - guidedRepetitions);
				message = remaining
					? `Gut! Noch ${remaining} Wiederholung${remaining === 1 ? '' : 'en'}.`
					: 'Perfekt!';
				if (guidedRepetitions >= 3) {
					advanceCharacterOrFinish('writing-guided-full');
					return;
				}
				attemptKey += 1;
			} else {
				message = 'Bitte langsam nachzeichnen, damit alle Striche erfasst werden.';
				totalWritingAttempts += 1;
				attemptKey += 1;
			}
			void persistSession();
		}
	}

	async function handleExport() {
		try {
			exporting = true;
			const snapshot = await exportSnapshot();
			const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `learning-chinese-signs-${new Date().toISOString()}.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			importFeedback = 'Export abgeschlossen.';
		} catch (error) {
			console.error(error);
			importFeedback = 'Export fehlgeschlagen.';
		} finally {
			exporting = false;
		}
	}

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		try {
			const text = await file.text();
			const payload = JSON.parse(text);

			if ('version' in payload && 'words' in payload) {
				const result = await importWordPack(payload);
				importFeedback = `${result.inserted} neue Wörter importiert.`;
			} else {
				await importSnapshot(payload);
				importFeedback = 'Benutzerdaten erfolgreich importiert.';
			}

			await loadNextWord();
			void persistSession();
		} catch (error) {
			console.error(error);
			importFeedback = 'Import fehlgeschlagen. Bitte Datei prüfen.';
		}
		input.value = '';
	}

	async function handleSettingsSave(event: SubmitEvent) {
		event.preventDefault();
		if (!activeSettings) return;
		const form = event.target as HTMLFormElement;
		const formData = new FormData(form);
		const enforceTones = formData.get('tones') === 'on';
		const showOutline = formData.get('outline') === 'on';
		const mode = formData.get('mode') as Settings['learningMode'];
		const leniency = Number(formData.get('leniency'));

		const next: Settings = {
			...activeSettings,
			enforceTones,
			showStrokeOrderHints: showOutline,
			learningMode: mode,
			leniency: Number.isFinite(leniency) ? leniency : activeSettings.leniency
		};

		await saveSettings(next);
		showSettings = false;
		void persistSession();
	}

	async function handleKlettImport() {
		if (klettImporting) return;
		if (selectedKlettChapters.length === 0) {
			importFeedback = 'Bitte wähle mindestens ein Kapitel aus.';
			return;
		}
		klettImporting = true;
		try {
			const selection = allKlettChaptersSelected ? 'all' : selectedKlettChapters;
			const result = await importKlettChapters(selection);
			importFeedback = result.inserted
				? `Klett-Wörter importiert: ${result.inserted}.`
				: 'Keine neuen Klett-Wörter importiert – vermutlich schon vorhanden.';
			if (!currentWord) {
				await loadNextWord();
			}
		} catch (error) {
			console.error(error);
			importFeedback = 'Klett-Import fehlgeschlagen.';
		} finally {
			klettImporting = false;
		}
	}

	function resetSession() {
		loadNextWord();
	}

	async function unloadCurrentWord() {
		if (!currentWord || unloadingWord) return;
		unloadingWord = true;
		const removedPrompt = currentWord.prompt;
		try {
			await suspendWord(currentWord.id);
			await saveSession(null);
			await loadNextWord();
			importFeedback = `"${removedPrompt}" wird aktuell nicht mehr abgefragt. Fortschritt bleibt gespeichert.`;
		} catch (error) {
			console.error(error);
			importFeedback = 'Karte konnte nicht entfernt werden.';
		} finally {
			unloadingWord = false;
		}
	}
	const displayedPrompt = () => {
		if (!currentWord) return '';
		switch (currentLearningMode()) {
			case 'pinyin-to-character':
				return currentWord.pinyin;
			default:
				return currentWord.prompt;
		}
	};

	function giveUp() {
		if (!currentWord || sessionFinished) return;
		void finishLesson(false, stage);
		void persistSession();
	}
</script>

<section class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
	<header class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-semibold text-slate-900">Chinesisch Wiederholungstrainer</h1>
			<p class="text-sm text-slate-600">Übe Pinyin und Schriftzeichen im eigenen Tempo.</p>
		</div>
		<div class="flex items-center gap-3">
			<button class="rounded-md border border-slate-300 px-4 py-2 text-sm" on:click={() => (showSettings = true)}>
				Einstellungen
			</button>
			<button class="rounded-md border border-slate-300 px-4 py-2 text-sm" type="button" on:click={() => (showImportHelp = true)}>
				Hilfe
			</button>
			<label class="flex cursor-pointer flex-col items-center gap-1 text-xs text-slate-600">
				<span class="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm">Import</span>
				<input class="hidden" type="file" accept="application/json" on:change={handleImport} />
			</label>
			<form class="flex items-center gap-2" on:submit|preventDefault={handleKlettImport}>
				<div class="flex flex-col gap-2 text-left text-xs text-slate-600">
					<span class="text-sm font-medium text-slate-700">Klett Kapitel wählen</span>
					<div class="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
						<button
							type="button"
							class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
							on:click={selectAllKlettChapters}
						>
							Alle Kapitel auswählen
						</button>

						<button
							type="button"
							class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
							on:click={clearKlettChapterSelection}
						>
							Auswahl löschen
						</button>

						{#each klettChapterSummaries as item}
							<label class="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
								<input
									type="checkbox"
									checked={selectedKlettChapters.includes(item.chapter)}
									on:change={() => toggleKlettChapter(item.chapter)}
								/>
								<span>Kapitel {item.chapter} ({item.wordCount} Wörter)</span>
							</label>
						{/each}
					</div>
					<span class="text-xs text-slate-500">Ausgewählt: {selectedKlettWordCount} Wörter</span>
				</div>
				<button
					type="submit"
					class="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
					disabled={klettImporting || selectedKlettChapters.length === 0}
				>
					{klettImporting ? 'Importiert …' : 'Klett hinzufügen'}
				</button>
			</form>
			<button
				type="button"
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
				on:click={handleExport}
				disabled={exporting}
			>
				{exporting ? 'Export läuft …' : 'Export'}
			</button>
		</div>
	</header>

	{#if loading}
		<p class="text-center text-slate-600">Lade nächste Karte …</p>
	{:else if !currentWord}
		<p class="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-slate-700">{errorMessage}</p>
	{:else}
		<article class="grid gap-8 md:grid-cols-[2fr,1fr]">
			<section class="flex flex-col gap-6">
				<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
					<p class="text-4xl font-bold text-slate-900">{displayedPrompt()}</p>
				</div>

				{#if stage === 'pinyin'}
					<form class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" on:submit={handlePinyinSubmit}>
						<label class="flex flex-col gap-2 text-sm font-medium text-slate-700">
							Pinyin eingeben
							<input
								class="w-full rounded-md border border-slate-300 px-4 py-2 text-base"
								bind:value={pinyinInput}
								placeholder="z. B. nǐ hǎo"
								autocomplete="off"
								spellcheck={false}
						/>
						</label>
						<div class="mt-4 flex justify-between text-sm text-slate-500">
							<span>Versuche übrig: {remainingAttempts(pinyinAttempts)}</span>
							<button class="rounded-md bg-slate-900 px-3 py-2 text-white" type="submit">Prüfen</button>
						</div>
					</form>
				{:else}
					<div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
						<h3 class="mb-4 text-lg font-semibold text-slate-900">Schriftzeichen zeichnen</h3>
						<HandwritingQuiz
							{attemptKey}
							mode={writingMode}
							character={currentWord.characters[characterIndex]}
							leniency={activeSettings?.leniency ?? 1}
							disabled={sessionFinished}
							alwaysShowOutline={activeSettings?.showStrokeOrderHints ?? false}
							bind:this={quizComponent}
							on:complete={handleQuizComplete}
						/>
						<div class="mt-4 flex flex-wrap justify-center gap-2">
							<button
								type="button"
								class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 disabled:opacity-60"
								on:click={handleHintRequest}
								disabled={sessionFinished}
							>
								Hinweis
							</button>
						</div>
						{#if stage === 'writing-guided-full'}
							<p class="mt-3 text-center text-sm text-slate-600">Wiederholungen erledigt: {guidedRepetitions}/3</p>
						{/if}
					</div>
				{/if}

				<div class="space-y-2">
					{#if message}
						<p class="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">{message}</p>
					{/if}
					{#if toneMessage}
						<p class="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{toneMessage}</p>
					{/if}
					{#if importFeedback}
						<p class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{importFeedback}</p>
					{/if}
				</div>

				<div class="flex gap-3">
					{#if sessionFinished}
						<button class="rounded-md bg-slate-900 px-4 py-2 text-white" on:click={resetSession}>
							Nächstes Wort
						</button>
					{:else}
						<button class="rounded-md border border-slate-300 px-4 py-2 text-slate-600" type="button" on:click={giveUp}>
							Aufgeben
						</button>
						<button
							type="button"
							class="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-60"
							on:click={unloadCurrentWord}
							disabled={unloadingWord}
						>
							Karte vorerst aussetzen
						</button>
					{/if}
				</div>
			</section>

			<aside class="flex flex-col gap-4">
				<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Fortschritt</h3>
					<ul class="mt-3 space-y-2 text-sm text-slate-700">
						<li>Pinyin Versuche: {pinyinAttempts}</li>
						<li>Zeichen-Fortschritt: {characterIndex + 1}/{currentWord.characters.length}</li>
						<li>Schreibversuche: {totalWritingAttempts}</li>
						{#if currentProgress}
							<li>Aktueller Status: {currentProgress.bucket}</li>
						{/if}
					</ul>
				</section>
				<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Letzte Durchgänge</h3>
					{#if summaryHistory.length === 0}
						<p class="mt-2 text-sm text-slate-500">Noch keine Einträge.</p>
					{:else}
						<ul class="mt-2 space-y-2 text-sm text-slate-600">
							{#each summaryHistory as item}
								<li class="rounded-md border border-slate-100 px-3 py-2">
									<span class="font-medium">{item.wordId}</span>
									<span class="ml-2">{item.success ? '✔️' : '⏳'}</span>
									<span class="ml-2 text-xs text-slate-500">{new Date(item.timestamp).toLocaleString()}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</aside>
		</article>
	{/if}

	{#if showSettings && activeSettings}
		<div class="fixed inset-0 z-20 flex items-center justify-center bg-black/50">
			<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
				<header class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-slate-900">Einstellungen</h2>
					<button class="text-slate-500" on:click={() => (showSettings = false)}>Schließen</button>
				</header>
				<form class="space-y-4" on:submit={handleSettingsSave}>
					<label class="flex items-center justify-between text-sm text-slate-700">
						<span>Töne streng prüfen</span>
						<input type="checkbox" name="tones" checked={activeSettings.enforceTones} />
					</label>
					<label class="flex items-center justify-between text-sm text-slate-700">
						<span>Schriftzeichen immer anzeigen</span>
						<input type="checkbox" name="outline" checked={activeSettings.showStrokeOrderHints} />
					</label>
					<label class="flex flex-col gap-2 text-sm text-slate-700">
						<span>Lernmodus</span>
						<select
							name="mode"
							class="rounded-md border border-slate-300 px-3 py-2"
							bind:value={activeSettings.learningMode}
						>
							<option value="prompt-to-pinyin">Deutsch → Pinyin</option>
							<option value="prompt-to-character">Deutsch → Schriftzeichen</option>
							<option value="pinyin-to-character">Pinyin → Schriftzeichen</option>
						</select>
					</label>
					<label class="flex flex-col gap-2 text-sm text-slate-700">
						<span>Schreib-Lenienz</span>
						<input
							type="number"
							step="0.1"
							min="0.2"
							max="2"
							name="leniency"
							value={activeSettings.leniency}
						/>
					</label>
					<div class="flex justify-end gap-3">
						<button type="button" class="rounded-md border border-slate-300 px-4 py-2" on:click={() => (showSettings = false)}>
							Abbrechen
						</button>
						<button type="submit" class="rounded-md bg-slate-900 px-4 py-2 text-white">Speichern</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if showImportHelp}
		<div class="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
			<div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
				<header class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-slate-900">Import-Hilfe</h2>
					<button class="text-slate-500" on:click={() => (showImportHelp = false)}>Schließen</button>
				</header>
				<div class="space-y-3 text-sm text-slate-700">
					<p>Mit dem Import-Button kannst du neue Vokabelpakete oder Sicherungen im JSON-Format laden.</p>
					<ol class="list-decimal space-y-1 pl-4">
						<li>Exportiere vorhandene Daten als Vorlage über den Button „Export“.</li>
						<li>Erstelle eine JSON-Datei im folgenden Format oder passe die exportierte Datei an.</li>
						<li>Wähle die Datei über „Import“ aus, um Wörter oder Fortschritt zu übernehmen.</li>
					</ol>
					<pre class="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-xs"><code>{importExample}</code></pre>
				</div>
			</div>
		</div>
	{/if}
</section>
