
# Claude Certified Architect Exam Simulator — AI Instructions

## Project overview

A local-only Next.js exam simulator for engineers preparing for the Claude Certified Architect certification. Users clone and run it locally. No hosted deployment, no authentication.

It is an **agentic application** — agents interact with the user to generate unseen questions, evaluate performance, and drive other intelligent interactions. The RAG knowledge base (see `DATABASE.md`) is what grounds those agents.

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

## Styling & UI

**Read `DESIGN.md` before writing UI.** It defines the design approach and is the
authoritative source for component/styling patterns. Summary of the non-negotiables:

- **Mantine 9 is the component library.** Use a Mantine component before writing custom
  markup. Follow the decision hierarchy in `DESIGN.md`: Mantine component → props/style
  props → theme → CSS Module → custom component.
- **Global design decisions live in `app/theme.ts`** (`createTheme`), not on instances.
- **Fine-tuning uses CSS Modules.** Co-located `ComponentName.module.css`, applied via
  `className` / `classNames`. Inside CSS, reference **Mantine CSS variables**
  (`var(--mantine-spacing-md)`, `var(--mantine-color-blue-6)`, …) — never hardcoded
  colors/sizes.
- **No inline `style={{...}}` and no Mantine `styles={{...}}` prop** (it's inline style
  and outranks CSS Modules). Use `classNames` + a CSS Module instead.
- Global styles only in `app/globals.css`.
- **No Tailwind** and no second styling/component library — none is installed.
- Mantine interactive components are `'use client'`; keep pages/layouts as Server
  Components and push Mantine into client leaf components.
- **Light and dark mode are both mandatory.** Every view must work in both; use semantic
  Mantine color variables / `light-dark()`, never per-scheme hardcoding. An
  always-visible color-scheme toggle lives in a corner of the screen on every route.

## Database (Drizzle + SQLite + sqlite-vec)

See `DATABASE.md` for the full architecture. Key points:

- One file, `db/local.db`, holds two responsibilities: the **knowledge base** (RAG source — read-only at runtime) and **generated content** (runtime read/write). Keep them in separate tables.
- Query/repository functions live in `db/` (e.g., `db/questions.ts`). Use Drizzle's query builder or the `sql` tagged template — no raw string-concatenated SQL.
- Embeddings come from a **local model** — no external embedding API.
- **Knowledge-base tables (`kb_*`, incl. their `vec0` table) are owned by the seed** — it drops and recreates them each run. **Runtime tables are owned by Drizzle migrations** — their data must survive.
- Never modify the `.db` file manually. To reset, truncate runtime tables — do not delete `db/local.db` (that discards knowledge-base vectors and forces a full re-embed).
- **Never run `pnpm db:migrate` or `pnpm db:seed` without explicit user approval.** Both mutate `db/local.db`. Show the command you intend to run and wait for the user to confirm.

**When changing the database**

1. Classify the table first: *reference material the agent reads* → knowledge base; *data created by app usage* → runtime.
2. **Knowledge-base table** → edit its DDL in `db/seed.ts` (it drops and recreates KB tables). Do **not** add it to `schema.ts`, do **not** create a migration, and never put corpus content in migration history. After the change, run `pnpm db:seed`.
3. **Runtime table** → define it in `db/schema.ts`, then run `pnpm db:generate` → `pnpm db:migrate` in sequence. For a runtime `vec0` table, hand-write a custom `sql` migration (virtual tables can't live in `schema.ts`).

## File and folder conventions

- File and folder names: `kebab-case` (e.g., `question-card.tsx`, `use-timer.ts`).
- Component named exports are PascalCase.
- Routing only in `app/`. Business logic in `lib/`. UI components in `components/`. DB access in `db/`.
- **`app/` and `components/` must never import directly from `db/`.** All database access is proxied through `lib/` — one `lib/<domain>.ts` file per domain (e.g. `lib/user.ts` wraps `db/users.ts`). This keeps the app layer decoupled from the DB layer and gives `lib/` a place to add caching, transformation, or business rules later without touching DB code.
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
- **Never run `git commit` without explicit user approval.** Before committing, always show the proposed commit message and wait for the user to confirm or adjust it.

## Environment variables

- Local config goes in `.env.local` — never committed.
- Document every required variable in `.env.example` with a placeholder value.

## Domain rules

- Question content lives in the SQLite database, not hardcoded in components or pages.
- The database ships with a seed script — question data must be reproducible from source.


<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

