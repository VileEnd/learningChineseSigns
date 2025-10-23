import type { WordEntry } from '../types';

export interface ParsedSyllable {
	letters: string;
	tone: number; // 1-5 (5 = neutral)
}

const toneMarkMap: Record<string, { base: string; tone: number }> = {
	ā: { base: 'a', tone: 1 },
	á: { base: 'a', tone: 2 },
	ǎ: { base: 'a', tone: 3 },
	à: { base: 'a', tone: 4 },
	ē: { base: 'e', tone: 1 },
	é: { base: 'e', tone: 2 },
	ě: { base: 'e', tone: 3 },
	è: { base: 'e', tone: 4 },
	ī: { base: 'i', tone: 1 },
	í: { base: 'i', tone: 2 },
	ǐ: { base: 'i', tone: 3 },
	ì: { base: 'i', tone: 4 },
	ō: { base: 'o', tone: 1 },
	ó: { base: 'o', tone: 2 },
	ǒ: { base: 'o', tone: 3 },
	ò: { base: 'o', tone: 4 },
	ū: { base: 'u', tone: 1 },
	ú: { base: 'u', tone: 2 },
	ǔ: { base: 'u', tone: 3 },
	ù: { base: 'u', tone: 4 },
	ǖ: { base: 'v', tone: 1 },
	ǘ: { base: 'v', tone: 2 },
	ǚ: { base: 'v', tone: 3 },
	ǜ: { base: 'v', tone: 4 },
	ü: { base: 'v', tone: 5 }
};

const digitToneMap: Record<string, number> = {
	'1': 1,
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	'0': 5
};

export const pinyinDelimiters = /[\s\-··\.]+/g;

const SYLLABLE_SEPARATORS = new Set([' ', '\t', '\n', '\r', '-', '·', '•', '.', ',', ';', ':']);

function splitIntoSyllables(input: string): string[] {
	const tokens: string[] = [];
	let buffer = '';
	const normalized = input.normalize('NFC');

	const pushBuffer = () => {
		const trimmed = buffer.trim();
		if (trimmed.length > 0) {
			tokens.push(trimmed);
		}
		buffer = '';
	};

	for (const rawChar of normalized) {
		const lower = rawChar.toLowerCase();
		if (SYLLABLE_SEPARATORS.has(lower) || lower === "'" || lower === '’') {
			pushBuffer();
			continue;
		}
		if (digitToneMap[lower] !== undefined) {
			buffer += lower;
			pushBuffer();
			continue;
		}
		buffer += lower;
	}

	pushBuffer();
	return tokens;
}

export function parseSyllable(raw: string): ParsedSyllable {
	const normalized = raw
		.trim()
		.normalize('NFC')
		.toLowerCase();

	if (!normalized) {
		return { letters: '', tone: 5 };
	}

	let tone = 5;
	let letters = '';

	for (const char of normalized) {
		if (toneMarkMap[char]) {
			const { base, tone: detectedTone } = toneMarkMap[char];
			letters += base;
			if (detectedTone !== 5) {
				tone = detectedTone;
			}
			continue;
		}

		if (digitToneMap[char] !== undefined && normalized.endsWith(char)) {
			tone = digitToneMap[char];
			continue;
		}

		if (char >= 'a' && char <= 'z') {
			letters += char;
			continue;
		}

		if (char === '\u00fc') {
			letters += 'v';
			continue;
		}

		if (char === '\'') {
			continue;
		}
	}

	return { letters, tone };
}

export function parsePinyin(input: string): ParsedSyllable[] {
	return splitIntoSyllables(input)
		.map((syllable) => parseSyllable(syllable))
		.filter((syllable) => syllable.letters.length > 0);
}

export interface ComparePinyinOptions {
	enforceTone: boolean;
	allowNeutralToneMismatch?: boolean;
}

export interface PinyinComparisonResult {
	match: boolean;
	lettersMatch: boolean;
	toneMismatch: boolean;
	parsedInput: ParsedSyllable[];
	parsedTarget: ParsedSyllable[];
	normalizedTarget: string;
}

export function comparePinyin(
	input: string,
	targetEntry: Pick<WordEntry, 'pinyin' | 'alternatePinyin'>,
	options: ComparePinyinOptions
): PinyinComparisonResult {
	const { enforceTone, allowNeutralToneMismatch = true } = options;
	const candidates = [targetEntry.pinyin, ...(targetEntry.alternatePinyin ?? [])];
	const parsedInput = parsePinyin(input);

	for (const candidate of candidates) {
		const parsedTarget = parsePinyin(candidate);
		const lettersMatch =
			parsedInput.length === parsedTarget.length &&
			parsedInput.every((syllable, index) => syllable.letters === parsedTarget[index]?.letters);

		if (!lettersMatch) {
			continue;
		}

		const toneMismatch = parsedInput.some((syllable, index) => {
			const target = parsedTarget[index];
			if (!target) return true;

			if (allowNeutralToneMismatch && (syllable.tone === 5 || target.tone === 5)) {
				return false;
			}

			return syllable.tone !== target.tone;
		});

		const match = enforceTone ? !toneMismatch : true;

		return {
			match,
			lettersMatch: true,
			toneMismatch,
			parsedInput,
			parsedTarget,
			normalizedTarget: candidate
		};
	}

	return {
		match: false,
		lettersMatch: false,
		toneMismatch: false,
		parsedInput,
		parsedTarget: [],
		normalizedTarget: ''
	};
}

export function normalizeForDisplay(value: string): string {
	return parsePinyin(value)
		.map(({ letters, tone }) => (tone === 5 ? letters : `${letters}${tone}`))
		.join(' ');
}
