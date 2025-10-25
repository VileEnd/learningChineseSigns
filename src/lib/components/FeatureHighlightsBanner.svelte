<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let visible = false;

	const dispatch = createEventDispatcher();

	function dismiss() {
		dispatch('dismiss');
	}
</script>

{#if visible}
	<section class="relative rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
		<button
			type="button"
			class="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
			on:click={dismiss}
			aria-label="Hinweis schließen"
		>
			✕
		</button>
		<h2 class="text-sm font-semibold text-slate-900">Was dich erwartet</h2>
		<ul class="mt-2 space-y-1">
			<li>✍️ Handschriftliche Zeichenübungen mit Strich-für-Strich-Feedback.</li>
			<li>🎯 Adaptive Pinyin- und Wortschatz-Abfragen mit persönlichem Wiederholungsplan.</li>
			<li>🧠 Matching-Runden, um Deutsch, Pinyin und Schriftzeichen zu verknüpfen.</li>
		</ul>
		<p class="mt-3 text-xs text-slate-500">
			Tipp: Tippe z. B. <code>ni3 hao3</code> – wir wandeln Zahlen automatisch in Tonzeichen um.
		</p>
	</section>
{/if}
