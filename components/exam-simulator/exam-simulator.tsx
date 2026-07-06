"use client";

import {
	Alert,
	Badge,
	Button,
	Container,
	Group,
	NumberInput,
	Paper,
	Progress,
	Radio,
	Select,
	SimpleGrid,
	Stack,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import {
	IconArrowRight,
	IconCertificate,
	IconCheck,
	IconClock,
	IconRefresh,
	IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
	fetchExamQuestions,
	finalizeExamSimulation,
	recordSingleExamAnswer,
	startExamSimulation,
} from "@/app/actions";
import type {
	Alternative,
	Domain,
	ExamGradeResult,
	ExamQuestion,
	Scenario,
} from "@/lib/exam";
import {
	DOMAIN_CHECKPOINT_COUNT,
	DOMAIN_HEADINGS,
	EXAM_QUESTION_COUNT,
	SCENARIO_TITLES,
} from "@/lib/exam-taxonomy";
import classes from "./exam-simulator.module.css";

interface ExamSimulatorProps {
	initialQuestions: ExamQuestion[];
}

type Phase = "setup" | "active" | "results";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function formatDuration(ms: number): string {
	const totalSec = Math.floor(Math.abs(ms) / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatDurationShort(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	if (m === 0) return `${s}s`;
	return `${m}m ${pad(s)}s`;
}

export function ExamSimulator({ initialQuestions }: ExamSimulatorProps) {
	const [phase, setPhase] = useState<Phase>("setup");
	const [limitMs, setLimitMs] = useState(0);

	// Setup form
	const [hours, setHours] = useState<number | string>(2);
	const [minutes, setMinutes] = useState<number | string>(0);
	const [seconds, setSeconds] = useState<number | string>(0);
	const [setupError, setSetupError] = useState("");
	const [domain, setDomain] = useState<Domain | "all">("all");

	// Reset timer default when scope changes: 2h for full exam, 20m for a domain.
	useEffect(() => {
		if (domain === "all") {
			setHours(2);
			setMinutes(0);
		} else {
			setHours(0);
			setMinutes(35);
		}
		setSeconds(0);
	}, [domain]);

	// Exam state
	const [questions, setQuestions] = useState(initialQuestions);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [selected, setSelected] = useState("");
	const [submittedAnswers, setSubmittedAnswers] = useState<
		Map<number, Alternative>
	>(new Map());
	const [timeExpired, setTimeExpired] = useState(false);
	const [results, setResults] = useState<ExamGradeResult | null>(null);

	// Exam simulation ID — created when exam starts, used for every answer write
	const examSimulationIdRef = useRef<number | null>(null);

	// Per-question timing
	const questionStartedAtRef = useRef<number>(Date.now());

	// Countdown timer
	const [elapsedMs, setElapsedMs] = useState(0);
	const startTimeRef = useRef<number | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Transitions
	const [isStartingExam, startStartingExam] = useTransition();
	const [isRecordingAnswer, startRecordingAnswer] = useTransition();
	const [isFinalizing, startFinalizing] = useTransition();

	// When timer expires while an answer is still being recorded, we defer
	// finalization until the recording transition completes.
	const [pendingFinalize, setPendingFinalize] = useState<{
		elapsed: number;
		completed: boolean;
	} | null>(null);

	const stopTimer = useCallback(() => {
		if (intervalRef.current !== null) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const startTimer = useCallback(() => {
		stopTimer();
		startTimeRef.current = Date.now();
		setElapsedMs(0);
		intervalRef.current = setInterval(() => {
			if (startTimeRef.current !== null) {
				setElapsedMs(Date.now() - startTimeRef.current);
			}
		}, 200);
	}, [stopTimer]);

	useEffect(() => () => stopTimer(), [stopTimer]);

	const handleFinish = useCallback(
		(elapsed: number, completed: boolean) => {
			stopTimer();
			const simId = examSimulationIdRef.current;
			if (simId === null) return;
			const questionCount = questions.length;
			startFinalizing(async () => {
				const result = await finalizeExamSimulation(
					simId,
					elapsed,
					completed,
					questionCount,
				);
				setResults(result);
				setPhase("results");
			});
		},
		[stopTimer, questions.length],
	);

	// Drain any pending finalize once the in-flight answer recording settles.
	useEffect(() => {
		if (pendingFinalize && !isRecordingAnswer) {
			const { elapsed, completed } = pendingFinalize;
			setPendingFinalize(null);
			handleFinish(elapsed, completed);
		}
	}, [pendingFinalize, isRecordingAnswer, handleFinish]);

	// Auto-finalize when the exam timer reaches zero.
	useEffect(() => {
		if (phase !== "active" || limitMs <= 0) return;
		if (elapsedMs >= limitMs && !timeExpired) {
			setTimeExpired(true);
			if (isRecordingAnswer) {
				setPendingFinalize({ elapsed: elapsedMs, completed: true });
			} else {
				handleFinish(elapsedMs, true);
			}
		}
	}, [elapsedMs, limitMs, phase, timeExpired, isRecordingAnswer, handleFinish]);

	function handleStart() {
		const h = typeof hours === "number" ? hours : 0;
		const m = typeof minutes === "number" ? minutes : 0;
		const s = typeof seconds === "number" ? seconds : 0;
		const totalMs = (h * 3600 + m * 60 + s) * 1000;
		if (totalMs <= 0) {
			setSetupError("Set a time limit greater than zero.");
			return;
		}
		setSetupError("");

		startStartingExam(async () => {
			const qs =
				domain === "all" ? initialQuestions : await fetchExamQuestions(domain);
			setQuestions(qs);
			const simId = await startExamSimulation();
			examSimulationIdRef.current = simId;
			setLimitMs(totalMs);
			setPhase("active");
			setCurrentIndex(0);
			setSelected("");
			setTimeExpired(false);
			setSubmittedAnswers(new Map());
			questionStartedAtRef.current = Date.now();
			startTimer();
		});
	}

	function handleSubmitQuestion() {
		if (!selected || timeExpired) return;
		const q = questions[currentIndex];
		if (!q || submittedAnswers.has(q.id)) return;

		const durationMs = Date.now() - questionStartedAtRef.current;
		const selectedLetter = selected as Alternative;
		const simId = examSimulationIdRef.current;

		// Record locally for UI immediately.
		setSubmittedAnswers((prev) => {
			const next = new Map(prev);
			next.set(q.id, selectedLetter);
			return next;
		});

		// Persist to DB in background.
		if (simId !== null) {
			startRecordingAnswer(async () => {
				await recordSingleExamAnswer(simId, q.id, selectedLetter, durationMs);
			});
		}
	}

	function handleNext() {
		if (currentIndex < questions.length - 1) {
			const nextIndex = currentIndex + 1;
			setCurrentIndex(nextIndex);
			const nextQ = questions[nextIndex];
			setSelected(
				nextQ && submittedAnswers.has(nextQ.id)
					? (submittedAnswers.get(nextQ.id) ?? "")
					: "",
			);
			questionStartedAtRef.current = Date.now();
		}
	}

	function handleNavigateTo(index: number) {
		const q = questions[index];
		if (!q) return;
		// Can only navigate to already-answered questions or the current one.
		if (index > currentIndex && !submittedAnswers.has(q.id)) return;
		setCurrentIndex(index);
		setSelected(
			submittedAnswers.has(q.id) ? (submittedAnswers.get(q.id) ?? "") : "",
		);
		if (!submittedAnswers.has(q.id)) {
			questionStartedAtRef.current = Date.now();
		}
	}

	function handleFinishExam() {
		const elapsed = startTimeRef.current
			? Date.now() - startTimeRef.current
			: limitMs;
		const completed = submittedAnswers.size === questions.length;
		if (isRecordingAnswer) {
			setPendingFinalize({ elapsed, completed });
		} else {
			handleFinish(elapsed, completed);
		}
	}

	function handleRestart() {
		stopTimer();
		examSimulationIdRef.current = null;
		setPhase("setup");
		setDomain("all");
		setSelected("");
		setTimeExpired(false);
		setResults(null);
		setElapsedMs(0);
		setSubmittedAnswers(new Map());
		setPendingFinalize(null);
	}

	// ─── Setup ────────────────────────────────────────────────────────────────

	const DOMAIN_SELECT_DATA = [
		{ value: "all", label: "Full exam (all domains)" },
		...Object.entries(DOMAIN_HEADINGS).map(([slug, heading]) => ({
			value: slug,
			label: heading,
		})),
	];

	const selectedDomainLabel =
		domain === "all"
			? "Full exam (all domains)"
			: (DOMAIN_HEADINGS[domain as Domain] ?? domain);

	const questionCount =
		domain === "all" ? EXAM_QUESTION_COUNT : DOMAIN_CHECKPOINT_COUNT;

	if (phase === "setup") {
		return (
			<main className={classes.pageSetup}>
				<Paper component="section" className={classes.setupCard}>
					<Stack gap="lg">
						<Stack gap={4}>
							<Title order={2}>Exam Simulator</Title>
							<Text size="sm" c="dimmed">
								{questionCount} questions · {selectedDomainLabel}
							</Text>
						</Stack>

						<Select
							label="Test scope"
							data={DOMAIN_SELECT_DATA}
							value={domain}
							onChange={(v) => setDomain((v ?? "all") as Domain | "all")}
							allowDeselect={false}
						/>

						<Stack gap="xs">
							<Text size="sm" fw={500}>
								Total exam time
							</Text>
							<Group gap="xs" align="flex-end">
								<NumberInput
									label="h"
									value={hours}
									onChange={setHours}
									min={0}
									max={9}
									clampBehavior="strict"
									w={72}
									hideControls
								/>
								<Text className={classes.timeInputSeparator}>:</Text>
								<NumberInput
									label="m"
									value={minutes}
									onChange={setMinutes}
									min={0}
									max={59}
									clampBehavior="strict"
									w={72}
									hideControls
								/>
								<Text className={classes.timeInputSeparator}>:</Text>
								<NumberInput
									label="s"
									value={seconds}
									onChange={setSeconds}
									min={0}
									max={59}
									clampBehavior="strict"
									w={72}
									hideControls
								/>
							</Group>
							{setupError ? (
								<Text c="red" size="sm">
									{setupError}
								</Text>
							) : null}
						</Stack>

						<Button onClick={handleStart} fullWidth loading={isStartingExam}>
							Start exam
						</Button>
					</Stack>
				</Paper>
			</main>
		);
	}

	// ─── Results ──────────────────────────────────────────────────────────────

	if (phase === "results" && results) {
		return <ResultsPage results={results} onRestart={handleRestart} />;
	}

	// ─── Active exam ──────────────────────────────────────────────────────────

	const remaining = limitMs - elapsedMs;
	const isOvertime = remaining <= 0;
	const timerLabel = isOvertime
		? `-${formatDuration(-remaining)}`
		: formatDuration(remaining);

	const dotClass = isOvertime
		? classes.statusDotOvertime
		: classes.statusDotRunning;
	const badgeClass = [
		classes.timerBadge,
		isOvertime ? classes.timerBadgeOvertime : "",
	]
		.filter(Boolean)
		.join(" ");

	const currentQ = questions[currentIndex];
	const isCurrentSubmitted = currentQ
		? submittedAnswers.has(currentQ.id)
		: false;
	const allAnswered = submittedAnswers.size === questions.length;
	const canFinish =
		allAnswered ||
		(isCurrentSubmitted && currentIndex === questions.length - 1);

	return (
		<main className={classes.page}>
			<Container size="md" className={classes.inner}>
				<Stack gap="lg">
					{/* Header */}
					<div className={classes.headerRow}>
						<Title order={1}>Exam Simulator</Title>
						<div className={classes.headerControls}>
							<div className={badgeClass}>
								<span className={[classes.statusDot, dotClass].join(" ")} />
								<span className={classes.timerDigits}>{timerLabel}</span>
							</div>
							<Tooltip label="Restart exam" position="bottom">
								<Button
									variant="default"
									size="sm"
									radius="md"
									leftSection={<IconRefresh size={16} stroke={1.5} />}
									onClick={handleRestart}
								>
									Restart
								</Button>
							</Tooltip>
						</div>
					</div>

					{/* Question navigation grid */}
					<Paper className={classes.card}>
						<Stack gap="xs">
							<Text size="xs" c="dimmed" fw={500}>
								{submittedAnswers.size} / {questions.length} answered
							</Text>
							<div className={classes.questionGrid}>
								{questions.map((q, i) => {
									const isAnswered = submittedAnswers.has(q.id);
									const isCurrent = i === currentIndex;
									const isAccessible = isAnswered || i <= currentIndex;

									let boxClass = classes.questionBox;
									if (isCurrent) {
										boxClass = [
											classes.questionBox,
											classes.questionBoxCurrent,
										].join(" ");
									} else if (isAnswered) {
										boxClass = [
											classes.questionBox,
											classes.questionBoxAnswered,
										].join(" ");
									} else if (!isAccessible) {
										boxClass = [
											classes.questionBox,
											classes.questionBoxDisabled,
										].join(" ");
									}

									return (
										<button
											key={q.id}
											type="button"
											className={boxClass}
											onClick={() => handleNavigateTo(i)}
											aria-label={`Question ${i + 1}${isAnswered ? " (answered)" : ""}`}
											aria-current={isCurrent ? "true" : undefined}
										>
											{i + 1}
										</button>
									);
								})}
							</div>
						</Stack>
					</Paper>

					{/* Time-expired banner */}
					{timeExpired ? (
						<Alert
							color="red"
							title="Time's up"
							variant="light"
							icon={<IconClock size={16} />}
						>
							Your answers have been submitted. The exam ended due to time.
						</Alert>
					) : null}

					{/* Current question card */}
					{currentQ ? (
						<Paper component="section" className={classes.card}>
							<Stack gap="lg">
								<Group justify="space-between" align="flex-start">
									<Text size="sm" c="dimmed" fw={500}>
										Question {currentIndex + 1} of {questions.length}
									</Text>
									{currentQ.domain || currentQ.scenario ? (
										<Group gap="xs">
											{currentQ.scenario ? (
												<Badge variant="light" size="xs" color="umber">
													{SCENARIO_TITLES[currentQ.scenario as Scenario]}
												</Badge>
											) : null}
											{currentQ.domain ? (
												<Badge variant="outline" size="xs">
													{DOMAIN_HEADINGS[currentQ.domain as Domain].replace(
														/^Domain \d+: /,
														"",
													)}
												</Badge>
											) : null}
										</Group>
									) : null}
								</Group>

								<Text className={classes.question}>{currentQ.question}</Text>

								<Radio.Group
									value={selected}
									onChange={(v) => {
										if (!isCurrentSubmitted && !timeExpired) setSelected(v);
									}}
									aria-label="Answer choices"
								>
									<Stack gap="sm">
										{currentQ.choices.map((choice) => {
											let choiceClass = classes.choice;
											if (isCurrentSubmitted) {
												choiceClass = [
													classes.choice,
													choice.letter === submittedAnswers.get(currentQ.id)
														? classes.choiceSelected
														: "",
												]
													.filter(Boolean)
													.join(" ");
											} else if (choice.letter === selected) {
												choiceClass = [
													classes.choice,
													classes.choiceSelected,
												].join(" ");
											}

											return (
												<div key={choice.letter} className={choiceClass}>
													<Radio
														value={choice.letter}
														label={choice.text}
														disabled={isCurrentSubmitted || timeExpired}
														classNames={{ labelWrapper: classes.choiceLabel }}
													/>
												</div>
											);
										})}
									</Stack>
								</Radio.Group>

								{isCurrentSubmitted ? (
									<Alert color="umber" variant="light" title="Answer recorded">
										Your answer has been saved. Results will be shown after the
										exam.
									</Alert>
								) : null}

								<Group justify="space-between">
									<Button
										onClick={handleSubmitQuestion}
										disabled={!selected || isCurrentSubmitted || timeExpired}
										loading={isRecordingAnswer && !isCurrentSubmitted}
									>
										Submit answer
									</Button>
									<Group gap="sm">
										{isCurrentSubmitted &&
										currentIndex < questions.length - 1 ? (
											<Button
												variant="default"
												onClick={handleNext}
												rightSection={<IconArrowRight size={18} stroke={1.7} />}
											>
												Next
											</Button>
										) : null}
										{canFinish ? (
											<Button
												color="green"
												onClick={handleFinishExam}
												loading={isFinalizing || isRecordingAnswer}
												disabled={isRecordingAnswer}
												leftSection={<IconCertificate size={18} stroke={1.5} />}
											>
												Finish exam
											</Button>
										) : null}
									</Group>
								</Group>
							</Stack>
						</Paper>
					) : null}
				</Stack>
			</Container>
		</main>
	);
}

// ─── Results page ──────────────────────────────────────────────────────────────

interface ResultsPageProps {
	results: ExamGradeResult;
	onRestart: () => void;
}

function ResultsPage({ results, onRestart }: ResultsPageProps) {
	const passed = results.score >= 720;

	return (
		<main className={classes.pageResults}>
			<Container size="md">
				<Stack gap="xl">
					<div className={classes.headerRow}>
						<Title order={1}>Exam Results</Title>
						<Button
							variant="default"
							leftSection={<IconRefresh size={16} stroke={1.5} />}
							onClick={onRestart}
						>
							New exam
						</Button>
					</div>

					{/* Score hero */}
					<div className={classes.resultsHero}>
						<Group gap="xs" align="flex-end">
							<span
								className={classes.scoreNumber}
								style={{
									color: passed
										? "var(--mantine-color-green-filled)"
										: "var(--mantine-color-red-filled)",
								}}
							>
								{results.score}
							</span>
							<span className={classes.scoreDivider}>/</span>
							<span className={classes.scoreMax}>1000</span>
						</Group>
						<Badge
							size="lg"
							color={passed ? "green" : "red"}
							variant="filled"
							leftSection={
								passed ? <IconCheck size={14} /> : <IconX size={14} />
							}
						>
							{passed ? "Pass" : "Fail"} — {results.percentage}%
						</Badge>
						<Text size="sm" c="dimmed">
							Passing threshold: 720 points (72%)
						</Text>
					</div>

					{/* Stat cards */}
					<SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
						<div className={classes.statCard}>
							<Group gap="xs">
								<IconCheck
									size={16}
									color="var(--mantine-color-green-filled)"
								/>
								<Text className={classes.statLabel}>Correct</Text>
							</Group>
							<span
								className={classes.statValue}
								style={{ color: "var(--mantine-color-green-filled)" }}
							>
								{results.correctCount}
							</span>
						</div>
						<div className={classes.statCard}>
							<Group gap="xs">
								<IconX size={16} color="var(--mantine-color-red-filled)" />
								<Text className={classes.statLabel}>Wrong</Text>
							</Group>
							<span
								className={classes.statValue}
								style={{ color: "var(--mantine-color-red-filled)" }}
							>
								{results.wrongCount}
							</span>
						</div>
						<div className={classes.statCard}>
							<Group gap="xs">
								<IconClock size={16} color="var(--mantine-color-dimmed)" />
								<Text className={classes.statLabel}>Exam time</Text>
							</Group>
							<span className={classes.statValue}>
								{formatDuration(results.totalExamTimeMs)}
							</span>
						</div>
						<div className={classes.statCard}>
							<Group gap="xs">
								<IconClock size={16} color="var(--mantine-color-dimmed)" />
								<Text className={classes.statLabel}>Avg / question</Text>
							</Group>
							<span className={classes.statValue}>
								{formatDurationShort(results.avgQuestionTimeMs)}
							</span>
						</div>
					</SimpleGrid>

					{/* Domain breakdown */}
					{results.byDomain.length > 0 ? (
						<div className={classes.breakdownCard}>
							<Stack gap="md">
								<Title order={3} size="h5">
									By Domain
								</Title>
								<Stack gap="sm">
									{results.byDomain
										.sort((a, b) => b.correct / b.total - a.correct / a.total)
										.map((d) => {
											const pct =
												d.total > 0
													? Math.round((d.correct / d.total) * 100)
													: 0;
											const label =
												DOMAIN_HEADINGS[d.domain]?.replace(
													/^Domain \d+: /,
													"",
												) ?? d.domain;
											return (
												<div key={d.domain} className={classes.breakdownRow}>
													<Text className={classes.breakdownLabel}>
														{label}
													</Text>
													<Progress
														value={pct}
														color={
															pct >= 70 ? "green" : pct >= 50 ? "yellow" : "red"
														}
														size="sm"
														style={{ flex: 1 }}
													/>
													<Text className={classes.breakdownCount}>
														{d.correct}/{d.total} ({pct}%)
													</Text>
												</div>
											);
										})}
								</Stack>
							</Stack>
						</div>
					) : null}

					{/* Scenario breakdown */}
					{results.byScenario.length > 0 ? (
						<div className={classes.breakdownCard}>
							<Stack gap="md">
								<Title order={3} size="h5">
									By Scenario
								</Title>
								<Stack gap="sm">
									{results.byScenario
										.sort((a, b) => b.correct / b.total - a.correct / a.total)
										.map((s) => {
											const pct =
												s.total > 0
													? Math.round((s.correct / s.total) * 100)
													: 0;
											const label = SCENARIO_TITLES[s.scenario] ?? s.scenario;
											return (
												<div key={s.scenario} className={classes.breakdownRow}>
													<Text className={classes.breakdownLabel}>
														{label}
													</Text>
													<Progress
														value={pct}
														color={
															pct >= 70 ? "green" : pct >= 50 ? "yellow" : "red"
														}
														size="sm"
														style={{ flex: 1 }}
													/>
													<Text className={classes.breakdownCount}>
														{s.correct}/{s.total} ({pct}%)
													</Text>
												</div>
											);
										})}
								</Stack>
							</Stack>
						</div>
					) : null}
				</Stack>
			</Container>
		</main>
	);
}
