import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Warm ivory from the app icon (#F7F2EA at shade 1). Used as the page body
// background in light mode; white surfaces float above it. See DESIGN.md.
const parchment: MantineColorsTuple = [
	"#fdfcf8",
	"#f7f2ea",
	"#efe6d6",
	"#e4d6bd",
	"#dbc8a6",
	"#d2bb92",
	"#cbb184",
	"#b39769",
	"#9e8459",
	"#8a7149",
];

const umber: MantineColorsTuple = [
	"#fbf4ec",
	"#f2e4d3",
	"#e2c5a8",
	"#cfa176",
	"#b98252",
	"#9a673e",
	"#7b5032",
	"#634129",
	"#513624",
	"#3f2b1f",
];

export const theme = createTheme({
	fontFamily: "var(--font-geist-sans), sans-serif",
	fontFamilyMonospace: "var(--font-geist-mono), monospace",
	defaultRadius: "md",
	black: "#121212",
	colors: { parchment, umber },
	primaryColor: "umber",
	primaryShade: { light: 6, dark: 4 },
	autoContrast: true,
});
