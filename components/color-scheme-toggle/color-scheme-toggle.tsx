"use client";

import {
	ActionIcon,
	useComputedColorScheme,
	useMantineColorScheme,
} from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "./color-scheme-toggle.module.css";

/**
 * Always-visible light/dark toggle, fixed in the top-right corner on every route.
 * Renders the icon for the scheme you'd switch *to*. The first render is stable
 * between server and client; after mount, the resolved scheme can safely update.
 */
export function ColorSchemeToggle() {
	const [mounted, setMounted] = useState(false);
	const { setColorScheme } = useMantineColorScheme();
	const computed = useComputedColorScheme("light", {
		getInitialValueInEffect: true,
	});
	const isDark = mounted && computed === "dark";

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<ActionIcon
			className={classes.toggle}
			onClick={() => setColorScheme(isDark ? "light" : "dark")}
			variant="default"
			size="lg"
			radius="md"
			aria-label={
				mounted
					? `Switch to ${isDark ? "light" : "dark"} mode`
					: "Toggle color scheme"
			}
		>
			{isDark ? (
				<IconSun size={20} stroke={1.5} />
			) : (
				<IconMoon size={20} stroke={1.5} />
			)}
		</ActionIcon>
	);
}
