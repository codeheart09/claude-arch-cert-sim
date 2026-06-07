"use client";

import {
	ActionIcon,
	Alert,
	Button,
	Container,
	Group,
	Paper,
	Radio,
	Stack,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import { IconArrowRight, IconFlag } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fetchRandomQuestion, submitPracticeAnswer } from "@/app/actions";
import { challengeQuestion } from "@/app/ai-tutor/actions";
import type {
	Alternative,
	AnswerResult,
	PracticeChoice,
	PracticeQuestion,
} from "@/lib/practice";
import { QuestionSkeleton } from "./question-skeleton";
import classes from "./random-questions.module.css";

interface RandomQuestionsProps {
	initialQuestion: PracticeQuestion | null;
}

/** Builds the className for a choice row given the current selection/result. */
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

export function RandomQuestions({ initialQuestion }: RandomQuestionsProps) {
	const router = useRouter();
	const [current, setCurrent] = useState(initialQuestion);
	const [servedIds, setServedIds] = useState<number[]>(
		initialQuestion ? [initialQuestion.id] : [],
	);
	const [selected, setSelected] = useState("");
	const [result, setResult] = useState<AnswerResult | null>(null);
	const [isLoading, startLoading] = useTransition();
	const [isSubmitting, startSubmitting] = useTransition();
	const [isChallenging, setIsChallenging] = useState(false);

	const submitted = result !== null;

	function handleSubmit() {
		if (!current || !selected || submitted) {
			return;
		}
		startSubmitting(async () => {
			const outcome = await submitPracticeAnswer(
				current.id,
				selected as Alternative,
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
		});
	}

	return (
		<main className={classes.page}>
			<Container size="md" className={classes.inner}>
				<Stack gap="lg">
					<Title order={1}>Random Questions</Title>

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
									<Group>
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
											rightSection={<IconArrowRight size={18} stroke={1.7} />}
										>
											Next
										</Button>
									</Group>
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
