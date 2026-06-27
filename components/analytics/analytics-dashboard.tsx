"use client";

import { AreaChart, BarChart, LineChart } from "@mantine/charts";
import {
	Center,
	RingProgress,
	SegmentedControl,
	SimpleGrid,
	Stack,
	Text,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import type { AnalyticsData, Period } from "@/lib/analytics";
import classes from "./analytics-dashboard.module.css";

const PERIOD_DATA = [
	{ value: "1d", label: "24 h" },
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
	{ value: "60q", label: "60 answers" },
	{ value: "300q", label: "300 answers" },
	{ value: "all", label: "All time" },
];

function accuracyColor(rate: number): string {
	if (rate < 50) return "red.6";
	if (rate < 72) return "yellow.6";
	return "green.6";
}

function formatAnswerTime(ms: number): { main: string; sub: string } {
	const totalSec = ms / 1000;
	const minutes = totalSec / 60;
	const seconds = Math.round(totalSec % 60);
	return { main: minutes.toFixed(1), sub: `${seconds}s` };
}

function formatExamTime(ms: number): { main: string; sub: string } {
	const totalMin = ms / 60_000;
	const hours = totalMin / 60;
	const minutes = Math.round(totalMin % 60);
	return { main: hours.toFixed(1), sub: `${minutes}m` };
}

interface Props {
	data: AnalyticsData;
	period: Period;
}

export function AnalyticsDashboard({ data, period }: Props) {
	const router = useRouter();

	function onPeriodChange(value: string) {
		router.replace(`/analytics?period=${value}`);
	}

	const isEmpty = data.totalAnswers === 0;

	const answerTime =
		data.avgAnswerDurationMs !== null
			? formatAnswerTime(data.avgAnswerDurationMs)
			: null;

	const examTime =
		data.avgExamDurationMs !== null
			? formatExamTime(data.avgExamDurationMs)
			: null;

	const domainChartData = data.correctnessByDomain.map((d) => ({
		label: d.label,
		accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
	}));

	const scenarioChartData = data.correctnessByScenario.map((d) => ({
		label: d.label,
		accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
	}));

	const correctnessChartData = data.correctnessBatches.map((b) => ({
		batch: b.label,
		accuracy: b.value,
	}));

	const responseTimeChartData = data.responseTimeBatches
		.filter((b) => b.count > 0)
		.map((b) => ({
			batch: b.label,
			seconds: Math.round(b.value / 1000),
		}));

	const ringRate =
		data.correctnessRate !== null ? Math.round(data.correctnessRate) : null;

	return (
		<div className={classes.page}>
			<Stack gap="md">
				{/* ── Header & period filter ── */}
				<div className={classes.controls}>
					<Text component="h1" className={classes.pageTitle}>
						Your Analytics
					</Text>
					<SegmentedControl
						data={PERIOD_DATA}
						value={period}
						onChange={onPeriodChange}
						size="sm"
					/>
				</div>

				{/* ── Row 1: Indicator cards ── */}
				<SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
					{/* Accuracy */}
					<div className={classes.statCard}>
						<Text className={classes.statLabel}>Overall Accuracy</Text>
						{isEmpty || ringRate === null ? (
							<EmptyValue />
						) : (
							<RingProgress
								size={110}
								thickness={10}
								roundCaps
								sections={[{ value: ringRate, color: accuracyColor(ringRate) }]}
								label={
									<div className={classes.ringLabel}>
										<span className={classes.ringValue}>{ringRate}</span>
										<span className={classes.ringUnit}>%</span>
									</div>
								}
							/>
						)}
					</div>

					{/* Exam passes */}
					<div className={classes.statCard}>
						<Text className={classes.statLabel}>Overall Exams Passed</Text>
						<Text
							className={classes.statValue}
							c={isEmpty ? "dimmed" : undefined}
						>
							{isEmpty ? "—" : String(data.examPassCount)}
						</Text>
						{!isEmpty && (
							<Text className={classes.statNote}>score ≥ 720 / 1000</Text>
						)}
					</div>

					{/* Avg answer time */}
					<div className={classes.statCard}>
						<Text className={classes.statLabel}>Overall Avg Answer Time</Text>
						{isEmpty || answerTime === null ? (
							<EmptyValue />
						) : (
							<>
								<Text className={classes.statValue}>{answerTime.main}</Text>
								<Text className={classes.statNote}>min</Text>
								<span className={classes.statSub}>{answerTime.sub}</span>
							</>
						)}
					</div>

					{/* Avg exam time */}
					<div className={classes.statCard}>
						<Text className={classes.statLabel}>Overall Avg Exam Time</Text>
						{examTime === null ? (
							<EmptyValue />
						) : (
							<>
								<Text className={classes.statValue}>{examTime.main}</Text>
								<Text className={classes.statNote}>h</Text>
								<span className={classes.statSub}>{examTime.sub}</span>
							</>
						)}
					</div>
				</SimpleGrid>

				{/* ── Row 2: Accuracy by group ── */}
				<SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
					<div className={classes.chartCard}>
						<div className={classes.chartTitle}>Accuracy by Domain</div>
						{isEmpty || domainChartData.length === 0 ? (
							<EmptyChart />
						) : (
							<BarChart
								data={domainChartData}
								dataKey="label"
								series={[
									{ name: "accuracy", color: "orange.5", label: "Accuracy" },
								]}
								orientation="vertical"
								h={220}
								valueFormatter={(v) => `${v}%`}
								xAxisProps={{
									domain: [0, 120],
									ticks: [0, 25, 50, 75, 100],
									tickFormatter: (v: number) => `${v}%`,
								}}
								yAxisProps={{ width: 85 }}
								barProps={{ barSize: 20 }}
								withBarValueLabel
								withTooltip
								withLegend={false}
								gridAxis="y"
							/>
						)}
					</div>

					<div className={classes.chartCard}>
						<div className={classes.chartTitle}>Accuracy by Scenario</div>
						{isEmpty || scenarioChartData.length === 0 ? (
							<EmptyChart />
						) : (
							<BarChart
								data={scenarioChartData}
								dataKey="label"
								series={[
									{ name: "accuracy", color: "grape.7", label: "Accuracy" },
								]}
								orientation="vertical"
								h={220}
								valueFormatter={(v) => `${v}%`}
								xAxisProps={{
									domain: [0, 120],
									ticks: [0, 25, 50, 75, 100],
									tickFormatter: (v: number) => `${v}%`,
								}}
								yAxisProps={{ width: 85 }}
								barProps={{ barSize: 20 }}
								withBarValueLabel
								withTooltip
								withLegend={false}
								gridAxis="y"
							/>
						)}
					</div>
				</SimpleGrid>

				{/* ── Row 3: Time series ── */}
				<SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
					<div className={classes.chartCard}>
						<div className={classes.chartTitle}>Accuracy Trend Over Time</div>
						{isEmpty || correctnessChartData.length < 2 ? (
							<EmptyChart message="Answer more questions to see your accuracy trend." />
						) : (
							<AreaChart
								data={correctnessChartData}
								dataKey="batch"
								series={[
									{ name: "accuracy", color: "orange.5", label: "Accuracy %" },
								]}
								h={220}
								curveType="monotone"
								withDots={correctnessChartData.length <= 15}
								withGradient
								fillOpacity={0.15}
								valueFormatter={(v) => `${v.toFixed(1)}%`}
								yAxisProps={{
									domain: [0, 100],
									tickFormatter: (v) => `${v}%`,
								}}
								xAxisProps={{
									label: {
										value: "Batch",
										position: "insideBottom",
										offset: -2,
									},
								}}
								referenceLines={[
									{
										y: 72,
										label: "Pass",
										color: "yellow.5",
										strokeDasharray: "4 4",
										labelPosition: "insideTopLeft",
									},
									{
										y: 90,
										label: "Target",
										color: "green.5",
										strokeDasharray: "4 4",
										labelPosition: "insideTopLeft",
									},
								]}
								withTooltip
								withLegend={false}
							/>
						)}
					</div>

					<div className={classes.chartCard}>
						<div className={classes.chartTitle}>
							Answer Time Trend Over Time
						</div>
						{isEmpty || responseTimeChartData.length < 2 ? (
							<EmptyChart message="Answer more questions to see your response time trend." />
						) : (
							<LineChart
								data={responseTimeChartData}
								dataKey="batch"
								series={[
									{ name: "seconds", color: "grape.7", label: "Avg time (s)" },
								]}
								h={220}
								curveType="monotone"
								withDots={responseTimeChartData.length <= 15}
								strokeWidth={2}
								valueFormatter={(v) => `${v}s`}
								xAxisProps={{
									label: {
										value: "Batch",
										position: "insideBottom",
										offset: -2,
									},
								}}
								withTooltip
								withLegend={false}
							/>
						)}
					</div>
				</SimpleGrid>
			</Stack>
		</div>
	);
}

function EmptyValue() {
	return (
		<Text fz="3rem" fw={800} c="dimmed" lh={1}>
			—
		</Text>
	);
}

function EmptyChart({
	message = "No answers recorded yet.",
}: {
	message?: string;
}) {
	return (
		<Center className={classes.emptyState}>
			<Text fz="sm" c="dimmed" ta="center">
				{message}
			</Text>
		</Center>
	);
}
