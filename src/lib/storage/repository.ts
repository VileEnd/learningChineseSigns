import {
	bootstrapWords,
	db,
	updateProgress,
	saveSessionState as persistSessionState,
	loadSessionState as readSessionState,
	clearSessionState,
	type LessonSummaryRecord,
	type SessionStateRecord,
	type WordRecord
} from './db';
import type {
	ExportSnapshot,
	LessonStage,
	LessonSummary,
	SessionState,
	Settings,
	WordEntry,
	WordProgress,
	WordPack
} from '../types';
import { defaultWords } from '../data/defaultWords';
import { klettChapters, totalKlettWords } from '../data/klett';
import { 
	availableLibraries, 
	getChaptersForLibrary, 
	getWordsForChapters,
	type LibraryType 
} from '../data/libraries';
import { scheduleNextReview, selectNextCandidate } from '../scheduler/spaced-repetition';
import { exportSnapshotSchema, wordPackSchema, chaptersPackSchema } from './schema';

export async function initializeRepository(): Promise<void> {
	await db.open();
	await db.ensureSettings();
	await bootstrapWords(defaultWords);
	await removeLegacyDefaultWords();
}

const LEGACY_DEFAULT_WORD_IDS = new Set([
	'w-ni3-hao3',
	'w-xie4xie',
	'w-qing3',
	'w-dui4buqi3'
]);

async function removeLegacyDefaultWords(): Promise<void> {
	if (LEGACY_DEFAULT_WORD_IDS.size === 0) return;
	await db.transaction('rw', db.words, db.progress, async () => {
		for (const id of LEGACY_DEFAULT_WORD_IDS) {
			await db.words.delete(id);
			await db.progress.delete(id);
		}
	});
}

export async function getSettings(): Promise<Settings> {
	return db.ensureSettings().then((record) => record.payload);
}

export async function saveSettings(settings: Settings): Promise<void> {
	await db.settings.put({ id: 'default', payload: settings, updatedAt: Date.now() });
}

export async function getNextLessonCandidate(): Promise<{ word: WordRecord; progress: WordProgress } | null> {
	const progressList = (await db.progress.toArray()).map((item) => ({
		...item,
		reviewCount: item.reviewCount ?? 0,
		suspended: item.suspended ?? false
	}));
	const activeProgress = progressList.filter((item) => !item.suspended);
	if (progressList.length === 0) {
		return null;
	}

	const nextProgress = selectNextCandidate(activeProgress.length > 0 ? activeProgress : progressList);
	if (!nextProgress) {
		return null;
	}

	const word = await db.words.get(nextProgress.wordId);
	if (!word) {
		return null;
	}

	return { word, progress: nextProgress };
}

export async function recordLesson(summary: LessonSummary): Promise<void> {
	const currentProgress = await db.progress.get(summary.wordId);
	if (!currentProgress) {
		return;
	}

	const updated = scheduleNextReview(currentProgress, summary);
	await updateProgress(updated);
	await db.summaries.add({
		wordId: summary.wordId,
		success: summary.success,
		stageReached: summary.stageReached,
		pinyinAttempts: summary.pinyinAttempts,
		writingAttempts: summary.writingAttempts,
		timestamp: summary.timestamp
	});
}

export async function listRecentSummaries(limit = 10): Promise<LessonSummary[]> {
	const entries = await db.summaries.orderBy('timestamp').reverse().limit(limit).toArray();
	return entries.map(({ id: _id, stageReached, ...rest }: LessonSummaryRecord) => ({
		...rest,
		stageReached: stageReached as LessonStage
	}));
}

export async function getWordById(id: string): Promise<WordRecord | null> {
	const record = await db.words.get(id);
	return record ?? null;
}

export async function getProgressByWordId(id: string): Promise<WordProgress | null> {
	const record = await db.progress.get(id);
	if (!record) {
		return null;
	}
	return {
		...record,
		reviewCount: record.reviewCount ?? 0,
		suspended: record.suspended ?? false
	};
}

