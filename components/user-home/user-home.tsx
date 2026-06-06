"use client";

import { Container, Stack, Text, Title } from "@mantine/core";
import classes from "./user-home.module.css";

export function UserHome() {
	return (
		<main className={classes.page}>
			<Container size="md">
				<Stack gap="xs">
					<Title order={1}>Ready for your next practice session.</Title>
					<Text c="dimmed">
						Generate a fresh exam path when you are ready to continue.
					</Text>
				</Stack>
			</Container>
		</main>
	);
}
