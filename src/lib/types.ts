export type LearningMode = 'prompt-to-pinyin' | 'prompt-to-character' | 'pinyin-to-character';

export type LearningBucket = 'learning' | 'reinforce' | 'known';

export type LessonStage = 'pinyin' | 'writing' | 'writing-guided-half' | 'writing-guided-full' | 'complete';
export type WritingMode = 'free' | 'guided-half' | 'guided-full';

export interface WordEntry {
	id: string;
	prompt: string; // e.g. German word or phrase
	promptLanguage: string; // ISO language code, e.g. 'de'
	pinyin: string;
	characters: string[]; // simplified Chinese characters composing the word
	alternatePinyin?: string[]; // numeric tone fallback etc.
	hints?: {
		audio?: string;
		note?: string;
	};
}

export interface WordPack {
	version: number;
	words: WordEntry[];
}

export interface WordProgress {
	wordId: string;
	bucket: LearningBucket;
	streak: number;
	lastReviewedAt: number;
	nextDueAt: number;
	pinyinAttempts: number;
	writingAttempts: number;
	lastResult: 'success' | 'failure';
	suspended?: boolean;
}

export interface LessonSummary {
	wordId: string;
	success: boolean;
	stageReached: LessonStage;
	pinyinAttempts: number;
	writingAttempts: number;
	timestamp: number;
}

export interface SessionState {
	currentWordId: string;
	stage: LessonStage;
	writingMode: WritingMode;
	pinyinSolved: boolean;
	pinyinAttempts: number;
	pinyinInput: string;
	message: string;
	toneMessage: string;
	writingAttemptCounter: number;
	guidedRepetitions: number;
	totalWritingAttempts: number;
	characterIndex: number;
	attemptKey: number;
	sessionFinished: boolean;
	updatedAt: number;
}

export interface Settings {
	interfaceLanguage: string; // UI language (initially de)
	learningMode: LearningMode;
	enforceTones: boolean;
	showStrokeOrderHints: boolean; // show character outline immediately instead of hiding it initially
	leniency: number; // 0..1 for handwriting leniency (hanzi-writer quiz leniency)
}

export interface ExportSnapshot {
	settings: Settings;
	progress: WordProgress[];
	customWords: WordEntry[];
	lastUpdated: number;
}