export async function saveSession(state: SessionState | null): Promise<void> {
	if (!state) {
		await clearSessionState();
		return;
	}
	await persistSessionState({ ...state, updatedAt: Date.now() });
}

export async function loadSession(): Promise<SessionState | null> {
	const record: SessionStateRecord | undefined = await readSessionState();
	return record?.payload ?? null;
}

export async function importWordPack(
	pack: WordPack | { version: number; chapters: Array<{ chapter: number; words: WordEntry[] }> },
	source: WordRecord['source'] = 'custom'
): Promise<{ inserted: number }> {
	// Check if it's a chapters-based pack (like klett2.json)
	const chaptersResult = chaptersPackSchema.safeParse(pack);
	let words: WordEntry[] = [];

	if (chaptersResult.success) {
		// Flatten chapters into words array
		words = chaptersResult.data.chapters.flatMap((chapter) => chapter.words);
	} else {
		// Try regular word pack format
		const wordPackResult = wordPackSchema.safeParse(pack);
		if (!wordPackResult.success) {
			throw new Error('Ungültiges Wortpaket – bitte das JSON-Format prüfen.');
		}
		words = wordPackResult.data.words;
	}

	let inserted = 0;
	await db.transaction('rw', db.words, db.progress, async () => {
		for (const word of words) {
			const existingWord = await db.words.get(word.id);
			const existingProgress = await db.progress.get(word.id);
			const now = Date.now();
			if (existingWord) {
				await db.words.put({ ...existingWord, ...word, source, updatedAt: now });
			} else {
				await db.words.put({ ...word, source, createdAt: now, updatedAt: now } satisfies WordRecord);
			}

			if (existingProgress) {
				await db.progress.put({
					...existingProgress,
					suspended: false,
					reviewCount: existingProgress.reviewCount ?? 0
				});
			} else {
				await db.progress.put({
					wordId: word.id,
					bucket: 'learning',
					streak: 0,
					lastReviewedAt: 0,
					nextDueAt: now,
					pinyinAttempts: 0,
					writingAttempts: 0,
					lastResult: 'failure',
					reviewCount: 0,
					suspended: false
				});
			}

			if (!existingWord) {
				inserted += 1;
			}
		}
	});

	return { inserted };
}

export async function upsertWord(word: WordEntry, source: WordRecord['source'] = 'custom'): Promise<void> {
	await db.transaction('rw', db.words, db.progress, async () => {
		const existing = await db.words.get(word.id);
		const now = Date.now();
		if (existing) {
			await db.words.put({ ...existing, ...word, source, updatedAt: now });
			return;
		}

		await db.words.put({ ...word, source, createdAt: now, updatedAt: now });
		await db.progress.put({
			wordId: word.id,
			bucket: 'learning',
			streak: 0,
			lastReviewedAt: 0,
			nextDueAt: now,
			pinyinAttempts: 0,
			writingAttempts: 0,
			lastResult: 'failure'
		});
	});
}

export async function exportSnapshot(): Promise<ExportSnapshot> {
	const [settingsRecord, progress, words] = await Promise.all([
		db.ensureSettings(),
		db.progress.toArray(),
		db.words.toArray()
	]);

	const payload: ExportSnapshot = {
		settings: settingsRecord.payload,
		progress,
		customWords: words.filter((word) => word.source === 'custom'),
		lastUpdated: Date.now()
	};

	const parsed = exportSnapshotSchema.safeParse(payload);
	if (!parsed.success) {
		throw new Error('Export fehlgeschlagen – ungültige Daten.');
	}

	return parsed.data;
}

export async function importSnapshot(snapshot: ExportSnapshot): Promise<void> {
	const parsed = exportSnapshotSchema.safeParse(snapshot);
	if (!parsed.success) {
		throw new Error('Ungültige Sicherungsdatei.');
	}

	const data = parsed.data;
	await db.transaction('rw', db.words, db.progress, db.settings, async () => {
		await db.settings.put({ id: 'default', payload: data.settings, updatedAt: Date.now() });

		for (const progress of data.progress) {
			await db.progress.put({
				...progress,
				suspended: progress.suspended ?? false,
				reviewCount: progress.reviewCount ?? 0
			});
		}

		for (const word of data.customWords) {
			await db.words.put({
				...word,
				source: 'custom',
				createdAt: snapshot.lastUpdated,
				updatedAt: Date.now()
			});
		}
	});
}

