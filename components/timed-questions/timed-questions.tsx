"use client";

import {
	ActionIcon,
	Alert,
	Button,
	Container,
	Group,
	NumberInput,
	Paper,
	Radio,
	Stack,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import {
	IconArrowRight,
	IconFlag,
	IconPlayerPause,
	IconPlayerPlay,
	IconRefresh,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchRandomQuestion, submitPracticeAnswer } from "@/app/actions";
import { challengeQuestion } from "@/app/ai-tutor/actions";
import { QuestionSkeleton } from "@/components/random-questions/question-skeleton";
import type {
	Alternative,
	AnswerResult,
	PracticeChoice,
	PracticeQuestion,
} from "@/lib/practice";
import classes from "./timed-questions.module.css";

interface TimedQuestionsProps {
	initialQuestion: PracticeQuestion | null;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function choiceClassName(
	choice: PracticeChoice,
	selected: string,
	result: AnswerResult | null,
): string {
	const isSelected = choice.letter === selected;
	let state: string | undefined;
	if (result && isSelected) {
		state = result.isCorrect ? classes.choiceCorrect : classes.choiceIncorrect;
	} else if (!result && isSelected) {
		state = classes.choiceSelected;
	}
	return [classes.choice, state].filter(Boolean).join(" ");
}

type Phase = "setup" | "active";

export function TimedQuestions({ initialQuestion }: TimedQuestionsProps) {
	const router = useRouter();
	const [phase, setPhase] = useState<Phase>("setup");
	const [limitMs, setLimitMs] = useState<number>(0);

	// Setup form state
	const [hours, setHours] = useState<number | string>(0);
	const [minutes, setMinutes] = useState<number | string>(2);
	const [seconds, setSeconds] = useState<number | string>(0);
	const [setupError, setSetupError] = useState<string>("");

	// Question state
	const [current, setCurrent] = useState(initialQuestion);
	const [servedIds, setServedIds] = useState<number[]>(
		initialQuestion ? [initialQuestion.id] : [],
	);
	const [selected, setSelected] = useState("");
	const [result, setResult] = useState<AnswerResult | null>(null);
	const [isLoading, startLoading] = useTransition();
	const [isSubmitting, startSubmitting] = useTransition();
	const [isChallenging, setIsChallenging] = useState(false);

	// Timer state
	const [elapsedMs, setElapsedMs] = useState(0);
	const [isPaused, setIsPaused] = useState(false);
	const [capturedDurationMs, setCapturedDurationMs] = useState<number | null>(
		null,
	);
	const startTimeRef = useRef<number | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pausedAtRef = useRef<number>(0);

	const submitted = result !== null;

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
		setIsPaused(false);
		setCapturedDurationMs(null);
		pausedAtRef.current = 0;
		intervalRef.current = setInterval(() => {
			if (startTimeRef.current !== null) {
				setElapsedMs(Date.now() - startTimeRef.current);
			}
		}, 100);
	}, [stopTimer]);

	useEffect(() => {
		return () => stopTimer();
	}, [stopTimer]);

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
		setLimitMs(totalMs);
		setPhase("active");
		startTimer();
	}

	function handlePause() {
		if (submitted) return;
		if (isPaused) {
			// Resume: recalculate startTime so elapsed continues from where it paused
			startTimeRef.current = Date.now() - pausedAtRef.current;
			intervalRef.current = setInterval(() => {
				if (startTimeRef.current !== null) {
					setElapsedMs(Date.now() - startTimeRef.current);
				}
			}, 100);
			setIsPaused(false);
		} else {
			pausedAtRef.current = elapsedMs;
			stopTimer();
			setIsPaused(true);
		}
	}

	function handleRestart() {
		stopTimer();
		setPhase("setup");
		setSelected("");
		setResult(null);
		setElapsedMs(0);
		setIsPaused(false);
		setCapturedDurationMs(null);
	}

	function handleSubmit() {
		if (!current || !selected || submitted) return;

		const duration = isPaused
			? pausedAtRef.current
			: startTimeRef.current !== null
				? Date.now() - startTimeRef.current
				: undefined;

		stopTimer();
		setCapturedDurationMs(duration ?? null);

		startSubmitting(async () => {
			const outcome = await submitPracticeAnswer(
				current.id,
				selected as Alternative,
				duration,
			);
			setResult(outcome);
		});
	}

	function handleNext() {
		startLoading(async () => {
			let next = await fetchRandomQuestion(servedIds);
			let nextServedIds = servedIds;

			if (!next && servedIds.length > 0) {
				next = await fetchRandomQuestion();
				nextServedIds = [];
			}

			setCurrent(next);
			setServedIds(next ? [...nextServedIds, next.id] : nextServedIds);
			setSelected("");
			setResult(null);
			startTimer();
		});
	}

	// ─── Setup screen ───────────────────────────────────────────────────────────
	if (phase === "setup") {
		return (
			<main className={classes.pageSetup}>
				<Paper component="section" className={classes.setupCard}>
					<Stack gap="lg">
						<Stack gap={4}>
							<Title order={2}>Timed Questions</Title>
							<Text size="sm" c="dimmed">
								Set a per-question time limit to begin.
							</Text>
						</Stack>

						<Stack gap="xs">
							<Text size="sm" fw={500}>
								Time limit per question
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

						<Button onClick={handleStart} fullWidth>
							Start session
						</Button>
					</Stack>
				</Paper>
			</main>
		);
	}

	// ─── Active session ─────────────────────────────────────────────────────────
	const displayMs = capturedDurationMs ?? elapsedMs;
	const remaining = limitMs - displayMs;
	const isOvertime = remaining <= 0;
	const timerLabel = isOvertime
		? `-${formatDuration(-remaining)}`
		: formatDuration(remaining);

	const dotClass = submitted
		? classes.statusDotDone
		: isPaused
			? classes.statusDotPaused
			: isOvertime
				? classes.statusDotOvertime
				: classes.statusDotRunning;

	const badgeClass = [
		classes.timerBadge,
		submitted || (!isPaused && !isOvertime)
			? ""
			: isPaused
				? classes.timerBadgePaused
				: classes.timerBadgeOvertime,
		!submitted && !isPaused && isOvertime ? classes.timerBadgeOvertime : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<main className={classes.page}>
			<Container size="md" className={classes.inner}>
				<Stack gap="lg">
					<div className={classes.headerRow}>
						<Title order={1}>Timed Questions</Title>
						<div className={classes.headerControls}>
							<div className={badgeClass}>
								<span className={[classes.statusDot, dotClass].join(" ")} />
								<span className={classes.timerDigits}>{timerLabel}</span>
							</div>
							<Tooltip label={isPaused ? "Resume" : "Pause"} position="bottom">
								<ActionIcon
									variant="default"
									size="lg"
									radius="md"
									aria-label={isPaused ? "Resume timer" : "Pause timer"}
									onClick={handlePause}
									disabled={submitted}
								>
									{isPaused ? (
										<IconPlayerPlay size={18} stroke={1.5} />
									) : (
										<IconPlayerPause size={18} stroke={1.5} />
									)}
								</ActionIcon>
							</Tooltip>
							<Tooltip label="Restart session" position="bottom">
								<ActionIcon
									variant="default"
									size="lg"
									radius="md"
									aria-label="Restart session"
									onClick={handleRestart}
								>
									<IconRefresh size={18} stroke={1.5} />
								</ActionIcon>
							</Tooltip>
							{current ? (
								<Tooltip label="Challenge this question" position="bottom">
									<ActionIcon
										variant="subtle"
										color="orange"
										size="lg"
										radius="md"
										aria-label="Challenge this question"
										loading={isChallenging}
										onClick={async () => {
											if (!current) return;
											setIsChallenging(true);
											try {
												const convId = await challengeQuestion(current.id);
												router.push(`/ai-tutor?c=${convId}`);
											} finally {
												setIsChallenging(false);
											}
										}}
									>
										<IconFlag size={18} stroke={1.5} />
									</ActionIcon>
								</Tooltip>
							) : null}
						</div>
					</div>

					{isLoading ? (
						<QuestionSkeleton />
					) : current ? (
						<Paper component="section" className={classes.card}>
							<Stack gap="lg">
								<Text className={classes.question}>{current.question}</Text>

								<Radio.Group
									value={selected}
									onChange={setSelected}
									aria-label="Answer choices"
								>
									<Stack gap="sm">
										{current.choices.map((choice) => (
											<div
												key={choice.letter}
												className={choiceClassName(choice, selected, result)}
											>
												<Radio
													value={choice.letter}
													label={choice.text}
													disabled={submitted}
													color={
														submitted && choice.letter === selected
															? result.isCorrect
																? "green"
																: "red"
															: undefined
													}
													classNames={{ labelWrapper: classes.choiceLabel }}
												/>
											</div>
										))}
									</Stack>
								</Radio.Group>

								{result ? (
									<Alert
										color={result.isCorrect ? "green" : "red"}
										title={result.isCorrect ? "Correct" : "Not quite"}
										variant="light"
									>
										{result.insight}
									</Alert>
								) : null}

								<Group justify="space-between">
									<Button
										onClick={handleSubmit}
										disabled={!selected || submitted}
										loading={isSubmitting}
									>
										Submit
									</Button>
									<Button
										variant="default"
										onClick={handleNext}
										rightSection={
											submitted ? (
												<IconArrowRight size={18} stroke={1.7} />
											) : undefined
										}
									>
										{submitted ? "Next" : "Skip Question"}
									</Button>
								</Group>
							</Stack>
						</Paper>
					) : (
						<Paper component="section" className={classes.card}>
							<Text c="dimmed">
								No questions are available yet. Seed the question bank to start
								practising.
							</Text>
						</Paper>
					)}
				</Stack>
			</Container>
		</main>
	);
}
