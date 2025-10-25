import { settings } from './settings';
import {
	getMatchingRound,
	getProgressByWordId,
	getWordById,
	loadSession,
	saveSession
} from '../storage/repository';
import type { MatchingRound, Settings, SessionState, WordProgress } from '../types';
import type { WordRecord } from '../storage/db';

export interface SettingsChange {
	current: Settings;
	previous: Settings | null;
}

export function watchSettingsChanges(callback: (change: SettingsChange) => void): () => void {
	let previous: Settings | null = null;
	return settings.subscribe((value) => {
		if (!value) {
			return;
		}
		callback({ current: value, previous });
		previous = value;
	});
}

export interface LessonHydration {
	snapshot: SessionState;
	word: WordRecord;
	progress: WordProgress;
}

export type MatchingRoundResult =
	| { type: 'success'; desiredCount: number; round: MatchingRound }
	| { type: 'insufficient'; desiredCount: number; round: null; message: string }
	| { type: 'error'; desiredCount: number; round: null; message: string };

let cachedLesson: LessonHydration | null | undefined;
let lessonCacheToken = 0;

export async function hydrateLessonState(options: { force?: boolean } = {}): Promise<LessonHydration | null> {
	const { force = false } = options;
	if (!force && cachedLesson !== undefined) {
		return cachedLesson;
	}
	const requestId = ++lessonCacheToken;
	const snapshot = await loadSession();
	if (!snapshot) {
		if (requestId === lessonCacheToken) {
			cachedLesson = null;
		}
		return null;
	}
	const word = await getWordById(snapshot.currentWordId);
	if (!word) {
		await saveSession(null);
		if (requestId === lessonCacheToken) {
			cachedLesson = null;
		}
		return null;
	}
	const progress = await getProgressByWordId(word.id);
	if (!progress || progress.suspended) {
		await saveSession(null);
		if (requestId === lessonCacheToken) {
			cachedLesson = null;
		}
		return null;
	}
	const result: LessonHydration = { snapshot, word, progress };
	if (requestId === lessonCacheToken) {
		cachedLesson = result;
	}
	return result;
}

export function invalidateLessonCache(): void {
	cachedLesson = undefined;
}

let cachedMatching: MatchingRoundResult | undefined;
let matchingCacheKey: string | null = null;
let matchingCacheToken = 0;

export async function fetchMatchingRound(options: { desiredCount: number; force?: boolean }): Promise<MatchingRoundResult> {
	const desiredCount = Math.max(3, options.desiredCount);
	const cacheKey = `${desiredCount}`;
	const force = options.force ?? false;
	if (!force && cachedMatching !== undefined && matchingCacheKey === cacheKey) {
		return cachedMatching;
	}
	const requestId = ++matchingCacheToken;
	try {
		const round = await getMatchingRound(desiredCount);
		let result: MatchingRoundResult;
		if (!round || round.words.length < desiredCount) {
			result = {
				type: 'insufficient',
				desiredCount,
				round: null,
				message: `Nicht genug aktive Wörter für die Matching-Runde (benötigt ${desiredCount}). Importiere neue Karten oder reaktiviere pausierte Wörter.`
			};
		} else {
			result = { type: 'success', desiredCount, round };
		}
		if (requestId === matchingCacheToken) {
			cachedMatching = result;
			matchingCacheKey = cacheKey;
		}
		return result;
	} catch (error) {
		console.error(error);
		const result: MatchingRoundResult = {
			type: 'error',
			desiredCount,
			round: null,
			message: 'Matching-Runde konnte nicht geladen werden.'
		};
		if (requestId === matchingCacheToken) {
			cachedMatching = result;
			matchingCacheKey = cacheKey;
		}
		return result;
	}
}

export function invalidateMatchingCache(): void {
	cachedMatching = undefined;
	matchingCacheKey = null;
}
