import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	experimental: {
		optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
	},
	serverExternalPackages: [
		"sqlite-vec",
		"sqlite-vec-darwin-arm64",
		"sqlite-vec-darwin-x64",
		"sqlite-vec-linux-arm64",
		"sqlite-vec-linux-x64",
		"sqlite-vec-windows-x64",
	],
};

export default nextConfig;
