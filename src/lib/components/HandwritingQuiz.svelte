<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import HanziWriter from 'hanzi-writer';

	type Mode = 'free' | 'guided-half' | 'guided-full';

	export let character: string;
	export let leniency = 1;
	export let mode: Mode = 'free';
	export let attemptKey = 0;
	export let disabled = false;
	export let alwaysShowOutline = false;

	const dispatch = createEventDispatcher<{
		start: undefined;
		complete: { mistakes: number };
		hint: { level: Mode };
	}>();

	let container: HTMLDivElement;
	let writer: HanziWriter | null = null;
	let lastMode: Mode | null = mode;
	let lastAttemptKey = attemptKey;
	let lastCharacter = character;
	let restarting = false;
	let outlineHintActive = false;
	let lastOutlineVisible = false;
	let restorePassiveListeners: (() => void) | null = null;

	const PASSIVE_TOUCH_EVENTS = new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel']);

	function ensurePassiveTouchListeners(target: HTMLElement): () => void {
		const originalAdd = target.addEventListener;
		const patchedAdd: typeof target.addEventListener = (type: any, listener: any, options?: any) => {
			if (typeof type === 'string' && PASSIVE_TOUCH_EVENTS.has(type)) {
				if (options === undefined) {
					return originalAdd.call(target, type, listener, { passive: true });
				}
				if (typeof options === 'boolean') {
					return originalAdd.call(target, type, listener, { capture: options, passive: true });
				}
				if (options && typeof options === 'object' && !('passive' in options)) {
					return originalAdd.call(target, type, listener, { ...options, passive: true });
				}
			}
			return originalAdd.call(target, type, listener, options);
		};
		target.addEventListener = patchedAdd;
		return () => {
			target.addEventListener = originalAdd;
		};
	}

	function shouldShowOutline(): boolean {
		return alwaysShowOutline || outlineHintActive || mode !== 'free';
	}

	async function syncOutline(visible = shouldShowOutline()): Promise<void> {
		if (!writer) return;
		const api = writer as unknown as Record<string, unknown>;
		const method = visible ? api.showOutline : api.hideOutline;
		if (typeof method === 'function') {
			const outcome = (method as (...args: unknown[]) => unknown).call(writer);
			await Promise.resolve(outcome);
		}
		lastOutlineVisible = visible;
	}

	function getStrokeCount(): number {
		const internal = writer as unknown as { _character?: { strokes: unknown[] } };
		return internal?._character?.strokes?.length ?? 8;
	}

	async function showHint(level: Mode) {
		if (!writer) return;

		outlineHintActive = true;
		await syncOutline(true);

		if (level === 'guided-half') {
			const total = getStrokeCount();
			const limit = Math.max(1, Math.floor(total / 2));
			await writer.hideCharacter();
			for (let i = 0; i < limit; i += 1) {
				await writer.animateStroke(i);
			}
		} else if (level === 'guided-full') {
			await writer.showCharacter();
		}

		dispatch('hint', { level });
	}

	async function restartQuiz(forceHint = false) {
		if (!writer || disabled || restarting) {
			return;
		}

		restarting = true;

		if ('cancelQuiz' in (writer as object)) {
			try {
				(writer as unknown as { cancelQuiz: () => void }).cancelQuiz();
			} catch (error) {
				console.warn('Failed to cancel active quiz', error);
			}
		}

		await writer.hideCharacter();
		await syncOutline();

		if (mode !== 'free') {
			await showHint(mode);
		}

		dispatch('start', undefined);

		await writer.quiz({
			leniency,
			showHintAfterMisses: mode === 'free' ? 3 : 1,
			highlightOnComplete: true,
			markStrokeCorrectAfterMisses: false,
			onComplete: (summary) => {
				dispatch('complete', { mistakes: summary.totalMistakes });
			}
		});

		restarting = false;
	}

	onMount(async () => {
		if (container) {
			restorePassiveListeners = ensurePassiveTouchListeners(container);
		}

		writer = HanziWriter.create(container, character, {
			showOutline: false,
			showCharacter: false,
			renderer: 'svg',
			drawingWidth: 32,
			drawingColor: '#ef4444',
			strokeColor: '#0f172a',
			highlightColor: '#22c55e'
		});

		outlineHintActive = alwaysShowOutline;
		await syncOutline();
		await restartQuiz(false);
	});

	onDestroy(() => {
		if (writer && 'cancelQuiz' in writer) {
			(writer as unknown as { cancelQuiz: () => void }).cancelQuiz();
		}
		writer = null;
		if (restorePassiveListeners) {
			restorePassiveListeners();
			restorePassiveListeners = null;
		}
	});

	async function handleCharacterChange() {
		if (!writer) return;
		await writer.setCharacter(character);
		outlineHintActive = alwaysShowOutline;
		lastOutlineVisible = false;
		await restartQuiz(true);
	}

	$: if (writer && character !== lastCharacter) {
		lastCharacter = character;
		handleCharacterChange().catch((error) => console.error(error));
	}

	$: if (writer && mode !== lastMode) {
		lastMode = mode;
		if (mode !== 'free') {
			outlineHintActive = true;
		}
		restartQuiz(true).catch((error) => console.error(error));
	}

	$: if (writer && attemptKey !== lastAttemptKey) {
		lastAttemptKey = attemptKey;
		restartQuiz().catch((error) => console.error(error));
	}

	$: if (writer) {
		const desired = shouldShowOutline();
		if (desired !== lastOutlineVisible) {
			syncOutline(desired).catch((error) => console.error(error));
		}
	}

export async function revealOutline(): Promise<void> {
	outlineHintActive = true;
	await syncOutline(true);
	await showHint('guided-half');
}
</script>

<div class="mx-auto max-w-xs" aria-live="polite">
	<div class="aspect-square border border-slate-300 bg-white" bind:this={container}></div>
</div>
