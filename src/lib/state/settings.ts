import { writable } from 'svelte/store';
import type { Settings } from '../types';
import { getSettings as readSettings, saveSettings as persistSettings } from '../storage/repository';

const settingsStore = writable<Settings | null>(null);

export const settings = {
	subscribe: settingsStore.subscribe,
	set(value: Settings) {
		settingsStore.set(value);
	},
	update(updater: (value: Settings) => Settings) {
		settingsStore.update((current) => {
			if (!current) {
				return current;
			}
			const next = updater(current);
			queueMicrotask(() => {
				persistSettings(next).catch((error) => console.error('Failed to save settings', error));
			});
			return next;
		});
	}
};

export async function loadSettings(): Promise<Settings> {
	const data = await readSettings();
	settingsStore.set(data);
	return data;
}

export async function saveSettings(next: Settings): Promise<void> {
	settingsStore.set(next);
	await persistSettings(next);
}
