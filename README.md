# Claude Certified Architect Exam Simulator

A training application for engineers preparing for the **Claude Certified Architect** certification exam. It provides a realistic, interactive exam simulation experience to build confidence and deepen understanding of Claude's architecture, capabilities, and best practices.

It is an **agentic application**: agents interact with you to generate fresh, unseen questions, evaluate your performance, and power other intelligent interactions throughout a session.

## Purpose

The certification exam tests knowledge across a range of topics including Claude's model capabilities, API usage patterns, prompt engineering, tool use, safety considerations, and architectural best practices for production deployments. This simulator lets candidates:

- Practice with exam-style questions across all topic domains
- Get immediate feedback with detailed explanations
- Track progress and identify weak areas over time
- Simulate timed exam conditions

## Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | CSS Modules |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| Auth | None — clone and run locally |

## Getting Started

If you don't have pnpm installed:

```bash
npm install -g pnpm
```

Then install dependencies, set up the database, and start the dev server — in this order:

```bash
pnpm install                  # install dependencies
cp .env.example .env.local    # create local config (edit if needed)
pnpm db:migrate               # create db/local.db and apply migrations
pnpm db:seed                  # build the knowledge base (downloads the local embedding model on first run)
pnpm dev                      # start the dev server
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The database must be migrated and seeded **before** `pnpm dev` — the app reads from it on startup. See [DATABASE.md](./DATABASE.md) for the full database architecture.

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
