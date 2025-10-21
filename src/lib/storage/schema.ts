import { z } from 'zod';

export const wordEntrySchema = z.object({
	id: z.string().min(1),
	prompt: z.string().min(1),
	promptLanguage: z.string().min(2).max(8),
	pinyin: z.string().min(1),
	characters: z.array(z.string().min(1)).min(1),
	alternatePinyin: z.array(z.string().min(1)).optional(),
	hints: z
		.object({
			audio: z.string().optional(),
			note: z.string().optional()
		})
		.partial()
		.optional()
});

export const wordPackSchema = z.object({
	version: z.number().int().min(1),
	words: z.array(wordEntrySchema)
});

export const chapterSchema = z.object({
	chapter: z.number().int().min(1),
	words: z.array(wordEntrySchema)
});

export const chaptersPackSchema = z.object({
	version: z.number().int().min(1),
	chapters: z.array(chapterSchema)
});

export const settingsSchema = z.object({
	interfaceLanguage: z.string().min(2).max(8),
	learningMode: z.enum(['prompt-to-pinyin', 'prompt-to-character', 'pinyin-to-character']),
	enforceTones: z.boolean(),
	showStrokeOrderHints: z.boolean(),
	leniency: z.number().min(0.2).max(2)
});

export const progressSchema = z.object({
	wordId: z.string(),
	bucket: z.enum(['learning', 'reinforce', 'known']),
	streak: z.number().int().min(0),
	lastReviewedAt: z.number().int().min(0),
	nextDueAt: z.number().int().min(0),
	pinyinAttempts: z.number().int().min(0),
	writingAttempts: z.number().int().min(0),
	lastResult: z.enum(['success', 'failure']),
	reviewCount: z.number().int().min(0).optional(),
	suspended: z.boolean().optional()
});

export const exportSnapshotSchema = z.object({
	settings: settingsSchema,
	progress: z.array(progressSchema),
	customWords: z.array(wordEntrySchema),
	lastUpdated: z.number().int().min(0)
});

export type WordEntryPayload = z.infer<typeof wordEntrySchema>;
export type WordPackPayload = z.infer<typeof wordPackSchema>;
export type ChaptersPackPayload = z.infer<typeof chaptersPackSchema>;
export type ExportSnapshotPayload = z.infer<typeof exportSnapshotSchema>;
