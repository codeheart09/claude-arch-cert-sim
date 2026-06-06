import "@mantine/core/styles.css";
import "./globals.css";

import { mantineHtmlProps } from "@mantine/core";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { AppLoader } from "@/components/app-loader/app-loader";
import { ColorSchemeToggle } from "@/components/color-scheme-toggle/color-scheme-toggle";
import { TopNavigation } from "@/components/top-navigation/top-navigation";
import { getUser } from "@/lib/user";
import classes from "./layout.module.css";
import { Providers } from "./providers";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Claude Certified Architect — Exam Simulator",
	description:
		"Practice exam simulator for engineers preparing for the Claude Certified Architect certification.",
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	await connection();
	const user = getUser();
	const topBarMessage = user
		? `Welcome back, ${user.name}`
		: "Claude Certified Architect";

	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable}`}
			{...mantineHtmlProps}
		>
			<body>
				<Providers>
					<header className={classes.topBar}>
						<div className={classes.welcome}>{topBarMessage}</div>
						<TopNavigation />
						<div aria-hidden="true" />
					</header>
					<ColorSchemeToggle />
					{children}
					<AppLoader />
				</Providers>
			</body>
		</html>
	);
}
