/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

if (import.meta.env.DEV) {
	sw.addEventListener('install', (event) => {
		event.waitUntil(sw.skipWaiting());
	});

	sw.addEventListener('activate', (event) => {
		event.waitUntil(sw.clients.claim());
	});

	sw.addEventListener('fetch', () => {
		// passthrough in development to avoid caching issues during HMR
	});
} else {
	const APP_CACHE = `learning-chinese-signs-${version}`;
	const ASSETS = [...build, ...files, ...prerendered];

	sw.addEventListener('install', (event) => {
		event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(ASSETS)));
	});

	sw.addEventListener('activate', (event) => {
		event.waitUntil(
			caches
				.keys()
				.then((keys) =>
					Promise.all(
						keys
							.filter((key) => key.startsWith('learning-chinese-signs-') && key !== APP_CACHE)
							.map((key) => caches.delete(key))
					)
				)
		);
	});

	sw.addEventListener('fetch', (event) => {
		const request = event.request;
		if (request.method !== 'GET') {
			return;
		}

		const url = new URL(request.url);

		if (url.origin === self.location.origin && ASSETS.includes(url.pathname)) {
			event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
			return;
		}

		event.respondWith(
			fetch(request)
				.then((response) => {
					const clone = response.clone();
					caches.open(APP_CACHE).then((cache) => cache.put(request, clone)).catch(() => undefined);
					return response;
				})
				.catch(async () => {
					const cached = await caches.match(request);
					if (cached) return cached;
					throw new Error('Offline und keine gespeicherte Antwort.');
				})
		);
	});
}
