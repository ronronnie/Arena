/**
 * Drizzle schema — the Arena domain model.
 *
 * Two structural commitments run through this file. They are not conventions to be
 * remembered; they are shapes that make the wrong thing impossible to express.
 *
 * Core rule 1 — two lanes. Set Piece and Signature entries live in SEPARATE TABLES
 * (`setPieceEntries`, `signatureEntries`). The prompt pack models both in one `entries`
 * table with a `lane` enum and a CHECK. We diverged: with one table, a query that forgets
 * `WHERE lane = 'set_piece'` silently feeds freeform work into the rating system, and the
 * only thing standing in the way is a WHERE clause. With two tables, `comparisons` can
 * only reference `setPieceEntries`, so a signature entry reaching the rating system is a
 * foreign-key error rather than a bad afternoon. See ADR 0004.
 *
 * Core rule 3 — blind before, revealed after. `setPieceEntries` carries `userId`, because
 * an entry does belong to someone. What protects the blind vote is that no blind-path
 * query ever reads that column: the `set_piece_entry_blind` VIEW (created in the custom
 * migration, see `drizzle/`) has no `userId` at all. Voting reads the view. Identity is
 * reachable only through `revealComparison`, which requires a recorded vote.
 *
 * Identity itself is never duplicated. `neon_auth.user` belongs to Neon Auth's hosted
 * Better Auth instance; we declare it read-only below and hang the Arena profile off it.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// NOT re-exported. drizzle-kit generates migrations from the tables exported by this
// file, so re-exporting Neon Auth's table here would put `CREATE TABLE "neon_auth"."user"`
// back into the migration. Import it from './auth-schema' directly where you need it.
import { authUsers } from './auth-schema';

/* ------------------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------------------- */

export const seasonStatus = pgEnum('season_status', ['upcoming', 'open', 'judging', 'complete']);

export const setPieceStatus = pgEnum('set_piece_status', [
  'draft',
  'scheduled',
  'published',
  'closed',
  'archived',
]);

export const licenseType = pgEnum('license_type', [
  'direct',
  'library',
  'public_domain',
  'original',
]);

export const entryStatus = pgEnum('entry_status', [
  'uploading',
  'processing',
  'under_review',
  'eligible',
  'rejected',
  'withdrawn',
]);

/**
 * Where an entry's video actually lives. Mux is the real pipeline (Prompt 8); `fixture`
 * is a committed clip under `public/fixtures/`, which is how the voting surface in
 * Prompts 5-7 gets built before uploads exist. Modelled explicitly rather than left to a
 * nullable column, so "which of these two IDs is populated?" is never a guess.
 */
export const videoSource = pgEnum('video_source', ['mux', 'fixture']);

export const eligibilityCheckType = pgEnum('eligibility_check_type', [
  'duration',
  'framing',
  'takes',
  'wardrobe',
  'audio_match',
  'integrity',
  'moderation',
]);

export const eligibilityStatus = pgEnum('eligibility_status', [
  'pending',
  'pass',
  'fail',
  'manual_review',
]);

export const divisionTier = pgEnum('division_tier', ['bronze', 'silver', 'gold', 'elite']);

export const seasonOutcome = pgEnum('season_outcome', ['promoted', 'held', 'relegated']);

export const reportReason = pgEnum('report_reason', [
  'not_the_brief',
  'stolen_work',
  'unsafe',
  'hateful',
  'sexual',
  'underage_concern',
  'vote_manipulation',
  'other',
]);

export const reportStatus = pgEnum('report_status', ['open', 'triaged', 'upheld', 'dismissed']);

export const moderationActionType = pgEnum('moderation_action_type', [
  'none',
  'entry_hidden',
  'entry_rejected',
  'rating_discounted',
  'account_suspended',
  'account_banned',
]);

export const appealStatus = pgEnum('appeal_status', ['open', 'under_review', 'granted', 'denied']);

/* ------------------------------------------------------------------------------------
 * Profiles, categories, seasons
 * ---------------------------------------------------------------------------------- */

