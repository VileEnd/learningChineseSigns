import klettData from '$lib/assets/klett2.json';
import type { WordEntry } from '$lib/types';

interface RawWord {
	id?: string;
	prompt?: string;
	pinyin?: string;
	characters?: string[];
	alternatePinyin?: string[];
}

interface RawChapter {
	version?: number;
	chapter: number;
	words: RawWord[];
}

interface KlettJsonStructure {
	version: number;
	chapters: RawChapter[];
}

export interface KlettChapter {
	chapter: number;
	version: number;
	words: WordEntry[];
}

function parseChapters(data: KlettJsonStructure): KlettChapter[] {
	return (data.chapters ?? []).map((chapter) => {
		const words: WordEntry[] = (chapter.words ?? [])
			.filter(
				(word): word is Required<Pick<RawWord, 'id' | 'prompt' | 'pinyin' | 'characters'>> & RawWord =>
					Boolean(word.id && word.prompt && word.pinyin && Array.isArray(word.characters) && word.characters.length > 0)
			)
			.map((word, index) => ({
				id: `${word.id}-c${chapter.chapter}-${index}`,
				prompt: word.prompt!,
				promptLanguage: 'de',
				pinyin: word.pinyin!,
				characters: word.characters!,
				alternatePinyin: word.alternatePinyin?.filter(Boolean)
			}));

		return {
			chapter: chapter.chapter,
			version: chapter.version ?? data.version ?? 1,
			words
		};
	});
}

export const klettChapters = parseChapters(klettData as KlettJsonStructure);

export const totalKlettWords = klettChapters.reduce((count, chapter) => count + chapter.words.length, 0);
