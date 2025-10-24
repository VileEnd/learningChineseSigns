import type { LearningBucket, LessonSummary, WordProgress } from '../types';

const DAY_MS = 86_400_000;

const bucketPriority: Record<LearningBucket, number> = {
	learning: 0,
	reinforce: 1,
	known: 2
};

function deriveQuality(summary: LessonSummary): number {
	if (!summary.success) {
		switch (summary.stageReached) {
			case 'pinyin':
				return 0;
			case 'writing':
				return 1;
			default:
				return 2;
		}
	}

	let quality = 5;

	if (summary.pinyinAttempts >= 3) {
		quality -= 2;
	} else if (summary.pinyinAttempts === 2) {
		quality -= 1;
	}

	if (summary.writingAttempts >= 6) {
		quality -= 2;
	} else if (summary.writingAttempts >= 4) {
		quality -= 1;
	}

	if (summary.stageReached === 'writing-guided-half') {
		quality = Math.min(quality, 4);
	}

	if (summary.stageReached === 'writing-guided-full') {
		quality = Math.min(quality, 3);
	}

	return Math.max(3, Math.min(5, quality));
}

function determineBucket(repetitions: number, interval: number, quality: number): LearningBucket {
	if (quality < 3 || repetitions <= 1 || interval <= 1) {
		return 'learning';
	}

	if (interval < 14) {
		return 'reinforce';
	}

	return 'known';
}

function updateEasiness(previous: number, quality: number): number {
	const adjustment = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
	const next = previous + adjustment;
	return Math.min(3.5, Math.max(1.3, Number.isFinite(next) ? next : previous));
}

export function scheduleNextReview(progress: WordProgress, summary: LessonSummary): WordProgress {
	const now = summary.timestamp ?? Date.now();
	const previousRepetitions = progress.sm2Repetitions ?? 0;
	const previousInterval = progress.sm2Interval ?? 1;
	const previousEasiness = progress.sm2Easiness ?? 2.5;

	const quality = deriveQuality(summary);
	let easiness = updateEasiness(previousEasiness, quality);
	let repetitions = previousRepetitions;
	let interval = previousInterval <= 0 ? 1 : previousInterval;

	if (quality < 3) {
		repetitions = 0;
		interval = 1;
	} else {
		repetitions += 1;
		if (repetitions === 1) {
			interval = 1;
		} else if (repetitions === 2) {
			interval = 6;
		} else {
			interval = Math.max(1, Math.round(interval * easiness));
		}
	}

	const nextDueAt = now + interval * DAY_MS;
	const bucket = determineBucket(repetitions, interval, quality);
	const reviewCount = (progress.reviewCount ?? 0) + 1;
	const streak = quality >= 4 ? (progress.streak ?? 0) + 1 : 0;
	const lastResult = quality >= 3 ? 'success' : 'failure';

	return {
		...progress,
		bucket,
		streak,
		lastReviewedAt: now,
		nextDueAt,
		reviewCount,
		lastResult,
		pinyinAttempts: summary.pinyinAttempts,
		writingAttempts: summary.writingAttempts,
		suspended: false,
		sm2Repetitions: repetitions,
		sm2Interval: interval,
		sm2Easiness: easiness,
		sm2LastQuality: quality
	};
}

export function selectNextCandidate(progressList: WordProgress[]): WordProgress | null {
	if (progressList.length === 0) {
		return null;
	}

	const now = Date.now();

	return [...progressList]
		.sort((a, b) => {
			const overdueA = a.nextDueAt <= now ? 0 : 1;
			const overdueB = b.nextDueAt <= now ? 0 : 1;
			if (overdueA !== overdueB) return overdueA - overdueB;

			const dueDelta = a.nextDueAt - b.nextDueAt;
			if (dueDelta !== 0) return dueDelta;

			const bucketDelta = bucketPriority[a.bucket] - bucketPriority[b.bucket];
			if (bucketDelta !== 0) return bucketDelta;

			const qualityDelta = (a.sm2LastQuality ?? 0) - (b.sm2LastQuality ?? 0);
			if (qualityDelta !== 0) return qualityDelta;

			return (a.lastReviewedAt ?? 0) - (b.lastReviewedAt ?? 0);
		})[0] ?? null;
}
