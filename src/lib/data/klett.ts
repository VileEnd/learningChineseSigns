import klettRaw from '$lib/assets/klett.json?raw';
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

export interface KlettChapter {
	chapter: number;
	version: number;
	words: WordEntry[];
}

function parseChapters(source: string): KlettChapter[] {
	const cleaned = source
		.replace(/\uFEFF/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^[\t ]*\/\/.*$/gm, '');

	const chunks: string[] = [];
	let depth = 0;
	let start = -1;

	for (let index = 0; index < cleaned.length; index += 1) {
		const char = cleaned[index];
		if (char === '{') {
			if (depth === 0) {
				start = index;
			}
			depth += 1;
		} else if (char === '}') {
			if (depth > 0) {
				depth -= 1;
				if (depth === 0 && start !== -1) {
					chunks.push(cleaned.slice(start, index + 1));
					start = -1;
				}
			}
		}
	}

	return chunks
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => JSON.parse(chunk) as RawChapter)
		.map((chapter) => {
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
				version: chapter.version ?? 1,
				words
			};
		});
}

export const klettChapters = parseChapters(klettRaw);

export const totalKlettWords = klettChapters.reduce((count, chapter) => count + chapter.words.length, 0);
