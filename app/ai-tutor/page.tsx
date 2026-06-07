import { connection } from "next/server";
import { AiTutorChat } from "@/components/ai-tutor/ai-tutor-chat";
import { listConversations } from "@/lib/conversations";

export default async function AiTutorPage() {
	await connection();
	const conversations = listConversations();
	return <AiTutorChat initialConversations={conversations} />;
}
