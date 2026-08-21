/**
 * TypeScript types for the domain model, inferred from the Drizzle schema.
 *
 * The prompt pack asks for generated types. With Drizzle there is nothing to generate:
 * the schema is TypeScript, so the types are inferred from it and cannot drift out of
 * sync with the tables the way a generated file can. This file exists so that callers
 * have one obvious place to import from.
 *
 * Framework-free and side-effect-free — types only. Importing this does not open a
 * database connection, which is why it is safe to use from the domain layer.
 */

import type * as authSchema from './auth-schema';
import type * as schema from './schema';

/* Row types — what a SELECT gives you. */
export type AuthUser = typeof authSchema.authUsers.$inferSelect;
export type Profile = typeof schema.profiles.$inferSelect;
export type Category = typeof schema.categories.$inferSelect;
export type Season = typeof schema.seasons.$inferSelect;
export type Track = typeof schema.tracks.$inferSelect;
export type SetPiece = typeof schema.setPieces.$inferSelect;
export type SetPieceEntry = typeof schema.setPieceEntries.$inferSelect;
export type SignatureEntry = typeof schema.signatureEntries.$inferSelect;
export type EligibilityCheck = typeof schema.eligibilityChecks.$inferSelect;
export type Comparison = typeof schema.comparisons.$inferSelect;
export type Rating = typeof schema.ratings.$inferSelect;
export type RatingHistoryRow = typeof schema.ratingHistory.$inferSelect;
export type Division = typeof schema.divisions.$inferSelect;
export type DivisionMember = typeof schema.divisionMembers.$inferSelect;
export type JudgeScore = typeof schema.judgeScores.$inferSelect;
export type JudgeCalibration = typeof schema.judgeCalibration.$inferSelect;
export type SeasonResult = typeof schema.seasonResults.$inferSelect;
export type Follow = typeof schema.follows.$inferSelect;
export type Report = typeof schema.reports.$inferSelect;
export type ModerationAction = typeof schema.moderationActions.$inferSelect;
export type Appeal = typeof schema.appeals.$inferSelect;

/* Insert types — what a caller must supply. */
export type NewProfile = typeof schema.profiles.$inferInsert;
export type NewCategory = typeof schema.categories.$inferInsert;
export type NewSeason = typeof schema.seasons.$inferInsert;
export type NewTrack = typeof schema.tracks.$inferInsert;
export type NewSetPiece = typeof schema.setPieces.$inferInsert;
export type NewSetPieceEntry = typeof schema.setPieceEntries.$inferInsert;
export type NewSignatureEntry = typeof schema.signatureEntries.$inferInsert;
export type NewEligibilityCheck = typeof schema.eligibilityChecks.$inferInsert;
export type NewComparison = typeof schema.comparisons.$inferInsert;
export type NewRating = typeof schema.ratings.$inferInsert;
export type NewRatingHistoryRow = typeof schema.ratingHistory.$inferInsert;
export type NewDivision = typeof schema.divisions.$inferInsert;
export type NewDivisionMember = typeof schema.divisionMembers.$inferInsert;
export type NewJudgeScore = typeof schema.judgeScores.$inferInsert;
export type NewSeasonResult = typeof schema.seasonResults.$inferInsert;
export type NewFollow = typeof schema.follows.$inferInsert;
export type NewReport = typeof schema.reports.$inferInsert;
export type NewModerationAction = typeof schema.moderationActions.$inferInsert;
export type NewAppeal = typeof schema.appeals.$inferInsert;

/* Enum unions — narrower and more useful at a call site than `string`. */
export type SeasonStatus = (typeof schema.seasonStatus.enumValues)[number];
export type SetPieceStatus = (typeof schema.setPieceStatus.enumValues)[number];
export type LicenseType = (typeof schema.licenseType.enumValues)[number];
export type EntryStatus = (typeof schema.entryStatus.enumValues)[number];
export type VideoSource = (typeof schema.videoSource.enumValues)[number];
export type EligibilityCheckType = (typeof schema.eligibilityCheckType.enumValues)[number];
export type EligibilityStatus = (typeof schema.eligibilityStatus.enumValues)[number];
export type DivisionTier = (typeof schema.divisionTier.enumValues)[number];
export type SeasonOutcome = (typeof schema.seasonOutcome.enumValues)[number];
export type ReportReason = (typeof schema.reportReason.enumValues)[number];
export type ReportStatus = (typeof schema.reportStatus.enumValues)[number];
export type ModerationActionType = (typeof schema.moderationActionType.enumValues)[number];
export type AppealStatus = (typeof schema.appealStatus.enumValues)[number];

/**
 * An entry as a voter is allowed to see it, before they vote.
 *
 * Core rule 3 is a type here, not a habit. There is no `userId` on this object, no handle,
 * no avatar and no follower count — so a blind-path query physically cannot return one by
 * forgetting a column. The reveal is a separate call against a recorded vote.
 */
export type BlindEntry = {
  id: string;
  setPieceId: string;
  videoSource: VideoSource;
  muxPlaybackId: string | null;
  fixturePath: string | null;
  durationMs: number | null;
};

/** A pair to judge. Same brief, by construction — the database guarantees it. */
export type BlindPair = {
  comparisonId: string;
  setPieceId: string;
  a: BlindEntry;
  b: BlindEntry;
};

/** What the reveal hands back once a vote exists. */
export type RevealedCompetitor = {
  entryId: string;
  userId: string;
  displayName: string;
  handle: string;
  won: boolean;
};
