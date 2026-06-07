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

## App Pages and Sessions

The simulator is organized into dedicated study pages. Some pages run active answer sessions, while others summarize your progress or manage the local question bank and user data.

### Your Analytics

The **Your Analytics** page is a read-only progress view rather than a practice session.

You can filter the dashboard by `24 h`, `7 days`, `30 days`, `60 answers`, `300 answers`, or `All time`. The page then recalculates your metrics for that selected window.

What it includes:

- **Overview metrics** for overall accuracy, exam passes, average answer time, and average exam time
- **Category breakdowns** showing accuracy by domain and by scenario
- **Trend charts** for accuracy over time and answer-speed trends across answer batches
- **Empty states** when you do not yet have enough recorded answers or completed exams to populate a chart or stat

This page is powered by your persisted practice answers and exam results, so it becomes more useful as you spend time in the simulator's study modes.

### Exam Simulation

The **Exam Simulation** page is the full-length certification practice mode. A session starts on a setup screen where you define the total exam time in hours, minutes, and seconds.

When you start, the app creates a persisted exam session and serves a balanced **60-question** exam set. During the session, you work through one question at a time with a running countdown timer. Each answer must be explicitly submitted before you move on.

What the session includes:

- **Total exam timer** with overtime display if the limit is exceeded
- **One-question-at-a-time flow** with explicit answer submission
- **Question navigation grid** showing progress through the 60-question set
- **Controlled navigation** so you can revisit answered questions and the current question, but not jump ahead to unanswered future questions
- **Immediate answer persistence** for every submitted response, including per-question duration
- **Restart control** if you want to discard the current run and begin again

How the session ends:

- **Manual finish** once all questions are answered, or when you reach the final eligible step in the flow
- **Automatic finalization** when the total exam timer expires

Results are shown only after the exam ends. The results screen includes:

- **Score out of 1000** with pass/fail status against the **720-point** threshold
- **Correct and wrong counts**
- **Total exam duration** and **average time per question**
- **Performance breakdowns** by domain and by scenario

### Timed Questions

The **Timed Questions** page is a rolling practice mode where each question has its own time limit. A session begins with a setup screen where you configure the per-question timer in hours, minutes, and seconds.

Once started, the page shows one random question at a time with a live countdown. If the timer reaches zero, the display continues into overtime so you can see how far past the target you went. You can also pause and resume the timer during the question, or restart the whole timed session.

What the session includes:

- **Per-question countdown timer** with overtime display
- **Pause and resume controls**
- **Restart control** to return to setup and begin again
- **Immediate grading** after submission
- **Stored answer duration** captured when you submit the question
- **Next-question flow** for continuous timed drilling

After you submit an answer, the app shows immediate feedback with a correct/incorrect result and the stored explanation for the option you selected.

This mode also includes a **flag/challenge action**. If a question seems incorrect or unclear, you can send it to the **AI Tutor** for review, which opens a challenge conversation tied to that question.

If the question bank is empty, the page shows a fallback message instead of starting practice.

### Random Questions

The **Random Questions** page is the simplest ongoing practice mode. It serves one random question at a time without a timer, making it useful for steady drilling without time pressure.

The session flow is straightforward: select an answer, submit it for grading, read the immediate explanation, and move to the next question. The app tracks which questions have already been served in the current run so it can cycle through unseen items before resetting that served list and starting the pool again.

What the session includes:

- **Untimed question-by-question practice**
- **Immediate grading and explanation** after submission
- **Continuous next-question flow**
- **Answer history recording** for analytics and progress tracking
- **Question-pool cycling** to reduce repeats until the current served set is exhausted

Unlike Timed Questions, this mode does **not** capture per-answer duration.

This page also includes the **flag/challenge action** that sends the current question into **AI Tutor** for review in a dedicated challenge conversation.

If the question bank is empty, the page shows a fallback message telling you to seed the database before practicing.

### Configurations

The **Configurations** page is for managing the local simulator rather than running an answer session.

Its main area is the **Question Bank** panel, which shows the current number of stored questions and lets you ask the app to generate more. You choose how many new questions to generate, start the run, watch a live progress indicator, and follow the streaming execution log as the generation agents work.

What it includes:

- **Current question-bank count**
- **Generate N new questions** input, capped for local batch generation
- **Live progress tracking** during generation
- **Streaming execution log** with created, duplicate, and failed outcomes
- **Cancel control** while a generation run is in progress
- **Post-run summary** showing how many questions were created, skipped as duplicates, or failed
- **Updated total count** after the run completes

Generated questions are grounded in the local RAG knowledge base and checked for uniqueness before being added to the bank.

The page also includes a **Danger Zone** for wiping local user progress. This reset removes:

- Your user profile
- Practice answer history
- Exam simulation records and scores
- AI Tutor conversation history

The reset does **not** remove questions from the database. It uses a confirmation modal and is intentionally irreversible.

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
