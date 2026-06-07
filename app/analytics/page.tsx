import { connection } from "next/server";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { getAnalyticsData, type Period } from "@/lib/analytics";

const VALID_PERIODS: Period[] = ["1d", "7d", "30d", "60q", "300q", "all"];

function toPeriod(raw: string | undefined): Period {
	if (raw && (VALID_PERIODS as string[]).includes(raw)) return raw as Period;
	return "all";
}

export default async function AnalyticsPage({
	searchParams,
}: {
	searchParams: Promise<{ period?: string }>;
}) {
	await connection();
	const { period: raw } = await searchParams;
	const period = toPeriod(raw);
	const data = getAnalyticsData(period);
	return <AnalyticsDashboard data={data} period={period} />;
}
