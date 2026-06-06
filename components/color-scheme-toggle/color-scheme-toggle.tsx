"use client";

import {
	ActionIcon,
	useComputedColorScheme,
	useMantineColorScheme,
} from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import classes from "./color-scheme-toggle.module.css";

/**
 * Always-visible light/dark toggle, fixed in the top-right corner on every route.
 * Renders the icon for the scheme you'd switch *to*. Uses `getInitialValueInEffect`
 * so the resolved scheme is read after mount, avoiding a hydration mismatch.
 */
export function ColorSchemeToggle() {
	const { setColorScheme } = useMantineColorScheme();
	const computed = useComputedColorScheme("light", {
		getInitialValueInEffect: true,
	});
	const isDark = computed === "dark";

	return (
		<ActionIcon
			className={classes.toggle}
			onClick={() => setColorScheme(isDark ? "light" : "dark")}
			variant="default"
			size="lg"
			radius="md"
			aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
		>
			{isDark ? (
				<IconSun size={20} stroke={1.5} />
			) : (
				<IconMoon size={20} stroke={1.5} />
			)}
		</ActionIcon>
	);
}
