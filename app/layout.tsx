import "@mantine/core/styles.css";
import "./globals.css";

import {
	ColorSchemeScript,
	MantineProvider,
	mantineHtmlProps,
} from "@mantine/core";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ColorSchemeToggle } from "@/components/color-scheme-toggle/color-scheme-toggle";
import { theme } from "./theme";

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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable}`}
			{...mantineHtmlProps}
		>
			<head>
				<ColorSchemeScript defaultColorScheme="auto" />
			</head>
			<body>
				<MantineProvider theme={theme} defaultColorScheme="auto">
					<ColorSchemeToggle />
					{children}
				</MantineProvider>
			</body>
		</html>
	);
}
