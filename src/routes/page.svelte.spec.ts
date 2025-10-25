import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Settings } from '$lib/types';

const mockWord = {
	id: 'word-1',
	prompt: 'Hallo',
	promptLanguage: 'de',
	pinyin: 'nǐ hǎo',
	characters: ['你', '好'],
	source: 'custom',
	createdAt: Date.now(),
	updatedAt: Date.now()
} as const;

const mockProgress = {
	wordId: mockWord.id,
	bucket: 'learning',
	streak: 0,
	lastReviewedAt: 0,
	nextDueAt: Date.now(),
	pinyinAttempts: 0,
	writingAttempts: 0,
	lastResult: 'failure'
} as const;

const defaultSettings: Settings = {
	interfaceLanguage: 'de',
	learningMode: 'prompt-to-pinyin',
	enforceTones: true,
	showStrokeOrderHints: false,
	leniency: 1,
	librarySelections: { demo: ['chapter-1'] },
	matchingWordCount: 3
};

vi.mock('$lib/storage/repository', () => {
	const createMatchingWords = (count: number) =>
		Array.from({ length: Math.max(3, count) }, (_, index) => ({
			id: `matching-${index}`,
			prompt: `Prompt ${index}`,
			pinyin: `pinyin-${index}`,
			characters: ['字']
		}));

	return {
		initializeRepository: vi.fn(async () => {}),
		getNextLessonCandidate: vi.fn(async () => ({ word: mockWord, progress: mockProgress })),
		recordLesson: vi.fn(async () => {}),
		recordMatchingRound: vi.fn(async () => {}),
		exportSnapshot: vi.fn(async () => ({ settings: defaultSettings, progress: [], customWords: [], lastUpdated: Date.now() })),
		importWordPack: vi.fn(async () => ({ inserted: 0 })),
		importSnapshot: vi.fn(async () => ({ inserted: 0, restoredProgress: 0, restoredSettings: false })),
		listRecentSummaries: vi.fn(async () => []),
		getWordById: vi.fn(async () => mockWord),
		getProgressByWordId: vi.fn(async () => mockProgress),
		saveSession: vi.fn(async () => {}),
		loadSession: vi.fn(async () => null),
		getKlettChapterSummaries: vi.fn(async () => []),
		getKlettTotalWordCount: vi.fn(async () => 0),
		importKlettChapters: vi.fn(async () => ({ inserted: 0 })),
		suspendKlettChapters: vi.fn(async () => 0),
		resumeWord: vi.fn(async () => {}),
		searchWordsByPrompt: vi.fn(async () => []),
		suspendWord: vi.fn(async () => {}),
		getAvailableLibraries: vi.fn(async () => []),
		getLibraryChapters: vi.fn(async () => []),
		importLibraryChapters: vi.fn(async () => ({ inserted: 0 })),
		suspendLibraryChapters: vi.fn(async () => 0),
		applyLibrarySelections: vi.fn(async () => ({
			inserted: 0,
			paused: 0,
			details: [],
			normalizedSelections: defaultSettings.librarySelections ?? {}
		})),
		getMatchingRound: vi.fn(async (count: number) => ({ words: createMatchingWords(count ?? 3) }))
	};
});

vi.mock('$lib/state/settings', () => {
	let currentSettings: Settings = { ...defaultSettings };
	const subscribers = new Set<(value: Settings | null) => void>();
	const emit = () => {
		for (const subscriber of subscribers) {
			subscriber(currentSettings);
		}
	};
	return {
		loadSettings: vi.fn(async () => {
			emit();
			return currentSettings;
		}),
		saveSettings: vi.fn(async (next: Settings) => {
			currentSettings = { ...next };
			emit();
		}),
		settings: {
			subscribe(run: (value: Settings | null) => void) {
				subscribers.add(run);
				run(currentSettings);
				return () => subscribers.delete(run);
			}
		},
		__setMockSettings(next: Settings) {
			currentSettings = { ...next };
		}
	};
});

let setMockSettings!: (settings: Settings) => void;
let PageComponent!: typeof import('./+page.svelte').default;
let invalidateLessonCacheFn!: () => void;
let invalidateMatchingCacheFn!: () => void;
let getMatchingRoundMock!: ReturnType<typeof vi.fn>;
let getNextLessonCandidateMock!: ReturnType<typeof vi.fn>;

let unmount: (() => void) | undefined;

beforeAll(async () => {
	const settingsModule = (await import('$lib/state/settings')) as unknown as {
		__setMockSettings: (settings: Settings) => void;
	};
	setMockSettings = settingsModule.__setMockSettings;

	({ default: PageComponent } = await import('./+page.svelte'));

	const syncModule = await import('$lib/state/study-sync');
	invalidateLessonCacheFn = syncModule.invalidateLessonCache;
	invalidateMatchingCacheFn = syncModule.invalidateMatchingCache;

	const repositoryModule = await import('$lib/storage/repository');
	getMatchingRoundMock = repositoryModule.getMatchingRound as unknown as ReturnType<typeof vi.fn>;
	getNextLessonCandidateMock = repositoryModule.getNextLessonCandidate as unknown as ReturnType<typeof vi.fn>;
});

beforeEach(() => {
	vi.clearAllMocks();
	setMockSettings(defaultSettings);
	invalidateLessonCacheFn();
	invalidateMatchingCacheFn();
});

afterEach(() => {
	if (unmount) {
		unmount();
		unmount = undefined;
	}
});

describe('/+page.svelte initialization', () => {
	it('loads the next lesson card when starting in study mode', async () => {
		unmount = render(PageComponent).unmount;
		await vi.waitFor(() => {
			expect(getNextLessonCandidateMock).toHaveBeenCalledOnce();
		});
	});

	it('loads a matching round when starting in matching mode', async () => {
		setMockSettings({ ...defaultSettings, learningMode: 'matching-triplets', matchingWordCount: 5 });
		unmount = render(PageComponent).unmount;
		await vi.waitFor(() => {
			expect(getMatchingRoundMock).toHaveBeenCalled();
		});
		expect(getNextLessonCandidateMock).not.toHaveBeenCalled();
	});
});
