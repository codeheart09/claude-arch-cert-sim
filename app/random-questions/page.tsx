import { connection } from "next/server";
import { RandomQuestions } from "@/components/random-questions/random-questions";
import { getRandomPracticeQuestion } from "@/lib/practice";

export default async function RandomQuestionsPage() {
	await connection();

	const initialQuestion = getRandomPracticeQuestion();

	return <RandomQuestions initialQuestion={initialQuestion} />;
}
