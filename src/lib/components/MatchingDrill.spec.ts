import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import MatchingDrill from './MatchingDrill.svelte';

afterEach(() => cleanup());

describe('MatchingDrill accessibility', () => {
	const sampleWords = [
		{
			id: 'word-1',
			prompt: 'Hallo',
			pinyin: 'nǐ hǎo',
			characters: ['你', '好']
		},
		{
			id: 'word-2',
			prompt: 'Danke',
			pinyin: 'xièxie',
			characters: ['谢', '谢']
		}
	];

	test('arrow keys shift focus between cards', async () => {
		const { getAllByRole } = render(MatchingDrill, {
			props: { words: sampleWords, roundId: 1 }
		});
		const cards = getAllByRole('button');
		cards[0].focus();
		await fireEvent.keyDown(cards[0], { key: 'ArrowRight' });
		expect(document.activeElement).toBe(cards[1]);

		await fireEvent.keyDown(cards[1], { key: 'End' });
		expect(document.activeElement).toBe(cards[cards.length - 1]);
	});

	test('status message is exposed via role status', () => {
		const { getByRole } = render(MatchingDrill, {
			props: { words: sampleWords, roundId: 2 }
		});
		const statusElement = getByRole('status');
		expect(statusElement.textContent).toContain('Wähle die passenden Kombinationen');
	});
});
