import type { WordEntry } from '$lib/types';

import { browser } from '$app/environment';

export type LibraryType = string;

interface RawWord {
	id?: string;
	prompt?: string;
	promptLanguage?: string;
	pinyin?: string;
	characters?: string[] | string;
	alternatePinyin?: string[] | string;
	hints?: {
		audio?: string;
		note?: string;
	};
}

interface RawChapter {
	chapter?: number | string;
	label?: string;
	words?: RawWord[];
}

interface RawLibrary {
	version?: number;
	libraryId?: string;
	name?: string;
	promptLanguage?: string;
	chapters?: RawChapter[];
	chapter?: number | string;
	words?: RawWord[];
}

interface LibraryChapter {
	id: string;
	label: string;
	wordCount: number;
	words: WordEntry[];
	order: number;
	rawChapterLabel: string;
	numericChapter?: number;
}

interface LibraryData {
	id: LibraryType;
	name: string;
	promptLanguage: string;
	totalWords: number;
	chapters: LibraryChapter[];
	sourcePath: string;
}

export interface ChapterInfo {
	id: string;
	label: string;
	wordCount: number;
	order: number;
	numericChapter?: number;
}

export interface LibraryInfo {
	id: LibraryType;
	name: string;
	totalWords: number;
}

let libraries: LibraryData[] = [];
const libraryMap = new Map<LibraryType, LibraryData>();
const LIBRARY_INDEX_URL = '/library/index.json';
const LIBRARY_CACHE_KEY = 'lcs-library-cache-v1';
const fallbackPromptLanguage = 'de';
let loadPromise: Promise<void> | null = null;

function slugify(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
}

function titleize(value: string): string {
	return value
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase()) || 'Vokabular';
}

function ensureArray<T>(input: T | T[] | undefined): T[] {
	if (!input) return [];
	return Array.isArray(input) ? input : [input];
}

function normaliseWord(raw: RawWord, fallbackLanguage: string, generatedId: string): WordEntry | null {
	if (!raw.pinyin || !raw.prompt) {
		return null;
	}

	const charactersArray = ensureArray(raw.characters).filter((char): char is string => typeof char === 'string' && char.trim().length > 0);
	if (charactersArray.length === 0) {
		return null;
	}

	const alternateArray = ensureArray(raw.alternatePinyin)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	return {
		id: raw.id?.trim() || generatedId,
		prompt: raw.prompt.trim(),
		promptLanguage: raw.promptLanguage?.trim() || fallbackLanguage,
		pinyin: raw.pinyin.trim(),
		characters: charactersArray,
		...(alternateArray.length > 0 ? { alternatePinyin: alternateArray } : {}),
		...(raw.hints ? { hints: raw.hints } : {})
	};
}

function buildChapterId(libraryId: string, rawValue: string, index: number, usedIds: Set<string>): string {
	const slugBase = slugify(rawValue) || `chapter-${index + 1}`;
	let candidate = `${libraryId}-${slugBase}`;
	let counter = 2;
	while (usedIds.has(candidate)) {
		candidate = `${libraryId}-${slugBase}-${counter++}`;
	}
	usedIds.add(candidate);
	return candidate;
}

function parseLibrary(sourcePath: string, raw: RawLibrary, usedLibraryIds: Set<string>): LibraryData | null {
	const fileName = sourcePath.split('/').pop() ?? 'library.json';
	const baseName = fileName.replace(/\.json$/i, '');
	const requestedId = raw.libraryId?.trim() || slugify(baseName) || 'library';
	let libraryId = requestedId;
	let counter = 2;
	while (usedLibraryIds.has(libraryId)) {
		libraryId = `${requestedId}-${counter++}`;
	}
	usedLibraryIds.add(libraryId);

	const promptLanguage = raw.promptLanguage?.trim() || fallbackPromptLanguage;
	const libraryName = raw.name?.trim() || titleize(baseName);

	const rawChapters: RawChapter[] = Array.isArray(raw.chapters)
		? raw.chapters
		: raw.words
			? [
				{
					chapter: raw.chapter ?? 1,
					words: raw.words
				}
			]
			: [];

	const chapterIdSet = new Set<string>();
	const chapters: LibraryChapter[] = [];

	rawChapters.forEach((chapter, index) => {
		const chapterWords = ensureArray(chapter.words)
			.map((word, wordIndex) => normaliseWord(word, promptLanguage, `w-${libraryId}-${index + 1}-${wordIndex + 1}`))
			.filter((word): word is WordEntry => word !== null);

		if (chapterWords.length === 0) {
			return;
		}

		const rawLabelValue = (chapter.label ?? chapter.chapter ?? index + 1).toString();
		const numericChapter = typeof chapter.chapter === 'number'
			? chapter.chapter
			: Number.isFinite(Number(chapter.chapter))
				? Number(chapter.chapter)
				: undefined;
		const chapterLabel = typeof chapter.chapter === 'number'
			? `Kapitel ${chapter.chapter}`
			: rawLabelValue.trim();

		const id = buildChapterId(libraryId, rawLabelValue, index, chapterIdSet);

		const chapterEntry: LibraryChapter = {
			id,
			label: chapterLabel || `Kapitel ${index + 1}`,
			wordCount: chapterWords.length,
			words: chapterWords,
			order: index,
			rawChapterLabel: rawLabelValue
		};

		if (typeof numericChapter === 'number' && !Number.isNaN(numericChapter)) {
			chapterEntry.numericChapter = numericChapter;
		}

		chapters.push(chapterEntry);
	});

	if (chapters.length === 0) {
		return null;
	}

	const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);

	return {
		id: libraryId,
		name: libraryName,
		promptLanguage,
		totalWords,
		chapters,
		sourcePath
	};
}

