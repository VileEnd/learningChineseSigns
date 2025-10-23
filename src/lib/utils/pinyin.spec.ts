import { describe, expect, it } from 'vitest';
import { comparePinyin, convertNumericToToneMarks, parsePinyin } from './pinyin';

describe('pinyin utilities', () => {
	it('splits multi-syllable tone-mark strings correctly', () => {
		const parsed = parsePinyin('bàba');
		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toMatchObject({ letters: 'ba', tone: 4 });
		expect(parsed[1]).toMatchObject({ letters: 'ba', tone: 5 });
	});

	it('accepts numeric input without trailing neutral tone digits', () => {
		const result = comparePinyin(
			'ba4ba',
			{ pinyin: 'bàba', alternatePinyin: ['ba4 ba0'] },
			{ enforceTone: true }
		);
		expect(result.match).toBe(true);
		expect(result.toneMismatch).toBe(false);
		expect(result.normalizedTarget).toBe('ba4ba');
	});

	it('flags incorrect tone when enforcement is enabled', () => {
		const result = comparePinyin(
			'ba1ba',
			{ pinyin: 'bàba', alternatePinyin: ['ba4 ba0'] },
			{ enforceTone: true }
		);
		expect(result.match).toBe(false);
		expect(result.toneMismatch).toBe(true);
	});

	it('converts numeric tones to marked vowels', () => {
		expect(convertNumericToToneMarks('pi1')).toBe('pī');
		expect(convertNumericToToneMarks('lv4')).toBe('lǜ');
		expect(convertNumericToToneMarks('lu:4')).toBe('lǜ');
		expect(convertNumericToToneMarks('shang4 ge4')).toBe('shàng gè');
		expect(convertNumericToToneMarks("nv3 peng2you0")).toBe('nǚ péngyou');
	});
});
