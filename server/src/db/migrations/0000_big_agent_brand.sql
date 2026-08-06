CREATE TABLE `command_settings` (
	`command_name` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`permission_level` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`cooldown_global_sec` integer DEFAULT 0 NOT NULL,
	`cooldown_user_sec` integer DEFAULT 0 NOT NULL,
	`mods_bypass_cooldown` integer DEFAULT true NOT NULL,
	`response_template` text NOT NULL,
	`error_template` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`author` text NOT NULL,
	`game` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`added_by` text NOT NULL,
	`edited_at` text,
	`edited_by` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