async function loadLibraries(): Promise<void> {
	if (libraries.length > 0) {
		return;
	}
	if (loadPromise) {
		await loadPromise;
		return;
	}

	loadPromise = (async () => {
		if (browser) {
			try {
				const cached = localStorage.getItem(LIBRARY_CACHE_KEY);
				if (cached) {
					const parsed = JSON.parse(cached) as LibraryData[];
					libraries = parsed;
					libraryMap.clear();
					parsed.forEach((library) => {
						libraryMap.set(library.id, library);
					});
					return;
				}
			} catch (error) {
				console.warn('Bibliotheks-Cache konnte nicht gelesen werden.', error);
			}
		}

		if (!browser) {
			libraries = [];
			libraryMap.clear();
			return;
		}

		const indexResponse = await fetch(LIBRARY_INDEX_URL);
		if (!indexResponse.ok) {
			throw new Error(`Bibliotheksindex konnte nicht geladen werden (${indexResponse.status})`);
		}
		const files = (await indexResponse.json()) as string[];
		const usedLibraryIds = new Set<string>();
		const parsedLibraries: LibraryData[] = [];

		for (const fileName of files) {
			try {
				const response = await fetch(`/library/${fileName}`);
				if (!response.ok) {
					console.warn(`Bibliothek konnte nicht geladen werden (${fileName}): ${response.status}`);
					continue;
				}
				const raw = (await response.json()) as RawLibrary;
				const parsed = parseLibrary(`/library/${fileName}`, raw, usedLibraryIds);
				if (!parsed) {
					console.warn(`Bibliothek ignoriert (keine gültigen Kapitel): ${fileName}`);
					continue;
				}
				parsedLibraries.push(parsed);
			} catch (error) {
				console.error(`Bibliothek ${fileName} konnte nicht verarbeitet werden.`, error);
			}
		}

		libraries = parsedLibraries;
		libraryMap.clear();
		libraries.forEach((library) => {
			libraryMap.set(library.id, library);
		});

		if (browser) {
			try {
				localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(libraries));
			} catch (error) {
				console.warn('Bibliotheks-Cache konnte nicht gespeichert werden.', error);
			}
		}
	})();

	await loadPromise;
}

export async function getAvailableLibraries(): Promise<LibraryInfo[]> {
	await loadLibraries();
	return libraries.map(({ id, name, totalWords }) => ({ id, name, totalWords }));
}

export async function getLibraryMetadata(libraryId: LibraryType): Promise<LibraryData | undefined> {
	await loadLibraries();
	return libraryMap.get(libraryId);
}

export async function getChaptersForLibrary(libraryId: LibraryType): Promise<ChapterInfo[]> {
	await loadLibraries();
	const library = libraryMap.get(libraryId);
	if (!library) {
		return [];
	}

	return library.chapters.map(({ id, label, wordCount, order, numericChapter }) => ({
		id,
		label,
		wordCount,
		order,
		numericChapter
	}));
}

export async function getWordsForChapters(libraryId: LibraryType, chapterIds: string[]): Promise<WordEntry[]> {
	await loadLibraries();
	const library = libraryMap.get(libraryId);
	if (!library || chapterIds.length === 0) {
		return [];
	}

	const selectedIds = new Set(chapterIds);
	return library.chapters
		.filter((chapter) => selectedIds.has(chapter.id))
		.flatMap((chapter) => chapter.words);
}

export async function getAllChapterIdsForLibrary(libraryId: LibraryType): Promise<string[]> {
	const chapters = await getChaptersForLibrary(libraryId);
	return chapters.map((chapter) => chapter.id);
}

export async function getLibraryTotalWordCount(libraryId: LibraryType): Promise<number> {
	await loadLibraries();
	return libraryMap.get(libraryId)?.totalWords ?? 0;
}

export async function listLibraries(): Promise<LibraryData[]> {
	await loadLibraries();
	return libraries.slice();
}
