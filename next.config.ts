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
		// fastembed and its platform-specific native tokenizer binaries
		"fastembed",
		"@anush008/tokenizers",
		"@anush008/tokenizers-darwin-universal",
		"@anush008/tokenizers-darwin-x64",
		"@anush008/tokenizers-darwin-arm64",
		"@anush008/tokenizers-linux-x64-gnu",
		"@anush008/tokenizers-linux-x64-musl",
		"@anush008/tokenizers-linux-arm64-gnu",
		"@anush008/tokenizers-linux-arm64-musl",
		"@anush008/tokenizers-linux-arm-gnueabihf",
		"@anush008/tokenizers-win32-x64-msvc",
		"@anush008/tokenizers-win32-ia32-msvc",
		"@anush008/tokenizers-win32-arm64-msvc",
		"@anush008/tokenizers-android-arm64",
		"@anush008/tokenizers-android-arm-eabi",
		"@anush008/tokenizers-freebsd-x64",
	],
};

export default nextConfig;
