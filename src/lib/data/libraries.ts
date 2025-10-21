import { klettChapters, totalKlettWords } from './klett';
import { hskLevels, totalHSKWords } from './hsk';
import type { WordEntry } from '$lib/types';

export type LibraryType = 'klett' | 'hsk';

export interface LibraryInfo {
	id: LibraryType;
	name: string;
	totalWords: number;
}

export interface ChapterInfo {
	id: string;
	label: string;
	wordCount: number;
}

export const availableLibraries: LibraryInfo[] = [
	{
		id: 'klett',
		name: 'Klett Lehrbuch',
		totalWords: totalKlettWords
	},
	{
		id: 'hsk',
		name: 'HSK Vocabulary',
		totalWords: totalHSKWords
	}
];

export function getChaptersForLibrary(libraryId: LibraryType): ChapterInfo[] {
	if (libraryId === 'klett') {
		return klettChapters.map((chapter) => ({
			id: `klett-${chapter.chapter}`,
			label: `Kapitel ${chapter.chapter}`,
			wordCount: chapter.words.length
		}));
	} else if (libraryId === 'hsk') {
		return hskLevels.map((level) => ({
			id: `hsk-${level.level}`,
			label: level.level,
			wordCount: level.words.length
		}));
	}
	return [];
}

export function getWordsForChapters(libraryId: LibraryType, chapterIds: string[]): WordEntry[] {
	if (libraryId === 'klett') {
		const chapterNumbers = chapterIds
			.filter((id) => id.startsWith('klett-'))
			.map((id) => Number(id.replace('klett-', '')))
			.filter((num) => !isNaN(num));

		return klettChapters
			.filter((chapter) => chapterNumbers.includes(chapter.chapter))
			.flatMap((chapter) => chapter.words);
	} else if (libraryId === 'hsk') {
		const levels = chapterIds
			.filter((id) => id.startsWith('hsk-'))
			.map((id) => id.replace('hsk-', ''));

		return hskLevels
			.filter((level) => levels.includes(level.level))
			.flatMap((level) => level.words);
	}
	return [];
}

export function getAllChapterIdsForLibrary(libraryId: LibraryType): string[] {
	return getChaptersForLibrary(libraryId).map((chapter) => chapter.id);
}
