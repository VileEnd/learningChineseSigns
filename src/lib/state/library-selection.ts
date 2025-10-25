import { derived, get, writable } from 'svelte/store';
import type { LibrarySelectionMap } from '$lib/types';
import type { LibraryType } from '$lib/data/libraries';

export type LibraryCatalogEntry = {
	id: LibraryType;
	name: string;
	chapters: Array<{
		id: string;
		label: string;
		wordCount: number;
	}>;
};

export type LibrarySummary = {
	libraryId: LibraryType;
	name: string;
	chapterCount: number;
	wordCount: number;
	chapterLabels: string[];
};

export type DraftSummary = {
	libraryId: LibraryType;
	name: string;
	chapterCount: number;
	wordCount: number;
};

export type ActiveDetails = {
	summaries: LibrarySummary[];
	totalChapters: number;
	totalWords: number;
	headerLabel: string;
	primaryLabel: string;
	collapsedSummary: string;
};

export type DraftDetails = {
	summaries: DraftSummary[];
	summaryMap: Map<LibraryType, DraftSummary>;
	totalChapters: number;
	totalWords: number;
	activeLibraries: number;
};

export type LibrarySelectionManager = ReturnType<typeof createLibrarySelectionManager>;

export function createLibrarySelectionManager(
	catalog: LibraryCatalogEntry[],
	initialSelection: LibrarySelectionMap = {}
) {
	const catalogMap = new Map<LibraryType, LibraryCatalogEntry>(catalog.map((entry) => [entry.id, entry]));

	const normalize = (selection: LibrarySelectionMap | undefined): LibrarySelectionMap => {
		const result: LibrarySelectionMap = {};
		if (!selection) {
			return result;
		}
		for (const [libraryId, chapters] of Object.entries(selection) as Array<[LibraryType, string[]]>) {
			const ordered = sortChapterIds(catalogMap, libraryId, chapters);
			if (ordered.length > 0) {
				result[libraryId] = ordered;
			}
		}
		return result;
	};

	const activeSelection = writable<LibrarySelectionMap>(normalize(initialSelection));
	const draftSelection = writable<LibrarySelectionMap>(normalize(initialSelection));

	const activeDetails = derived(activeSelection, (selection) => buildActiveDetails(selection, catalogMap));
	const draftDetails = derived(draftSelection, (selection) => buildDraftDetails(selection, catalogMap));
	const activeSummaries = derived(activeDetails, (details) => details.summaries);
	const draftSummaries = derived(draftDetails, (details) => details.summaries);

	const setActiveSelection = (next: LibrarySelectionMap | undefined) => {
		const normalized = normalize(next);
		activeSelection.set(normalized);
		draftSelection.set(normalized);
	};

	const setDraftSelection = (next: LibrarySelectionMap | undefined) => {
		draftSelection.set(normalize(next));
	};

	const openDraftFromActive = () => {
		draftSelection.set(normalize(get(activeSelection)));
	};

	const toggleDraftChapter = (libraryId: LibraryType, chapterId: string) => {
		draftSelection.update((current) => {
			const next = normalize(current);
			const selected = new Set(next[libraryId] ?? []);
			if (selected.has(chapterId)) {
				selected.delete(chapterId);
			} else {
				selected.add(chapterId);
			}
			const ordered = sortChapterIds(catalogMap, libraryId, selected);
			if (ordered.length > 0) {
				next[libraryId] = ordered;
			} else {
				delete next[libraryId];
			}
			return next;
		});
	};

	const selectAllDraftChapters = (libraryId: LibraryType) => {
		draftSelection.update((current) => {
			const next = normalize(current);
			const catalogEntry = catalogMap.get(libraryId);
			if (!catalogEntry) {
				return next;
			}
			next[libraryId] = catalogEntry.chapters.map((chapter) => chapter.id);
			return next;
		});
	};

	const clearDraftSelection = (libraryId: LibraryType) => {
		draftSelection.update((current) => {
			const next = normalize(current);
			if (libraryId in next) {
				delete next[libraryId];
			}
			return next;
		});
	};

	const isDraftChapterSelected = (libraryId: LibraryType, chapterId: string): boolean => {
		const current = get(draftSelection);
		return (current[libraryId] ?? []).includes(chapterId);
	};

	const getDraftSelectionSnapshot = (omitEmpty = false): LibrarySelectionMap => {
		const normalized = normalize(get(draftSelection));
		if (!omitEmpty) {
			return normalized;
		}
		const result: LibrarySelectionMap = {};
		for (const [libraryId, chapters] of Object.entries(normalized) as Array<[LibraryType, string[]]>) {
			if (chapters.length > 0) {
				result[libraryId] = [...chapters];
			}
		}
		return result;
	};

	return {
		catalog,
		catalogMap,
		activeSelection,
		draftSelection,
		activeDetails,
		draftDetails,
		activeSummaries,
		draftSummaries,
		setActiveSelection,
		setDraftSelection,
		openDraftFromActive,
		toggleDraftChapter,
		selectAllDraftChapters,
		clearDraftSelection,
		isDraftChapterSelected,
		getDraftSelectionSnapshot
	};
}

