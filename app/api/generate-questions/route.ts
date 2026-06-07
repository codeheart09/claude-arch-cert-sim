import { connection } from "next/server";
import { buildCombos } from "@/lib/exam-taxonomy";
import {
	type GenerationResult,
	generateQuestion,
} from "@/lib/question-generator";
import { getQuestionCount } from "@/lib/questions";

export const dynamic = "force-dynamic";

const MAX_COUNT = 50;
const BATCH_SIZE = 3;

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
}

export async function GET(request: Request): Promise<Response> {
	await connection();

	const url = new URL(request.url);
	const countParam = Number(url.searchParams.get("count"));
	const count =
		Number.isFinite(countParam) && countParam > 0
			? Math.min(Math.floor(countParam), MAX_COUNT)
			: 5;

	const combos = buildCombos(count);
	const batches = chunk(combos, BATCH_SIZE);
	const results: GenerationResult[] = [];

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;

			const send = (payload: object): void => {
				if (closed) return;
				try {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
					);
				} catch {
					closed = true;
				}
			};

			try {
				for (const batch of batches) {
					if (request.signal.aborted || closed) break;
					await Promise.all(
						batch.map((combo) =>
							generateQuestion(combo, {
								log: (message) => send({ type: "log", message }),
							}).then((result) => {
								results.push(result);
								send({ type: "result", ...result });
							}),
						),
					);
				}

				const summary = {
					created: results.filter((r) => r.status === "created").length,
					duplicates: results.filter((r) => r.status === "duplicate").length,
					failed: results.filter(
						(r) => r.status === "invalid" || r.status === "error",
					).length,
				};

				send({ type: "done", summary, totalCount: getQuestionCount() });

				if (!closed) {
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					controller.close();
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				send({ type: "error", message });
				if (!closed) {
					try {
						controller.close();
					} catch {
						// already closed
					}
				}
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
