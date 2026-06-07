CREATE TABLE `exam_simulations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`completed` integer NOT NULL,
	`duration` integer NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `answers` ADD `exam_simulation_id` integer REFERENCES exam_simulations(id);