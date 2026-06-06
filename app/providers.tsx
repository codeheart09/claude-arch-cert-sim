"use client";

import { type CSSVariablesResolver, MantineProvider } from "@mantine/core";
import { theme } from "./theme";

const cssVariablesResolver: CSSVariablesResolver = (t) => ({
	variables: {},
	light: { "--mantine-color-body": t.colors.parchment[1] },
	dark: {},
});

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<MantineProvider
			theme={theme}
			defaultColorScheme="auto"
			cssVariablesResolver={cssVariablesResolver}
		>
			{children}
		</MantineProvider>
	);
}
