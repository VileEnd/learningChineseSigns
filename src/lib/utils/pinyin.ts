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

const toneMarksByVowel: Record<string, [string, string, string, string]> = {
	a: ['ā', 'á', 'ǎ', 'à'],
	e: ['ē', 'é', 'ě', 'è'],
	i: ['ī', 'í', 'ǐ', 'ì'],
	o: ['ō', 'ó', 'ǒ', 'ò'],
	u: ['ū', 'ú', 'ǔ', 'ù'],
	v: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
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
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'v']);
const INITIAL_STARTERS = new Set(['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']);
const LETTER_PATTERN = /[a-zA-ZüÜvV:'’:]/;

function normalizedLetter(char: string | undefined): string | null {
	if (!char) return null;
	const lower = char.toLowerCase();
	if (toneMarkMap[lower]) {
		return toneMarkMap[lower].base;
	}
	if (lower === '\u00fc') {
		return 'v';
	}
	if (lower >= 'a' && lower <= 'z') {
		return lower;
	}
	return null;
}

function shouldStartNewSyllable(
	letter: string,
	nextLetter: string | null,
	pendingTone: number | null,
	buffer: string,
	lastLetter: string | null
): boolean {
	if (!buffer || pendingTone === null) {
		return false;
	}
	if (!INITIAL_STARTERS.has(letter)) {
		return false;
	}
	if (letter === 'h' && lastLetter && (lastLetter === 'c' || lastLetter === 's' || lastLetter === 'z')) {
		return false;
	}
	if (letter === 'g' && lastLetter === 'n' && (!nextLetter || !VOWELS.has(nextLetter))) {
		return false;
	}
	if (letter === 'r' && (!nextLetter || !VOWELS.has(nextLetter))) {
		return false;
	}
	if (letter === 'n' && (!nextLetter || !VOWELS.has(nextLetter))) {
		return false;
	}
	if (letter === 'm' && (!nextLetter || !VOWELS.has(nextLetter))) {
		return false;
	}
	return true;
}

function splitIntoSyllables(input: string): string[] {
	const tokens: string[] = [];
	let buffer = '';
	const normalized = input.normalize('NFC');
	let pendingTone: number | null = null;
	let lastLetter: string | null = null;

	const pushBuffer = () => {
		if (!buffer) {
			pendingTone = null;
			lastLetter = null;
			return;
		}
		if (pendingTone !== null && pendingTone !== 5 && !/\d$/.test(buffer)) {
			buffer += String(pendingTone);
		}
		const trimmed = buffer.trim();
		if (trimmed.length > 0) {
			tokens.push(trimmed);
		}
		buffer = '';
		pendingTone = null;
		lastLetter = null;
	};

	for (let index = 0; index < normalized.length; index += 1) {
		const rawChar = normalized[index];
		const lower = rawChar.toLowerCase();
		const nextLower = normalizedLetter(normalized[index + 1]);
		if (SYLLABLE_SEPARATORS.has(lower) || lower === "'" || lower === '’') {
			pushBuffer();
			continue;
		}
		if (toneMarkMap[lower]) {
			const { base, tone } = toneMarkMap[lower];
			buffer += base;
			lastLetter = base;
			if (tone !== 5) {
				pendingTone = tone;
			}
			continue;
		}
		if (digitToneMap[lower] !== undefined) {
			const detectedTone = digitToneMap[lower];
			pendingTone = detectedTone;
			if (detectedTone !== 5 && !/\d$/.test(buffer)) {
				buffer += lower;
			}
			pushBuffer();
			continue;
		}
		const candidateLetter = normalizedLetter(rawChar);
		if (!candidateLetter) {
			continue;
		}
		if (shouldStartNewSyllable(candidateLetter, nextLower, pendingTone, buffer, lastLetter)) {
			pushBuffer();
		}
		buffer += candidateLetter;
		lastLetter = candidateLetter;
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

function formatNumericPinyin(syllables: ParsedSyllable[]): string {
	return syllables
		.map(({ letters, tone }) => (tone === 5 ? letters : `${letters}${tone}`))
		.join('');
}

type LetterToken = {
	type: 'letter';
	base: string;
	uppercase: boolean;
};

type LiteralToken = {
	type: 'literal';
	value: string;
};

function chooseAccentToken(tokens: LetterToken[]): LetterToken | null {
	if (tokens.length === 0) {
		return null;
	}
	const baseSequence = tokens.map((token) => token.base).join('');
	if (!baseSequence) {
		return null;
	}
	const priority = ['a', 'e'];
	for (const vowel of priority) {
		const index = baseSequence.indexOf(vowel);
		if (index !== -1) {
			return tokens[index];
		}
	}
	const ouIndex = baseSequence.indexOf('ou');
	if (ouIndex !== -1) {
		return tokens[ouIndex];
	}
	for (let index = tokens.length - 1; index >= 0; index -= 1) {
		if (VOWELS.has(tokens[index].base)) {
			return tokens[index];
		}
	}
	return tokens[tokens.length - 1];
}

function applyToneToLetters(rawLetters: string, toneValue: number | null | undefined): string {
	const tokens: Array<LetterToken | LiteralToken> = [];
	let derivedTone: number | null = toneValue && toneValue >= 1 && toneValue <= 4 ? toneValue : null;

	for (let index = 0; index < rawLetters.length; index += 1) {
		const char = rawLetters[index];

		if (char === ':' && tokens.length > 0) {
			const lastToken = tokens[tokens.length - 1];
			if (lastToken?.type === 'letter' && lastToken.base === 'u') {
				lastToken.base = 'v';
				continue;
			}
		}

		if (char === "'" || char === '’') {
			tokens.push({ type: 'literal', value: char });
			continue;
		}

		if (!LETTER_PATTERN.test(char)) {
			tokens.push({ type: 'literal', value: char });
			continue;
		}

		const lowercase = char.toLowerCase();
		const accentInfo = toneMarkMap[lowercase];
		let base = lowercase;
		if (accentInfo) {
			base = accentInfo.base;
			if (derivedTone === null && accentInfo.tone !== 5) {
				derivedTone = accentInfo.tone;
			}
		}

		const uppercase = char !== lowercase;
		tokens.push({ type: 'letter', base, uppercase });
	}

	const letterTokens = tokens.filter((token): token is LetterToken => token.type === 'letter');
	const toneToApply = derivedTone && derivedTone >= 1 && derivedTone <= 4 ? derivedTone : null;
	const accentTarget = toneToApply ? chooseAccentToken(letterTokens) : null;

	return tokens
		.map((token) => {
			if (token.type === 'literal') {
				return token.value;
			}
			const base = token.base;
			const plainLetter = base === 'v' ? 'ü' : base;
			if (accentTarget && token === accentTarget) {
				const marks = toneMarksByVowel[base];
				if (marks) {
					const letter = marks[toneToApply! - 1];
					return token.uppercase ? letter.toUpperCase() : letter;
				}
			}
			return token.uppercase ? plainLetter.toUpperCase() : plainLetter;
		})
		.join('');
}

function convertLettersSegment(segment: string): string {
	const match = segment.match(/^([a-zA-ZüÜvV:'’]+?)([0-5])$/);
	if (match) {
		const [, letters, toneDigit] = match;
		const tone = digitToneMap[toneDigit] ?? 5;
		return applyToneToLetters(letters, tone);
	}
	if (/^[a-zA-ZüÜvV:'’]+$/.test(segment)) {
		return applyToneToLetters(segment, null);
	}
	return segment;
}

export function convertNumericToToneMarks(input: string): string {
	const pieces: string[] = [];
	let buffer = '';

	const flushBuffer = () => {
		if (!buffer) return;
		pieces.push(convertLettersSegment(buffer));
		buffer = '';
	};

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (LETTER_PATTERN.test(char)) {
			buffer += char;
			continue;
		}
		if (digitToneMap[char] !== undefined) {
			buffer += char;
			flushBuffer();
			continue;
		}
		flushBuffer();
		pieces.push(char);
	}

	flushBuffer();
	return pieces.join('');
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
			normalizedTarget: formatNumericPinyin(parsedTarget)
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
