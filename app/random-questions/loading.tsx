import { Container, Stack, Title } from "@mantine/core";
import { QuestionSkeleton } from "@/components/random-questions/question-skeleton";
import classes from "@/components/random-questions/random-questions.module.css";

export default function Loading() {
	return (
		<main className={classes.page}>
			<Container size="md" className={classes.inner}>
				<Stack gap="lg">
					<Title order={1}>Random Questions</Title>
					<QuestionSkeleton />
				</Stack>
			</Container>
		</main>
	);
}
