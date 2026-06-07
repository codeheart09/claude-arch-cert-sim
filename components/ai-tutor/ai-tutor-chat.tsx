"use client";

import {
	ActionIcon,
	Alert,
	Paper,
	Select,
	Text,
	Textarea,
	Tooltip,
} from "@mantine/core";
import {
	IconAlertCircle,
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

interface ErrorMessage {
	id: number;
	conversationId: number;
	role: "error";
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
		(AiConversationMessage | OptimisticMessage | ErrorMessage)[]
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
		const convId = activeId;
		setInput("");
		setIsStreaming(true);
		setStreamingText("");

		const optimisticId = Date.now();
		const optimisticMsg: OptimisticMessage = {
			id: optimisticId,
			conversationId: convId,
			role: "user",
			content: userText,
			createdAt: new Date(),
		};
		setMessages((prev) => [...prev, optimisticMsg]);

		function makeErrorMsg(content: string): ErrorMessage {
			return {
				id: Date.now(),
				conversationId: convId,
				role: "error",
				content,
				createdAt: new Date(),
			};
		}

		try {
			const res = await fetch("/api/ai-tutor", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversationId: convId,
					userMessage: userText,
				}),
			});

			if (!res.ok || !res.body) {
				const text = await res.text().catch(() => "");
				setMessages((prev) => [
					...prev.filter((m) => m.id !== optimisticId),
					makeErrorMsg(
						text.trim() || `Request failed with status ${res.status}.`,
					),
				]);
				setIsStreaming(false);
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let fullText = "";
			let buffer = "";
			let streamDone = false;

			while (!streamDone) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const payload = line.slice(6).trim();

					if (payload === "[DONE]") {
						streamDone = true;
						startTransition(async () => {
							const fresh = await getConversationMessages(convId);
							setMessages(fresh);
							setConversations((prev) =>
								prev.map((c) =>
									c.id === convId
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
						} else if (data.type === "error") {
							streamDone = true;
							const errorMsg = makeErrorMsg(
								data.message ?? "An unexpected error occurred.",
							);
							startTransition(async () => {
								const fresh = await getConversationMessages(convId);
								setMessages([...fresh, errorMsg]);
							});
							setStreamingText("");
							setIsStreaming(false);
							break;
						}
					} catch {
						// Ignore malformed SSE lines
					}
				}
			}

			if (!streamDone) {
				// Stream closed without a completion or error event
				setIsStreaming(false);
				setStreamingText("");
				const errorMsg = makeErrorMsg(
					"The connection was interrupted. Please try again.",
				);
				if (fullText) {
					startTransition(async () => {
						const fresh = await getConversationMessages(convId);
						setMessages([...fresh, errorMsg]);
					});
				} else {
					setMessages((prev) => [
						...prev.filter((m) => m.id !== optimisticId),
						errorMsg,
					]);
				}
			}
		} catch (err) {
			setIsStreaming(false);
			setStreamingText("");
			const message =
				err instanceof Error ? err.message : "Failed to connect to the server.";
			setMessages((prev) => [
				...prev.filter((m) => m.id !== optimisticId),
				makeErrorMsg(message),
			]);
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

					{messages.map((msg) => {
						if (msg.role === "error") {
							return (
								<Alert
									key={msg.id}
									icon={<IconAlertCircle size={16} />}
									color="red"
									variant="light"
									className={classes.errorMessage}
								>
									{msg.content}
								</Alert>
							);
						}

						return (
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
						);
					})}

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
								{streamingText ? (
									<>
										<div className={classes.markdown}>
											<Markdown remarkPlugins={[remarkGfm]}>
												{streamingText}
											</Markdown>
										</div>
										<span className={classes.cursor} aria-hidden="true" />
									</>
								) : (
									<div
										className={classes.typingIndicator}
										role="status"
										aria-label="Thinking…"
									>
										<span className={classes.typingDot} />
										<span className={classes.typingDot} />
										<span className={classes.typingDot} />
									</div>
								)}
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