export async function listAllWords(): Promise<WordRecord[]> {
	return db.words.toArray();
}

export async function suspendWord(wordId: string): Promise<void> {
	await db.transaction('rw', db.progress, async () => {
		const record = await db.progress.get(wordId);
		if (!record) return;
		await db.progress.put({ ...record, suspended: true });
	});
}

export async function resumeWord(wordId: string): Promise<void> {
	await db.transaction('rw', db.progress, async () => {
		const record = await db.progress.get(wordId);
		if (!record) return;
		await db.progress.put({ ...record, suspended: false });
	});
}

export async function searchWordsByPrompt(query: string, limit = 8): Promise<WordRecord[]> {
	const term = query.trim().toLowerCase();
	if (!term) {
		return [];
	}

	return db.words
		.where('promptLanguage')
		.equals('de')
		.and((word) => word.prompt.toLowerCase().includes(term))
		.limit(limit)
		.toArray();
}

export interface KlettChapterSummary {
	chapter: number;
	wordCount: number;
}

export function getKlettChapterSummaries(): KlettChapterSummary[] {
	return klettChapters.map((chapter) => ({
		chapter: chapter.chapter,
		wordCount: chapter.words.length
	}));
}

export function getKlettTotalWordCount(): number {
	return totalKlettWords;
}

export async function importKlettChapters(selection: 'all' | number | number[]): Promise<{ inserted: number }> {
	const numbers =
		selection === 'all'
			? klettChapters.map((chapter) => chapter.chapter)
			: Array.isArray(selection)
				? selection
				: [selection];

	const selected = klettChapters.filter((chapter) => numbers.includes(chapter.chapter));
	const words = selected.flatMap((chapter) => chapter.words);
	if (words.length === 0) {
		return { inserted: 0 };
	}

	return importWordPack(
		{
			version: 1,
			words
		},
		'built-in'
	);
}

export async function suspendKlettChapters(selection: 'all' | number | number[]): Promise<number> {
	const chapterNumbers =
		selection === 'all'
			? klettChapters.map((chapter) => chapter.chapter)
			: Array.isArray(selection)
				? selection
				: [selection];

	const wordIds = klettChapters
		.filter((chapter) => chapterNumbers.includes(chapter.chapter))
		.flatMap((chapter) => chapter.words.map((word) => word.id));

	if (wordIds.length === 0) {
		return 0;
	}

	let affected = 0;
	await db.transaction('rw', db.progress, async () => {
		for (const wordId of wordIds) {
			const progress = await db.progress.get(wordId);
			if (!progress || progress.suspended) continue;
			await db.progress.put({ ...progress, suspended: true });
			affected += 1;
		}
	});

	return affected;
}

// New generic library functions
export function getAvailableLibraries() {
	return availableLibraries;
}

export function getLibraryChapters(libraryId: LibraryType) {
	return getChaptersForLibrary(libraryId);
}

export async function importLibraryChapters(
	libraryId: LibraryType, 
	chapterIds: string[]
): Promise<{ inserted: number }> {
	const words = getWordsForChapters(libraryId, chapterIds);
	
	if (words.length === 0) {
		return { inserted: 0 };
	}

	return importWordPack(
		{
			version: 1,
			words
		},
		'built-in'
	);
}

export async function suspendLibraryChapters(
	libraryId: LibraryType,
	chapterIds: string[]
): Promise<number> {
	const words = getWordsForChapters(libraryId, chapterIds);
	const wordIds = words.map((word) => word.id);

	if (wordIds.length === 0) {
		return 0;
	}

	let affected = 0;
	await db.transaction('rw', db.progress, async () => {
		for (const wordId of wordIds) {
			const progress = await db.progress.get(wordId);
			if (!progress || progress.suspended) continue;
			await db.progress.put({ ...progress, suspended: true });
			affected += 1;
		}
	});

	return affected;
}
