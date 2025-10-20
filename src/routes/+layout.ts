// Disable SSR only when browser-driven Vitest runs set the flag.
export const ssr = import.meta.env.VITE_DISABLE_SSR !== 'true';
