ALTER TABLE "comparisons" DROP CONSTRAINT "comparisons_decided_has_winner";--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "decision_ms" integer;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "both_watched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_decision_shape" CHECK (("comparisons"."decided_at" IS NULL AND "comparisons"."winner_entry_id" IS NULL AND "comparisons"."skipped" = false)
          OR ("comparisons"."decided_at" IS NOT NULL AND "comparisons"."skipped" = true AND "comparisons"."winner_entry_id" IS NULL)
          OR ("comparisons"."decided_at" IS NOT NULL AND "comparisons"."skipped" = false AND "comparisons"."winner_entry_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_skip_is_not_counted" CHECK (NOT "comparisons"."skipped" OR NOT "comparisons"."is_counted");--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_decision_ms_sane" CHECK ("comparisons"."decision_ms" IS NULL OR "comparisons"."decision_ms" >= 0);