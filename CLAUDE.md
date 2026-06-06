@AGENTS.md

# Claude Certified Architect Exam Simulator — AI Instructions

## Project overview

A local-only Next.js exam simulator for engineers preparing for the Claude Certified Architect certification. Users clone and run it locally. No hosted deployment, no authentication.

**Stack:** Next.js 16 (App Router) · TypeScript (strict) · CSS Modules · SQLite + Drizzle ORM · Biome · Vitest

---

## Package management

- Always install dependencies using `pnpm add <package>@latest` (or `pnpm add -D <package>@latest` for dev). Never edit `package.json` version fields directly — that risks resolving older cached versions.
- Use `pnpm` for all script invocations (`pnpm dev`, `pnpm build`, `pnpm test`, etc.).

## Library research

Before writing code that uses any library (Next.js, Drizzle, Biome, Vitest, React, etc.), **search and fetch the latest documentation**. Training data is likely stale for all packages in this project — Next.js 16 and Drizzle in particular have breaking changes from earlier versions.

---

## Next.js conventions

- **App Router only.** Never introduce Pages Router patterns (`pages/`, `getServerSideProps`, `getStaticProps`, `_app.tsx`).
- **Server Components by default.** Only add `'use client'` when the component needs browser APIs, event listeners, or React state/effects.
- **Server Actions for mutations.** Use `'use server'` functions for writes. Avoid API routes unless exposing an endpoint for external consumers.
- Never use `useEffect` to fetch data — use Server Components or the `use()` hook.

## TypeScript

- `strict: true` is enabled — do not disable it.
- No `any`. No `@ts-ignore` or `as any` casts. Use proper types or `unknown` with narrowing.
- Prefer `interface` for object shapes, `type` for unions, intersections, and primitives.
- No default exports except for Next.js page and layout files (which require them).

## Styling

- All component styles go in a co-located `ComponentName.module.css` file.
- Global styles only in `app/globals.css`.
- No inline `style={{...}}` props.
- No Tailwind utility classes — none is installed.

## Database (Drizzle + SQLite)

- Schema definitions live in `db/schema.ts`.
- Query/repository functions live in `db/` (e.g., `db/questions.ts`).
- Use Drizzle's query builder or the `sql` tagged template. No raw string-concatenated SQL.
- **After any schema change**, always run both commands in sequence:
  1. `pnpm db:generate` — generates the migration file from the updated schema
  2. `pnpm db:migrate` — applies the migration to the local SQLite database
- Never modify the SQLite `.db` file manually and never skip these steps after a schema edit.

## File and folder conventions

- File and folder names: `kebab-case` (e.g., `question-card.tsx`, `use-timer.ts`).
- Component named exports are PascalCase.
- Routing only in `app/`. Business logic in `lib/`. UI components in `components/`. DB access in `db/`.
- Test files are co-located with the source file they test: `question-card.test.tsx` next to `question-card.tsx`.

## Linting and formatting (Biome)

- Run `pnpm biome check --write .` to lint and format before committing.
- Do not introduce ESLint or Prettier configs — Biome replaces both.

## Testing (Vitest)

- Unit and integration tests use Vitest.
- Co-locate test files with source (`.test.ts` / `.test.tsx`).
- Test pure logic and data transformations first; avoid testing Next.js internals.
- Run tests with `pnpm test`.

## Git

- Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- One logical change per commit.

## Environment variables

- Local config goes in `.env.local` — never committed.
- Document every required variable in `.env.example` with a placeholder value.

## Domain rules

- Question content lives in the SQLite database, not hardcoded in components or pages.
- The database ships with a seed script — question data must be reproducible from source.
