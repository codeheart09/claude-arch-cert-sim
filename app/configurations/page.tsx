import { ConfigurationsPanel } from "@/components/configurations/configurations-panel";
import { getQuestionCount } from "@/lib/questions";

export default function ConfigurationsPage() {
	const count = getQuestionCount();
	return <ConfigurationsPanel initialCount={count} />;
}
