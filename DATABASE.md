# Database Architecture

A single local SQLite file (`db/local.db`) serves **two responsibilities** that share one connection and one `sqlite-vec` extension load. They are kept separate by table grouping and by which script owns them — not by living in different files.

## The two responsibilities

### 1. Knowledge base (RAG source) — read-only at runtime

The reference material agents use to write certification-aligned questions: the exam guide, domain blueprint, study material, and curated exemplar questions. Each item is chunked, embedded with a **local embedding model** (no API keys, runs offline), and stored alongside its vector for similarity retrieval.

- **Owned by a re-runnable seed script**, not the app and not migration history.
- **Source-of-truth is committed markdown**, not the built vectors. Updating the corpus means editing the source markdown and re-running the seed — which produces reviewable diffs instead of an unmergeable binary blob.
- The seed only touches knowledge-base tables: it truncates and rebuilds them. Runtime data is never affected.

### 2. Generated content (runtime) — read/write

The questions the app produces and everything tied to a user's local sessions (generated questions + their embeddings, exam sessions, progress, scoring).

- **Owned by the app and by Drizzle migrations.**
- This is local, per-user state.
- Generated questions are embedded at runtime so new questions can be **deduplicated by semantic similarity** (vector near-neighbor search) against existing questions, and optionally against exemplars.

## Why one file

Both responsibilities are rebuilt from committed source (migrations + seed), so neither is a committed binary — which removes the only reason to split them across files. Keeping them together gives one connection, one `sqlite-vec` load, and cross-table dedup (e.g. "not too similar to any exemplar *or* existing question") in a single query.

## Embeddings

- Embeddings are produced by a **local model** — no external API, works offline, reproducible.
- `sqlite-vec` provides vector storage and search via `vec0` virtual tables. These are not first-class Drizzle definitions, so they are created with raw `sql` — either by the seed (knowledge base) or by a custom migration (runtime), depending on which side owns them (see below).

## Schema vs. content: which tool owns what

The dividing line: **Drizzle owns tables whose data must survive schema changes; the seed owns tables it rebuilds wholesale.** vec0 tables follow their owner.

| Tables | Owner | How |
|---|---|---|
| Knowledge base — schema **and** content (`kb_*`, incl. its `vec0` table) | Re-runnable seed | `pnpm db:seed` (drops + recreates each run) |
| Runtime — schema (sessions, progress, generated questions) | Drizzle migrations | `pnpm db:generate` → `pnpm db:migrate` |
| Runtime — the dedup `vec0` table for generated questions | Drizzle | custom `sql` migration (persists, so it can't be rebuilt) |
| Runtime — content | The app, at runtime | — |

Two consequences:
- **KB tables are deliberately not in Drizzle.** The seed creates and rebuilds them, so there is nothing for a migration to preserve. Corpus content never enters migration history — wording edits must not spawn migrations.
- **Runtime schema always goes through Drizzle**, including the one `vec0` table on the runtime side, which needs a custom `sql` migration because virtual tables can't be expressed in `schema.ts`.

## Resetting during development

Reset by **truncating runtime tables**, not by deleting `db/local.db`. Deleting the whole file discards the knowledge-base vectors too, forcing a full re-embed (the slow step). Treat "wipe the file" as a rare, deliberate act.

## Updating the corpus

1. Edit the source markdown for the knowledge base.
2. Run `pnpm db:seed` to re-chunk, re-embed, and rebuild the knowledge-base tables.
3. Runtime data (generated questions, sessions, progress) is left untouched.

## Platform compatibility

`sqlite-vec`'s prebuilt binary is compiled against an older SQLite (~3.45.x) than the one `better-sqlite3@12` bundles (3.53.x). This version skew is a known cross-platform concern and matters here because the project is public — Linux and Windows users will clone and run it.

| Platform | Status |
|---|---|
| macOS (x64) | Verified — extension loads, vector search returns correct results |
| Linux (x64) / Windows | **Not yet verified.** The same skew has been reported elsewhere to make the extension *load without error but register no functions*, so queries fail with "no such function" / "no such module: vec0". Needs validation. |

We do **not** work around this by downgrading `better-sqlite3`: its bundled SQLite is coupled to the Node ABI it ships prebuilds for, so an older release would likely lack a prebuilt for current Node and break installation instead — trading one incompatibility for another.

**If the extension loads but `vec0` / `vec_*` functions are missing:**
1. Confirm the symptom: `select vec_version();` errors even though `sqliteVec.load(db)` succeeded.
2. Supply a `sqlite-vec` build matched to your SQLite and load it via its loadable path, instead of the npm prebuilt.

The durable fix is a `better-sqlite3` + Node + `sqlite-vec` combination tested on macOS, Linux, and Windows — pinned as a known-good matrix rather than juggled per machine. Validating Linux and Windows is an open task.
