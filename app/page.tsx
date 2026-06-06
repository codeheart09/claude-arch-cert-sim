import { connection } from "next/server";
import { UserHome } from "@/components/user-home/user-home";
import { WelcomeScreen } from "@/components/welcome-screen/welcome-screen";
import { getUser } from "@/lib/user";

export default async function Home() {
	await connection();

	const user = getUser();

	if (!user) {
		return <WelcomeScreen />;
	}

	return <UserHome />;
}
