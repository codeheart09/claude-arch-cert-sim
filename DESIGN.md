# Design & UI Plan

This project does **not** build a design system from scratch. It uses **Mantine 9**
for styled, accessible components, a **centralized theme** as the single source of
truth, and **CSS Modules for fine-tuning** when a component needs a custom look.

This document is the durable record of *how we style things here*. Follow it so the
app stays visually coherent and we reuse the system instead of reinventing it.

> **Before writing UI code:** Mantine's API may differ from training data. Check the
> docs at <https://mantine.dev> (or `node_modules/@mantine/core`) for the component
> you're using.

---

## Look & feel

The product is for professional engineers and should meet the quality bar of
contemporary developer tooling. Concretely:

- **Content-first and low-chrome.** Minimal decoration; the UI recedes so questions,
  code, and results are the focus.
- **Clear typographic hierarchy.** A small, deliberate type scale with comfortable line
  height for reading; **monospace** (`--mantine-font-family-monospace`) for code,
  identifiers, and technical data.
- **Restrained, systematic color.** A neutral gray foundation with a single purposeful
  accent (the theme `primaryColor`). Color carries meaning — state, action — not
  decoration.
- **Calm spacing on a strong grid.** Consistent spacing scale; whitespace favored over
  density, but efficient and without wasted motion.
- **Subtle depth.** Hairline borders (`--mantine-color-default-border`) and soft
  shadows for separation — flat, not skeuomorphic.
- **Crisp and legible.** High contrast in both color schemes, sharp focus states, fully
  keyboard-navigable.
- **Purposeful motion.** Short, functional transitions (hover, open/close); no
  decorative animation.

These are defaults, not rigid rules — deviate only deliberately.

---

## The decision hierarchy

When building any UI, **stop at the first step that satisfies the need.** Do not skip
ahead to custom CSS.

1. **Use a Mantine component.** Reach for an existing component before writing markup —
   `Button`, `TextInput`, `Card`, `Modal`, `Table`, `Tabs`, `Badge`, `Alert`, etc.
2. **Configure it with props.** Use component props and Mantine **style props**
   (`p`, `m`, `mt`, `c`, `w`, `bg`, `radius`, …) for spacing/color/sizing pulled from
   the theme scale — e.g. `<Stack gap="md">`, `<Box p="lg" c="blue.6">`.
3. **Change it globally via the theme.** If the change should apply everywhere (brand
   color, default radius, font), edit `app/theme.ts` — **not** the instance.
4. **Fine-tune with a CSS Module.** For a one-off visual tweak, pass `className` /
   `classNames` pointing at a co-located `*.module.css`, and reference **Mantine CSS
   variables** inside it (see below). Never hardcode values.
5. **Build a custom component** only when nothing in Mantine fits. Compose it from
   Mantine primitives (`Box`, `Group`, `Stack`, `Flex`, `Grid`) and theme variables;
   put it in `components/`.

---

## Theme is the single source of truth

Global design decisions live in **`app/theme.ts`**, created with `createTheme` and
passed to `MantineProvider` in `app/layout.tsx`.

```ts
// app/theme.ts
import { createTheme } from "@mantine/core";

export const theme = createTheme({
	primaryColor: "blue",
	defaultRadius: "md",
	// fontFamily, colors, spacing, fontSizes, shadows, headings… go here.
});
```

Rules:

- Brand color, default radius, fonts, and custom color palettes are configured **here
  and only here.** Don't re-specify them per component.
- A custom color is a 10-shade array under `theme.colors`, then referenced by name
  (`primaryColor: "brand"`, `c="brand.6"`, `var(--mantine-color-brand-6)`).
- Anything you set in the theme is automatically exposed as a CSS variable for use in
  CSS Modules.

---

## Styling rules

**Allowed**

- Mantine components and their props.
- Mantine **style props** (`p`, `m`, `gap`, `c`, `bg`, `w`, `h`, `radius`, …) for
  theme-scale values.
- `className` (root element) and `classNames={{ ... }}` (inner elements via the Styles
  API) pointing at a co-located CSS Module.
- Inside CSS Modules: **Mantine CSS variables only** for color, spacing, radius, etc.

**Forbidden**

- ❌ The `style={{ ... }}` prop and the `styles={{ ... }}` prop. They are inline styles
  (banned project-wide), and `styles` outranks CSS Modules so you'd be forced into
  `!important`. Use `className` / `classNames` + a CSS Module instead.
- ❌ Hardcoded design values in CSS (`#3b82f6`, `16px`, `0.5rem`). Use the variables
  below so fine-tuning stays on-theme.
- ❌ Tailwind utilities (not installed) and any second component/styling library.

---

## Mantine CSS variables (use these in CSS Modules)

When fine-tuning, reference these instead of literals so tweaks track the theme:

