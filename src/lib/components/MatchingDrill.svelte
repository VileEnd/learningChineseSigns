<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import type { MatchingCardKind, MatchingRoundWord } from '$lib/types';

	type Card = {
		id: string;
		wordId: string;
		kind: MatchingCardKind;
		label: string;
		selected: boolean;
		matched: boolean;
		mismatch: boolean;
	};

	export let words: MatchingRoundWord[] = [];
	export let roundId = 0;
	export let disabled = false;

	const dispatch = createEventDispatcher<{
		match: { wordId: string };
		mismatch: void;
		complete: { wordIds: string[] };
	}>();

	const defaultMessage =
		'Wähle die passenden Kombinationen aus Deutsch, Pinyin und Schriftzeichen.';

	const MATCH_CARD_CLASSES = [
		'border-emerald-300 bg-emerald-50 text-emerald-900',
		'border-sky-300 bg-sky-50 text-sky-900',
		'border-amber-300 bg-amber-50 text-amber-900',
		'border-violet-300 bg-violet-50 text-violet-900',
		'border-rose-300 bg-rose-50 text-rose-900',
		'border-lime-300 bg-lime-50 text-lime-900'
	];

	const MATCH_LABEL_CLASSES = [
		' text-emerald-600',
		' text-sky-600',
		' text-amber-600',
		' text-violet-600',
		' text-rose-600',
		' text-lime-600'
	];

	const MATCH_VALUE_CLASSES = [
		' text-emerald-900',
		' text-sky-900',
		' text-amber-900',
		' text-violet-900',
		' text-rose-900',
		' text-lime-900'
	];

	let cards: Card[] = [];
	let selectedIds = new Set<string>();
	let matchedWordIds = new Set<string>();
	let statusMessage = defaultMessage;
	let previousRoundId = roundId;
	let mismatchTimer: ReturnType<typeof setTimeout> | null = null;
	let matchedPalette = new Map<string, number>();

	const typeLabels: Record<MatchingCardKind, string> = {
		prompt: 'Deutsch',
		pinyin: 'Pinyin',
		characters: 'Schriftzeichen'
	};

	function paletteIndexFor(wordId: string): number | null {
		const value = matchedPalette.get(wordId);
		return value === undefined ? null : value % MATCH_CARD_CLASSES.length;
	}

	function cardClass(card: Card): string {
		const base =
			'rounded-2xl border p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-600';
		if (card.mismatch) {
			return `${base} border-rose-300 bg-rose-50`;
		}
		if (card.matched) {
			const paletteIndex = paletteIndexFor(card.wordId) ?? 0;
			return `${base} ${MATCH_CARD_CLASSES[paletteIndex]}`;
		}
		if (card.selected) {
			return `${base} border-slate-400 bg-slate-50`;
		}
		return `${base} border-slate-200 bg-white hover:border-slate-400 hover:shadow-md`;
	}

	function labelClass(card: Card): string {
		const base = 'text-xs font-semibold uppercase tracking-wide';
		if (card.mismatch) {
			return `${base} text-rose-600`;
		}
		if (card.matched) {
			const paletteIndex = paletteIndexFor(card.wordId) ?? 0;
			return `${base}${MATCH_LABEL_CLASSES[paletteIndex]}`;
		}
		return `${base} ${card.selected ? 'text-slate-600' : 'text-slate-500'}`;
	}

	function valueClass(card: Card): string {
		const baseByKind: Record<MatchingCardKind, string> = {
			characters: 'mt-2 text-3xl font-semibold',
			pinyin: 'mt-2 text-xl font-semibold',
			prompt: 'mt-2 text-lg font-medium'
		};
		const base = baseByKind[card.kind];
		if (card.mismatch) {
			return `${base} text-rose-600`;
		}
		if (card.matched) {
			const paletteIndex = paletteIndexFor(card.wordId) ?? 0;
			return `${base}${MATCH_VALUE_CLASSES[paletteIndex]}`;
		}
		return `${base} text-slate-900`;
	}

	function shuffle<T>(items: T[]): T[] {
		const result = [...items];
		for (let index = result.length - 1; index > 0; index -= 1) {
			const swapIndex = Math.floor(Math.random() * (index + 1));
			[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
		}
		return result;
	}

	function buildCards(source: MatchingRoundWord[]): Card[] {
		const generated: Card[] = [];
		for (const word of source) {
			const characters = word.characters.join('');
			generated.push(
				{
					id: `${word.id}-prompt`,
					wordId: word.id,
					kind: 'prompt',
					label: word.prompt,
					selected: false,
					matched: false,
					mismatch: false
				},
				{
					id: `${word.id}-pinyin`,
					wordId: word.id,
					kind: 'pinyin',
					label: word.pinyin,
					selected: false,
					matched: false,
					mismatch: false
				},
				{
					id: `${word.id}-characters`,
					wordId: word.id,
					kind: 'characters',
					label: characters,
					selected: false,
					matched: false,
					mismatch: false
				}
			);
		}
		return shuffle(generated);
	}

	function resetRoundState(): void {
		cards = words.length > 0 ? buildCards(words) : [];
		selectedIds = new Set();
		matchedWordIds = new Set();
		statusMessage = defaultMessage;
		matchedPalette = new Map();
	}

	function clearMismatch(): void {
		if (!mismatchTimer) {
			return;
		}
		clearTimeout(mismatchTimer);
		mismatchTimer = null;
	}

	function evaluateSelection(selection: Set<string>): void {
		const chosen = cards.filter((card) => selection.has(card.id));
		if (chosen.length !== 3) {
			return;
		}

		const wordIds = new Set(chosen.map((card) => card.wordId));
		const kinds = new Set(chosen.map((card) => card.kind));

		if (wordIds.size === 1 && kinds.size === 3) {
			const [wordId] = Array.from(wordIds);
			let paletteIndex = matchedPalette.get(wordId);
			if (paletteIndex === undefined) {
				paletteIndex = matchedPalette.size % MATCH_CARD_CLASSES.length;
				matchedPalette.set(wordId, paletteIndex);
			}
			const updatedCards = cards.map((card) => {
				if (!selection.has(card.id)) {
					return card;
				}
				return {
					...card,
					selected: false,
					matched: true,
					mismatch: false
				};
			});
			cards = updatedCards;
			const nextMatched = new Set(matchedWordIds);
			nextMatched.add(wordId);
			matchedWordIds = nextMatched;
			selectedIds = new Set();
			statusMessage = nextMatched.size === words.length ? 'Grossartig! Alle Paare gefunden.' : 'Treffer! Suche weiter nach passenden Dreiern.';
			dispatch('match', { wordId });
			if (nextMatched.size === words.length) {
				dispatch('complete', { wordIds: Array.from(nextMatched) });
			}
			return;
		}

		const mismatchedIds = Array.from(selection);
		const updatedCards = cards.map((card) => {
			if (!selection.has(card.id)) {
				return card;
			}
			return {
				...card,
				selected: true,
				mismatch: true
			};
		});
		cards = updatedCards;
		statusMessage = 'Diese Auswahl passt nicht zusammen.';
		dispatch('mismatch');
		clearMismatch();
		mismatchTimer = setTimeout(() => {
			cards = cards.map((card) => {
				if (!mismatchedIds.includes(card.id)) {
					return card;
				}
				return {
					...card,
					selected: false,
					mismatch: false
				};
			});
			selectedIds = new Set();
			statusMessage = defaultMessage;
			mismatchTimer = null;
		}, 900);
	}

	function toggleCard(card: Card): void {
		if (disabled || card.matched) {
			return;
		}
		if (mismatchTimer && !selectedIds.has(card.id)) {
			return;
		}

		if (selectedIds.has(card.id)) {
			const next = new Set(selectedIds);
			next.delete(card.id);
			selectedIds = next;
			cards = cards.map((current) =>
				current.id === card.id ? { ...current, selected: false, mismatch: false } : current
			);
			if (selectedIds.size === 0) {
				statusMessage = defaultMessage;
			}
			return;
		}

		if (selectedIds.size >= 3) {
			return;
		}

		const activeSelection = cards.filter((current) => selectedIds.has(current.id));
		if (activeSelection.some((current) => current.kind === card.kind)) {
			statusMessage = 'Pro Kategorie darf nur eine Karte gleichzeitig aktiv sein.';
			return;
		}

		const next = new Set(selectedIds);
		next.add(card.id);
		selectedIds = next;
		cards = cards.map((current) => (current.id === card.id ? { ...current, selected: true } : current));

		if (next.size === 3) {
			evaluateSelection(next);
		} else {
			statusMessage = 'Wähle insgesamt drei Karten.';
		}
	}

	onDestroy(() => {
		clearMismatch();
	});

	$: if (roundId !== previousRoundId || (roundId === previousRoundId && cards.length === 0 && words.length > 0)) {
		previousRoundId = roundId;
		clearMismatch();
		resetRoundState();
	}
</script>

<div class="flex flex-col gap-6">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
		{#if cards.length === 0}
			<p class="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
				Keine passenden Karten verfuegbar.
			</p>
		{:else}
			{#each cards as card (card.id)}
				<button
					type="button"
					class={cardClass(card)}
					on:click={() => toggleCard(card)}
					aria-pressed={card.selected}
					disabled={disabled || card.matched}
				>
					<p class={labelClass(card)}>{typeLabels[card.kind]}</p>
					<p class={valueClass(card)}>{card.label}</p>
				</button>
			{/each}
		{/if}
	</div>
	<p class="rounded-xl bg-slate-900/90 px-4 py-3 text-sm font-medium text-white shadow">
		{statusMessage}
	</p>
</div>
