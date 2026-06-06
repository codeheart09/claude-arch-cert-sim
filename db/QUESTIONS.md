# Questions: JSON Schema and Import Process

Pre-authored exam questions live in `db/questions.json`. The seed script imports them into the `questions` runtime table and their vector embeddings into `questions_vec`.

## JSON record format

Each record in `db/questions.json` must conform to this shape:

```json
{
  "question": "string — the question stem",
  "difficulty": "easy" | "medium" | "hard",
  "domain": "agentic-architecture" | "tool-design-mcp" | "claude-code-config" | "prompt-engineering" | "context-reliability",
  "scenario": "customer-support-agent" | "code-generation" | "multi-agent-research" | "developer-productivity" | "ci-cd-integration" | "structured-data-extraction",
  "alternatives": {
    "a": "string",
    "b": "string",
    "c": "string",
    "d": "string"
  },
  "correct_alternative": "b",
  "insights": {
    "a": "Why A is wrong...",
    "b": "Why B is correct...",
    "c": "Why C is wrong...",
    "d": "Why D is wrong..."
  }
}
```

### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `question` | string | yes | The question stem. Also used as the dedup key (SHA-256 hash). |
| `difficulty` | enum | yes | `easy`, `medium`, or `hard` |
| `domain` | enum | no | Primary exam domain this question tests (see below) |
| `scenario` | enum | no | Exam scenario this question belongs to (see below) |
| `alternatives` | object | yes | Keys must be letters from `a`–`e`. Standard questions use `a`–`d`. |
| `correct_alternative` | enum | yes | Must be a key that exists in `alternatives` |
| `insights` | object | yes | One entry per alternative explaining why it is correct or incorrect |

### Domain enum values

| Value | Exam domain |
|-------|-------------|
| `agentic-architecture` | Domain 1: Agentic Architecture & Orchestration (27%) |
| `tool-design-mcp` | Domain 2: Tool Design & MCP Integration (18%) |
| `claude-code-config` | Domain 3: Claude Code Configuration & Workflows (20%) |
| `prompt-engineering` | Domain 4: Prompt Engineering & Structured Output (20%) |
| `context-reliability` | Domain 5: Context Management & Reliability (15%) |

### Scenario enum values

| Value | Scenario |
|-------|----------|
| `customer-support-agent` | Scenario 1: Customer Support Resolution Agent |
| `code-generation` | Scenario 2: Code Generation with Claude Code |
| `multi-agent-research` | Scenario 3: Multi-Agent Research System |
| `developer-productivity` | Scenario 4: Developer Productivity with Claude |
| `ci-cd-integration` | Scenario 5: Claude Code for Continuous Integration |
| `structured-data-extraction` | Scenario 6: Structured Data Extraction |

## Import process

Questions are imported by `pnpm db:seed`, which:

1. Reads `db/questions.json`
2. Batch-embeds all question texts with the local BGE-small-en-v1.5 model
3. For each question, computes its SHA-256 content hash and skips it if already present
4. Inserts new questions into the `questions` table and their vectors into `questions_vec`

Re-running `pnpm db:seed` is safe — it only adds new questions and never removes existing ones.

## Adding questions

1. Append one or more records to `db/questions.json`
2. Run `pnpm db:seed`
3. Verify the logged "Imported N authored questions" count

## AI-generated questions

The `lib/questions.ts` facade (`importSingleQuestion`, `importQuestionsFromFile`) uses the same underlying functions and the same idempotency logic. AI-generated questions are stored with `source = 'generated'` (the default for `source = 'authored'` only applies when importing from this file).
