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
	let hintRunning = false;

	const PASSIVE_TOUCH_EVENTS = new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel']);

	type RenderTargetLike = {
		node?: EventTarget | null;
		_eventify?: (evt: Event, pointFunc: (event: Event) => { x: number; y: number }) => {
			getPoint: () => { x: number; y: number };
			preventDefault: () => void;
		};
	};

	const PASSIVE_PATCHED_FLAG = Symbol('passiveTouchPatched');

	type EventifyFn = (evt: Event, pointFunc: (event: Event) => { x: number; y: number }) => {
		getPoint: () => { x: number; y: number };
		preventDefault: () => void;
	};

	function applyPassiveHandlingToRenderTarget(target: RenderTargetLike | null | undefined): (() => void) | null {
		if (!target || (target as Record<symbol, unknown>)[PASSIVE_PATCHED_FLAG]) {
			return null;
		}

		const restorers: Array<() => void> = [];

		const node = 'node' in target ? (target.node as EventTarget | null | undefined) : null;
		const nodeRestorer = ensurePassiveTouchListeners(node);
		if (nodeRestorer) {
			restorers.push(nodeRestorer);
		}

		const maybeEventify = target._eventify as EventifyFn | undefined;
		if (typeof maybeEventify === 'function') {
			const patchedEventify: EventifyFn = function patchedEventify(
				evt: Event,
				pointFunc: (event: Event) => { x: number; y: number }
			) {
				const result = maybeEventify.call(target, evt, pointFunc);
				const originalPrevent = result.preventDefault;
				return {
					getPoint: result.getPoint,
					preventDefault: () => {
						const cancelable = typeof evt === 'object' && evt !== null && 'cancelable' in evt ? (evt as Event).cancelable : true;
						if (cancelable) {
							try {
								originalPrevent();
							} catch (error) {
								console.warn('preventDefault failed on passive touch event', error);
							}
						}
					}
				};
			};
			(target as RenderTargetLike & { _eventify: EventifyFn })._eventify = patchedEventify;
			restorers.push(() => {
				(target as RenderTargetLike & { _eventify: EventifyFn })._eventify = maybeEventify;
			});
		}

		(target as Record<symbol, unknown>)[PASSIVE_PATCHED_FLAG] = true;

		return restorers.length
			? () => {
				for (const restore of restorers) {
					try {
						restore();
					} catch (error) {
						console.warn('Failed to restore passive render target patch', error);
					}
				}
				delete (target as Record<symbol, unknown>)[PASSIVE_PATCHED_FLAG];
			}
			: null;
	}

	type EventTargetWithAdd = EventTarget & {
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => void;
	};

	function ensurePassiveTouchListeners(target: EventTarget | null | undefined): (() => void) | null {
		const candidate = target as EventTargetWithAdd | null;
		if (!candidate || typeof candidate.addEventListener !== 'function') {
			return null;
		}
		const originalAdd = candidate.addEventListener.bind(candidate);
		const patchedAdd: typeof candidate.addEventListener = (type, listener, options) => {
			if (typeof type === 'string' && PASSIVE_TOUCH_EVENTS.has(type)) {
				if (options === undefined) {
					return originalAdd(type, listener, { passive: true });
				}
				if (typeof options === 'boolean') {
					return originalAdd(type, listener, { capture: options, passive: true });
				}
				if (options && typeof options === 'object' && !('passive' in options)) {
					return originalAdd(type, listener, { ...options, passive: true });
				}
			}
			return originalAdd(type, listener, options);
		};
		(candidate as EventTargetWithAdd).addEventListener = patchedAdd;
		return () => {
			(candidate as EventTargetWithAdd).addEventListener = originalAdd;
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

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	async function playStrokeHint(strokeCount: number) {
		if (!writer) return;
		await writer.hideCharacter();
		const total = getStrokeCount();
		const limit = Math.min(total, Math.max(1, strokeCount));
		for (let i = 0; i < limit; i += 1) {
			await writer.animateStroke(i);
		}
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
		const restorers: Array<() => void> = [];
		const containerRestorer = ensurePassiveTouchListeners(container);
		if (containerRestorer) restorers.push(containerRestorer);
		const ownerDocument = container?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
		const docRestorer = ensurePassiveTouchListeners(ownerDocument);
		if (docRestorer) restorers.push(docRestorer);
		const winRestorer = ensurePassiveTouchListeners(ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null));
		if (winRestorer) restorers.push(winRestorer);
		restorePassiveListeners = restorers.length
			? () => {
				for (const restore of restorers) {
					try {
						restore();
					} catch (error) {
						console.warn('Failed to restore passive listener patch', error);
					}
				}
			}
			: null;

		writer = HanziWriter.create(container, character, {
			showOutline: false,
			showCharacter: false,
			renderer: 'svg',
			drawingWidth: 32,
			drawingColor: '#ef4444',
			strokeColor: '#0f172a',
			highlightColor: '#22c55e'
		});

		const renderTargetRestorer = applyPassiveHandlingToRenderTarget((writer as unknown as { target?: RenderTargetLike }).target);
		if (renderTargetRestorer) {
			restorers.push(renderTargetRestorer);
		}

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
	if (!writer || hintRunning) {
		return;
	}
	const previousOutlineActive = outlineHintActive;
	const previousVisible = shouldShowOutline();
	const quizController = 'cancelQuiz' in (writer as object) ? (writer as unknown as { cancelQuiz: () => void }) : null;
	hintRunning = true;
	try {
		if (quizController) {
			try {
				quizController.cancelQuiz();
			} catch (error) {
				console.warn('Failed to cancel quiz before hint animation', error);
			}
		}
		outlineHintActive = true;
		await syncOutline(true);
		await playStrokeHint(3);
		await delay(350);
		await writer.hideCharacter();
		outlineHintActive = previousOutlineActive;
		await syncOutline(previousVisible);
		dispatch('hint', { level: 'guided-half' });
		await restartQuiz();
	} finally {
		hintRunning = false;
	}
}
</script>

<div class="mx-auto max-w-xs" aria-live="polite">
	<div class="aspect-square border border-slate-300 bg-white touch-none select-none" bind:this={container}></div>
</div>
