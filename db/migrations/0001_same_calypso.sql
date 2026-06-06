CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question` text NOT NULL,
	`difficulty` text NOT NULL,
	`domain` text,
	`scenario` text,
	`alternatives` text NOT NULL,
	`correct_alternative` text NOT NULL,
	`insights` text NOT NULL,
	`content_hash` text NOT NULL,
	`source` text DEFAULT 'authored' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_content_hash_unique` ON `questions` (`content_hash`);