function sortChapterIds(
	catalogMap: Map<LibraryType, LibraryCatalogEntry>,
	libraryId: LibraryType,
	chapterIds: Iterable<string>
): string[] {
	const catalog = catalogMap.get(libraryId);
	if (!catalog) {
		return Array.from(new Set(chapterIds));
	}
	const allowed = new Set(chapterIds);
	return catalog.chapters.filter((chapter) => allowed.has(chapter.id)).map((chapter) => chapter.id);
}

function buildActiveDetails(
	selection: LibrarySelectionMap,
	catalogMap: Map<LibraryType, LibraryCatalogEntry>
): ActiveDetails {
	const summaries = buildActiveSummaries(selection, catalogMap);
	const totalChapters = summaries.reduce((sum, entry) => sum + entry.chapterCount, 0);
	const totalWords = summaries.reduce((sum, entry) => sum + entry.wordCount, 0);

	let headerLabel = 'Keine Bibliotheken aktiv';
	let primaryLabel = 'Keine Bibliothek';
	let collapsedSummary = '';

	if (summaries.length === 1) {
		const entry = summaries[0];
		headerLabel = `${entry.name}: ${entry.chapterCount} Kap., ${entry.wordCount} Wörter`;
		primaryLabel = entry.name;
		collapsedSummary = `${entry.chapterCount} Kap., ${entry.wordCount} Wörter`;
	} else if (summaries.length > 1) {
		headerLabel = `${summaries.length} Bibliotheken · ${totalChapters} Kap., ${totalWords} Wörter`;
		primaryLabel = `${summaries[0].name} +${summaries.length - 1}`;
		collapsedSummary = headerLabel;
	}

	return {
		summaries,
		totalChapters,
		totalWords,
		headerLabel,
		primaryLabel,
		collapsedSummary
	};
}

function buildDraftDetails(
	selection: LibrarySelectionMap,
	catalogMap: Map<LibraryType, LibraryCatalogEntry>
): DraftDetails {
	const summaries = buildDraftSummaries(selection, catalogMap);
	const summaryMap = new Map<LibraryType, DraftSummary>(summaries.map((entry) => [entry.libraryId, entry]));
	const totalChapters = summaries.reduce((sum, entry) => sum + entry.chapterCount, 0);
	const totalWords = summaries.reduce((sum, entry) => sum + entry.wordCount, 0);
	const activeLibraries = summaries.filter((entry) => entry.chapterCount > 0).length;

	return {
		summaries,
		summaryMap,
		totalChapters,
		totalWords,
		activeLibraries
	};
}

function buildActiveSummaries(
	selection: LibrarySelectionMap,
	catalogMap: Map<LibraryType, LibraryCatalogEntry>
): LibrarySummary[] {
	const summaries: LibrarySummary[] = [];
	for (const [libraryId, chapters] of Object.entries(selection) as Array<[LibraryType, string[]]>) {
		const catalog = catalogMap.get(libraryId);
		if (!catalog) {
			continue;
		}
		const selectedSet = new Set(chapters);
		const selectedChapters = catalog.chapters.filter((chapter) => selectedSet.has(chapter.id));
		if (selectedChapters.length === 0) {
			continue;
		}
		summaries.push({
			libraryId,
			name: catalog.name,
			chapterCount: selectedChapters.length,
			wordCount: selectedChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
			chapterLabels: selectedChapters.map((chapter) => chapter.label)
		});
	}
	return summaries;
}

function buildDraftSummaries(
	selection: LibrarySelectionMap,
	catalogMap: Map<LibraryType, LibraryCatalogEntry>
): DraftSummary[] {
	const summaries: DraftSummary[] = [];
	for (const [libraryId, chapters] of Object.entries(selection) as Array<[LibraryType, string[]]>) {
		const catalog = catalogMap.get(libraryId);
		if (!catalog) {
			continue;
		}
		const selectedSet = new Set(chapters);
		const selectedChapters = catalog.chapters.filter((chapter) => selectedSet.has(chapter.id));
		summaries.push({
			libraryId,
			name: catalog.name,
			chapterCount: selectedChapters.length,
			wordCount: selectedChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
		});
	}
	return summaries;
}
