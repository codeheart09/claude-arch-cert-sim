/**
 * Corpus loading + chunking for the RAG knowledge base.
 *
 * Document-agnostic: it turns any well-structured markdown file in the corpus
 * folder into embeddable chunks. The exam guide is the first such document, not
 * a special case — adding a new document means dropping a `.md` into the corpus
 * directory (see DATABASE.md), not editing this code.
 *
 * Pure logic, deliberately kept free of DB/embedding concerns so it can be unit
 * tested in isolation and reused by the seed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Doc-level metadata, read from each file's YAML frontmatter. */
export interface DocMeta {
	/** Stable source id (defaults to the filename without extension). */
	source: string;
	/** Coarse document kind, e.g. "exam-guide" | "study-guide" | "exemplar-questions". */
	type: string;
	/** Human-readable title, if declared. */
	title?: string;
}

/** One embeddable unit of corpus text plus the metadata used to filter retrieval. */
export interface CorpusChunk {
	source: string;
	type: string;
	/** Ancestor heading texts, outermost first (e.g. ["Domain 1: …", "Task Statement 1.1: …"]). */
	headingTrail: string[];
	/** The deepest heading the chunk sits under. */
	heading: string;
	/** 0-based running index within the document, preserving order. */
	chunkIndex: number;
	text: string;
	/** Derived tag: "Domain N: …" when present in the heading trail, else null. */
	domain: string | null;
	/** Derived tag: task-statement id like "1.1" when present, else null. */
	taskStatement: string | null;
}

/**
 * Soft/hard size limits, in characters. The local embedding model
 * (BGE-small-en-v1.5) truncates at 512 tokens, so chunks must stay under that.
 * We budget conservatively at ~4 chars/token: a ~400-token target with a hard
 * cap well below 512.
 */
const TARGET_CHARS = 1600;
const MAX_CHARS = 1900;
/** Max chars of trailing context carried between split pieces for continuity. */
const OVERLAP_CHARS = 240;

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

interface ParsedDoc {
	meta: DocMeta;
	body: string;
}

/** Parses leading YAML frontmatter (flat `key: value` only — no extra dependency). */
export function parseFrontmatter(
	raw: string,
	fallbackSource: string,
): ParsedDoc {
	const match = raw.match(FRONTMATTER_RE);
	const meta: DocMeta = { source: fallbackSource, type: "document" };
	if (!match) {
		return { meta, body: raw };
	}
	for (const line of match[1].split(/\r?\n/)) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1];
		const value = kv[2].trim();
		if (!value) continue;
		if (key === "source" || key === "type" || key === "title") {
			meta[key] = value;
		}
	}
	return { meta, body: raw.slice(match[0].length) };
}

/**
 * Derives optional structured tags from the heading trail. Generic by default —
 * it simply finds nothing for documents that don't use this vocabulary. A new
 * document type needing bespoke tags adds a case here, not a new chunker.
 */
export function extractTags(headingTrail: string[]): {
	domain: string | null;
	taskStatement: string | null;
} {
	let domain: string | null = null;
	let taskStatement: string | null = null;
	for (const heading of headingTrail) {
		if (/^Domain \d+:/.test(heading)) {
			domain = heading;
		}
		const task = heading.match(/^Task Statement (\d+\.\d+)\b/);
		if (task) {
			taskStatement = task[1];
		}
	}
	return { domain, taskStatement };
}

/**
 * Breaks text into atoms — lines within paragraphs, then sentences, then hard
 * slices — each capped at TARGET_CHARS so that overlap + one atom can never
 * exceed MAX_CHARS during packing.
 */
function atomize(text: string): string[] {
	const atoms: string[] = [];
	const push = (value: string): void => {
		const trimmed = value.trim();
		if (trimmed) atoms.push(trimmed);
	};
	for (const para of text.split(/\n{2,}/)) {
		if (para.trim().length <= TARGET_CHARS) {
			push(para);
			continue;
		}
		for (const line of para.split(/\n/)) {
			if (line.trim().length <= TARGET_CHARS) {
				push(line);
				continue;
			}
			for (const sentence of line.split(/(?<=[.!?])\s+/)) {
				if (sentence.length <= TARGET_CHARS) {
					push(sentence);
				} else {
					for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
						push(sentence.slice(i, i + TARGET_CHARS));
					}
				}
			}
		}
	}
	return atoms;
}

/** Splits a section's text into pieces that each fit the embedding budget. */
function splitToBudget(text: string): string[] {
	if (text.length <= MAX_CHARS) {
		return [text];
	}
	// Greedily pack atoms up to MAX_CHARS, carrying a small trailing overlap into
	// the next piece for continuity (only when it is small enough to fit).
	const pieces: string[] = [];
	let current: string[] = [];
	let length = 0;
	const sep = (): number => (current.length ? 1 : 0);
	for (const atom of atomize(text)) {
		if (current.length && length + 1 + atom.length > MAX_CHARS) {
			pieces.push(current.join("\n"));
			const last = current[current.length - 1];
			if (last.length <= OVERLAP_CHARS) {
				current = [last];
				length = last.length;
			} else {
				current = [];
				length = 0;
			}
		}
		length += sep() + atom.length;
		current.push(atom);
	}
	if (current.length) {
		pieces.push(current.join("\n"));
	}
	return pieces;
}

/** Chunks one markdown document into ordered, metadata-tagged corpus chunks. */
export function chunkMarkdown(
	raw: string,
	fallbackSource: string,
): CorpusChunk[] {
	const { meta, body } = parseFrontmatter(raw, fallbackSource);
	const chunks: CorpusChunk[] = [];
	const stack: { level: number; text: string }[] = [];
	let buffer: string[] = [];
	let index = 0;

	const flush = (): void => {
		const text = buffer.join("\n").trim();
		buffer = [];
		if (!text) return;
		const headingTrail = stack.map((entry) => entry.text);
		const heading = headingTrail.at(-1) ?? meta.title ?? meta.source;
		const tags = extractTags(headingTrail);
		for (const piece of splitToBudget(text)) {
			chunks.push({
				source: meta.source,
				type: meta.type,
				headingTrail,
				heading,
				chunkIndex: index++,
				text: piece,
				...tags,
			});
		}
	};

	for (const line of body.split(/\r?\n/)) {
		const heading = line.match(HEADING_RE);
		if (heading) {
			flush();
			const level = heading[1].length;
			while (stack.length && stack[stack.length - 1].level >= level) {
				stack.pop();
			}
			stack.push({ level, text: heading[2].trim() });
		} else {
			buffer.push(line);
		}
	}
	flush();

	return chunks;
}

/** Reads and chunks every `.md` file in the corpus directory, in filename order. */
export function loadCorpus(dir: string): CorpusChunk[] {
	const files = readdirSync(dir)
		.filter((file) => file.endsWith(".md"))
		.sort();
	const chunks: CorpusChunk[] = [];
	for (const file of files) {
		const raw = readFileSync(join(dir, file), "utf8");
		chunks.push(...chunkMarkdown(raw, basename(file, ".md")));
	}
	return chunks;
}