/**
 * The Arena profile. Keyed by the Neon Auth user id — one profile per identity, and the
 * identity is not copied.
 *
 * `dob` is stored; `isMinor` is NOT. A stored minor flag goes stale on a birthday, and
 * Core rule 7 is not something to be wrong about for up to a year. Age is derived at read
 * time by `lib/domain/age.ts`, which treats a missing date of birth as a minor.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    handle: text('handle').notNull(),
    /** Null until onboarding collects it (Prompt 3). Null is treated as "minor". */
    dob: date('dob'),
    country: text('country'),
    city: text('city'),
    /** Core rule 4: everyone signs up as a judge. There is no performer option. */
    isJudge: boolean('is_judge').notNull().default(true),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    comparisonsCompleted: integer('comparisons_completed').notNull().default(0),
    /** Null until UNLOCK_THRESHOLD comparisons are judged. The compete-unlock. */
    competeUnlockedAt: timestamp('compete_unlocked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('profiles_handle_key').on(t.handle),
    check('profiles_comparisons_completed_non_negative', sql`${t.comparisonsCompleted} >= 0`),
  ],
);

/** A discipline. Competitors are only ever compared within one. `parentId` gives sub-styles. */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_slug_key').on(t.slug),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: 'categories_parent_id_fk',
    }).onDelete('set null'),
  ],
);

/** A bounded run of drops ending in promotion and relegation. */
export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: seasonStatus('status').notNull().default('upcoming'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('seasons_category_number_key').on(t.categoryId, t.number),
    check('seasons_window_ordered', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/* ------------------------------------------------------------------------------------
 * The set piece system — licensing, briefs
 * ---------------------------------------------------------------------------------- */

/**
 * A licensed piece of music a set piece is performed to.
 *
 * The licence window is the load-bearing part: `set_pieces_require_valid_license`
 * (a trigger, see the custom migration) refuses to let a set piece publish unless its
 * track's window covers the whole drop.
 */
export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    licensor: text('licensor').notNull(),
    licenseType: licenseType('license_type').notNull(),
    licenseStartsAt: timestamp('license_starts_at', { withTimezone: true }).notNull(),
    licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }).notNull(),
    /** ISO 3166-1 alpha-2 codes, or `['WORLD']`. */
    territory: text('territory').array().notNull(),
    usageTerms: text('usage_terms').notNull(),
    fingerprintRef: text('fingerprint_ref'),
    contractRef: text('contract_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tracks_license_window_ordered', sql`${t.licenseExpiresAt} > ${t.licenseStartsAt}`),
    check('tracks_territory_not_empty', sql`array_length(${t.territory}, 1) >= 1`),
  ],
);

/** The brief: an identical weekly task every competitor in a category performs. */
export const setPieces = pgTable(
  'set_pieces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    weekNo: integer('week_no').notNull(),
    title: text('title').notNull(),
    briefText: text('brief_text').notNull(),
    /** `{ durationS, framing, takes, wardrobe, ... }` — read by the eligibility engine. */
    requirements: jsonb('requirements').notNull().default({}),
    tutorialMuxAssetId: text('tutorial_mux_asset_id'),
    trackId: uuid('track_id').references(() => tracks.id, { onDelete: 'restrict' }),
    creatorCredit: text('creator_credit'),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    submitBy: timestamp('submit_by', { withTimezone: true }).notNull(),
    judgingEndsAt: timestamp('judging_ends_at', { withTimezone: true }).notNull(),
    status: setPieceStatus('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('set_pieces_season_week_key').on(t.seasonId, t.weekNo),
    index('set_pieces_status_opens_at_idx').on(t.status, t.opensAt),
    check('set_pieces_window_ordered', sql`${t.submitBy} > ${t.opensAt}`),
    check('set_pieces_judging_after_submit', sql`${t.judgingEndsAt} > ${t.submitBy}`),
  ],
);

/* ------------------------------------------------------------------------------------
 * Entries — two lanes, two tables (Core rule 1)
 * ---------------------------------------------------------------------------------- */

/**
 * THE RANKED LANE. One competitor's performance of one brief. The only thing that can
 * feed a rating.
 *
 * The composite unique on `(id, setPieceId)` looks redundant next to the primary key —
 * it is not. It is the target of the composite foreign keys on `comparisons`, which is
 * what makes "both entries in a comparison are on the same brief" a declarative database
 * constraint rather than a trigger or a hopeful WHERE clause.
 */
