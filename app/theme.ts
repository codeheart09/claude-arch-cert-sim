import { createTheme } from "@mantine/core";

/**
 * Centralized Mantine theme — the single source of truth for global design
 * decisions (brand color, default radius, fonts, custom palettes).
 *
 * See DESIGN.md for the styling approach. Change global look-and-feel here,
 * not on individual component instances.
 */
export const theme = createTheme({
	fontFamily: "var(--font-geist-sans), sans-serif",
	fontFamilyMonospace: "var(--font-geist-mono), monospace",
	defaultRadius: "md",
});
