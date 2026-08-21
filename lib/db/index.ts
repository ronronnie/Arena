import 'server-only';

/**
 * The data-access layer. The ONLY way into the database from the rest of the app.
 *
 * Nothing outside /lib/db may import ./client — an ESLint rule enforces it. Add query
 * functions under /lib/db/queries and re-export them here. Every one of them takes an
 * `Actor` as its first argument and is responsible for its own authorization.
 *
 * What is NOT exported from here is as deliberate as what is: no Drizzle client, no
 * schema tables, and no query builder. A caller that can reach `db` can write any query
 * it likes, and the whole reason this file exists is that after moving off Supabase there
 * is no second line of defence behind it.
 */

export type { Actor, AnonymousActor, SystemActor, UserActor } from './actor';
export {
  ForbiddenError,
  anonymous,
  isSystem,
  isUser,
  requireSelfOrSystem,
  requireUser,
  system,
} from './actor';

export type {
  BlindEntry,
  BlindPair,
  DivisionTier,
  EligibilityStatus,
  EntryStatus,
  RevealedCompetitor,
  SeasonStatus,
  SetPieceStatus,
  VideoSource,
} from './types';

/* Profiles — Core rules 4 and 7. */
export type { OwnProfile, PublicProfile } from './queries/profiles';
export {
  countComparisonAndMaybeUnlock,
  createProfile,
  getMyProfile,
  getProfile,
  getPublicProfile,
  hasCompeteUnlock,
} from './queries/profiles';

/* Briefs, categories, seasons. */
export type { PublicSetPiece } from './queries/setPieces';
export {
  getCurrentSeason,
  getOpenSetPiece,
  listCategories,
  listOpenSetPieces,
  publishSetPiece,
} from './queries/setPieces';

/* Entries — two lanes, kept apart (Core rule 1). */
export type { OwnSetPieceEntry } from './queries/entries';
export {
  createSetPieceEntry,
  createSignatureEntry,
  getSetPieceEntryForOwner,
  listMySetPieceEntries,
  listPublicSignatureEntries,
  setSetPieceEntryStatus,
} from './queries/entries';

/* Blind pairwise voting — Core rule 3. */
export {
  countMyDecidedComparisons,
  nextBlindPair,
  recordVote,
  revealComparison,
} from './queries/comparisons';

/* Ratings, divisions, leaderboards — Core rules 2 and 5. */
export type { LeaderboardRow } from './queries/ratings';
export {
  getCategoryLeaderboard,
  getDivisionStandings,
  getMyRating,
  listSeasonDivisions,
} from './queries/ratings';

/* The unranked social graph. Never reachable from a rating. */
export {
  follow,
  getFollowerCount,
  isFollowing,
  listMyFollowing,
  unfollow,
} from './queries/follows';
