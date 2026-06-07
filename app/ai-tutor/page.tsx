import { connection } from "next/server";
import { AiTutorChat } from "@/components/ai-tutor/ai-tutor-chat";
import { listConversations } from "@/lib/conversations";

export default async function AiTutorPage({
	searchParams,
}: {
	searchParams: Promise<{ c?: string }>;
}) {
	await connection();
	const { c } = await searchParams;
	const conversations = listConversations();
	const initialActiveId = c ? Number(c) : undefined;
	return (
		<AiTutorChat
			initialConversations={conversations}
			initialActiveId={initialActiveId}
		/>
	);
}
