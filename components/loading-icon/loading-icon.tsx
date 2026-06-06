import classes from "./loading-icon.module.css";

interface LoadingIconProps {
	/** Rendered width/height in px. Square; the artwork scales to fit. */
	size?: number;
}

/**
 * A-mark outline followed by its inner notch. Used as a clip path with
 * `clip-rule: evenodd` so the notch becomes a knockout hole (showing the page
 * background through it), regardless of color scheme.
 */
const A_MARK =
	"M256 170 L366 442 H314 L290 380 H222 L198 442 H146 L256 170 Z M240 334 H272 L256 290 L240 334 Z";

/**
 * Animated loading mark derived from the app favicon: an Anthropic-style "A"
 * wearing a graduation cap. Pure SVG + CSS (no client JS), so it renders as a
 * Server Component. Colors come from Mantine theme variables, so it adapts to
 * light/dark. Animations: a gray shine sweeps the A from bottom-left to
 * top-right, the cap bobs, the tassel swings.
 *
 * Note: the clip/gradient ids are fixed, so render a single instance at a time
 * (it's used as a full-screen loader).
 */
export function LoadingIcon({ size = 96 }: LoadingIconProps) {
	return (
		<svg
			className={classes.icon}
			width={size}
			height={size}
			viewBox="0 0 512 512"
			fill="none"
			role="presentation"
			aria-hidden="true"
			focusable="false"
		>
			<title>Loading</title>
			<defs>
				<clipPath id="loading-a-clip">
					<path d={A_MARK} clipRule="evenodd" />
				</clipPath>
				{/* Narrow band, angled and translated along the bottom-left → top-right axis. */}
				<linearGradient
					id="loading-shine"
					x1="0"
					y1="0"
					x2="1"
					y2="0"
					gradientTransform="rotate(-32 0.5 0.5)"
				>
					<stop className={classes.shineStop} offset="0%" stopOpacity="0" />
					<stop className={classes.shineStop} offset="28%" stopOpacity="0" />
					<stop className={classes.shineStop} offset="50%" stopOpacity="0.9" />
					<stop className={classes.shineStop} offset="72%" stopOpacity="0" />
					<stop className={classes.shineStop} offset="100%" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/* Soft ground shadow behind the mark. */}
			<ellipse className={classes.shadow} cx="256" cy="398" rx="116" ry="18" />

			{/* The "A", with a gray shine sweeping across it (both clipped to its shape). */}
			<g clipPath="url(#loading-a-clip)">
				<rect x="140" y="165" width="232" height="282" fill="currentColor" />
				<rect
					className={classes.shine}
					x="106"
					y="156"
					width="300"
					height="300"
					fill="url(#loading-shine)"
				/>
			</g>

			{/* Graduation cap. */}
			<g className={classes.cap}>
				<path
					className={classes.solid}
					d="M256 78 L400 132 L256 186 L112 132 Z"
				/>
				{/* Lighter/darker center of the board (the original's inner highlight). */}
				<path
					className={classes.capInner}
					d="M256 100 L342 132 L256 164 L170 132 Z"
				/>
				<path
					className={classes.solid}
					d="M188 152 C214 173 298 173 324 152 V190 C298 213 214 213 188 190 V152 Z"
				/>
				{/* Tassel — swings from where the cord meets the cap corner. */}
				<g className={classes.tassel}>
					<path className={classes.cord} d="M400 132 V220" />
					<circle className={classes.solid} cx="400" cy="230" r="18" />
					<path
						className={classes.solid}
						d="M388 248 H412 L426 302 H374 L388 248 Z"
					/>
				</g>
			</g>
		</svg>
	);
}
