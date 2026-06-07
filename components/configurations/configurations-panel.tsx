"use client";

import {
	Alert,
	Badge,
	Button,
	Container,
	Divider,
	Group,
	List,
	Loader,
	Modal,
	NumberInput,
	Paper,
	Progress,
	ScrollArea,
	SimpleGrid,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
	IconAlertTriangle,
	IconBan,
	IconCircleCheck,
	IconCircleX,
	IconDatabase,
	IconRefresh,
	IconSparkles,
	IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { resetUserDataAction } from "@/app/actions";
import type { QuestionCombo } from "@/lib/exam-taxonomy";
import type { GenerationStatus } from "@/lib/question-generator";
import classes from "./configurations-panel.module.css";

interface LogEntry {
	id: string;
	time: string;
	type: "log" | "result";
	status?: GenerationStatus;
	message?: string;
	combo?: QuestionCombo;
	question?: string;
	elapsedMs?: number;
	questionId?: number;
}

interface Summary {
	created: number;
	duplicates: number;
	failed: number;
}

type Phase = "idle" | "running" | "done";

interface ConfigurationsPanelProps {
	initialCount: number;
}

function nowTime(): string {
	return new Date().toISOString().slice(11, 19);
}

function truncate(text: string, max = 70): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function comboLabel(combo: QuestionCombo): string {
	return `${combo.scenario}/${combo.domain}/${combo.difficulty}`;
}

function getAlertColor(summary: Summary | null): string {
	if (!summary) return "gray";
	if (summary.failed > 0) return "orange";
	if (summary.created === 0) return "yellow";
	return "green";
}

function StatusIcon({ status }: { status: GenerationStatus }) {
	if (status === "created") {
		return <IconCircleCheck size={13} color="var(--mantine-color-green-6)" />;
	}
	if (status === "duplicate") {
		return (
			<IconAlertTriangle size={13} color="var(--mantine-color-yellow-6)" />
		);
	}
	return <IconCircleX size={13} color="var(--mantine-color-red-6)" />;
}

function LogLine({ entry }: { entry: LogEntry }) {
	if (entry.type === "result" && entry.status && entry.combo) {
		const timing =
			entry.elapsedMs !== undefined
				? ` (${(entry.elapsedMs / 1000).toFixed(1)}s)`
				: "";
		return (
			<div className={classes.logEntry}>
				<Group gap={5} wrap="nowrap" align="center">
					<span className={classes.logIconWrapper}>
						<StatusIcon status={entry.status} />
					</span>
					<span className={classes.logText}>
						<Text span c="dimmed" fz="xs">
							{entry.time}{" "}
						</Text>
						<Text span fz="xs" fw={500}>
							{entry.status}
						</Text>
						<Text span c="dimmed" fz="xs">
							{timing} — {comboLabel(entry.combo)}
						</Text>
						{entry.question && (
							<Text span c="dimmed" fz="xs">
								{" "}
								— {truncate(entry.question)}
							</Text>
						)}
					</span>
				</Group>
			</div>
		);
	}
	return (
		<div className={classes.logEntry}>
			<Text c="dimmed" fz="xs">
				{entry.time} {entry.message}
			</Text>
		</div>
	);
}

export function ConfigurationsPanel({
	initialCount,
}: ConfigurationsPanelProps) {
	const router = useRouter();
	const [phase, setPhase] = useState<Phase>("idle");
	const [countValue, setCountValue] = useState<string | number>(5);
	const [requestedCount, setRequestedCount] = useState(0);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [completed, setCompleted] = useState(0);
	const [summary, setSummary] = useState<Summary | null>(null);
	const [currentTotalCount, setCurrentTotalCount] = useState(initialCount);
	const abortRef = useRef<AbortController | null>(null);
	const logEndRef = useRef<HTMLDivElement>(null);
	const [resetModalOpen, { open: openResetModal, close: closeResetModal }] =
		useDisclosure(false);
	const [resetting, setResetting] = useState(false);

	useEffect(() => {
		if (log.length > 0) {
			logEndRef.current?.scrollIntoView({ behavior: "instant" });
		}
	}, [log]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	async function startGeneration() {
		const n =
			typeof countValue === "number"
				? countValue
				: Number.parseInt(countValue as string, 10);
		if (!Number.isFinite(n) || n < 1) return;

		const clamped = Math.min(n, 50);
		setRequestedCount(clamped);
		setPhase("running");
		setLog([]);
		setCompleted(0);
		setSummary(null);

		const ac = new AbortController();
		abortRef.current = ac;

		const addEntry = (entry: Omit<LogEntry, "id" | "time">) => {
			setLog((prev) => [
				...prev,
				{ ...entry, id: crypto.randomUUID(), time: nowTime() },
			]);
		};

		try {
			const response = await fetch(`/api/generate-questions?count=${clamped}`, {
				signal: ac.signal,
			});

			if (!response.ok || !response.body) {
				addEntry({
					type: "log",
					message: `Connection error: ${response.statusText}`,
				});
				setPhase("done");
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			outer: while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const raw = line.slice(6).trim();
					if (raw === "[DONE]") break outer;

					let event: unknown;
					try {
						event = JSON.parse(raw);
					} catch {
						continue;
					}

					if (!event || typeof event !== "object") continue;
					const e = event as Record<string, unknown>;

					if (e.type === "log") {
						addEntry({ type: "log", message: String(e.message ?? "") });
					} else if (e.type === "result") {
						setCompleted((prev) => prev + 1);
						addEntry({
							type: "result",
							status: e.status as GenerationStatus,
							combo: e.combo as QuestionCombo,
							question: e.question as string | undefined,
							elapsedMs: e.elapsedMs as number | undefined,
							questionId: e.id as number | undefined,
						});
					} else if (e.type === "done") {
						setSummary(e.summary as Summary);
						setCurrentTotalCount(e.totalCount as number);
						setPhase("done");
					} else if (e.type === "error") {
						addEntry({
							type: "log",
							message: `Error: ${String(e.message ?? "Unknown error")}`,
						});
						setPhase("done");
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				console.error("Generation stream error:", err);
			}
			setPhase("done");
		}
	}

	function cancel() {
		abortRef.current?.abort();
		setPhase("done");
	}

	function reset() {
		setPhase("idle");
		setLog([]);
		setCompleted(0);
		setSummary(null);
	}

	async function confirmReset() {
		setResetting(true);
		try {
			await resetUserDataAction();
			closeResetModal();
			router.push("/");
		} finally {
			setResetting(false);
		}
	}

	const progressValue =
		requestedCount > 0 ? (completed / requestedCount) * 100 : 0;

	return (
		<Container size="md" className={classes.pageContainer}>
			<Modal
				opened={resetModalOpen}
				onClose={closeResetModal}
				title={
					<Group gap="xs">
						<IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />
						<Text fw={700} c="red">
							This cannot be undone
						</Text>
					</Group>
				}
				centered
				size="md"
			>
				<Stack gap="md">
					<Text size="sm">
						You are about to permanently delete all user progress from this
						simulator:
					</Text>
					<List size="sm" spacing="xs">
						<List.Item>Your user profile</List.Item>
						<List.Item>All practice answers and history</List.Item>
						<List.Item>All exam simulation records and scores</List.Item>
					</List>
					<Alert color="red" variant="light">
						There is no backup. Once deleted, this data cannot be recovered.
					</Alert>
					<Group justify="flex-end" gap="sm">
						<Button
							variant="outline"
							onClick={closeResetModal}
							disabled={resetting}
						>
							Cancel
						</Button>
						<Button
							color="red"
							leftSection={<IconTrash size={16} />}
							onClick={confirmReset}
							loading={resetting}
						>
							Delete All User Data
						</Button>
					</Group>
				</Stack>
			</Modal>

			<Stack gap="xl">
				<Title order={2}>Configurations</Title>

				<Paper withBorder p="lg" radius="md">
					<Stack gap="md">
						<Group justify="space-between">
							<Group gap="xs">
								<IconDatabase size={20} />
								<Text fw={600} size="lg">
									Question Bank
								</Text>
							</Group>
							<Badge size="lg" variant="light">
								{currentTotalCount} questions
							</Badge>
						</Group>

						<Text c="dimmed" size="sm">
							Generate new exam questions using the AI agent. Each question is
							grounded in the RAG knowledge base and validated for uniqueness.
							Questions run in batches of 3.
						</Text>

						<Divider />

						{phase === "idle" && (
							<Group gap="sm" align="flex-end">
								<Text size="sm">Generate</Text>
								<NumberInput
									value={countValue}
									onChange={setCountValue}
									min={1}
									max={50}
									step={1}
									w={90}
									size="sm"
									aria-label="Number of questions to generate"
								/>
								<Text size="sm">new questions</Text>
								<Button
									leftSection={<IconSparkles size={16} />}
									onClick={startGeneration}
									disabled={
										typeof countValue === "number"
											? !Number.isFinite(countValue) || countValue < 1
											: !Number.isFinite(
													Number.parseInt(countValue as string, 10),
												)
									}
								>
									Start Generation
								</Button>
							</Group>
						)}

						{phase === "running" && (
							<Stack gap="md">
								<Group justify="space-between">
									<Group gap="xs">
										<Loader size="xs" />
										<Text size="sm" fw={500}>
											Generating {requestedCount} question
											{requestedCount !== 1 ? "s" : ""}…
										</Text>
									</Group>
									<Text size="sm" c="dimmed">
										{completed} / {requestedCount}
									</Text>
								</Group>

								<Progress value={progressValue} animated striped size="md" />

								<Divider label="Execution Log" labelPosition="left" />

								<ScrollArea h={280} className={classes.logArea}>
									<Stack gap={0}>
										{log.map((entry) => (
											<LogLine key={entry.id} entry={entry} />
										))}
										<div ref={logEndRef} />
									</Stack>
								</ScrollArea>

								<Button
									variant="subtle"
									color="red"
									leftSection={<IconBan size={16} />}
									onClick={cancel}
									w="fit-content"
								>
									Cancel
								</Button>
							</Stack>
						)}

						{phase === "done" && (
							<Stack gap="md">
								<Alert color={getAlertColor(summary)}>
									{summary
										? `Generation complete — ${summary.created} created, ${summary.duplicates} duplicate${summary.duplicates !== 1 ? "s" : ""}, ${summary.failed} failed`
										: "Generation cancelled"}
								</Alert>

								{summary && (
									<SimpleGrid cols={3}>
										<Paper withBorder className={classes.statCard} radius="md">
											<Text c="green" className={classes.statNumber}>
												{summary.created}
											</Text>
											<Text size="sm" c="dimmed" mt={4}>
												Created
											</Text>
										</Paper>
										<Paper withBorder className={classes.statCard} radius="md">
											<Text c="yellow" className={classes.statNumber}>
												{summary.duplicates}
											</Text>
											<Text size="sm" c="dimmed" mt={4}>
												Duplicates
											</Text>
										</Paper>
										<Paper withBorder className={classes.statCard} radius="md">
											<Text c="red" className={classes.statNumber}>
												{summary.failed}
											</Text>
											<Text size="sm" c="dimmed" mt={4}>
												Failed
											</Text>
										</Paper>
									</SimpleGrid>
								)}

								<Text size="sm" c="dimmed">
									Database now contains{" "}
									<Text span fw={600} fz="sm">
										{currentTotalCount} questions
									</Text>
								</Text>

								{log.length > 0 && (
									<>
										<Divider label="Execution Log" labelPosition="left" />
										<ScrollArea h={220} className={classes.logArea}>
											<Stack gap={0}>
												{log.map((entry) => (
													<LogLine key={entry.id} entry={entry} />
												))}
											</Stack>
										</ScrollArea>
									</>
								)}

								<Button
									leftSection={<IconRefresh size={16} />}
									variant="outline"
									onClick={reset}
									w="fit-content"
								>
									Generate More
								</Button>
							</Stack>
						)}
					</Stack>
				</Paper>

				<Paper withBorder p="lg" radius="md" className={classes.dangerSection}>
					<Stack gap="md">
						<Group gap="xs">
							<IconTrash size={20} className={classes.dangerTitle} />
							<Text fw={600} size="lg" className={classes.dangerTitle}>
								Danger Zone
							</Text>
						</Group>

						<Text c="dimmed" size="sm">
							Permanently delete all user progress — practice answers, exam
							simulation records, and your user profile. Questions in the
							database are not affected.
						</Text>

						<Divider />

						<Button
							variant="outline"
							color="red"
							leftSection={<IconTrash size={16} />}
							onClick={openResetModal}
							w="fit-content"
						>
							Reset User Data
						</Button>
					</Stack>
				</Paper>
			</Stack>
		</Container>
	);
}
