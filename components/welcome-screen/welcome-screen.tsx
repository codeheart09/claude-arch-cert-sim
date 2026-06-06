"use client";

import { Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconArrowRight, IconSparkles } from "@tabler/icons-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createLocalUser } from "@/app/actions";
import type { CreateUserState } from "@/lib/user-form";
import classes from "./welcome-screen.module.css";

const initialState: CreateUserState = {};

function SubmitButton() {
	const { pending } = useFormStatus();

	return (
		<Button
			type="submit"
			size="md"
			loading={pending}
			rightSection={<IconArrowRight size={18} stroke={1.7} />}
		>
			Begin
		</Button>
	);
}

export function WelcomeScreen() {
	const [state, formAction] = useActionState(createLocalUser, initialState);

	return (
		<main className={classes.page}>
			<Paper component="section" className={classes.panel}>
				<Stack gap="xl">
					<Stack gap="sm">
						<Text className={classes.kicker}>
							<IconSparkles size={18} stroke={1.6} />
							Local exam simulator
						</Text>
						<Title order={1} className={classes.title}>
							Welcome in. What name should the simulator use while you practice?
						</Title>
						<Text className={classes.copy}>
							Your practice runs, generated questions, and coaching notes stay
							on this machine. Add a name so the simulator can keep the session
							personal.
						</Text>
					</Stack>

					<form action={formAction}>
						<Stack gap="md">
							<TextInput
								name="name"
								label="Your name"
								placeholder="Ada Lovelace"
								size="md"
								required
								maxLength={80}
								autoComplete="name"
								error={state.error}
								classNames={{ input: classes.input }}
							/>
							<SubmitButton />
						</Stack>
					</form>
				</Stack>
			</Paper>
		</main>
	);
}
