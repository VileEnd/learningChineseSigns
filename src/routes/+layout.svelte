<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { browser, dev } from '$app/environment';
 import '../app.css';
 import favicon from '$lib/assets/favicon.svg';

 type BeforeInstallPromptEvent = Event & {
 	prompt: () => Promise<void>;
 	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
 };

 let installPromptEvent: BeforeInstallPromptEvent | null = null;
 let showInstallBanner = false;
 let installRequestPending = false;

const isStandaloneDisplay = () => {
	if (!browser) {
		return false;
	}
	const nav = navigator as Navigator & { standalone?: boolean };
	return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
};

 function enableInstallBanner(event: BeforeInstallPromptEvent) {
 	if (isStandaloneDisplay()) {
 		return;
 	}
 	installPromptEvent = event;
 	showInstallBanner = true;
 }

 async function triggerInstall() {
 	if (!installPromptEvent) {
 		return;
 	}
 	installRequestPending = true;
 	try {
 		await installPromptEvent.prompt();
 		await installPromptEvent.userChoice.catch(() => undefined);
 	} finally {
 		installPromptEvent = null;
 		showInstallBanner = false;
 		installRequestPending = false;
 	}
 }

 function dismissInstallBanner() {
 	showInstallBanner = false;
 	installPromptEvent = null;
 }

const handleBeforeInstallPrompt = (event: Event) => {
	const typed = event as BeforeInstallPromptEvent;
	typed.preventDefault();
	enableInstallBanner(typed);
};

const handleAppInstalled = () => {
	installPromptEvent = null;
	showInstallBanner = false;
};

onMount(() => {
	if (!('serviceWorker' in navigator)) {
		return;
	}

	if (dev) {
		navigator.serviceWorker
			.getRegistrations()
			.then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
			.then(() => {
				const cacheStorage = 'caches' in window ? window.caches : null;
				if (cacheStorage) {
					void cacheStorage
						.keys()
						.then((keys) => Promise.all(keys.map((key) => cacheStorage.delete(key))));
				}
			})
			.catch((error) => {
				console.warn('Failed to clean up service workers in dev mode', error);
			});
		return;
	}

	if (!window.isSecureContext) {
		console.warn('Service workers require a secure context (HTTPS or localhost). Skipping registration.');
	 	return;
	 }

		const register = () => {
			navigator.serviceWorker
				.register('/service-worker.js', { type: 'classic' })
				.catch((error) => {
					console.error('Service worker registration failed', error);
				});
		};

		if (document.readyState === 'complete') {
			register();
		} else {
			addEventListener(
				'load',
				() => register(),
				{ once: true }
			);
		}

		if (browser) {
			window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.addEventListener('appinstalled', handleAppInstalled);
			if (isStandaloneDisplay()) {
				showInstallBanner = false;
			}
		}
	 });

	onDestroy(() => {
		if (!browser) {
			return;
		}
		window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.removeEventListener('appinstalled', handleAppInstalled);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#0f172a" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta
		name="description"
		content="Chinesischer Zettelkasten hilft dir beim Üben von Pinyin, Schriftzeichen und Wortschatz mit interaktiven Lektionen, Matching-Spielen und einem intelligenten Wiederholungsplan."
	/>
	<title>Chinesischer Zettelkasten – Interaktive Handschrift- & Pinyin-Übungen</title>
	<meta property="og:title" content="Chinesischer Zettelkasten – effektiv Chinesisch lernen" />
	<meta
		property="og:description"
		content="Trainiere Schriftzeichen, Pinyin und Wortschatz mit einem interaktiven Zettelkasten, persönlichen Wiederholungen und Matching-Runden."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="de_DE" />
	<link rel="apple-touch-icon" href={favicon} />
</svelte:head>

{#if showInstallBanner}
	<div class="pointer-events-none fixed bottom-4 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 px-4">
		<div class="pointer-events-auto rounded-2xl bg-slate-900/95 p-4 text-white shadow-2xl ring-1 ring-slate-700/60">
			<h2 class="text-base font-semibold">App installieren?</h2>
			<p class="mt-2 text-sm text-slate-200">Füge den Zettelkasten zum Startbildschirm hinzu, um auch offline schnell zu üben.</p>
			<div class="mt-3 flex items-center justify-between gap-2">
				<button
					class="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 transition hover:border-white/40 hover:text-white"
					type="button"
					on:click={dismissInstallBanner}
				>
					Später
				</button>
				<button
					class="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
					type="button"
					on:click={triggerInstall}
					disabled={installRequestPending}
				>
					{installRequestPending ? 'Öffnet …' : 'Installieren'}
				</button>
			</div>
		</div>
	</div>
{/if}

<main class="min-h-screen">
	<slot />
</main>
