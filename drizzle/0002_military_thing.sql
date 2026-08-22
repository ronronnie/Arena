ALTER TABLE "profiles" ADD COLUMN "primary_category_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_primary_category_id_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;