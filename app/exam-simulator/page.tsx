import { connection } from "next/server";
import { ExamSimulator } from "@/components/exam-simulator/exam-simulator";
import { getExamQuestions } from "@/lib/exam";

export default async function ExamSimulatorPage() {
	await connection();
	const initialQuestions = getExamQuestions();
	return <ExamSimulator initialQuestions={initialQuestions} />;
}
