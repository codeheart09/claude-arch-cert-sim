import { LoadingIcon } from "@/components/loading-icon/loading-icon";
import classes from "./full-screen-loader.module.css";

/**
 * Full-viewport loading screen: the animated graduation-cap mark over a
 * theme-colored backdrop. Use as a route `loading.tsx` or a Suspense fallback.
 */
export function FullScreenLoader() {
	return (
		<div className={classes.overlay} role="status" aria-label="Loading">
			<LoadingIcon size={250} />
		</div>
	);
}