| Token        | Variables                                                    | Example value          |
| ------------ | ----------------------------------------------------------- | ---------------------- |
| Spacing      | `--mantine-spacing-{xs,sm,md,lg,xl}`                        | `md` = `1rem`          |
| Font size    | `--mantine-font-size-{xs,sm,md,lg,xl}`                      | `md` = `1rem`          |
| Line height  | `--mantine-line-height-{xs,sm,md,lg,xl}`                    | `md` = `1.55`          |
| Radius       | `--mantine-radius-{xs,sm,md,lg,xl}`                         | `md` = `0.5rem`        |
| Shadow       | `--mantine-shadow-{xs,sm,md,lg,xl}`                         | layered box-shadow     |
| Color        | `--mantine-color-{name}-{0..9}`                             | `--mantine-color-blue-6` |
| Headings     | `--mantine-h{1..6}-font-size` (+ `-font-weight`, `-line-height`) | —                 |

Color names: `blue, red, pink, grape, violet, indigo, cyan, teal, green, lime, yellow,
orange, gray, dark` (plus any you add in `theme.colors`).

```css
/* feature-panel.module.css */
.panel {
	padding: var(--mantine-spacing-lg);
	border-radius: var(--mantine-radius-md);
	box-shadow: var(--mantine-shadow-sm);
	background: var(--mantine-color-body);
}
```

---

## Overriding component internals (Styles API)

Mantine components expose named selectors for their inner elements. Target them with
`classNames` + a CSS Module — never the `styles` prop.

```tsx
// search-input.tsx  ('use client')
import { TextInput } from "@mantine/core";
import classes from "./search-input.module.css";

export function SearchInput() {
	return (
		<TextInput
			label="Search"
			classNames={{ root: classes.root, input: classes.input, label: classes.label }}
		/>
	);
}
```

```css
/* search-input.module.css */
.input {
	border-radius: var(--mantine-radius-xl);
}
```

For state-based styling, use the `data-*` attributes Mantine renders (e.g.
`&[data-active]`, `&[data-disabled]`) inside the CSS Module.

---

## Server vs Client components

Mantine interactive components run on the client. Keep the boundary tight:

- Pages, layouts, and data-fetching stay **Server Components** (per `CLAUDE.md`).
- Push Mantine usage into **client leaf components** (`'use client'`) under
  `components/`, and pass plain data into them as props.
- Don't add `'use client'` to a page just to drop in a Mantine component — wrap the
  Mantine part in its own client component instead.

---

## Layout & composition

Use Mantine layout primitives instead of bespoke fl/grid CSS:

- `Stack` — vertical spacing (`gap` from theme scale).
- `Group` — horizontal grouping/alignment.
- `Flex` / `Grid` / `SimpleGrid` — general layout.
- `Container` — page width constraints.
- `Box` — a styled `div` that accepts style props and `className`.

---

## Color scheme — light & dark (required)

Both light and dark modes are **first-class and mandatory**. Every screen and component
must work in both — never ship a view that only works in one.

- **A color-scheme toggle is always visible**, fixed in a corner of the screen, on
  every route. It lives in the root layout (`app/layout.tsx`) as a `'use client'`
  component so it persists across navigation.
- **Default to the OS preference** — `<MantineProvider defaultColorScheme="auto">` —
  with the toggle overriding it. Mantine persists the choice to `localStorage`, and
  `ColorSchemeScript` (already wired) prevents a flash of the wrong scheme on load.
- Implement the toggle with the `useMantineColorScheme` hook (e.g. an `ActionIcon`
  cycling light / dark / auto).
- **Build theme-aware styles — never hardcode per scheme.** Prefer semantic variables
  (`--mantine-color-body`, `--mantine-color-text`, `--mantine-color-default-border`)
  and the `light-dark()` CSS helper.

---

## Brand surface — parchment

The app icon's warm ivory (`#F7F2EA`) is the **page body background** in light mode
(set via `cssVariablesResolver` → `--mantine-color-body`). White surfaces (`--surface-highlight`)
float above it — cards, panels, menus, dropdowns. Dark mode uses Mantine's default dark body.

Use the scheme-aware tokens from `app/globals.css`, not raw palette values:

- `var(--surface-highlight)` — white in light / `dark-6` in dark.
- `var(--surface-highlight-border)` — `parchment-3` in light / `dark-4` in dark.

```css
.card {
	background: var(--surface-highlight);
	border: 1px solid var(--surface-highlight-border);
}
```

---

## Component inventory

Custom, reusable components live in `components/` and should be listed here as they're
created, so we reuse rather than duplicate:

| Component | Location | Purpose |
| --------- | -------- | ------- |
| `ColorSchemeToggle` | `components/color-scheme-toggle/` | Always-visible light/dark toggle, fixed top-right on every route. |
| `LoadingIcon` | `components/loading-icon/` | Animated graduation-cap "A" mark (pure SVG/CSS, favicon-derived). Accepts `size`. |
| `FullScreenLoader` | `components/full-screen-loader/` | Full-viewport loading screen using `LoadingIcon`. Wired as `app/loading.tsx`. |
| `AppLoader` | `components/app-loader/` | Client wrapper that holds `FullScreenLoader` ~1.5s on initial load, then fades out. Mounted in the root layout. |
