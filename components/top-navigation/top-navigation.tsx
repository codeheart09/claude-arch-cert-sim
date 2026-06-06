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
import classes from "./top-navigation.module.css";

interface NavigationItem {
	label: string;
	Icon: Icon;
}

const items: NavigationItem[] = [
	{ label: "Your Analytics", Icon: IconChartBar },
	{ label: "Exam Simmulator", Icon: IconCertificate },
	{ label: "Question Stopwatch", Icon: IconStopwatch },
	{ label: "Random Questions", Icon: IconArrowsShuffle },
	{ label: "AI Tutor", Icon: IconRobot },
	{ label: "Configurations", Icon: IconSettings },
];

export function TopNavigation() {
	return (
		<nav aria-label="Primary" className={classes.nav}>
			<Group gap="xs" wrap="nowrap">
				{items.map(({ label, Icon }) => (
					<Tooltip key={label} label={label} withArrow>
						<ActionIcon
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
