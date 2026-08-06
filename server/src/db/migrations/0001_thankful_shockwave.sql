CREATE TABLE `quote_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`trigger` text NOT NULL,
	`quote_count` integer NOT NULL,
	`data` text NOT NULL
);
