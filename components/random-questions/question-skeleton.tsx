import { Paper, Skeleton, Stack } from "@mantine/core";
import classes from "./random-questions.module.css";

/**
 * Placeholder shown while a practice question is being fetched — used both by the
 * route-level `loading.tsx` and the in-component pending state on "Next".
 */
export function QuestionSkeleton() {
	return (
		<Paper component="section" className={classes.card}>
			<Stack gap="lg">
				<Stack gap="sm">
					<Skeleton height="var(--mantine-font-size-lg)" radius="sm" />
					<Skeleton height="var(--mantine-font-size-lg)" radius="sm" />
					<Skeleton
						height="var(--mantine-font-size-lg)"
						width="60%"
						radius="sm"
					/>
				</Stack>
				<Stack gap="sm">
					<Skeleton
						height="calc(var(--mantine-spacing-xl) * 1.6)"
						radius="md"
					/>
					<Skeleton
						height="calc(var(--mantine-spacing-xl) * 1.6)"
						radius="md"
					/>
					<Skeleton
						height="calc(var(--mantine-spacing-xl) * 1.6)"
						radius="md"
					/>
					<Skeleton
						height="calc(var(--mantine-spacing-xl) * 1.6)"
						radius="md"
					/>
				</Stack>
			</Stack>
		</Paper>
	);
}
