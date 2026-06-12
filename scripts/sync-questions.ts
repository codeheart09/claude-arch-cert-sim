/**
 * Sync edited entries from db/questions.json into db/local.db — only the rows
 * whose text actually changed. Updates both the `questions` row (content +
 * content_hash) and its `questions_vec` embedding.
 *
 * Change detection: an entry is "changed" when sha256(question text) differs
 * from the content_hash stored on its authored DB row.
 *
 * Identity (which row a changed entry maps to): POSITION in the JSON array,
 * validated against the hashes of the unchanged entries. The seed imports
 * questions.json in array order, so authored rows line up 1:1 with the array.
 * Before updating anything, we require that every *unchanged* entry still
 * matches its same-position row by hash and that the row count matches — if
 * that lockstep is violated (reorder / insert / delete / soft-delete), the
 * script aborts instead of guessing. Before writing, it prints the L2 distance
 * between each changed row's new embedding and its existing vector as a
 * "is this the right row?" sanity signal (small = the pre-edit version).
 *
 * Generated questions (source='generated') are never touched — they aren't in
 * the JSON and live only in the DB.
 *
 * Applies changes by default. Pass --dry-run to preview without writing.
 *
 * Usage:
 *   tsx scripts/sync-questions.ts                 # apply changes from db/questions.json
 *   tsx scripts/sync-questions.ts --dry-run       # preview only, no writes
 *   tsx scripts/sync-questions.ts --json <path>   # use a different JSON file
 *   DATABASE_FILE=<path> tsx scripts/sync-questions.ts ...   # target another DB
 */
import { readFileSync } from "node:fs";
import { openDb } from "../db/client";
import { hashQuestion, type QuestionInput } from "../db/questions";
import { embedPassages } from "../lib/embeddings";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const jsonFlag = args.indexOf("--json");
const JSON_PATH = jsonFlag >= 0 ? args[jsonFlag + 1] : "db/questions.json";

interface AuthoredRow {
	id: number;
	question: string;
	content_hash: string;
}

interface Change {
	pos: number;
	id: number;
	entry: QuestionInput;
	oldHash: string;
	newHash: string;
}

/** Decode a stored vec0 blob (little-endian float32) into a Float32Array. */
function blobToF32(buf: Buffer): Float32Array {
	const out = new Float32Array(buf.length / 4);
	for (let i = 0; i < out.length; i++) {
		out[i] = buf.readFloatLE(i * 4);
	}
	return out;
}

