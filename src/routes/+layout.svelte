<script lang="ts">
 import { onMount } from 'svelte';
 import { dev } from '$app/environment';
 import '../app.css';
 import favicon from '$lib/assets/favicon.svg';

 onMount(() => {
	if (dev) {
		return;
	}
 	if ('serviceWorker' in navigator) {
			if (!window.isSecureContext) {
				console.warn('Service workers require a secure context (HTTPS or localhost). Skipping registration.');
				return;
			}
			const register = () => {
				navigator.serviceWorker
					.register('/service-worker.js', { type: dev ? 'module' : 'classic' })
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
 	}
 });
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#0f172a" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="mobile-web-app-capable" content="yes" />
	<link rel="apple-touch-icon" href={favicon} />
</svelte:head>

<slot />
