"use client";

import {
	ActionIcon,
	Paper,
	Select,
	Text,
	Textarea,
	Tooltip,
} from "@mantine/core";
import {
	IconPlus,
	IconRobot,
	IconSend,
	IconTrash,
	IconUser,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, useTransition } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	createNewConversation,
	deleteConversation,
	getConversationMessages,
} from "@/app/ai-tutor/actions";
import type {
	AiConversation,
	AiConversationMessage,
} from "@/lib/conversations";
import classes from "./ai-tutor-chat.module.css";

interface Props {
	initialConversations: AiConversation[];
}

interface OptimisticMessage {
	id: number;
	conversationId: number;
	role: "user" | "assistant";
	content: string;
	createdAt: Date;
}

export function AiTutorChat({ initialConversations }: Props) {
	const [conversations, setConversations] =
		useState<AiConversation[]>(initialConversations);
	const [activeId, setActiveId] = useState<number | null>(
		initialConversations[0]?.id ?? null,
	);
	const [messages, setMessages] = useState<
		(AiConversationMessage | OptimisticMessage)[]
	>([]);
	const [streamingText, setStreamingText] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [input, setInput] = useState("");
	const [, startTransition] = useTransition();
	const messageListRef = useRef<HTMLDivElement>(null);

	// Load messages when conversation changes
	useEffect(() => {
		if (activeId === null) {
			setMessages([]);
			return;
		}
		startTransition(async () => {
			const msgs = await getConversationMessages(activeId);
			setMessages(msgs);
		});
	}, [activeId]);

	// Auto-scroll to bottom whenever messages or streaming text changes.
	// Reference both deps in the condition so Biome's exhaustive-deps rule is satisfied.
	useEffect(() => {
		if (messages.length === 0 && !streamingText) return;
		const el = messageListRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, streamingText]);

	async function handleNewConversation() {
		const id = await createNewConversation();
		const newConv: AiConversation = {
			id,
			title: "New conversation",
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		setConversations((prev) => [newConv, ...prev]);
		setActiveId(id);
		setMessages([]);
	}

	async function handleDeleteConversation() {
		if (activeId === null) return;
		await deleteConversation(activeId);
		const remaining = conversations.filter((c) => c.id !== activeId);
		setConversations(remaining);
		setActiveId(remaining[0]?.id ?? null);
	}

	function handleSelectConversation(val: string | null) {
		if (!val) return;
		setActiveId(Number(val));
	}

	async function handleSend() {
		if (!input.trim() || activeId === null || isStreaming) return;

		const userText = input.trim();
		setInput("");
		setIsStreaming(true);
		setStreamingText("");

		const optimisticId = Date.now();
		const optimisticMsg: OptimisticMessage = {
			id: optimisticId,
			conversationId: activeId,
			role: "user",
			content: userText,
			createdAt: new Date(),
		};
		setMessages((prev) => [...prev, optimisticMsg]);

		try {
			const res = await fetch("/api/ai-tutor", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversationId: activeId,
					userMessage: userText,
				}),
			});

			if (!res.ok || !res.body) {
				throw new Error(`Request failed: ${res.status}`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let fullText = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				// Keep the last (potentially incomplete) line in buffer
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const payload = line.slice(6).trim();

					if (payload === "[DONE]") {
						// Reload from DB to get canonical message IDs
						startTransition(async () => {
							const fresh = await getConversationMessages(activeId);
							setMessages(fresh);
							// Update conversation title in selector
							setConversations((prev) =>
								prev.map((c) =>
									c.id === activeId
										? {
												...c,
												title: userText.slice(0, 60).trim() || "Conversation",
											}
										: c,
								),
							);
						});
						setStreamingText("");
						setIsStreaming(false);
						break;
					}

					try {
						const data = JSON.parse(payload) as {
							type: string;
							delta?: string;
							message?: string;
						};
						if (data.type === "text" && data.delta) {
							fullText += data.delta;
							setStreamingText(fullText);
						}
					} catch {
						// Ignore malformed SSE lines
					}
				}
			}
		} catch {
			setIsStreaming(false);
			setStreamingText("");
			// Remove optimistic message on error
			setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			handleSend();
		}
	}

	const hasConversations = conversations.length > 0;
	const hasMessages = messages.length > 0 || isStreaming;

	return (
		<div className={classes.page}>
			<div className={classes.layout}>
				{/* Toolbar */}
				<div className={classes.toolbar}>
					<Select
						className={classes.selector}
						data={conversations.map((c) => ({
							value: String(c.id),
							label: c.title,
						}))}
						value={activeId !== null ? String(activeId) : null}
						onChange={handleSelectConversation}
						placeholder="No conversations yet"
						disabled={!hasConversations}
						clearable={false}
					/>
					<Tooltip label="New conversation" position="bottom">
						<ActionIcon
							variant="default"
							size="lg"
							onClick={handleNewConversation}
							aria-label="New conversation"
						>
							<IconPlus size={18} />
						</ActionIcon>
					</Tooltip>
					{activeId !== null && (
						<Tooltip label="Delete conversation" position="bottom">
							<ActionIcon
								variant="default"
								size="lg"
								color="red"
								onClick={handleDeleteConversation}
								aria-label="Delete conversation"
								disabled={isStreaming}
							>
								<IconTrash size={18} />
							</ActionIcon>
						</Tooltip>
					)}
				</div>

				{/* Message list */}
				<div className={classes.messageList} ref={messageListRef}>
					{!hasMessages && (
						<div className={classes.emptyState}>
							<IconRobot size={36} stroke={1.2} />
							<Text size="sm" fw={500}>
								{activeId === null
									? "Create a new conversation to start coaching."
									: "Send a message to begin."}
							</Text>
							<Text size="xs" c="dimmed">
								Ask about weak areas, exam concepts, or question walkthroughs.
							</Text>
						</div>
					)}

					{messages.map((msg) => (
						<div
							key={msg.id}
							className={`${classes.bubble} ${
								msg.role === "user"
									? classes.bubbleUser
									: classes.bubbleAssistant
							}`}
						>
							<div className={classes.bubbleIcon}>
								{msg.role === "user" ? (
									<IconUser size={14} />
								) : (
									<IconRobot size={14} />
								)}
							</div>
							<Paper
								className={classes.bubbleContent}
								radius="md"
								shadow="none"
							>
								{msg.role === "assistant" ? (
									<div className={classes.markdown}>
										<Markdown remarkPlugins={[remarkGfm]}>
											{msg.content}
										</Markdown>
									</div>
								) : (
									<Text className={classes.bubbleText}>{msg.content}</Text>
								)}
							</Paper>
						</div>
					))}

					{/* Live streaming bubble */}
					{isStreaming && (
						<div className={`${classes.bubble} ${classes.bubbleAssistant}`}>
							<div className={classes.bubbleIcon}>
								<IconRobot size={14} />
							</div>
							<Paper
								className={classes.bubbleContent}
								radius="md"
								shadow="none"
							>
								<div className={classes.markdown}>
									<Markdown remarkPlugins={[remarkGfm]}>
										{streamingText || " "}
									</Markdown>
								</div>
								<span className={classes.cursor} aria-hidden="true" />
							</Paper>
						</div>
					)}
				</div>

				{/* Input row */}
				<div className={classes.inputRow}>
					<Textarea
						className={classes.textarea}
						placeholder="Ask a question… (⌘+Enter to send)"
						value={input}
						onChange={(e) => setInput(e.currentTarget.value)}
						onKeyDown={handleKeyDown}
						disabled={activeId === null || isStreaming}
						autosize
						minRows={1}
						maxRows={6}
					/>
					<Tooltip label="Send (⌘+Enter)" position="top">
						<ActionIcon
							size="lg"
							variant="filled"
							onClick={handleSend}
							disabled={!input.trim() || activeId === null || isStreaming}
							aria-label="Send message"
						>
							<IconSend size={18} />
						</ActionIcon>
					</Tooltip>
				</div>
			</div>
		</div>
	);
}
