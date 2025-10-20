import type { ExecutionContext, KVNamespace } from '@cloudflare/workers-types';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				// Declare Cloudflare bindings here, for example:
				// COUNTER: DurableObjectNamespace;
				[key: string]: KVNamespace | unknown;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};

declare module '*?raw' {
	const content: string;
	export default content;
}
