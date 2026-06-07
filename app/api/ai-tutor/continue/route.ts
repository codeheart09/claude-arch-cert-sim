import { connection } from "next/server";
import { messagesToParams, runAgentLoop } from "@/lib/ai-tutor";
import { addMessage, getMessages } from "@/lib/conversations";

export const dynamic = "force-dynamic";

interface RequestBody {
	conversationId: number;
}

function isValidBody(v: unknown): v is RequestBody {
	return (
		typeof v === "object" &&
		v !== null &&
		typeof (v as Record<string, unknown>).conversationId === "number"
	);
}

// Runs the agent loop for a conversation whose user message is already persisted.
// Used by the challenge flow: the message is seeded server-side, so we only need to stream the response.
export async function POST(request: Request): Promise<Response> {
	await connection();

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	if (!isValidBody(body)) {
		return new Response("Invalid request body", { status: 400 });
	}

	const { conversationId } = body;
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (payload: string) =>
				controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

			try {
				const history = getMessages(conversationId);
				const params = messagesToParams(history);

				const fullText = await runAgentLoop(params, (delta) => {
					send(JSON.stringify({ type: "text", delta }));
				});

				addMessage(conversationId, "assistant", fullText);

				send("[DONE]");
				controller.close();
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "An unknown error occurred.";
				send(JSON.stringify({ type: "error", message }));
				controller.close();
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
