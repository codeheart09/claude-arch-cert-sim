"use client";

import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
	type Icon,
	IconArrowsShuffle,
	IconCertificate,
	IconChartBar,
	IconRobot,
	IconSettings,
	IconStopwatch,
} from "@tabler/icons-react";
import Link from "next/link";
import classes from "./top-navigation.module.css";

interface NavigationItem {
	label: string;
	href: string;
	Icon: Icon;
}

const items: NavigationItem[] = [
	{ label: "Your Analytics", href: "/analytics", Icon: IconChartBar },
	{ label: "Exam Simmulator", href: "/exam-simulator", Icon: IconCertificate },
	{
		label: "Question Stopwatch",
		href: "/question-stopwatch",
		Icon: IconStopwatch,
	},
	{
		label: "Random Questions",
		href: "/random-questions",
		Icon: IconArrowsShuffle,
	},
	{ label: "AI Tutor", href: "/ai-tutor", Icon: IconRobot },
	{ label: "Configurations", href: "/configurations", Icon: IconSettings },
];

export function TopNavigation() {
	return (
		<nav aria-label="Primary" className={classes.nav}>
			<Group gap="xs" wrap="nowrap">
				{items.map(({ label, href, Icon }) => (
					<Tooltip key={label} label={label} withArrow>
						<ActionIcon
							component={Link}
							href={href}
							aria-label={label}
							className={classes.item}
							variant="default"
							size="lg"
							radius="md"
						>
							<Icon size={20} stroke={1.5} />
						</ActionIcon>
					</Tooltip>
				))}
			</Group>
		</nav>
	);
}
