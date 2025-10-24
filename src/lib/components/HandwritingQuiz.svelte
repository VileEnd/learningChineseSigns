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
	let hintRunning = false;
	let scrollGuardCleanup: Array<() => void> = [];

	const PASSIVE_TOUCH_EVENTS = new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel']);

	type RenderTargetLike = {
		node?: EventTarget | null;
		_eventify?: (evt: Event, pointFunc: (event: Event) => { x: number; y: number }) => {
			getPoint: () => { x: number; y: number };
			preventDefault: () => void;
		};
	};

	const PASSIVE_PATCHED_FLAG = Symbol('passiveTouchPatched');
	const PASSIVE_ADD_STATE = Symbol('passiveTouchAddState');

	type PassiveTouchPatchState = {
		original: EventTargetWithAdd['addEventListener'];
		count: number;
	};

	type PassiveAwareWriter = HanziWriter & {
		__passiveRestorers?: Array<() => void>;
	};

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
						const isTouchType =
							typeof evt === 'object' &&
							evt !== null &&
							'type' in evt &&
							typeof (evt as Event).type === 'string' &&
							(evt as Event).type.startsWith('touch');
						if (isTouchType) {
							return;
						}
						try {
							originalPrevent();
						} catch (error) {
							console.warn('preventDefault failed on passive event', error);
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
		[PASSIVE_ADD_STATE]?: PassiveTouchPatchState;
	};

	function ensurePassiveTouchListeners(target: EventTarget | null | undefined): (() => void) | null {
		const candidate = target as EventTargetWithAdd | null;
		if (!candidate || typeof candidate.addEventListener !== 'function') {
			return null;
		}
		const existingState = candidate[PASSIVE_ADD_STATE];
		if (existingState) {
			existingState.count += 1;
			return () => {
				existingState.count = Math.max(0, existingState.count - 1);
				if (existingState.count === 0) {
					candidate.addEventListener = existingState.original;
					delete candidate[PASSIVE_ADD_STATE];
				}
			};
		}
		const originalAdd = candidate.addEventListener;
		const state: PassiveTouchPatchState = { original: originalAdd, count: 1 };
		const patchedAdd: typeof candidate.addEventListener = function patched(this: EventTarget, type, listener, options) {
			if (typeof type === 'string' && PASSIVE_TOUCH_EVENTS.has(type)) {
				if (options === undefined) {
					return originalAdd.call(this, type, listener, { passive: true });
				}
				if (typeof options === 'boolean') {
					return originalAdd.call(this, type, listener, { capture: options, passive: true });
				}
				if (options && typeof options === 'object' && !('passive' in options)) {
					return originalAdd.call(this, type, listener, { ...options, passive: true });
				}
			}
			return originalAdd.call(this, type, listener, options as unknown as boolean | AddEventListenerOptions | undefined);
		};
		candidate.addEventListener = patchedAdd;
		candidate[PASSIVE_ADD_STATE] = state;
		return () => {
			const currentState = candidate[PASSIVE_ADD_STATE];
			if (!currentState) {
				return;
			}
			currentState.count = Math.max(0, currentState.count - 1);
			if (currentState.count === 0) {
				candidate.addEventListener = originalAdd;
				delete candidate[PASSIVE_ADD_STATE];
			}
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
			attachScrollGuards(container);
		patchHanziWriterForPassiveListeners();
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
		const passiveWriter = writer as PassiveAwareWriter | null;
		if (passiveWriter?.__passiveRestorers?.length) {
			for (const restore of passiveWriter.__passiveRestorers) {
				try {
					restore();
				} catch (error) {
					console.warn('Failed to restore HanziWriter passive listener patch', error);
				}
			}
			passiveWriter.__passiveRestorers = [];
		}
		writer = null;
		if (scrollGuardCleanup.length) {
			for (const cleanup of scrollGuardCleanup) {
				try {
					cleanup();
				} catch (error) {
					console.warn('Failed to remove scroll guard listener', error);
				}
			}
			scrollGuardCleanup = [];
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

function attachScrollGuards(target: HTMLDivElement | null | undefined): void {
	if (!target) {
		return;
	}
	target.style.touchAction = 'none';
	target.style.overscrollBehavior = 'contain';
	target.style.setProperty('-webkit-overflow-scrolling', 'auto');
	const preventScroll = (event: Event) => {
		const pointerEvent = event as PointerEvent;
		if ('pointerType' in pointerEvent && pointerEvent.pointerType) {
			const type = pointerEvent.pointerType;
			if (type !== 'touch' && type !== 'pen') {
				return;
			}
		}
		if ('touches' in (event as TouchEvent) && (event as TouchEvent).touches?.length === 0) {
			return;
		}
		if (event.cancelable) {
			event.preventDefault();
		}
	};
	const listenerOptions = { passive: false, capture: true } as const;
	const listeners: Array<[keyof DocumentEventMap, EventListenerOrEventListenerObject]> = [
		['touchmove', preventScroll],
		['pointermove', preventScroll]
	];
	for (const [type, listener] of listeners) {
		target.addEventListener(type, listener as EventListener, listenerOptions);
		scrollGuardCleanup.push(() => target.removeEventListener(type, listener as EventListener, listenerOptions));
	}
}

let hanziWriterPassivePatched = false;

function patchHanziWriterForPassiveListeners(): void {
	if (hanziWriterPassivePatched) {
		return;
	}
	const prototype = HanziWriter.prototype as unknown as PassiveAwareWriter & {
		_setupListeners?: () => void;
		__passivePatched?: boolean;
	};
	if (!prototype || typeof prototype._setupListeners !== 'function' || prototype.__passivePatched) {
		hanziWriterPassivePatched = true;
		return;
	}
	const originalSetup = prototype._setupListeners as (this: HanziWriter) => void;
	prototype._setupListeners = function patchedSetup(this: PassiveAwareWriter) {
		const restorers: Array<() => void> = [];
		const target = (this as unknown as { target?: RenderTargetLike }).target ?? null;
		const targetRestorer = applyPassiveHandlingToRenderTarget(target);
		if (targetRestorer) restorers.push(targetRestorer);
		const node = target && 'node' in target ? (target.node as EventTarget | null | undefined) : null;
		const nodeRestorer = ensurePassiveTouchListeners(node);
		if (nodeRestorer) restorers.push(nodeRestorer);
		const ownerDocument = (() => {
			if (node && 'ownerDocument' in (node as Node)) {
				return (node as Node).ownerDocument;
			}
			if (typeof document !== 'undefined') {
				return document;
			}
			return null;
		})();
		const docRestorer = ensurePassiveTouchListeners(ownerDocument);
		if (docRestorer) restorers.push(docRestorer);
		const winRestorer = ensurePassiveTouchListeners(ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null));
		if (winRestorer) restorers.push(winRestorer);
		if (restorers.length) {
			this.__passiveRestorers = (this.__passiveRestorers ?? []).concat(restorers);
		}
		return originalSetup.call(this as HanziWriter);
	};
	prototype.__passivePatched = true;
	hanziWriterPassivePatched = true;
}
</script>

<div class="mx-auto max-w-xs" aria-live="polite">
	<div class="aspect-square border border-slate-300 bg-white touch-none select-none" bind:this={container}></div>
</div>
