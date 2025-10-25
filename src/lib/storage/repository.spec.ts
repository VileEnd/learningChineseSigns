import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type ProgressRecord } from './db';
import { recordLesson, recordMatchingRound } from './repository';
import type { LessonSummary } from '../types';

describe('repository transactions', () => {
	beforeAll(async () => {
		if (!db.isOpen()) {
			await db.open();
		}
	});

	afterAll(async () => {
		if (db.isOpen()) {
			await db.close();
		}
	});

	beforeEach(async () => {
		await db.transaction('rw', db.progress, db.summaries, async () => {
			await db.progress.clear();
			await db.summaries.clear();
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('records a single lesson update inside one transaction', async () => {
		await db.progress.put(createProgress('word-1'));
		const summary: LessonSummary = {
			wordId: 'word-1',
			success: true,
			stageReached: 'complete',
			pinyinAttempts: 1,
			writingAttempts: 2,
			timestamp: Date.now()
		};

		const transactionSpy = vi.spyOn(db, 'transaction');
		await recordLesson(summary);

		expect(transactionSpy).toHaveBeenCalledTimes(1);
		expect(transactionSpy.mock.calls[0][0]).toBe('rw');
		const summaries = await db.summaries.toArray();
		expect(summaries).toHaveLength(1);
		expect(summaries[0]?.wordId).toBe('word-1');
	});

	it('records an entire matching round within a single transaction', async () => {
		await db.progress.bulkPut([
			createProgress('matching-1'),
			createProgress('matching-2')
		]);

		const transactionSpy = vi.spyOn(db, 'transaction');
		await recordMatchingRound(['matching-1', 'matching-2']);

		expect(transactionSpy).toHaveBeenCalledTimes(1);
		expect(transactionSpy.mock.calls[0][0]).toBe('rw');
		const summaries = await db.summaries.orderBy('timestamp').toArray();
		expect(summaries).toHaveLength(2);
		expect(summaries.map((entry) => entry.wordId)).toEqual(['matching-1', 'matching-2']);
	});
});

function createProgress(wordId: string): ProgressRecord {
	const now = Date.now();
	return {
		wordId,
		bucket: 'learning',
		streak: 0,
		lastReviewedAt: now,
		nextDueAt: now,
		pinyinAttempts: 0,
		writingAttempts: 0,
		lastResult: 'failure',
		reviewCount: 0,
		suspended: false,
		sm2Repetitions: 0,
		sm2Interval: 1,
		sm2Easiness: 2.5,
		sm2LastQuality: 0
	};
}
