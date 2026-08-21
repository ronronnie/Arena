CREATE TYPE "public"."appeal_status" AS ENUM('open', 'under_review', 'granted', 'denied');--> statement-breakpoint
CREATE TYPE "public"."division_tier" AS ENUM('bronze', 'silver', 'gold', 'elite');--> statement-breakpoint
CREATE TYPE "public"."eligibility_check_type" AS ENUM('duration', 'framing', 'takes', 'wardrobe', 'audio_match', 'integrity', 'moderation');--> statement-breakpoint
CREATE TYPE "public"."eligibility_status" AS ENUM('pending', 'pass', 'fail', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('uploading', 'processing', 'under_review', 'eligible', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."license_type" AS ENUM('direct', 'library', 'public_domain', 'original');--> statement-breakpoint
CREATE TYPE "public"."moderation_action_type" AS ENUM('none', 'entry_hidden', 'entry_rejected', 'rating_discounted', 'account_suspended', 'account_banned');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('not_the_brief', 'stolen_work', 'unsafe', 'hateful', 'sexual', 'underage_concern', 'vote_manipulation', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'triaged', 'upheld', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."season_outcome" AS ENUM('promoted', 'held', 'relegated');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('upcoming', 'open', 'judging', 'complete');--> statement-breakpoint
CREATE TYPE "public"."set_piece_status" AS ENUM('draft', 'scheduled', 'published', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."video_source" AS ENUM('mux', 'fixture');--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moderation_action_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"status" "appeal_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_piece_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"entry_a" uuid NOT NULL,
	"entry_b" uuid NOT NULL,
	"winner_entry_id" uuid,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"voter_weight" double precision DEFAULT 1 NOT NULL,
	"is_counted" boolean DEFAULT true NOT NULL,
	"discount_reason" text,
	CONSTRAINT "comparisons_distinct_entries" CHECK ("comparisons"."entry_a" <> "comparisons"."entry_b"),
	CONSTRAINT "comparisons_winner_is_a_contender" CHECK ("comparisons"."winner_entry_id" IS NULL
          OR "comparisons"."winner_entry_id" = "comparisons"."entry_a"
          OR "comparisons"."winner_entry_id" = "comparisons"."entry_b"),
	CONSTRAINT "comparisons_decided_has_winner" CHECK (("comparisons"."decided_at" IS NULL AND "comparisons"."winner_entry_id" IS NULL)
          OR ("comparisons"."decided_at" IS NOT NULL AND "comparisons"."winner_entry_id" IS NOT NULL)),
	CONSTRAINT "comparisons_discount_reason_present" CHECK ("comparisons"."is_counted" OR "comparisons"."discount_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "division_members" (
	"division_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"position" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "division_members_division_id_user_id_pk" PRIMARY KEY("division_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"tier" "division_tier" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"check_type" "eligibility_check_type" NOT NULL,
	"status" "eligibility_status" DEFAULT 'pending' NOT NULL,
	"score" double precision,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_no_self_follow" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
CREATE TABLE "judge_calibration" (
	"judge_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"agreement_rate" double precision DEFAULT 0 NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_calibration_judge_id_category_id_pk" PRIMARY KEY("judge_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "judge_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" double precision NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid,
	"moderator_id" uuid,
	"system_reason" text,
	"action_type" "moderation_action_type" NOT NULL,
	"target_user_id" uuid,
	"target_set_piece_entry_id" uuid,
	"target_signature_entry_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_attributable" CHECK ("moderation_actions"."moderator_id" IS NOT NULL OR "moderation_actions"."system_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"handle" text NOT NULL,
	"dob" date,
	"country" text,
	"city" text,
	"is_judge" boolean DEFAULT true NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"comparisons_completed" integer DEFAULT 0 NOT NULL,
	"compete_unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_comparisons_completed_non_negative" CHECK ("profiles"."comparisons_completed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"season_id" uuid,
	"set_piece_id" uuid,
	"rating" double precision NOT NULL,
	"rating_deviation" double precision NOT NULL,
	"volatility" double precision NOT NULL,
	"comparisons_in_period" integer DEFAULT 0 NOT NULL,
	"period_started_at" timestamp with time zone NOT NULL,
	"period_ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"rating" double precision DEFAULT 1500 NOT NULL,
	"rating_deviation" double precision DEFAULT 350 NOT NULL,
	"volatility" double precision DEFAULT 0.06 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_category_id_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"set_piece_entry_id" uuid,
	"signature_entry_id" uuid,
	"reported_user_id" uuid,
	"reason" "report_reason" NOT NULL,
	"detail" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_exactly_one_subject" CHECK ((CASE WHEN "reports"."set_piece_entry_id" IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN "reports"."signature_entry_id" IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN "reports"."reported_user_id" IS NULL THEN 0 ELSE 1 END) = 1)
);
--> statement-breakpoint
CREATE TABLE "season_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"division_id" uuid,
	"final_rating" double precision NOT NULL,
	"final_position" integer,
	"outcome" "season_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "season_status" DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_window_ordered" CHECK ("seasons"."ends_at" > "seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "set_piece_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"set_piece_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"video_source" "video_source" NOT NULL,
	"mux_asset_id" text,
	"mux_playback_id" text,
	"fixture_path" text,
	"duration_ms" integer,
	"status" "entry_status" DEFAULT 'uploading' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_piece_entries_id_set_piece_key" UNIQUE("id","set_piece_id"),
	CONSTRAINT "set_piece_entries_video_source_consistent" CHECK (("set_piece_entries"."video_source" = 'mux' AND "set_piece_entries"."fixture_path" IS NULL)
          OR ("set_piece_entries"."video_source" = 'fixture' AND "set_piece_entries"."fixture_path" IS NOT NULL
              AND "set_piece_entries"."mux_asset_id" IS NULL AND "set_piece_entries"."mux_playback_id" IS NULL)),
	CONSTRAINT "set_piece_entries_rejection_reason_present" CHECK ("set_piece_entries"."status" <> 'rejected' OR "set_piece_entries"."rejection_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "set_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"week_no" integer NOT NULL,
	"title" text NOT NULL,
	"brief_text" text NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tutorial_mux_asset_id" text,
	"track_id" uuid,
	"creator_credit" text,
	"opens_at" timestamp with time zone NOT NULL,
	"submit_by" timestamp with time zone NOT NULL,
	"judging_ends_at" timestamp with time zone NOT NULL,
	"status" "set_piece_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_pieces_window_ordered" CHECK ("set_pieces"."submit_by" > "set_pieces"."opens_at"),
	CONSTRAINT "set_pieces_judging_after_submit" CHECK ("set_pieces"."judging_ends_at" > "set_pieces"."submit_by")
);
--> statement-breakpoint
CREATE TABLE "signature_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"caption" text,
	"video_source" "video_source" NOT NULL,
	"mux_asset_id" text,
	"mux_playback_id" text,
	"fixture_path" text,
	"duration_ms" integer,
	"status" "entry_status" DEFAULT 'uploading' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_entries_video_source_consistent" CHECK (("signature_entries"."video_source" = 'mux' AND "signature_entries"."fixture_path" IS NULL)
          OR ("signature_entries"."video_source" = 'fixture' AND "signature_entries"."fixture_path" IS NOT NULL
              AND "signature_entries"."mux_asset_id" IS NULL AND "signature_entries"."mux_playback_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"licensor" text NOT NULL,
	"license_type" "license_type" NOT NULL,
	"license_starts_at" timestamp with time zone NOT NULL,
	"license_expires_at" timestamp with time zone NOT NULL,
	"territory" text[] NOT NULL,
	"usage_terms" text NOT NULL,
	"fingerprint_ref" text,
	"contract_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_license_window_ordered" CHECK ("tracks"."license_expires_at" > "tracks"."license_starts_at"),
	CONSTRAINT "tracks_territory_not_empty" CHECK (array_length("tracks"."territory", 1) >= 1)
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_moderation_action_id_moderation_actions_id_fk" FOREIGN KEY ("moderation_action_id") REFERENCES "public"."moderation_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_set_piece_id_set_pieces_id_fk" FOREIGN KEY ("set_piece_id") REFERENCES "public"."set_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_voter_id_profiles_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_entry_a_same_set_piece_fk" FOREIGN KEY ("entry_a","set_piece_id") REFERENCES "public"."set_piece_entries"("id","set_piece_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_entry_b_same_set_piece_fk" FOREIGN KEY ("entry_b","set_piece_id") REFERENCES "public"."set_piece_entries"("id","set_piece_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division_members" ADD CONSTRAINT "division_members_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division_members" ADD CONSTRAINT "division_members_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_checks" ADD CONSTRAINT "eligibility_checks_entry_id_set_piece_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."set_piece_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_profiles_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_profiles_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_calibration" ADD CONSTRAINT "judge_calibration_judge_id_profiles_user_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_calibration" ADD CONSTRAINT "judge_calibration_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_scores" ADD CONSTRAINT "judge_scores_entry_id_set_piece_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."set_piece_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_scores" ADD CONSTRAINT "judge_scores_judge_id_profiles_user_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_profiles_user_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_profiles_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_set_piece_entry_id_set_piece_entries_id_fk" FOREIGN KEY ("target_set_piece_entry_id") REFERENCES "public"."set_piece_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_signature_entry_id_signature_entries_id_fk" FOREIGN KEY ("target_signature_entry_id") REFERENCES "public"."signature_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_set_piece_id_set_pieces_id_fk" FOREIGN KEY ("set_piece_id") REFERENCES "public"."set_pieces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_set_piece_entry_id_set_piece_entries_id_fk" FOREIGN KEY ("set_piece_entry_id") REFERENCES "public"."set_piece_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_signature_entry_id_signature_entries_id_fk" FOREIGN KEY ("signature_entry_id") REFERENCES "public"."signature_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_profiles_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_results" ADD CONSTRAINT "season_results_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_piece_entries" ADD CONSTRAINT "set_piece_entries_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_piece_entries" ADD CONSTRAINT "set_piece_entries_set_piece_id_set_pieces_id_fk" FOREIGN KEY ("set_piece_id") REFERENCES "public"."set_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_piece_entries" ADD CONSTRAINT "set_piece_entries_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_piece_entries" ADD CONSTRAINT "set_piece_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_pieces" ADD CONSTRAINT "set_pieces_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_pieces" ADD CONSTRAINT "set_pieces_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_pieces" ADD CONSTRAINT "set_pieces_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_entries" ADD CONSTRAINT "signature_entries_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_entries" ADD CONSTRAINT "signature_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appeals_status_idx" ON "appeals" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "comparisons_voter_idx" ON "comparisons" USING btree ("voter_id","decided_at");--> statement-breakpoint
CREATE INDEX "comparisons_set_piece_idx" ON "comparisons" USING btree ("set_piece_id","decided_at");--> statement-breakpoint
CREATE INDEX "comparisons_entry_a_idx" ON "comparisons" USING btree ("entry_a");--> statement-breakpoint
CREATE INDEX "comparisons_entry_b_idx" ON "comparisons" USING btree ("entry_b");--> statement-breakpoint
CREATE INDEX "division_members_standings_idx" ON "division_members" USING btree ("division_id","points" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "divisions_season_tier_name_key" ON "divisions" USING btree ("season_id","tier","name");--> statement-breakpoint
CREATE INDEX "eligibility_checks_entry_idx" ON "eligibility_checks" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_checks_entry_type_key" ON "eligibility_checks" USING btree ("entry_id","check_type");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "judge_scores_entry_judge_key" ON "judge_scores" USING btree ("entry_id","judge_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_target_user_idx" ON "moderation_actions" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_key" ON "profiles" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "rating_history_user_category_idx" ON "rating_history" USING btree ("user_id","category_id","period_ended_at");--> statement-breakpoint
CREATE INDEX "rating_history_season_leaderboard_idx" ON "rating_history" USING btree ("season_id","category_id","rating" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ratings_category_rating_idx" ON "ratings" USING btree ("category_id","rating" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "season_results_season_user_key" ON "season_results" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_category_number_key" ON "seasons" USING btree ("category_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "set_piece_entries_one_per_brief_key" ON "set_piece_entries" USING btree ("set_piece_id","user_id");--> statement-breakpoint
CREATE INDEX "set_piece_entries_brief_status_idx" ON "set_piece_entries" USING btree ("set_piece_id","status");--> statement-breakpoint
CREATE INDEX "set_piece_entries_user_idx" ON "set_piece_entries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "set_pieces_season_week_key" ON "set_pieces" USING btree ("season_id","week_no");--> statement-breakpoint
CREATE INDEX "set_pieces_status_opens_at_idx" ON "set_pieces" USING btree ("status","opens_at");--> statement-breakpoint
CREATE INDEX "signature_entries_user_idx" ON "signature_entries" USING btree ("user_id","created_at");