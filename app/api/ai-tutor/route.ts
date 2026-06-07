import { connection } from "next/server";
import { messagesToParams, runAgentLoop } from "@/lib/ai-tutor";
import {
	addMessage,
	findConversation,
	getMessages,
	setConversationTitle,
} from "@/lib/conversations";

export const dynamic = "force-dynamic";

interface RequestBody {
	conversationId: number;
	userMessage: string;
}

function isValidBody(v: unknown): v is RequestBody {
	return (
		typeof v === "object" &&
		v !== null &&
		typeof (v as Record<string, unknown>).conversationId === "number" &&
		typeof (v as Record<string, unknown>).userMessage === "string" &&
		((v as Record<string, unknown>).userMessage as string).trim().length > 0
	);
}

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

	const { conversationId, userMessage } = body;

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (payload: string) =>
				controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

			try {
				// Persist user message
				addMessage(conversationId, "user", userMessage);

				// Build full message history for Claude
				const history = getMessages(conversationId);
				const params = messagesToParams(history);

				// Run the agent loop, streaming text deltas to the client
				const fullText = await runAgentLoop(params, (delta) => {
					send(JSON.stringify({ type: "text", delta }));
				});

				// Persist assistant response
				addMessage(conversationId, "assistant", fullText);

				// Auto-title the conversation on the first exchange
				const conv = findConversation(conversationId);
				if (conv?.title === "New conversation") {
					const snippet = userMessage.slice(0, 60).trim();
					setConversationTitle(conversationId, snippet || "Conversation");
				}

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
