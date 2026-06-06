"use client";

import { Container, Stack, Text, Title } from "@mantine/core";
import classes from "./placeholder-page.module.css";

interface PlaceholderPageProps {
	title: string;
	message: string;
}

export function PlaceholderPage({ title, message }: PlaceholderPageProps) {
	return (
		<main className={classes.page}>
			<Container size="md">
				<Stack gap="xs">
					<Title order={1}>{title}</Title>
					<Text c="dimmed">{message}</Text>
				</Stack>
			</Container>
		</main>
	);
}
