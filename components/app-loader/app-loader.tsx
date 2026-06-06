"use client";

import { useEffect, useState } from "react";
import { FullScreenLoader } from "@/components/full-screen-loader/full-screen-loader";
import classes from "./app-loader.module.css";

/** How long the loader stays after the app is ready, before fading out. */
const HOLD_MS = 1500;
/** Matches the fade transition duration in the CSS module (plus a margin). */
const FADE_MS = 600;

/**
 * Shows the full-screen loader on initial app load, holds it for HOLD_MS, then
 * fades it out and unmounts. Rendered during SSR (so it's visible from the first
 * paint, with no flash before hydration); once done it returns null and does not
 * reappear on client navigation.
 */
export function AppLoader() {
	const [phase, setPhase] = useState<"holding" | "fading" | "done">("holding");

	useEffect(() => {
		const timer = setTimeout(() => setPhase("fading"), HOLD_MS);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (phase !== "fading") {
			return;
		}
		const timer = setTimeout(() => setPhase("done"), FADE_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	if (phase === "done") {
		return null;
	}

	return (
		<div
			className={
				phase === "fading" ? `${classes.fade} ${classes.hidden}` : classes.fade
			}
		>
			<FullScreenLoader />
		</div>
	);
}
