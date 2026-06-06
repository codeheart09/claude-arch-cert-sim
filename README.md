# Claude Certified Architect Exam Simulator

A training application for engineers preparing for the **Claude Certified Architect** certification exam. It provides a realistic, interactive exam simulation experience to build confidence and deepen understanding of Claude's architecture, capabilities, and best practices.

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

Then install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database

The database is a local SQLite file at `db/local.db` (git-ignored). To set it up or reset it after pulling changes:

```bash
pnpm db:generate   # generate migration files from the schema
pnpm db:migrate    # apply migrations to db/local.db
```

Run both commands in sequence whenever the schema in `db/schema.ts` changes. Never edit the `.db` file directly.

## Project Structure

```
/
├── app/          # Next.js App Router pages and layouts
├── components/   # Reusable UI components
├── db/           # Drizzle schema, queries, and migrations
├── lib/          # Shared utilities and helpers
└── public/       # Static assets
```
