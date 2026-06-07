import { connection } from "next/server";
import { TimedQuestions } from "@/components/timed-questions/timed-questions";
import { getRandomPracticeQuestion } from "@/lib/practice";

export default async function TimedQuestionsPage() {
	await connection();
	const initialQuestion = getRandomPracticeQuestion();
	return <TimedQuestions initialQuestion={initialQuestion} />;
}