function l2(a: Float32Array, b: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

async function main(): Promise<void> {
	const json = JSON.parse(readFileSync(JSON_PATH, "utf8")) as QuestionInput[];
	const db = openDb();

	// Authored rows in array order (the set the JSON is the source of truth for).
	const authored = db
		.prepare(
			"SELECT id, question, content_hash FROM questions WHERE source = 'authored' AND deleted = 0 ORDER BY id ASC",
		)
		.all() as AuthoredRow[];

	// Every live row's hash — used to reject edits that would duplicate or
	// reorder existing content.
	const allByHash = new Map(
		(
			db
				.prepare("SELECT id, content_hash FROM questions WHERE deleted = 0")
				.all() as { id: number; content_hash: string }[]
		).map((r) => [r.content_hash, r.id]),
	);

	// ── Lockstep validation ────────────────────────────────────────────────────
	if (authored.length !== json.length) {
		db.close();
		throw new Error(
			`Row/array length mismatch: ${authored.length} authored DB rows vs ${json.length} JSON entries. ` +
				"Position mapping is only safe when they line up 1:1. This indicates an " +
				"addition, deletion, or soft-delete — reseed for pure additions, or add a " +
				"stable id field to decouple identity from position.",
		);
	}

	const changes: Change[] = [];
	for (let pos = 0; pos < json.length; pos++) {
		const entry = json[pos];
		const row = authored[pos];
		const newHash = hashQuestion(entry.question);
		if (newHash === row.content_hash) {
			continue; // unchanged — confirms lockstep at this position
		}
		// Changed at this position. Guard against reorders / accidental dupes:
		// the new text must not already exist on a *different* row.
		const dupId = allByHash.get(newHash);
		if (dupId !== undefined && dupId !== row.id) {
			db.close();
			throw new Error(
				`Entry at position ${pos} (would map to row id ${row.id}) has text whose ` +
					`hash already exists on row id ${dupId}. This looks like a reorder or a ` +
					"duplicate, not an in-place edit. Aborting.",
			);
		}
		changes.push({
			pos,
			id: row.id,
			entry,
			oldHash: row.content_hash,
			newHash,
		});
	}

	if (changes.length === 0) {
		console.log(
			`No changes — ${JSON_PATH} matches the DB (${authored.length} authored rows).`,
		);
		db.close();
		return;
	}

	// Embed the new question texts (same passage embedder as the seed) so we can
	// both show the sanity distance and write the new vectors.
	const newVectors = await embedPassages(changes.map((c) => c.entry.question));

	console.log(
		`${changes.length} changed entr${changes.length === 1 ? "y" : "ies"} detected:\n`,
	);
	const getVec = db.prepare(
		"SELECT embedding FROM questions_vec WHERE rowid = ?",
	);
	for (let i = 0; i < changes.length; i++) {
		const c = changes[i];
		const existing = getVec.get(BigInt(c.id)) as
			| { embedding: Buffer }
			| undefined;
		const dist = existing
			? l2(newVectors[i], blobToF32(existing.embedding)).toFixed(4)
			: "n/a (no existing vector)";
		console.log(`  • position ${c.pos}  →  row id ${c.id}`);
		console.log(`      correct_alternative: ${c.entry.correct_alternative}`);
		console.log(
			`      hash: ${c.oldHash.slice(0, 12)}… → ${c.newHash.slice(0, 12)}…`,
		);
		console.log(`      L2(new vector, current vector): ${dist}`);
	}

	if (DRY_RUN) {
		console.log(
			"\nDry run (--dry-run) — no changes written. Re-run without it to apply.",
		);
		db.close();
		return;
	}

	const updateRow = db.prepare(
		`UPDATE questions
		 SET question = ?, difficulty = ?, domain = ?, scenario = ?,
		     alternatives = ?, correct_alternative = ?, insights = ?, content_hash = ?
		 WHERE id = ?`,
	);
	const delVec = db.prepare("DELETE FROM questions_vec WHERE rowid = ?");
	const insVec = db.prepare(
		"INSERT INTO questions_vec (rowid, embedding) VALUES (?, ?)",
	);

	const apply = db.transaction(() => {
		for (let i = 0; i < changes.length; i++) {
			const c = changes[i];
			updateRow.run(
				c.entry.question,
				c.entry.difficulty,
				c.entry.domain ?? null,
				c.entry.scenario ?? null,
				JSON.stringify(c.entry.alternatives),
				c.entry.correct_alternative,
				JSON.stringify(c.entry.insights),
				c.newHash,
				c.id,
			);
			delVec.run(BigInt(c.id));
			insVec.run(BigInt(c.id), newVectors[i]);
		}
	});
	apply();

	console.log(`\nApplied ${changes.length} update(s). Verifying…`);
	let ok = true;
	for (const c of changes) {
		const row = db
			.prepare("SELECT content_hash FROM questions WHERE id = ?")
			.get(c.id) as { content_hash: string };
		const vec = db
			.prepare("SELECT COUNT(*) AS n FROM questions_vec WHERE rowid = ?")
			.get(BigInt(c.id)) as { n: number };
		const good = row.content_hash === c.newHash && vec.n === 1;
		ok = ok && good;
		console.log(
			`  row ${c.id}: hash ${good ? "ok" : "MISMATCH"}, vec rows ${vec.n}`,
		);
	}
	console.log(
		ok ? "All updates verified." : "VERIFICATION FAILED — inspect the DB.",
	);
	db.close();
	if (!ok) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
