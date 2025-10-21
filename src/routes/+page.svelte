<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
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
		suspendKlettChapters,
		resumeWord,
		searchWordsByPrompt,
		suspendWord,
		getAvailableLibraries,
		getLibraryChapters,
		importLibraryChapters,
		suspendLibraryChapters
	} from '$lib/storage/repository';
	import { loadSettings, saveSettings, settings } from '$lib/state/settings';
	import type { LessonStage, LessonSummary, SessionState, Settings, WordProgress, WritingMode } from '$lib/types';
	import type { WordRecord } from '$lib/storage/db';
	import type { LibraryType } from '$lib/data/libraries';

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
	
	// Library management
	const availableLibraries = getAvailableLibraries();
	let selectedLibrary: LibraryType = 'klett';
	let selectedChapterIds: string[] = [];
	let libraryImporting = false;
	let showLibraryPicker = false;
	
	// Legacy Klett support (for backwards compatibility)
	const klettChapterSummaries = getKlettChapterSummaries();
	const klettTotalWords = getKlettTotalWordCount();
	let selectedKlettChapters: number[] = [];
	let klettImporting = false;
	let unloadingWord = false;
	let showKlettPicker = false;
	
	let searchQuery = '';
	let searchResults: WordRecord[] = [];
	let searchLoading = false;
	let searchOpen = false;
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;
	let searchRequestId = 0;
	let searchContainer: HTMLDivElement | null = null;
	let headerElement: HTMLElement | null = null;
	let headerHeight = 0;
	let removeResizeListener: (() => void) | null = null;
	let isMobileViewport = false;
	let headerExpanded = true; // New: Track header expanded state
	
	// Reactive statements for library selection
	$: currentLibraryChapters = getLibraryChapters(selectedLibrary);
	$: allChaptersSelected = currentLibraryChapters.length > 0 && selectedChapterIds.length === currentLibraryChapters.length;
	$: selectedWordCount = selectedChapterIds.length === 0 
		? 0 
		: currentLibraryChapters
			.filter((chapter) => selectedChapterIds.includes(chapter.id))
			.reduce((sum, chapter) => sum + chapter.wordCount, 0);
	$: selectedLibraryInfo = availableLibraries.find((lib) => lib.id === selectedLibrary);
	
	// Legacy Klett reactive statements
	$: allKlettChaptersSelected =
		klettChapterSummaries.length > 0 && selectedKlettChapters.length === klettChapterSummaries.length;
	$: selectedKlettWordCount = allKlettChaptersSelected
		? klettTotalWords
		: klettChapterSummaries
				.filter((item) => selectedKlettChapters.includes(item.chapter))
				.reduce((sum, item) => sum + item.wordCount, 0);
	$: selectedKlettChapterCount = selectedKlettChapters.length;
	const headerActionClass =
		'inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/70 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 md:gap-2 md:px-4 md:py-2 md:text-sm';
	const headerPrimaryActionClass =
		'inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-60 md:gap-2 md:px-4 md:py-2 md:text-sm';
	const importExample = `Format 1 - Einfache Wortliste:
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

Format 2 - Mit Kapiteln (wie Klett):
{
  "version": 1,
  "chapters": [
    {
      "chapter": 1,
      "words": [
        {
          "id": "w-ni3hao3",
          "prompt": "Hallo",
          "promptLanguage": "de",
          "pinyin": "nǐhǎo",
          "characters": ["你", "好"],
          "alternatePinyin": ["ni3hao3"]
        }
      ]
    }
  ]
}`;

	// Library management functions
	function toggleChapter(chapterId: string) {
		selectedChapterIds = selectedChapterIds.includes(chapterId)
			? selectedChapterIds.filter((id) => id !== chapterId)
			: [...selectedChapterIds, chapterId];
	}

	function selectAllChapters() {
		selectedChapterIds = currentLibraryChapters.map((chapter) => chapter.id);
	}

	function clearChapterSelection() {
		selectedChapterIds = [];
	}

	function handleLibraryChange() {
		// Reset chapter selection when library changes
		selectedChapterIds = [];
	}

	// Legacy Klett functions (for backwards compatibility)
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

	function closeSearchResults() {
		searchOpen = false;
	}

	function clearSearchField() {
		if (searchDebounce) {
			clearTimeout(searchDebounce);
			searchDebounce = null;
		}
		searchRequestId += 1;
		searchQuery = '';
		searchResults = [];
		searchLoading = false;
		closeSearchResults();
	}

	function updateHeaderHeight() {
		if (!browser) {
			return;
		}
		const nextHeight = headerElement?.getBoundingClientRect().height ?? 0;
		if (Math.abs(nextHeight - headerHeight) > 0.5) {
			headerHeight = nextHeight;
		}
		isMobileViewport = window.innerWidth < 768;
	}

	$: headerOffset = headerHeight > 0 ? headerHeight : 96;
	$: dialogTopGap = isMobileViewport
		? Math.max(16, Math.min(headerOffset, 80))
		: headerOffset;
	$: dialogPaddingTop = `${dialogTopGap}px`;
	$: dialogMinHeight = isMobileViewport ? `calc(100vh - ${dialogTopGap}px)` : 'auto';
	$: if (browser && showLibraryPicker) {
		updateHeaderHeight();
	}

	$: if (browser && showKlettPicker) {
		updateHeaderHeight();
	}

	function handleSearchFocus() {
		if (searchResults.length > 0 || searchQuery.trim().length > 0) {
			searchOpen = true;
		}
	}

	async function performSearch(term: string, requestId: number) {
		try {
			const matches = await searchWordsByPrompt(term);
			if (requestId !== searchRequestId) {
				return;
			}
			searchResults = matches;
			searchOpen = true;
		} finally {
			if (requestId === searchRequestId) {
				searchLoading = false;
				searchDebounce = null;
			}
		}
	}

	function handleSearchInput(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		searchQuery = value;
		if (searchDebounce) {
			clearTimeout(searchDebounce);
			searchDebounce = null;
		}
		const trimmed = value.trim();
		if (!trimmed) {
			searchResults = [];
			searchLoading = false;
			closeSearchResults();
			return;
		}
		searchLoading = true;
		searchOpen = true;
		const requestId = ++searchRequestId;
		searchDebounce = setTimeout(() => {
			void performSearch(trimmed, requestId);
		}, 200);
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			clearSearchField();
		}
	}

	async function handleSearchSubmit() {
		if (searchLoading || searchResults.length === 0) {
			return;
		}
		await selectSearchResult(searchResults[0]);
	}

	async function selectSearchResult(word: WordRecord) {
		await loadSpecificWord(word.id);
		clearSearchField();
	}

	function handleGlobalSearchClick(event: MouseEvent) {
		if (!searchContainer) {
			return;
		}
		if (searchContainer.contains(event.target as Node)) {
			return;
		}
		clearSearchField();
	}

	function klettChapterFromWordId(wordId: string): number | null {
		const match = /-c(\d+)-\d+$/.exec(wordId);
		return match ? Number(match[1]) : null;
	}

	let unsubscribe: (() => void) | null = null;

	const currentLearningMode = (): Settings['learningMode'] => activeSettings?.learningMode ?? 'prompt-to-pinyin';

	onMount(async () => {
		if (!browser) {
			return;
		}
		await initializeRepository();
		const loaded = await loadSettings();
		activeSettings = loaded;
		subscribeToSettings();
		const restored = await hydrateSession();
		if (!restored) {
			await loadNextWord();
		}
		summaryHistory = await listRecentSummaries();
		document.addEventListener('click', handleGlobalSearchClick, true);
		updateHeaderHeight();
		const handleResize = () => updateHeaderHeight();
		window.addEventListener('resize', handleResize);
		removeResizeListener = () => window.removeEventListener('resize', handleResize);
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
		if (searchDebounce) {
			clearTimeout(searchDebounce);
		}
		if (browser) {
			if (removeResizeListener) {
				removeResizeListener();
				removeResizeListener = null;
			}
			document.removeEventListener('click', handleGlobalSearchClick, true);
		}
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

	function resetBeforeLoadingWord() {
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
	}

	async function applyActiveWord(word: WordRecord, progress: WordProgress | null) {
		if (!progress) {
			throw new Error('Es existiert kein Lernfortschritt für dieses Wort.');
		}
		currentWord = word;
		currentProgress = progress;
		characterIndex = 0;
		const mode = currentLearningMode();
		stage = mode === 'prompt-to-pinyin' ? 'pinyin' : 'writing';
		pinyinSolved = mode !== 'prompt-to-pinyin';
		if (stage === 'writing') {
			writingMode = 'free';
			attemptKey += 1;
			message =
				mode === 'pinyin-to-character'
					? 'Zeichne das Schriftzeichen zum angegebenen Pinyin.'
					: 'Zeichne das Schriftzeichen.';
		}
		loading = false;
		await persistSession();
	}

	async function loadSpecificWord(wordId: string) {
		resetBeforeLoadingWord();
		const word = await getWordById(wordId);
		if (!word) {
			errorMessage = 'Wort konnte nicht geladen werden.';
			currentWord = null;
			currentProgress = null;
			loading = false;
			await persistSession();
			return;
		}
		let progress = await getProgressByWordId(wordId);
		if (!progress) {
			progress = {
				wordId: word.id,
				bucket: 'learning',
				streak: 0,
				lastReviewedAt: 0,
				nextDueAt: 0,
				pinyinAttempts: 0,
				writingAttempts: 0,
				lastResult: 'failure',
				reviewCount: 0,
				suspended: false
			};
		} else if (progress.suspended) {
			await resumeWord(word.id);
			progress = { ...progress, suspended: false };
		}
		await applyActiveWord(word, progress);
		importFeedback = `Trainiere jetzt: ${word.prompt}`;
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
		resetBeforeLoadingWord();
		const candidate = await getNextLessonCandidate();
		if (!candidate) {
			errorMessage = 'Keine Lernkarten gefunden. Bitte importiere neue Wörter.';
			currentWord = null;
			currentProgress = null;
			loading = false;
			await persistSession();
			return;
		}

		await applyActiveWord(candidate.word, candidate.progress);
		
		// Auto-collapse header on mobile when new word loads
		if (isMobileViewport && !sessionFinished) {
			headerExpanded = false;
		}
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

		// Auto-collapse header on mobile when user starts interacting
		if (isMobileViewport && headerExpanded) {
			headerExpanded = false;
		}

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
		
		// Auto-collapse header on mobile when user starts writing
		if (isMobileViewport && headerExpanded) {
			headerExpanded = false;
		}
		
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

			if ('version' in payload && ('words' in payload || 'chapters' in payload)) {
				const result = await importWordPack(payload);
				const format = 'chapters' in payload ? ' (Kapitel-Format)' : '';
				importFeedback = `${result.inserted} neue Wörter importiert${format}.`;
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

	async function handleLibraryImport(): Promise<boolean> {
		if (libraryImporting) return false;
		libraryImporting = true;
		try {
			if (selectedChapterIds.length === 0) {
				// Suspend all chapters from the selected library
				const allChapterIds = currentLibraryChapters.map((ch) => ch.id);
				const paused = await suspendLibraryChapters(selectedLibrary, allChapterIds);
				importFeedback = paused
					? `Alle ${selectedLibraryInfo?.name || 'Bibliothek'}-Wörter wurden pausiert (${paused}).`
					: `Keine aktiven ${selectedLibraryInfo?.name || 'Bibliothek'}-Wörter zum Pausieren gefunden.`;
				await loadNextWord();
				return true;
			}

			// Import selected chapters
			const result = await importLibraryChapters(selectedLibrary, selectedChapterIds);
			
			// Suspend chapters not selected
			const unselectedChapterIds = currentLibraryChapters
				.map((ch) => ch.id)
				.filter((id) => !selectedChapterIds.includes(id));
			
			const paused = unselectedChapterIds.length > 0 
				? await suspendLibraryChapters(selectedLibrary, unselectedChapterIds) 
				: 0;

			const feedbackParts = [
				result.inserted
					? `${selectedLibraryInfo?.name || 'Bibliothek'}-Wörter importiert: ${result.inserted}.`
					: 'Keine neuen Wörter importiert – vermutlich schon vorhanden.',
				paused ? `Pausiert: ${paused} Wörter außerhalb der Auswahl.` : ''
			].filter(Boolean);
			importFeedback = feedbackParts.join(' ');

			await loadNextWord();
			return true;
		} catch (error) {
			console.error(error);
			importFeedback = 'Import fehlgeschlagen.';
			return false;
		} finally {
			libraryImporting = false;
		}
	}

	async function handleKlettImport(): Promise<boolean> {
		if (klettImporting) return false;
		klettImporting = true;
		try {
			if (selectedKlettChapters.length === 0) {
				const paused = await suspendKlettChapters('all');
				importFeedback = paused
					? `Alle Klett-Wörter wurden pausiert (${paused}).`
					: 'Keine aktiven Klett-Wörter zum Pausieren gefunden.';
				if (currentWord && klettChapterFromWordId(currentWord.id) !== null) {
					await loadNextWord();
				}
				return true;
			}

			const selection = allKlettChaptersSelected ? 'all' : selectedKlettChapters;
			const result = await importKlettChapters(selection);
			const excludedChapters = allKlettChaptersSelected
				? []
				: klettChapterSummaries
						.map((item) => item.chapter)
						.filter((chapter) => !selectedKlettChapters.includes(chapter));
			const paused = excludedChapters.length > 0 ? await suspendKlettChapters(excludedChapters) : 0;
			const feedbackParts = [
				result.inserted
					? `Klett-Wörter importiert: ${result.inserted}.`
					: 'Keine neuen Klett-Wörter importiert – vermutlich schon vorhanden.',
				paused ? `Pausiert: ${paused} Wörter außerhalb der Auswahl.` : ''
			].filter(Boolean);
			importFeedback = feedbackParts.join(' ');

			if (!currentWord) {
				await loadNextWord();
			} else {
				const currentChapter = klettChapterFromWordId(currentWord.id);
				if (currentChapter !== null && (excludedChapters.length === 0 ? false : excludedChapters.includes(currentChapter))) {
					await loadNextWord();
				}
			}
			return true;
		} catch (error) {
			console.error(error);
			importFeedback = 'Klett-Import fehlgeschlagen.';
			return false;
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

<section class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-2 pb-10 md:py-10">
	<header class="sticky top-0 z-20 md:top-4" bind:this={headerElement}>
		<nav class="flex flex-col gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200/70 backdrop-blur md:rounded-3xl md:p-5">
			<!-- Mobile Compact Header -->
			{#if isMobileViewport && !headerExpanded}
				<div class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
							on:click={() => (headerExpanded = true)}
							aria-label="Header erweitern"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						<div>
							<h1 class="text-base font-semibold text-slate-900">Zettelkasten</h1>
							<p class="text-xs text-slate-500">{selectedLibraryInfo?.name || 'Bibliothek'}</p>
						</div>
					</div>
					<button
						type="button"
						class="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
						on:click={() => (showLibraryPicker = true)}
					>
						{selectedChapterIds.length}× / {selectedWordCount}
					</button>
				</div>
			{:else}
				<!-- Full Header (Desktop or Expanded Mobile) -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between">
						<div>
							<h1 class="text-2xl font-semibold text-slate-900 md:text-3xl">Chinesischer Zettelkasten</h1>
							<p class="text-sm text-slate-600">Deutsch - zu Pinyin & Schrift</p>
						</div>
						{#if isMobileViewport}
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
								on:click={() => (headerExpanded = false)}
								aria-label="Header minimieren"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
								</svg>
							</button>
						{/if}
					</div>
					
					<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
						<div class="relative w-full md:w-72" bind:this={searchContainer}>
							<form class="relative" on:submit|preventDefault={handleSearchSubmit}>
								<input
									class="w-full rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 pr-8 text-xs text-slate-800 shadow-inner focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 md:px-4 md:py-2 md:pr-10 md:text-sm"
									type="search"
									placeholder="Wort suchen"
									autocomplete="off"
									spellcheck={false}
									on:input={handleSearchInput}
									on:focus={handleSearchFocus}
									on:keydown={handleSearchKeydown}
									bind:value={searchQuery}
								/>
								{#if searchQuery}
									<button
										type="button"
										class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600 transition hover:bg-slate-300 md:right-2 md:h-6 md:w-6"
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
						<div class="flex flex-wrap items-center gap-2 md:justify-end">
							<button class={headerActionClass} type="button" on:click={() => (showSettings = true)}>
								<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
								<span class="hidden md:inline">Einstellungen</span>
							</button>
							<button class={headerActionClass} type="button" on:click={() => (showImportHelp = true)}>
								<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span class="hidden md:inline">Hilfe</span>
							</button>
							<label class={`${headerActionClass} cursor-pointer`}>
								<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
								</svg>
								<span class="hidden md:inline">Import</span>
								<input class="hidden" type="file" accept="application/json" on:change={handleImport} />
							</label>
							<button
								type="button"
								class={`${headerActionClass} justify-between`}
								on:click={() => (showLibraryPicker = true)}
								aria-expanded={showLibraryPicker}
							>
								<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
								</svg>
								<span class="hidden md:inline">Bibliothek</span>
								<span class="flex items-center gap-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white md:px-2 md:text-xs">
									{selectedChapterIds.length ? `${selectedChapterIds.length}×` : '0×'}
									<span class="hidden sm:inline">{selectedWordCount} Wörter</span>
								</span>
							</button>
							<button
								type="button"
								class={headerPrimaryActionClass}
								on:click={handleExport}
								disabled={exporting}
							>
								<svg class="h-4 w-4 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
								</svg>
								<span class="hidden md:inline">{exporting ? 'Export läuft …' : 'Export'}</span>
							</button>
						</div>
					</div>
					<div class="hidden text-xs font-medium text-slate-500 md:block">
						{selectedLibraryInfo?.name || 'Bibliothek'}: {selectedChapterIds.length ? `${selectedChapterIds.length} Kapitel, ${selectedWordCount} Wörter` : 'Keine Kapitel ausgewählt'}
					</div>
				</div>
			{/if}
		</nav>
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

	{#if showLibraryPicker}
		<div
			class="fixed inset-0 z-[80] isolate flex flex-col bg-white/80 backdrop-blur-sm md:items-center md:justify-center md:px-4 md:pb-10"
			style={`padding-top: ${dialogPaddingTop};`}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			on:keydown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					showLibraryPicker = false;
				}
			}}
		>
			<button
				type="button"
				class="absolute inset-0 z-0 h-full w-full cursor-pointer"
				aria-label="Bibliotheksauswahl schließen"
				on:click={() => (showLibraryPicker = false)}
			></button>
			<div
				data-state="open"
				class="relative z-10 flex w-full flex-1 flex-col translate-y-6 overflow-y-auto rounded-t-3xl bg-white p-6 opacity-0 shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ease-out data-[state=open]:translate-y-0 data-[state=open]:opacity-100 md:mt-0 md:h-auto md:max-w-2xl md:flex-none md:rounded-2xl md:p-8"
				style={`min-height: ${dialogMinHeight};`}
			>
				<header class="mb-4 flex items-center justify-between">
					<h2 class="text-base font-semibold text-slate-900">Bibliothek & Kapitel wählen</h2>
					<button class="text-sm text-slate-500" type="button" on:click={() => (showLibraryPicker = false)}>Schließen</button>
				</header>
				<form
					class="flex flex-col gap-4"
					on:submit|preventDefault={async () => {
						const imported = await handleLibraryImport();
						if (imported) {
							showLibraryPicker = false;
						}
					}}
				>
					<!-- Library Selection -->
					<div class="flex flex-col gap-2">
						<div class="text-sm font-medium text-slate-700">Bibliothek auswählen:</div>
						<div class="flex gap-2">
							{#each availableLibraries as library}
								<button
									type="button"
									class="flex-1 rounded-md border px-4 py-2 text-sm font-medium transition"
									class:bg-slate-900={selectedLibrary === library.id}
									class:text-white={selectedLibrary === library.id}
									class:border-slate-900={selectedLibrary === library.id}
									class:bg-white={selectedLibrary !== library.id}
									class:text-slate-700={selectedLibrary !== library.id}
									class:border-slate-200={selectedLibrary !== library.id}
									on:click={() => {
										selectedLibrary = library.id;
										handleLibraryChange();
									}}
								>
									{library.name}
									<span class="block text-xs opacity-70">{library.totalWords} Wörter</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Chapter Selection -->
					{#if currentLibraryChapters.length > 0}
						<div class="flex items-center justify-between text-sm text-slate-600">
							<button type="button" class="rounded border border-slate-200 px-3 py-1" on:click={selectAllChapters}>
								Alle auswählen
							</button>
							<button type="button" class="rounded border border-slate-200 px-3 py-1" on:click={clearChapterSelection}>
								Zurücksetzen
							</button>
						</div>
						<div class="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
							{#each currentLibraryChapters as chapter}
								<label class="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 transition">
									<span class="font-medium">{chapter.label}</span>
									<span class="text-xs text-slate-500">{chapter.wordCount} Wörter</span>
									<input
										type="checkbox"
										class="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
										checked={selectedChapterIds.includes(chapter.id)}
										on:change={() => toggleChapter(chapter.id)}
									/>
								</label>
							{/each}
						</div>
					{:else}
						<div class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
							Keine Kapitel verfügbar für diese Bibliothek.
						</div>
					{/if}

					<div class="flex flex-col gap-2 text-sm text-slate-600">
						<span>Ausgewählt: {selectedWordCount} Wörter aus {selectedChapterIds.length} Kapitel(n)</span>
						<button
							type="submit"
							class="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
							disabled={libraryImporting}
						>
							{libraryImporting
								? 'Wird übernommen …'
								: selectedChapterIds.length === 0
									? `${selectedLibraryInfo?.name || 'Bibliothek'} pausieren`
									: `${selectedLibraryInfo?.name || 'Bibliothek'} übernehmen`}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if showKlettPicker}
		<div
			class="fixed inset-0 z-[80] isolate flex flex-col bg-white/80 backdrop-blur-sm md:items-center md:justify-center md:px-4 md:pb-10"
			style={`padding-top: ${dialogPaddingTop};`}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			on:keydown={(event) => {
				if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					showKlettPicker = false;
				}
			}}
		>
			<button
				type="button"
				class="absolute inset-0 z-0 h-full w-full cursor-pointer"
				aria-label="Klett-Auswahl schließen"
				on:click={() => (showKlettPicker = false)}
			></button>
			<div
				data-state="open"
				class="relative z-10 flex w-full flex-1 flex-col translate-y-6 overflow-y-auto rounded-t-3xl bg-white p-6 opacity-0 shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ease-out data-[state=open]:translate-y-0 data-[state=open]:opacity-100 md:mt-0 md:h-auto md:max-w-2xl md:flex-none md:rounded-2xl md:p-8"
				style={`min-height: ${dialogMinHeight};`}
			>
				<header class="mb-4 flex items-center justify-between">
					<h2 class="text-base font-semibold text-slate-900">Klett Kapitel wählen</h2>
					<button class="text-sm text-slate-500" type="button" on:click={() => (showKlettPicker = false)}>Schließen</button>
				</header>
				<form
					class="flex flex-col gap-4"
					on:submit|preventDefault={async () => {
						const imported = await handleKlettImport();
						if (imported) {
							showKlettPicker = false;
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
					<div class="grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
						{#each klettChapterSummaries as item}
							<label class="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
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
					<div class="flex flex-col gap-2 text-sm text-slate-600">
						<span>Ausgewählt: {selectedKlettWordCount} Wörter</span>
						<button
							type="submit"
							class="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
							disabled={klettImporting}
						>
							{klettImporting
								? 'Wird übernommen …'
								: selectedKlettChapters.length === 0
									? 'Klett pausieren'
									: 'Klett übernehmen'}
						</button>
					</div>
				</form>
			</div>
		</div>
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
			<div class="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
				<header class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-slate-900">Import-Hilfe</h2>
					<button class="text-slate-500" on:click={() => (showImportHelp = false)}>Schließen</button>
				</header>
				<div class="space-y-3 text-sm text-slate-700">
					<p>Mit dem Import-Button kannst du neue Vokabelpakete oder Sicherungen im JSON-Format laden.</p>
					<ol class="list-decimal space-y-1 pl-4">
						<li>Exportiere vorhandene Daten als Vorlage über den Button „Export“.</li>
						<li>Erstelle eine JSON-Datei in einem der beiden Formate: einfache Wortlisten mit <code>words</code> oder strukturierte Kapitel mit <code>chapters</code> (wie Klett).</li>
						<li>Wähle die Datei über „Import“ aus, um Wörter oder Fortschritt zu übernehmen.</li>
					</ol>
					<pre class="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-xs"><code>{importExample}</code></pre>
				</div>
			</div>
		</div>
	{/if}
</section>
