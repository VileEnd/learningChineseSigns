import type { LearningBucket, LessonSummary, WordProgress } from '../types';

const BUCKET_SEQUENCE: LearningBucket[] = ['learning', 'reinforce', 'known'];

function bucketFromStreak(streak: number): LearningBucket {
	if (streak >= 5) {
		return 'known';
	}

	if (streak >= 2) {
		return 'reinforce';
	}

	return 'learning';
}

const bucketWeights: Record<LearningBucket, number> = {
	learning: 0,
	reinforce: 1,
	known: 2
};

export function scheduleNextReview(
	progress: WordProgress,
	summary: LessonSummary
): WordProgress {
	const success = summary.success;
	const streak = success ? progress.streak + 1 : 0;
	const bucket = bucketFromStreak(streak);
	const reviewCount = (progress.reviewCount ?? 0) + 1;

	return {
		...progress,
		bucket,
		streak,
		lastReviewedAt: summary.timestamp,
		nextDueAt: reviewCount,
		reviewCount,
		lastResult: success ? 'success' : 'failure',
		pinyinAttempts: summary.pinyinAttempts,
		writingAttempts: summary.writingAttempts,
		suspended: false
	};
}

export function selectNextCandidate(progressList: WordProgress[]): WordProgress | null {
	if (progressList.length === 0) {
		return null;
	}

	return [...progressList]
		.sort((a, b) => {
			const bucketDelta = bucketWeights[a.bucket] - bucketWeights[b.bucket];
			if (bucketDelta !== 0) return bucketDelta;

			const failureBiasA = a.lastResult === 'failure' ? 0 : 1;
			const failureBiasB = b.lastResult === 'failure' ? 0 : 1;
			if (failureBiasA !== failureBiasB) return failureBiasA - failureBiasB;

			const reviewDelta = (a.reviewCount ?? 0) - (b.reviewCount ?? 0);
			if (reviewDelta !== 0) return reviewDelta;

			return (a.lastReviewedAt ?? 0) - (b.lastReviewedAt ?? 0);
		})[0] ?? null;
}
