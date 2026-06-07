# Claude Certified Architect Exam Simulator

A local-first training application for engineers preparing for the **Claude Certified Architect** certification exam. It combines structured practice modes, analytics, and agent-driven study workflows to help you build exam readiness against the certification's architecture, API, prompting, safety, and operational topics.

It is an **agentic application**: agents generate fresh, unseen questions, challenge and explain answers, and use a local RAG knowledge base to stay grounded in the exam material.

## Features

- **Random practice questions** to drill across the question bank without repeating the same flow every session
- **Timed per-question practice** for response-speed training with pause/resume support
- **Full exam simulator** with a 60-question session, total exam timer, scoring, and results breakdown
- **Immediate answer feedback** with per-option insights that explain why each choice is right or wrong
- **Analytics dashboard** for accuracy, exam passes, answer speed, exam duration, and category trends
- **AI tutor conversations** for follow-up questions and challenge flows tied to specific questions
- **Agent-generated questions** added to the local bank, with schema validation and semantic deduplication
- **Local RAG grounding** over the certification study corpus so generated content stays aligned to the exam guide
- **Local-only operation** with no authentication or hosted app dependency

## Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js](https://nextjs.org/docs/app) 16 (App Router) |
| Language | TypeScript |
| UI | [Mantine](https://mantine.dev/) 9 + CSS Modules |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| Vector Search | [`sqlite-vec`](https://github.com/asg017/sqlite-vec) |
| Embeddings | [`fastembed`](https://github.com/qdrant/fastembed) with a local model |
| LLM Integration | [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) |
| RAG | Local knowledge base retrieval over seeded exam-study content |
| Auth | None — clone and run locally |

## Getting Started

If you don't have pnpm installed:

```bash
npm install -g pnpm
```

Then install dependencies, set up the database, and start the dev server — in this order:

```bash
pnpm install                  # install dependencies
cp .env.example .env.local    # create local config
# Edit .env.local to add your credentials
pnpm db:migrate               # create db/local.db and apply migrations
pnpm db:seed                  # build the knowledge base (downloads the local embedding model on first run)
pnpm dev                      # start the dev server
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The database must be migrated and seeded **before** `pnpm dev` — the app reads from it on startup. See [DATABASE.md](./DATABASE.md) for the full database architecture.

## Environment Configuration

Start by copying `.env.example` to `.env.local`, then review the values before first run.

- `ANTHROPIC_API_KEY`: required for AI-driven features such as question generation and tutor conversations. Replace the placeholder with a real key if you plan to use those workflows.
- `ANTHROPIC_MODEL`: optional. Leave the default unless you intentionally want a different Anthropic model.
- `QUESTION_GEN_CONCURRENCY`: optional. Controls how many generation agents run in parallel for batch generation; the default is usually fine for local use.
- `DATABASE_FILE`: optional. Leave it as `db/local.db` unless you deliberately want the app to use a different local SQLite file.

Copying the example is only the starting point: if you want the agentic features, you must supply your own `ANTHROPIC_API_KEY`.

## Database

A single local SQLite file at `db/local.db` (git-ignored) holds both the knowledge base (RAG source) and runtime data. See **[DATABASE.md](./DATABASE.md)** for the full architecture and the rules on what owns which tables.

Day-to-day commands:

```bash
pnpm db:migrate    # apply migrations (run after pulling schema changes)
pnpm db:seed       # rebuild the knowledge base from source (run after pulling corpus changes)
```

When you change the schema in `db/schema.ts`, generate the migration first, then apply it:

```bash
pnpm db:generate   # generate a migration from the updated schema
pnpm db:migrate    # apply it to db/local.db
```

Never edit the `.db` file directly.

Vector search uses the `sqlite-vec` extension. It is verified on macOS (x64); Linux and Windows are not yet validated and may need a matched extension build — see [DATABASE.md](./DATABASE.md#platform-compatibility) if vector queries fail with "no such module: vec0".

## Project Structure

```
/
├── app/          # Next.js App Router pages and layouts
├── components/   # Reusable UI components
├── db/           # Drizzle schema, queries, and migrations
├── lib/          # Shared utilities and helpers
└── public/       # Static assets
```
