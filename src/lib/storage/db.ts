import Dexie, { type Table } from 'dexie';
import type { LearningBucket, SessionState, Settings, WordEntry, WordProgress } from '../types';

export interface WordRecord extends WordEntry {
	source: 'built-in' | 'custom';
	createdAt: number;
	updatedAt: number;
}

export interface ProgressRecord extends WordProgress {}

export interface SettingsRecord {
	id: string;
	payload: Settings;
	updatedAt: number;
}

export interface LessonSummaryRecord {
	id?: number;
	wordId: string;
	success: boolean;
	stageReached: string;
	pinyinAttempts: number;
	writingAttempts: number;
	timestamp: number;
}

export interface SessionStateRecord {
	id: string;
	payload: SessionState;
	updatedAt: number;
}

const DEFAULT_SETTINGS: Settings = {
	interfaceLanguage: 'de',
	learningMode: 'prompt-to-pinyin',
	enforceTones: true,
	showStrokeOrderHints: false,
	leniency: 1
};

class LearningDexie extends Dexie {
	words!: Table<WordRecord, string>;
	progress!: Table<ProgressRecord, string>;
	settings!: Table<SettingsRecord, string>;
	summaries!: Table<LessonSummaryRecord, number>;
	session!: Table<SessionStateRecord, string>;

	constructor() {
		super('learning-chinese-signs');
		this.version(1).stores({
			words: '&id, promptLanguage, source',
			progress: '&wordId, bucket, nextDueAt',
			settings: '&id',
			summaries: '++id, wordId, timestamp'
		});

		this.version(2).stores({
			words: '&id, promptLanguage, source',
			progress: '&wordId, bucket, nextDueAt',
			settings: '&id',
			summaries: '++id, wordId, timestamp',
			session: '&id'
		});

		this.version(3)
			.stores({
				words: '&id, promptLanguage, source',
				progress: '&wordId, bucket, nextDueAt',
				settings: '&id',
				summaries: '++id, wordId, timestamp',
				session: '&id'
			})
			.upgrade(async (transaction) => {
				await transaction.table('progress').toCollection().modify((record: ProgressRecord) => {
					if (record.suspended === undefined) {
						record.suspended = false;
					}
				});
			});
	}

	async ensureSettings(): Promise<SettingsRecord> {
		const existing = await this.settings.get('default');
		if (existing) {
			return existing;
		}

		const baseline: SettingsRecord = {
			id: 'default',
			payload: DEFAULT_SETTINGS,
			updatedAt: Date.now()
		};
		await this.settings.put(baseline);
		return baseline;
	}
}

export const db = new LearningDexie();

export async function ensureWord(record: WordRecord): Promise<void> {
	await db.words.put({ ...record, updatedAt: Date.now() });
}

export async function updateProgress(entry: ProgressRecord): Promise<void> {
	await db.progress.put({
		...entry,
		suspended: entry.suspended ?? false,
		nextDueAt: entry.nextDueAt,
		lastReviewedAt: entry.lastReviewedAt
	});
}

export async function saveSessionState(state: SessionState): Promise<void> {
	await db.session.put({ id: 'active', payload: state, updatedAt: Date.now() });
}

export async function loadSessionState(): Promise<SessionStateRecord | undefined> {
	return db.session.get('active');
}

export async function clearSessionState(): Promise<void> {
	await db.session.delete('active');
}

export async function bootstrapWords(words: WordEntry[], source: WordRecord['source'] = 'built-in'): Promise<void> {
	const existingCount = await db.words.count();
	if (existingCount > 0) {
		return;
	}

	await db.transaction('rw', db.words, db.progress, async () => {
		for (const word of words) {
			const now = Date.now();
			await db.words.put({
				...word,
				source,
				createdAt: now,
				updatedAt: now
			});
			const progress: ProgressRecord = {
				wordId: word.id,
				bucket: 'learning',
				streak: 0,
				lastReviewedAt: 0,
				nextDueAt: now,
				pinyinAttempts: 0,
				writingAttempts: 0,
				lastResult: 'failure',
				suspended: false
			};
			await db.progress.put(progress);
		}
	});
}

export async function getSettings(): Promise<Settings> {
	const record = await db.ensureSettings();
	return record.payload;
}

export async function saveSettings(settings: Settings): Promise<void> {
	await db.settings.put({ id: 'default', payload: settings, updatedAt: Date.now() });
}

export async function listWordsByBucket(bucket: LearningBucket): Promise<WordRecord[]> {
	const progress = await db.progress.where({ bucket }).toArray();
	const ids = progress.map((item) => item.wordId);
	return db.words.bulkGet(ids).then((results) => results.filter((item): item is WordRecord => Boolean(item)));
}
