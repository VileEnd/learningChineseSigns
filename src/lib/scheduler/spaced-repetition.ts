import type { LearningBucket, LessonSummary, WordProgress } from '../types';

const BUCKET_SEQUENCE: LearningBucket[] = ['learning', 'reinforce', 'known'];

const BUCKET_INTERVALS: Record<LearningBucket, number> = {
	learning: 1000 * 60 * 60, // 1 hour
	reinforce: 1000 * 60 * 60 * 12, // 12 hours
	known: 1000 * 60 * 60 * 24 * 5 // 5 days
};

export function advanceBucket(current: LearningBucket, success: boolean): LearningBucket {
	if (!success) {
		return 'learning';
	}

	const index = BUCKET_SEQUENCE.indexOf(current);
	const nextIndex = Math.min(index + 1, BUCKET_SEQUENCE.length - 1);
	return BUCKET_SEQUENCE[nextIndex] ?? 'known';
}

export function regressBucket(current: LearningBucket): LearningBucket {
	if (current === 'learning') {
		return 'learning';
	}

	return 'learning';
}

export function scheduleNextReview(
	progress: WordProgress,
	summary: LessonSummary
): WordProgress {
	const success = summary.success;
	const bucket = success ? advanceBucket(progress.bucket, true) : regressBucket(progress.bucket);
	const nextDueAt = Date.now() + BUCKET_INTERVALS[bucket];

	return {
		...progress,
		bucket,
		streak: success ? progress.streak + 1 : 0,
		lastReviewedAt: summary.timestamp,
		nextDueAt,
		lastResult: success ? 'success' : 'failure',
		pinyinAttempts: summary.pinyinAttempts,
		writingAttempts: summary.writingAttempts,
		suspended: false
	};
}

export function selectNextCandidate(progressList: WordProgress[]): WordProgress | null {
	const available = progressList.filter((item) => !item.suspended);
	const pool = available.length > 0 ? available : progressList;
	if (pool.length === 0) {
		return null;
	}

	const now = Date.now();
	const due = pool
		.filter((item) => item.nextDueAt <= now)
		.sort((a, b) => a.nextDueAt - b.nextDueAt);

	if (due.length > 0) {
		return due[0];
	}

	return pool.sort((a, b) => a.nextDueAt - b.nextDueAt)[0] ?? null;
}
