import hsk1Data from '$lib/assets/hsk1.json';
import type { WordEntry } from '$lib/types';

interface RawWord {
	id?: string;
	prompt?: string;
	pinyin?: string;
	characters?: string[];
	alternatePinyin?: string[];
}

interface RawHSKLevel {
	version?: number;
	chapter: string;
	words: RawWord[];
}

export interface HSKLevel {
	level: string;
	version: number;
	words: WordEntry[];
}

function parseHSKLevel(data: RawHSKLevel, levelName: string): HSKLevel {
	const words: WordEntry[] = (data.words ?? [])
		.filter(
			(word): word is Required<Pick<RawWord, 'id' | 'prompt' | 'pinyin' | 'characters'>> & RawWord =>
				Boolean(word.id && word.prompt && word.pinyin && Array.isArray(word.characters) && word.characters.length > 0)
		)
		.map((word, index) => ({
			id: `${word.id}-hsk-${levelName}-${index}`,
			prompt: word.prompt!,
			promptLanguage: 'en',
			pinyin: word.pinyin!,
			characters: word.characters!,
			alternatePinyin: word.alternatePinyin?.filter(Boolean)
		}));

	return {
		level: levelName,
		version: data.version ?? 1,
		words
	};
}

export const hskLevels: HSKLevel[] = [
	parseHSKLevel(hsk1Data as RawHSKLevel, 'HSK1')
];

export const totalHSKWords = hskLevels.reduce((count, level) => count + level.words.length, 0);