export const setPieceEntries = pgTable(
  'set_piece_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    setPieceId: uuid('set_piece_id')
      .notNull()
      .references(() => setPieces.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    videoSource: videoSource('video_source').notNull(),
    muxAssetId: text('mux_asset_id'),
    muxPlaybackId: text('mux_playback_id'),
    fixturePath: text('fixture_path'),
    durationMs: integer('duration_ms'),
    status: entryStatus('status').notNull().default('uploading'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('set_piece_entries_one_per_brief_key').on(t.setPieceId, t.userId),
    // A UNIQUE CONSTRAINT, not a unique index. Postgres will only let a composite foreign
    // key point at a real constraint, and drizzle-kit emits constraints inside CREATE
    // TABLE but indexes afterwards — as an index this is created too late for the
    // comparisons foreign keys below to reference it.
    unique('set_piece_entries_id_set_piece_key').on(t.id, t.setPieceId),
    index('set_piece_entries_brief_status_idx').on(t.setPieceId, t.status),
    index('set_piece_entries_user_idx').on(t.userId),
    check(
      'set_piece_entries_video_source_consistent',
      sql`(${t.videoSource} = 'mux' AND ${t.fixturePath} IS NULL)
          OR (${t.videoSource} = 'fixture' AND ${t.fixturePath} IS NOT NULL
              AND ${t.muxAssetId} IS NULL AND ${t.muxPlaybackId} IS NULL)`,
    ),
    check(
      'set_piece_entries_rejection_reason_present',
      sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`,
    ),
  ],
);

/**
 * THE UNRANKED LANE. Freeform work. Affects following only.
 *
 * Note what is absent: no `seasonId`, no division, no route to `comparisons`, and nothing
 * that any rating query could join to. That absence IS Core rule 1. Do not add a rating
 * column here, and do not merge this table with `setPieceEntries` — see ADR 0004.
 */
export const signatureEntries = pgTable(
  'signature_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    caption: text('caption'),
    videoSource: videoSource('video_source').notNull(),
    muxAssetId: text('mux_asset_id'),
    muxPlaybackId: text('mux_playback_id'),
    fixturePath: text('fixture_path'),
    durationMs: integer('duration_ms'),
    status: entryStatus('status').notNull().default('uploading'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('signature_entries_user_idx').on(t.userId, t.createdAt),
    check(
      'signature_entries_video_source_consistent',
      sql`(${t.videoSource} = 'mux' AND ${t.fixturePath} IS NULL)
          OR (${t.videoSource} = 'fixture' AND ${t.fixturePath} IS NOT NULL
              AND ${t.muxAssetId} IS NULL AND ${t.muxPlaybackId} IS NULL)`,
    ),
  ],
);

/**
 * CORE RULE 3, AS A DATABASE OBJECT.
 *
 * The blind voting surface reads from here, never from `setPieceEntries`. This view has
 * no `user_id` column — not hidden, not filtered, absent — so a blind query cannot leak a
 * competitor's identity by selecting one column too many. It also contains only entries
 * with `status = 'eligible'`, so an entry still processing or already rejected cannot be
 * put in front of a voter.
 *
 * Created by the custom migration (`.existing()` tells drizzle-kit not to manage it).
 */
export const setPieceEntryBlind = pgView('set_piece_entry_blind', {
  id: uuid('id').notNull(),
  setPieceId: uuid('set_piece_id').notNull(),
  videoSource: videoSource('video_source').notNull(),
  muxPlaybackId: text('mux_playback_id'),
  fixturePath: text('fixture_path'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}).existing();

/** One automated or manual check against a brief's requirements. Ranked lane only. */
export const eligibilityChecks = pgTable(
  'eligibility_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => setPieceEntries.id, { onDelete: 'cascade' }),
    checkType: eligibilityCheckType('check_type').notNull(),
    status: eligibilityStatus('status').notNull().default('pending'),
    score: doublePrecision('score'),
    detail: jsonb('detail').notNull().default({}),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('eligibility_checks_entry_idx').on(t.entryId),
    uniqueIndex('eligibility_checks_entry_type_key').on(t.entryId, t.checkType),
  ],
);

/* ------------------------------------------------------------------------------------
 * Comparisons — the atomic unit of the rating system
 * ---------------------------------------------------------------------------------- */

/**
 * One judge's blind head-to-head choice between two entries on the same brief.
 *
 * Four things are enforced by the database rather than by care:
 *   1. Both entries are on this comparison's brief — the composite foreign keys below.
 *   2. The two entries are different — CHECK.
 *   3. The winner, if set, is one of the two — CHECK.
 *   4. A voter is never shown their own entry — trigger `comparisons_no_self_vote`
 *      (in the custom migration; it needs a lookup, so it cannot be a CHECK).
 *
 * `decidedAt` is the reveal gate. Identity is readable only once it is set (Core rule 3).
 */
export const comparisons = pgTable(
  'comparisons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    setPieceId: uuid('set_piece_id')
      .notNull()
      .references(() => setPieces.id, { onDelete: 'cascade' }),
    voterId: uuid('voter_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    entryA: uuid('entry_a').notNull(),
    entryB: uuid('entry_b').notNull(),
    winnerEntryId: uuid('winner_entry_id'),
    shownAt: timestamp('shown_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Judge calibration weight applied at decision time. */
    voterWeight: doublePrecision('voter_weight').notNull().default(1),
    /** Vote integrity (Prompt 14) can discount a vote without deleting the evidence. */
    isCounted: boolean('is_counted').notNull().default(true),
    discountReason: text('discount_reason'),
  },
  (t) => [
    // Both entries must belong to THIS comparison's set piece. Declarative, not a trigger.
    foreignKey({
      columns: [t.entryA, t.setPieceId],
      foreignColumns: [setPieceEntries.id, setPieceEntries.setPieceId],
      name: 'comparisons_entry_a_same_set_piece_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.entryB, t.setPieceId],
      foreignColumns: [setPieceEntries.id, setPieceEntries.setPieceId],
      name: 'comparisons_entry_b_same_set_piece_fk',
    }).onDelete('cascade'),
    index('comparisons_voter_idx').on(t.voterId, t.decidedAt),
    index('comparisons_set_piece_idx').on(t.setPieceId, t.decidedAt),
    index('comparisons_entry_a_idx').on(t.entryA),
    index('comparisons_entry_b_idx').on(t.entryB),
    check('comparisons_distinct_entries', sql`${t.entryA} <> ${t.entryB}`),
    check(
      'comparisons_winner_is_a_contender',
      sql`${t.winnerEntryId} IS NULL
          OR ${t.winnerEntryId} = ${t.entryA}
          OR ${t.winnerEntryId} = ${t.entryB}`,
    ),
    check(
      'comparisons_decided_has_winner',
      sql`(${t.decidedAt} IS NULL AND ${t.winnerEntryId} IS NULL)
          OR (${t.decidedAt} IS NOT NULL AND ${t.winnerEntryId} IS NOT NULL)`,
    ),
    check(
      'comparisons_discount_reason_present',
      sql`${t.isCounted} OR ${t.discountReason} IS NOT NULL`,
    ),
  ],
);

/* ------------------------------------------------------------------------------------
 * Rating, divisions, seasons results
 * ---------------------------------------------------------------------------------- */

/** A competitor's current Glicko-2 estimate in one category. Set piece lane only. */
export const ratings = pgTable(
  'ratings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    rating: doublePrecision('rating').notNull().default(1500),
    ratingDeviation: doublePrecision('rating_deviation').notNull().default(350),
    volatility: doublePrecision('volatility').notNull().default(0.06),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.categoryId] }),
    // Leaderboard hot path.
    index('ratings_category_rating_idx').on(t.categoryId, t.rating.desc()),
  ],
);

/** Append-only. One row per competitor per rating period. Never updated, never deleted. */
export const ratingHistory = pgTable(
  'rating_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id').references(() => seasons.id, { onDelete: 'set null' }),
    setPieceId: uuid('set_piece_id').references(() => setPieces.id, { onDelete: 'set null' }),
    rating: doublePrecision('rating').notNull(),
    ratingDeviation: doublePrecision('rating_deviation').notNull(),
    volatility: doublePrecision('volatility').notNull(),
    comparisonsInPeriod: integer('comparisons_in_period').notNull().default(0),
    periodStartedAt: timestamp('period_started_at', { withTimezone: true }).notNull(),
    periodEndedAt: timestamp('period_ended_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rating_history_user_category_idx').on(t.userId, t.categoryId, t.periodEndedAt),
    // Leaderboard by season: (season, category, rating desc).
    index('rating_history_season_leaderboard_idx').on(t.seasonId, t.categoryId, t.rating.desc()),
  ],
);

/** ~DIVISION_SIZE similarly rated competitors. Core rule 5: where you actually compete. */
export const divisions = pgTable(
  'divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    tier: divisionTier('tier').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('divisions_season_tier_name_key').on(t.seasonId, t.tier, t.name)],
);

export const divisionMembers = pgTable(
  'division_members',
  {
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    points: integer('points').notNull().default(0),
    position: integer('position'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.divisionId, t.userId] }),
    index('division_members_standings_idx').on(t.divisionId, t.points.desc()),
  ],
);

/** The weighted expert panel's score for one entry. Ranked lane only. */
export const judgeScores = pgTable(
  'judge_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => setPieceEntries.id, { onDelete: 'cascade' }),
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    criteria: jsonb('criteria').notNull().default({}),
    score: doublePrecision('score').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('judge_scores_entry_judge_key').on(t.entryId, t.judgeId)],
);

/** How closely a judge tracks consensus. Weights their vote. */
export const judgeCalibration = pgTable(
  'judge_calibration',
  {
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    agreementRate: doublePrecision('agreement_rate').notNull().default(0),
    weight: doublePrecision('weight').notNull().default(1),
    sampleSize: integer('sample_size').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.judgeId, t.categoryId] })],
);

export const seasonResults = pgTable(
  'season_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    finalRating: doublePrecision('final_rating').notNull(),
    finalPosition: integer('final_position'),
    outcome: seasonOutcome('outcome').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('season_results_season_user_key').on(t.seasonId, t.userId)],
);

/* ------------------------------------------------------------------------------------
 * The unranked social graph
 * ---------------------------------------------------------------------------------- */

/**
 * Following. Core rule 1 and Core rule 2: this table must never be read by anything that
 * computes a rating. It has no category, no season and no weight for exactly that reason
 * — there is nothing here for a rating query to want.
 */
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index('follows_followee_idx').on(t.followeeId),
    check('follows_no_self_follow', sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

/* ------------------------------------------------------------------------------------
 * Moderation. Core rule 7 — users may be minors.
 * ---------------------------------------------------------------------------------- */

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => profiles.userId, { onDelete: 'set null' }),
    setPieceEntryId: uuid('set_piece_entry_id').references(() => setPieceEntries.id, {
      onDelete: 'cascade',
    }),
    signatureEntryId: uuid('signature_entry_id').references(() => signatureEntries.id, {
      onDelete: 'cascade',
    }),
    reportedUserId: uuid('reported_user_id').references(() => profiles.userId, {
      onDelete: 'cascade',
    }),
    reason: reportReason('reason').notNull(),
    detail: text('detail'),
    status: reportStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    // Exactly one subject. A report about nothing, or about three things, is a bug.
    check(
      'reports_exactly_one_subject',
      sql`(CASE WHEN ${t.setPieceEntryId} IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN ${t.signatureEntryId} IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN ${t.reportedUserId} IS NULL THEN 0 ELSE 1 END) = 1`,
    ),
  ],
);

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
    /** The moderator. Null when the system acted on its own. */
    moderatorId: uuid('moderator_id').references(() => profiles.userId, { onDelete: 'set null' }),
    /** Why a `system()` actor acted. Required when there is no moderator. */
    systemReason: text('system_reason'),
    actionType: moderationActionType('action_type').notNull(),
    targetUserId: uuid('target_user_id').references(() => profiles.userId, {
      onDelete: 'cascade',
    }),
    targetSetPieceEntryId: uuid('target_set_piece_entry_id').references(() => setPieceEntries.id, {
      onDelete: 'cascade',
    }),
    targetSignatureEntryId: uuid('target_signature_entry_id').references(
      () => signatureEntries.id,
      { onDelete: 'cascade' },
    ),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('moderation_actions_target_user_idx').on(t.targetUserId, t.createdAt),
    // Every action is attributable: a human moderator, or a stated system reason.
    check(
      'moderation_actions_attributable',
      sql`${t.moderatorId} IS NOT NULL OR ${t.systemReason} IS NOT NULL`,
    ),
  ],
);

export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moderationActionId: uuid('moderation_action_id')
      .notNull()
      .references(() => moderationActions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    statement: text('statement').notNull(),
    status: appealStatus('status').notNull().default('open'),
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('appeals_status_idx').on(t.status, t.createdAt)],
);
