#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pinyin as convertToPinyin } from 'pinyin-pro';

function usage() {
	console.error('Usage: node scripts/convert-vocab-to-json.js <source-file.txt>');
}

function isHanCharacter(char) {
	return /\p{Script=Han}/u.test(char);
}

function slugify(value) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase()
		.slice(0, 32);
}

function normalisePinyinInput(value) {
	return value
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[·]/g, ' ')
		.split('/')
		[0]
		.replace(/\s+/g, ' ')
		.trim();
}

function extractPrimaryCharacters(raw) {
	const segment = raw.split(/[／/]/)[0]?.trim() ?? '';
	return Array.from(segment).filter((char) => isHanCharacter(char));
}

function buildAlternatePinyin(characters) {
	if (characters.length === 0) {
		return '';
	}

	const joined = characters.join('');
	const converted = convertToPinyin(joined, {
		toneType: 'num',
		type: 'array'
	});

	if (!Array.isArray(converted) || converted.length === 0) {
		return '';
	}

	return converted
		.map((syllable) => syllable.replace(/[\u00fcü]/g, 'v'))
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function createWordId(baseCandidate, prompt, existingIds) {
	const cleanedBase = baseCandidate.replace(/[^a-z0-9]/gi, '');
	let base = cleanedBase || slugify(prompt) || 'entry';
	let candidate = `w-${base}`;
	let counter = 1;

	while (existingIds.has(candidate)) {
		candidate = `w-${base}-${counter++}`;
	}

	existingIds.add(candidate);
	return candidate;
}

const [, , inputArg] = process.argv;

if (!inputArg) {
	usage();
	process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);

let fileContent;

try {
	fileContent = readFileSync(inputPath, 'utf8');
} catch (error) {
	console.error(`Failed to read file: ${inputPath}`);
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

const lines = fileContent.split(/\r?\n/);
const chapters = [];
const seenIds = new Set();

let currentChapter = null;

const flushChapter = () => {
	if (currentChapter && currentChapter.words.length > 0) {
		chapters.push(currentChapter);
	}
	currentChapter = null;
};

for (const rawLine of lines) {
	const line = rawLine.trim();
	if (!line) {
		continue;
	}

	if (/^Lektion\b/i.test(line)) {
		flushChapter();
		const match = line.match(/^Lektion\s*(\d+)/i);
		const chapterNumber = match ? Number.parseInt(match[1], 10) : chapters.length + 1;
		currentChapter = { chapter: chapterNumber, words: [] };
		continue;
	}

	if (!currentChapter) {
		console.warn(`Skipping vocab line outside of a chapter: ${line}`);
		continue;
	}

	if (/^Lektionsvokabular/i.test(line)) {
		continue;
	}

	const hanIndexMatch = line.match(/\p{Script=Han}/u);
	if (!hanIndexMatch || hanIndexMatch.index === undefined) {
		console.warn(`Skipping line without Chinese characters: ${line}`);
		continue;
	}

	const hanStart = hanIndexMatch.index;
	const pinyinPartRaw = line.slice(0, hanStart);
	const remainderRaw = line.slice(hanStart).trim();

	const pinyinNormalized = normalisePinyinInput(pinyinPartRaw);
	if (!pinyinNormalized) {
		console.warn(`Skipping line without detectable pinyin: ${line}`);
		continue;
	}

	const remainderMatch = remainderRaw.match(/^([\p{Script=Han}\s·（）()／/]+)\s*(.*)$/u);
	if (!remainderMatch) {
		console.warn(`Skipping line without translation: ${line}`);
		continue;
	}

	const charactersRaw = remainderMatch[1];
	const prompt = remainderMatch[2]?.trim() ?? '';

	const characters = extractPrimaryCharacters(charactersRaw);
	if (characters.length === 0) {
		console.warn(`Skipping line without valid characters: ${line}`);
		continue;
	}

	const alternatePinyin = buildAlternatePinyin(characters);
	const alternateList = alternatePinyin ? [alternatePinyin] : undefined;
	const id = createWordId(alternatePinyin || pinyinNormalized.replace(/\s+/g, ''), prompt, seenIds);

	currentChapter.words.push({
		id,
		prompt: prompt || pinyinNormalized,
		pinyin: pinyinNormalized,
		characters,
		...(alternateList ? { alternatePinyin: alternateList } : {})
	});
}

flushChapter();

if (chapters.length === 0) {
	console.error('No chapters were parsed. Ensure the source file is formatted correctly.');
	process.exit(1);
}

const outputDir = path.dirname(inputPath);
const baseName = path.basename(inputPath, path.extname(inputPath));
const outputPath = path.join(outputDir, `${baseName}.json`);

const payload = {
	version: 1,
	chapters
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`Converted ${inputPath} -> ${outputPath}`);
console.log(`Chapters: ${chapters.length}`);

const totalWords = chapters.reduce((acc, chapter) => acc + chapter.words.length, 0);
console.log(`Total words: ${totalWords}`);
