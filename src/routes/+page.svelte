<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import FeatureHighlightsBanner from '$lib/components/FeatureHighlightsBanner.svelte';
	import LessonHistory from '$lib/components/LessonHistory.svelte';
	import { browser } from '$app/environment';
	import HandwritingQuiz from '$lib/components/HandwritingQuiz.svelte';
	import StudyHeader from '$lib/components/study/StudyHeader.svelte';
	import SettingsDialog from '$lib/components/study/SettingsDialog.svelte';
	import LibraryPickerDialog from '$lib/components/study/LibraryPickerDialog.svelte';
	import KlettPickerDialog from '$lib/components/study/KlettPickerDialog.svelte';
	import MatchingModePanel from '$lib/components/study/MatchingModePanel.svelte';
	import { comparePinyin, convertNumericToToneMarks } from '$lib/utils/pinyin';
	import {
		initializeRepository,
		getNextLessonCandidate,
		recordLesson,
		recordMatchingRound,
		exportSnapshot,
		importWordPack,
		importSnapshot,
		listRecentSummaries,
		getWordById,
		getProgressByWordId,
		saveSession,
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
		suspendLibraryChapters,
		applyLibrarySelections,
		type KlettChapterSummary
	} from '$lib/storage/repository';
	import { loadSettings, saveSettings } from '$lib/state/settings';
	import {
		fetchMatchingRound,
		hydrateLessonState,
		invalidateLessonCache,
		invalidateMatchingCache,
		watchSettingsChanges,
		type LessonHydration,
		type MatchingRoundResult,
		type SettingsChange
	} from '$lib/state/study-sync';
	import {
		createLibrarySelectionManager,
		type LibraryCatalogEntry,
		type DraftSummary as LibraryDraftSummary,
		type LibrarySummary as LibrarySelectionSummary
	} from '$lib/state/library-selection';
	import type {
		LessonStage,
		LessonSummary,
		LessonHistoryEntry,
		MatchingRoundWord,
		LearningMode,
		LearningBucket,
		SessionState,
		Settings,
		WordProgress,
		WritingMode,
		LibrarySelectionMap
	} from '$lib/types';
	import type { WordRecord } from '$lib/storage/db';
	import type { LibraryType } from '$lib/data/libraries';

	let loading = true;
	let errorMessage = '';
	let pinyinInput = '';
	let pinyinAttempts = 0;
	let message = '';
	let toneMessage = '';
	let revealedPinyin = '';
	let currentWord: WordRecord | null = null;
	let currentProgress: WordProgress | null = null;
	let stage: LessonStage = 'pinyin';
	let pinyinSolved = false;
	let writingAttemptCounter = 0;
	let guidedRepetitions = 0;
	let totalWritingAttempts = 0;
	let attemptKey = 0;
	let sessionFinished = false;
	let summaryHistory: LessonHistoryEntry[] = [];
	let activeSettings: Settings | null = null;
	let showSettings = false;
	let exporting = false;
	let importFeedback = '';
	let writingMode: WritingMode = 'free';
	let characterIndex = 0;
	let quizComponent: InstanceType<typeof HandwritingQuiz> | null = null;
	let showImportHelp = false;

	const featureHighlightsStorageKey = 'featureHighlightsSeen';
	let showFeatureHighlights = !browser;

	// Matching mode state
	let matchingWords: MatchingRoundWord[] = [];
	let matchingRoundId = 0;
	let matchingLoading = false;
	let matchingError = '';
	let matchingComplete = false;
	let matchingRecording = false;
	let lastMatchedWords: MatchingRoundWord[] = [];
	let matchingFeedback = '';
	let fallbackLearningMode: LearningMode = 'prompt-to-pinyin';
	let togglingMode = false;
	let matchingModeActive = false;
	let settingsPreferredMode: Exclude<LearningMode, 'matching-triplets'> = 'prompt-to-pinyin';
	let settingsWasOpen = false;

	// Library management
	let libraryCatalog: LibraryCatalogEntry[] = [];
	const initialLibrarySelectionManager = createLibrarySelectionManager([]);
	let draftLibrarySelection = initialLibrarySelectionManager.draftSelection;
	let activeLibraryDetails = initialLibrarySelectionManager.activeDetails;
	let draftLibraryDetails = initialLibrarySelectionManager.draftDetails;
	let setActiveLibrarySelection = initialLibrarySelectionManager.setActiveSelection;
	let openLibraryDraft = initialLibrarySelectionManager.openDraftFromActive;
	let toggleDraftChapterFn = initialLibrarySelectionManager.toggleDraftChapter;
	let selectAllDraftChaptersFn = initialLibrarySelectionManager.selectAllDraftChapters;
	let clearDraftSelectionFn = initialLibrarySelectionManager.clearDraftSelection;
	let getDraftSelectionSnapshot = initialLibrarySelectionManager.getDraftSelectionSnapshot;

	function updateLibrarySelectionManager(catalog: LibraryCatalogEntry[], initialSelection: LibrarySelectionMap = {}) {
		const manager = createLibrarySelectionManager(catalog, initialSelection);
		libraryCatalog = catalog;
		draftLibrarySelection = manager.draftSelection;
		activeLibraryDetails = manager.activeDetails;
		draftLibraryDetails = manager.draftDetails;
		setActiveLibrarySelection = manager.setActiveSelection;
		openLibraryDraft = manager.openDraftFromActive;
		toggleDraftChapterFn = manager.toggleDraftChapter;
		selectAllDraftChaptersFn = manager.selectAllDraftChapters;
		clearDraftSelectionFn = manager.clearDraftSelection;
		getDraftSelectionSnapshot = manager.getDraftSelectionSnapshot;
	}
	let libraryImporting = false;
	let showLibraryPicker = false;

	// Legacy Klett support (for backwards compatibility)
	let klettChapterSummaries: KlettChapterSummary[] = [];
	let klettTotalWords = 0;
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
	let dialogTopGap = 32;
	let dialogPaddingTop = '32px';
	let dialogHeight = 'calc(100dvh - 32px - 1rem)';

	// Reactive statements for library selection
	let librarySummaries: LibrarySelectionSummary[] = [];
	let totalSelectedChapters = 0;
	let totalSelectedWords = 0;
	let libraryHeaderLabel = 'Keine Bibliotheken aktiv';
	let primaryLibraryLabel = 'Keine Bibliothek';
	let collapsedLibrarySummary = '';
	let librarySelectionDraftSummary: LibraryDraftSummary[] = [];
	let draftSummaryMap = new Map<LibraryType, LibraryDraftSummary>();
	let draftTotalChapters = 0;
	let draftTotalWords = 0;
	let draftActiveLibraries = 0;

	$: {
		const details = $activeLibraryDetails;
		librarySummaries = details.summaries;
		totalSelectedChapters = details.totalChapters;
		totalSelectedWords = details.totalWords;
		libraryHeaderLabel = details.headerLabel;
		primaryLibraryLabel = details.primaryLabel;
		collapsedLibrarySummary = details.collapsedSummary;
	}

	$: {
		const draftDetails = $draftLibraryDetails;
		librarySelectionDraftSummary = draftDetails.summaries;
		draftSummaryMap = draftDetails.summaryMap;
		draftTotalChapters = draftDetails.totalChapters;
		draftTotalWords = draftDetails.totalWords;
		draftActiveLibraries = draftDetails.activeLibraries;
	}

	$: matchingTargetWordCount = activeSettings?.matchingWordCount ?? 3;
	$: matchingCardCount = matchingTargetWordCount * 3;
	
	// Legacy Klett reactive statements
	$: allKlettChaptersSelected =
		klettChapterSummaries.length > 0 && selectedKlettChapters.length === klettChapterSummaries.length;
	$: selectedKlettWordCount = allKlettChaptersSelected
		? klettTotalWords
		: klettChapterSummaries
				.filter((item) => selectedKlettChapters.includes(item.chapter))
				.reduce((sum, item) => sum + item.wordCount, 0);
	$: selectedKlettChapterCount = selectedKlettChapters.length;
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

	let draftSelectionState: LibrarySelectionMap = {};

	$: draftSelectionState = $draftLibrarySelection;

	function toggleLibraryChapter(libraryId: LibraryType, chapterId: string) {
		toggleDraftChapterFn(libraryId, chapterId);
	}

	function selectAllLibraryChapters(libraryId: LibraryType) {
		selectAllDraftChaptersFn(libraryId);
	}

	function clearLibraryChapterSelection(libraryId: LibraryType) {
		clearDraftSelectionFn(libraryId);
	}

	function openLibraryPicker() {
		openLibraryDraft();
		showLibraryPicker = true;
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

	function dismissFeatureHighlights() {
		showFeatureHighlights = false;
		if (!browser) {
			return;
		}
		try {
			window.localStorage.setItem(featureHighlightsStorageKey, 'true');
		} catch {
			// ignore storage errors
		}
	}

	function updateHeaderHeight() {
		if (!browser) {
			return;
		}
		const nextHeight = headerElement?.getBoundingClientRect().height ?? 0;
		if (Math.abs(nextHeight - headerHeight) > 0.5) {
			headerHeight = nextHeight;
		}
		const hasCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
		const minViewportEdge = Math.min(window.innerWidth, window.innerHeight);
		isMobileViewport = window.innerWidth < 768 || (hasCoarsePointer && minViewportEdge < 640);
	}

	$: if (browser) {
		headerExpanded;
		void tick().then(() => updateHeaderHeight());
	}

	$: headerOffset = headerHeight > 0 ? headerHeight : 96;
	$: dialogTopGap = isMobileViewport
		? Math.max(12, Math.min(headerOffset, 44))
		: Math.max(20, Math.min(headerOffset, 48));
	$: dialogPaddingTop = `${dialogTopGap}px`;
	$: dialogHeight = `calc(100dvh - ${dialogPaddingTop} - 1rem)`;
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

	let settingsUnsubscribe: (() => void) | null = null;
	let settingsInitialized = false;

	const currentLearningMode = (): Settings['learningMode'] => activeSettings?.learningMode ?? 'prompt-to-pinyin';
	const isMatchingMode = (): boolean => matchingModeActive;

	$: matchingModeActive = activeSettings?.learningMode === 'matching-triplets';

	$: {
		if (showSettings && !settingsWasOpen) {
			const baseMode = matchingModeActive
				? fallbackLearningMode
				: activeSettings?.learningMode ?? 'prompt-to-pinyin';
			settingsPreferredMode =
				baseMode === 'matching-triplets' ? 'prompt-to-pinyin' : baseMode;
			settingsWasOpen = true;
		} else if (!showSettings && settingsWasOpen) {
			settingsWasOpen = false;
		}
	}

	onMount(async () => {
		if (!browser) {
			return;
		}
		let highlightsSeen = false;
		try {
			highlightsSeen = window.localStorage.getItem(featureHighlightsStorageKey) === 'true';
		} catch {
			highlightsSeen = false;
		}
		showFeatureHighlights = !highlightsSeen;
		if (!highlightsSeen) {
			try {
				window.localStorage.setItem(featureHighlightsStorageKey, 'true');
			} catch {
				// ignore storage errors
			}
		}
		await initializeRepository();
		const loaded = await loadSettings();
		activeSettings = loaded;
		const selectionResult = await applyLibrarySelections(loaded.librarySelections);
		const libraries = await getAvailableLibraries();
		const catalogEntries: LibraryCatalogEntry[] = await Promise.all(
			libraries.map(async (library) => {
				const chapters = await getLibraryChapters(library.id);
				return {
					id: library.id,
					name: library.name,
					chapters: chapters.map(({ id, label, wordCount }) => ({ id, label, wordCount }))
				};
			})
		);
		updateLibrarySelectionManager(catalogEntries, selectionResult.normalizedSelections);
		setActiveLibrarySelection(selectionResult.normalizedSelections);
		const [klettSummaries, klettWords] = await Promise.all([
			getKlettChapterSummaries(),
			getKlettTotalWordCount()
		]);
		klettChapterSummaries = klettSummaries;
		klettTotalWords = klettWords;
		if (selectionResult.inserted > 0 || selectionResult.paused > 0) {
			importFeedback = selectionResult.details
				.filter((detail) => detail.inserted > 0 || detail.paused > 0)
				.map((detail) => {
					const parts = [];
					if (detail.inserted > 0) {
						parts.push(`importiert ${detail.inserted}`);
					}
					if (detail.paused > 0) {
						parts.push(`pausiert ${detail.paused}`);
					}
					return `${detail.name}: ${parts.join(', ')}`;
				})
				.join(' | ');
		}
		const normalizedSettings: Settings = {
			...loaded,
			librarySelections: selectionResult.normalizedSelections
		};
		if (JSON.stringify(normalizedSettings.librarySelections) !== JSON.stringify(loaded.librarySelections ?? {})) {
			await saveSettings(normalizedSettings);
		}
		settingsUnsubscribe = watchSettingsChanges((change) => {
			void handleSettingsChange(change);
		});
		summaryHistory = await listRecentSummaries();
		document.addEventListener('click', handleGlobalSearchClick, true);
		updateHeaderHeight();
		const handleResize = () => updateHeaderHeight();
		window.addEventListener('resize', handleResize);
		removeResizeListener = () => window.removeEventListener('resize', handleResize);
	});

	onDestroy(() => {
		if (settingsUnsubscribe) settingsUnsubscribe();
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

	function resetMatchingState(clearWords = false) {
		if (clearWords) {
			matchingWords = [];
		}
		matchingLoading = false;
		matchingError = '';
		matchingFeedback = '';
		matchingComplete = false;
		matchingRecording = false;
		lastMatchedWords = [];
	}

	function applyLessonHydration(hydration: LessonHydration | null): boolean {
		if (!hydration) {
			return false;
		}
		const { snapshot, word, progress } = hydration;
		currentWord = word;
		currentProgress = progress;
		stage = snapshot.stage;
		writingMode = snapshot.writingMode;
		pinyinSolved = snapshot.pinyinSolved;
		pinyinAttempts = snapshot.pinyinAttempts;
		pinyinInput = convertNumericToToneMarks(snapshot.pinyinInput ?? '');
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

	function applyMatchingRoundResult(result: MatchingRoundResult): void {
		if (result.type === 'success' && result.round) {
			matchingWords = result.round.words;
			matchingError = '';
			return;
		}
		matchingWords = [];
		matchingError = result.message;
	}

	async function refreshMatchingRound(options: { force?: boolean } = {}): Promise<void> {
		resetMatchingState();
		matchingLoading = true;
		matchingRoundId += 1;
		const desiredCount = Math.max(3, activeSettings?.matchingWordCount ?? 3);
		try {
			const result = await fetchMatchingRound({ desiredCount, force: options.force });
			applyMatchingRoundResult(result);
		} finally {
			matchingLoading = false;
			loading = false;
		}
	}

	async function handleSettingsChange({ current, previous }: SettingsChange): Promise<void> {
		setActiveLibrarySelection(current.librarySelections);
		const previousMode = previous?.learningMode ?? fallbackLearningMode;
		const previousMatchingCount = previous?.matchingWordCount ?? 3;
		activeSettings = current;
		const nextMatchingCount = current.matchingWordCount ?? 3;
		const matchingCountChanged = previousMatchingCount !== nextMatchingCount;
		if (current.learningMode !== 'matching-triplets') {
			fallbackLearningMode = current.learningMode;
		}
		if (!settingsInitialized) {
			settingsInitialized = true;
			if (current.learningMode === 'matching-triplets') {
				resetMatchingState();
				await saveSession(null);
				invalidateLessonCache();
				invalidateMatchingCache();
				await refreshMatchingRound({ force: true });
				return;
			}
			resetMatchingState(true);
			const hydration = await hydrateLessonState({ force: true });
			const restored = applyLessonHydration(hydration);
			if (!restored) {
				await loadNextWord();
			}
			return;
		}
		if (previousMode !== current.learningMode) {
			await handleLearningModeChange(current.learningMode, previousMode);
			return;
		}
		if (current.learningMode === 'matching-triplets') {
			if (matchingCountChanged) {
				resetMatchingState();
				await saveSession(null);
				invalidateLessonCache();
				invalidateMatchingCache();
				await refreshMatchingRound({ force: true });
				return;
			}
			await saveSession(null);
			invalidateLessonCache();
			return;
		}
		await persistSession();
	}

	async function handleLearningModeChange(
		nextMode: Settings['learningMode'],
		previousMode: Settings['learningMode'] | null
	): Promise<void> {
		if (!browser) {
			return;
		}
		if (nextMode === 'matching-triplets') {
			if (previousMode && previousMode !== 'matching-triplets') {
				fallbackLearningMode = previousMode;
			}
			loading = true;
			currentWord = null;
			currentProgress = null;
			await saveSession(null);
			invalidateLessonCache();
			resetMatchingState();
			await refreshMatchingRound({ force: true });
			loading = false;
			return;
		}

		fallbackLearningMode = nextMode;
		resetMatchingState(true);
		loading = true;
		if (previousMode === 'matching-triplets') {
			await saveSession(null);
			invalidateLessonCache();
			invalidateMatchingCache();
		}
		const hydration = await hydrateLessonState({ force: true });
		if (hydration) {
			resetBeforeLoadingWord();
			await applyActiveWord(hydration.word, hydration.progress);
			return;
		}
		await loadNextWord();
	}

	function serializeSession(): SessionState | null {
		if (isMatchingMode()) {
			return null;
		}
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
		if (isMatchingMode()) {
			await saveSession(null);
			invalidateLessonCache();
			return;
		}
		await saveSession(serializeSession());
		invalidateLessonCache();
	}

	function resetBeforeLoadingWord() {
		if (isMatchingMode()) {
			return;
		}
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
		revealedPinyin = '';
		sessionFinished = false;
		writingMode = 'free';
	}

	async function applyActiveWord(word: WordRecord, progress: WordProgress | null) {
		if (isMatchingMode()) {
			return;
		}
		if (!progress) {
			throw new Error('Es existiert kein Lernfortschritt für dieses Wort.');
		}
		currentWord = word;
		currentProgress = progress;
		characterIndex = 0;
		const mode = currentLearningMode();
		stage = mode === 'prompt-to-pinyin' ? 'pinyin' : 'writing';
		pinyinSolved = mode !== 'prompt-to-pinyin';
		revealedPinyin = pinyinSolved ? word.pinyin : '';
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

	async function loadNextWord() {
		if (isMatchingMode()) {
			return;
		}
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

	async function completeMatchingRound(wordIds: string[]): Promise<void> {
		if (matchingRecording) {
			return;
		}
		matchingComplete = true;
		matchingRecording = true;
		matchingError = '';
		matchingFeedback = 'Speichere Lernerfolg...';
		try {
			if (wordIds.length > 0) {
				const matched = matchingWords.filter((word) => wordIds.includes(word.id));
				lastMatchedWords = matched;
				await recordMatchingRound(wordIds);
				invalidateMatchingCache();
				summaryHistory = await listRecentSummaries();
				matchingFeedback = 'Runde gespeichert. Starte eine neue Runde, wenn du bereit bist.';
			} else {
				lastMatchedWords = [];
				matchingFeedback = 'Runde abgeschlossen.';
			}
		} catch (error) {
			console.error(error);
			matchingError = 'Ergebnisse konnten nicht gespeichert werden.';
			matchingFeedback = '';
			matchingComplete = false;
		} finally {
			matchingRecording = false;
		}
	}

	async function refreshActiveMode(): Promise<void> {
		if (isMatchingMode()) {
			await saveSession(null);
			invalidateLessonCache();
			invalidateMatchingCache();
			await refreshMatchingRound({ force: true });
			return;
		}
		await loadNextWord();
	}

	async function toggleMatchingMode(): Promise<void> {
		if (!activeSettings || togglingMode) {
			return;
		}
		togglingMode = true;
		try {
			const currentMode = activeSettings.learningMode;
			let nextMode: LearningMode;
			if (currentMode === 'matching-triplets') {
				nextMode = fallbackLearningMode === 'matching-triplets' ? 'prompt-to-pinyin' : fallbackLearningMode;
			} else {
				nextMode = 'matching-triplets';
			}
			const nextSettings: Settings = { ...activeSettings, learningMode: nextMode };
			await saveSettings(nextSettings);
		} finally {
			togglingMode = false;
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

	async function handlePinyinInputChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement | null;
		if (!target) return;
		const originalValue = target.value;
		const caretPosition = target.selectionStart ?? originalValue.length;
		const converted = convertNumericToToneMarks(originalValue);
		if (converted === originalValue) {
			pinyinInput = converted;
			return;
		}
		const lengthDiff = originalValue.length - converted.length;
		target.value = converted;
		pinyinInput = converted;
		await tick();
		const newCaret = Math.max(0, caretPosition - lengthDiff);
		try {
			target.setSelectionRange(newCaret, newCaret);
		} catch {
			// Input may have been unmounted; ignore selection errors.
		}
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
			allowNeutralToneMismatch: !activeSettings.enforceTones
		});

		if (!comparison.lettersMatch) {
			pinyinAttempts += 1;
			message = `Nicht ganz richtig. Verbleibende Versuche: ${remainingAttempts(pinyinAttempts)}`;
			if (pinyinAttempts >= 3) {
				message = `Richtige Antwort: ${currentWord.pinyin}`;
				revealedPinyin = currentWord.pinyin;
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
		revealedPinyin = comparison.normalizedTarget;
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
		summaryHistory = await listRecentSummaries();
		await saveSession(null);
		invalidateLessonCache();
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

			await refreshActiveMode();
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
		const modeInput = formData.get('mode') as
			| Exclude<LearningMode, 'matching-triplets'>
			| null;
		const selectedMode = modeInput ?? settingsPreferredMode;
		const leniency = Number(formData.get('leniency'));
		const matchingWordCountRaw = Number(formData.get('matchingWordCount'));
		const normalizedMatchingWordCount = Number.isFinite(matchingWordCountRaw)
			? Math.min(Math.max(Math.round(matchingWordCountRaw), 3), 6)
			: activeSettings.matchingWordCount ?? 3;
		const matchingActive = isMatchingMode();
		const appliedMode = matchingActive ? 'matching-triplets' : selectedMode;

		if (selectedMode && selectedMode !== fallbackLearningMode) {
			fallbackLearningMode = selectedMode;
		}

		const next: Settings = {
			...activeSettings,
			enforceTones,
			showStrokeOrderHints: showOutline,
			learningMode: appliedMode,
			leniency: Number.isFinite(leniency) ? leniency : activeSettings.leniency,
			matchingWordCount: normalizedMatchingWordCount
		};

		await saveSettings(next);
		settingsPreferredMode = selectedMode;
		showSettings = false;
		void persistSession();
	}

	async function handleLibraryImport(): Promise<boolean> {
		if (libraryImporting || !activeSettings) return false;
		libraryImporting = true;
		try {
			const draftSelection = getDraftSelectionSnapshot();
			let totalInserted = 0;
			let totalPaused = 0;
			const feedbackSegments: string[] = [];

			for (const catalog of libraryCatalog) {
				const libraryId = catalog.id as LibraryType;
				const validChapters = catalog.chapters.map((chapter) => chapter.id);
				if (validChapters.length === 0) {
					continue;
				}
				const selectedIds = (draftSelection[libraryId] ?? []).filter((id) => validChapters.includes(id));

				if (selectedIds.length === 0) {
					const paused = await suspendLibraryChapters(libraryId, validChapters);
					if (paused > 0) {
						totalPaused += paused;
						feedbackSegments.push(`${catalog.name}: pausiert ${paused}`);
					}
					continue;
				}

				const importResult = await importLibraryChapters(libraryId, selectedIds);
				const unselectedIds = validChapters.filter((id) => !selectedIds.includes(id));
				const paused = unselectedIds.length > 0 ? await suspendLibraryChapters(libraryId, unselectedIds) : 0;
				totalInserted += importResult.inserted;
				totalPaused += paused;
				const segmentDetails = [
					importResult.inserted ? `importiert ${importResult.inserted}` : 'keine neuen Wörter',
					paused ? `pausiert ${paused}` : ''
				].filter(Boolean);
				feedbackSegments.push(`${catalog.name}: ${segmentDetails.join(', ')}`);
			}

			const normalizedSelections = getDraftSelectionSnapshot(true);
			const updatedSettings: Settings = {
				...activeSettings,
				librarySelections: normalizedSelections
			};

			await saveSettings(updatedSettings);
			setActiveLibrarySelection(normalizedSelections);

			const summaryParts = [];
			if (totalInserted > 0) {
				summaryParts.push(`Importiert: ${totalInserted}`);
			}
			if (totalPaused > 0) {
				summaryParts.push(`Pausiert: ${totalPaused}`);
			}
			const summary = summaryParts.join(' · ');
			importFeedback = [summary, ...feedbackSegments].filter(Boolean).join(' | ') || 'Keine Änderungen vorgenommen.';

			await refreshActiveMode();
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
					await refreshActiveMode();
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
				await refreshActiveMode();
			} else {
				const currentChapter = klettChapterFromWordId(currentWord.id);
				if (
					currentChapter !== null &&
					(excludedChapters.length === 0 ? false : excludedChapters.includes(currentChapter))
				) {
					await refreshActiveMode();
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
		void refreshActiveMode();
	}

	async function unloadCurrentWord() {
		if (!currentWord || unloadingWord) return;
		unloadingWord = true;
		const removedPrompt = currentWord.prompt;
		try {
			await suspendWord(currentWord.id);
			await saveSession(null);
			invalidateLessonCache();
			await refreshActiveMode();
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
		<StudyHeader
			{headerExpanded}
			{isMobileViewport}
			{matchingModeActive}
			{matchingLoading}
			{matchingRecording}
			{togglingMode}
			{loading}
			{primaryLibraryLabel}
			{matchingTargetWordCount}
			{matchingCardCount}
			{libraryHeaderLabel}
			{collapsedLibrarySummary}
			{totalSelectedChapters}
			{totalSelectedWords}
			{searchOpen}
			{searchLoading}
			{searchQuery}
			{searchResults}
			{klettChapterFromWordId}
			{exporting}
			{showLibraryPicker}
			toggleMatchingMode={toggleMatchingMode}
			openLibraryPicker={openLibraryPicker}
			openSettings={() => (showSettings = true)}
			openImportHelp={() => (showImportHelp = true)}
			handleExport={handleExport}
			handleImport={handleImport}
			handleSearchSubmit={handleSearchSubmit}
			handleSearchInput={handleSearchInput}
			handleSearchFocus={handleSearchFocus}
			handleSearchKeydown={handleSearchKeydown}
			clearSearchField={clearSearchField}
			selectSearchResult={selectSearchResult}
			setHeaderExpanded={(value) => (headerExpanded = value)}
			bind:searchContainer={searchContainer}
		/>
	</header>
	<FeatureHighlightsBanner visible={showFeatureHighlights} on:dismiss={dismissFeatureHighlights} />
	{#if loading}
		<p class="text-center text-slate-600">Lade nächste Karte …</p>
	{:else if matchingModeActive}
		<MatchingModePanel
			{matchingWords}
			{matchingRoundId}
			{matchingLoading}
			{matchingError}
			{matchingComplete}
			{matchingRecording}
			{matchingFeedback}
			{matchingTargetWordCount}
			{matchingCardCount}
			{lastMatchedWords}
			{librarySummaries}
			loadMatchingRound={() => refreshMatchingRound({ force: true })}
			completeMatchingRound={completeMatchingRound}
		/>
	{:else}
		<article class="grid gap-8 md:grid-cols-[2fr,1fr]">
			<section class="flex flex-col gap-6">
				{#if currentWord}
					<div class="rounded-lg border border-slate-200 bg-white px-6 py-4 shadow-sm">
						<h2 class="text-2xl font-semibold text-slate-900 md:text-3xl">{displayedPrompt()}</h2>
					</div>
					{#if stage === 'pinyin'}
						<form class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" on:submit={handlePinyinSubmit}>
							<label class="flex flex-col gap-2 text-sm text-slate-700">
								<span class="font-semibold text-slate-900">Pinyin eingeben</span>
								<input
									type="text"
									class="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-inner focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
									on:input={handlePinyinInputChange}
									bind:value={pinyinInput}
									placeholder="z. B. nǐ hǎo"
									autocomplete="off"
									spellcheck={false}
								/>
							</label>
							<p class="mt-2 text-xs text-slate-500">
								Hinweis: Du kannst Zahlen tippen, z. B. <code>ni3 hao3</code>, wir wandeln sie in Tonzeichen um.
							</p>
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
								character={currentWord?.characters?.[characterIndex] ?? ''}
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
						{#if revealedPinyin}
							<p class="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">Pinyin: {revealedPinyin}</p>
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
				{:else}
					<div class="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
						<h2 class="text-xl font-semibold text-slate-900">Keine Lernkarten aktiv</h2>
						<p class="mt-3 text-sm text-slate-600">
							{errorMessage || 'Wähle eine Bibliothek oder importiere neue Wörter, um zu starten.'}
						</p>
						<div class="mt-5 flex flex-wrap justify-center gap-3">
							<button
								type="button"
								class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white"
								on:click={openLibraryPicker}
							>
								Bibliothek auswählen
							</button>
							<button
								type="button"
								class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600"
								on:click={() => (showImportHelp = true)}
							>
								Import-Anleitung öffnen
							</button>
						</div>
					</div>
				{/if}
			</section>

			<aside class="flex flex-col gap-4">
				<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Fortschritt</h3>
					<ul class="mt-3 space-y-2 text-sm text-slate-700">
						<li>Pinyin Versuche: {pinyinAttempts}</li>
						<li>Zeichen-Fortschritt: {characterIndex + 1}/{currentWord?.characters.length ?? 0}</li>
						<li>Schreibversuche: {totalWritingAttempts}</li>
						{#if currentProgress}
							<li>Aktueller Status: {currentProgress.bucket}</li>
						{/if}
					</ul>
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
				<section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Letzte Durchgänge</h3>
					<LessonHistory entries={summaryHistory} />
				</section>
			</aside>
			</article>
	{/if}

	{#if showLibraryPicker}
		<LibraryPickerDialog
			dialogPaddingTop={dialogPaddingTop}
			dialogHeight={dialogHeight}
			libraryCatalog={libraryCatalog}
			draftSelection={draftSelectionState}
			draftSummaryMap={draftSummaryMap}
			selectAllLibraryChapters={selectAllLibraryChapters}
			clearLibraryChapterSelection={clearLibraryChapterSelection}
			toggleLibraryChapter={toggleLibraryChapter}
			handleLibraryImport={handleLibraryImport}
			libraryImporting={libraryImporting}
			draftActiveLibraries={draftActiveLibraries}
			draftTotalChapters={draftTotalChapters}
			draftTotalWords={draftTotalWords}
			close={() => (showLibraryPicker = false)}
		/>
	{/if}

	{#if showKlettPicker}
		<div
			class="fixed inset-0 z-[80] isolate flex flex-col bg-white/80 backdrop-blur-sm md:items-center md:px-4"
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
				class="relative z-10 flex w-full flex-1 min-h-0 flex-col translate-y-6 overflow-hidden rounded-t-3xl bg-white p-6 opacity-0 shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ease-out data-[state=open]:translate-y-0 data-[state=open]:opacity-100 md:mt-0 md:max-w-2xl md:flex-none md:rounded-2xl md:p-8"
				style={`height: ${dialogHeight}; max-height: ${dialogHeight};`}
			>
				<header class="mb-4 flex items-center justify-between">
					<h2 class="text-base font-semibold text-slate-900">Klett Kapitel wählen</h2>
					<button class="text-sm text-slate-500" type="button" on:click={() => (showKlettPicker = false)}>Schließen</button>
				</header>
				<form
					class="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden"
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
					<div class="mt-auto flex flex-col gap-2 border-t border-slate-200/70 pt-3 text-sm text-slate-600">
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
		<SettingsDialog
			settings={activeSettings}
			bind:settingsPreferredMode={settingsPreferredMode}
			handleSettingsSave={handleSettingsSave}
			close={() => (showSettings = false)}
		/>
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
