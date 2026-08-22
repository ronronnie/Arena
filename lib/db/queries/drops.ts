/**
 * The drop — the weekly ritual, read from the database.
 *
 * Everything here derives its phase from `lib/domain/dropLifecycle.ts` rather than from
 * `set_pieces.status`, so a scheduled job that fails to run cannot make a screen lie about
 * whether entries are open. The status column records what an admin or a job decided; the
 * clock decides what a user is told.
 *
 * The entry COUNT is public and the entries themselves are not. "Forty-one people have
 * entered" is the social proof that makes a drop feel alive; who they are is Core rule 3's
 * business and stays behind the blind view until a vote is recorded.
 */

import { and, asc, count, desc, eq, lte, ne } from 'drizzle-orm';
import {
  dropPhase,
  formatRemaining,
  isUrgent,
  presentPhase,
  windowProgress,
  type DropPhase,
} from '@/lib/domain/dropLifecycle';
import { type Actor, ForbiddenError } from '../actor';
import { db } from '../client';
import { categories, seasons, setPieceEntries, setPieces, tracks } from '../schema';

export type DropRequirements = {
  durationS?: number;
  framing?: string;
  takes?: number;
  wardrobe?: string;
  [key: string]: unknown;
};

export type Drop = {
  id: string;
  seasonId: string;
  categoryId: string;
  weekNo: number;
  title: string;
  briefText: string;
  requirements: DropRequirements;
  tutorialMuxAssetId: string | null;
  creatorCredit: string | null;
  opensAt: Date;
  submitBy: Date;
  judgingEndsAt: Date;

  /** Derived from the clock, never stored. */
  phase: DropPhase;
  phaseLabel: string;
  phaseDescription: string;
  /** Countdown for the current phase, already worded. Null once there is nothing to wait for. */
  deadline: Date | null;
  deadlineLabel: string | null;
  remainingLabel: string | null;
  urgent: boolean;
  progress: number;

  /** How many eligible entries so far. Public. */
  entryCount: number;

  /** The licensed track, for the credit line. */
  track: { title: string; artist: string; licensor: string } | null;
};

const dropColumns = {
  id: setPieces.id,
  seasonId: setPieces.seasonId,
  categoryId: setPieces.categoryId,
  weekNo: setPieces.weekNo,
  title: setPieces.title,
  briefText: setPieces.briefText,
  requirements: setPieces.requirements,
  tutorialMuxAssetId: setPieces.tutorialMuxAssetId,
  creatorCredit: setPieces.creatorCredit,
  opensAt: setPieces.opensAt,
  submitBy: setPieces.submitBy,
  judgingEndsAt: setPieces.judgingEndsAt,
  status: setPieces.status,
  trackTitle: tracks.title,
  trackArtist: tracks.artist,
  trackLicensor: tracks.licensor,
};

/**
 * Exactly what the select above returns.
 *
 * Written out rather than inferred from `dropColumns`: Drizzle's column type carries the
 * data type but not its nullability, so an inferred version quietly promised that
 * `tutorialMuxAssetId` was always a string.
 */
type DropRow = {
  id: string;
  seasonId: string;
  categoryId: string;
  weekNo: number;
  title: string;
  briefText: string;
  requirements: unknown;
  tutorialMuxAssetId: string | null;
  creatorCredit: string | null;
  opensAt: Date;
  submitBy: Date;
  judgingEndsAt: Date;
  status: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived';
  trackTitle: string | null;
  trackArtist: string | null;
  trackLicensor: string | null;
};

/** Assembles the derived half. One place, so every surface agrees about the phase. */
function toDrop(row: DropRow, entryCount: number, now: Date): Drop {
  const lifecycle = {
    status: row.status,
    opensAt: row.opensAt,
    submitBy: row.submitBy,
    judgingEndsAt: row.judgingEndsAt,
  };

  const presentation = presentPhase(lifecycle, now);
  const remainingMs =
    presentation.deadline === null ? null : presentation.deadline.getTime() - now.getTime();

  return {
    id: row.id,
    seasonId: row.seasonId,
    categoryId: row.categoryId,
    weekNo: row.weekNo,
    title: row.title,
    briefText: row.briefText,
    requirements: (row.requirements ?? {}) as DropRequirements,
    tutorialMuxAssetId: row.tutorialMuxAssetId,
    creatorCredit: row.creatorCredit,
    opensAt: row.opensAt,
    submitBy: row.submitBy,
    judgingEndsAt: row.judgingEndsAt,

    phase: dropPhase(lifecycle, now),
    phaseLabel: presentation.label,
    phaseDescription: presentation.description,
    deadline: presentation.deadline,
    deadlineLabel: presentation.deadlineLabel,
    remainingLabel: remainingMs === null ? null : formatRemaining(remainingMs),
    urgent: remainingMs !== null && isUrgent(remainingMs),
    progress: windowProgress(lifecycle, now),

    entryCount,
    track:
      row.trackTitle === null
        ? null
        : {
            title: row.trackTitle,
            artist: row.trackArtist ?? '',
            licensor: row.trackLicensor ?? '',
          },
  };
}

/** Eligible entries only — the count a user sees is the count that will be judged. */
async function countEntries(setPieceId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(setPieceEntries)
    .where(and(eq(setPieceEntries.setPieceId, setPieceId), eq(setPieceEntries.status, 'eligible')));

  return rows[0]?.value ?? 0;
}

/**
 * The current drop for a category.
 *
 * "Current" means the most recent brief that has opened — not the newest row. A brief
 * published for next week is real and announced, but showing it as the current drop would
 * spoil the one people are still working on.
 *
 * Public: a brief is an advertisement for the drop, and the whole audience-first funnel
 * depends on being able to read one signed out.
 */
export async function getCurrentDrop(
  _actor: Actor,
  categoryId: string,
  now: Date = new Date(),
): Promise<Drop | null> {
  const rows = await db
    .select(dropColumns)
    .from(setPieces)
    .leftJoin(tracks, eq(tracks.id, setPieces.trackId))
    .where(
      and(
        eq(setPieces.categoryId, categoryId),
        ne(setPieces.status, 'draft'),
        ne(setPieces.status, 'scheduled'),
        lte(setPieces.opensAt, now),
      ),
    )
    .orderBy(desc(setPieces.opensAt))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  return toDrop(row, await countEntries(row.id), now);
}

/**
 * The next brief, if one is announced.
 *
 * Published but not yet open. Rendered as "opens soon" — the brief TEXT is deliberately
 * not returned here, only that something is coming, because the tension of not knowing is
 * part of the ritual.
 */
export async function getUpcomingDrop(
  _actor: Actor,
  categoryId: string,
  now: Date = new Date(),
): Promise<{ weekNo: number; opensAt: Date; remainingLabel: string } | null> {
  const rows = await db
    .select({
      weekNo: setPieces.weekNo,
      opensAt: setPieces.opensAt,
    })
    .from(setPieces)
    .where(and(eq(setPieces.categoryId, categoryId), eq(setPieces.status, 'published')))
    .orderBy(asc(setPieces.opensAt));

  const next = rows.find((row) => row.opensAt.getTime() > now.getTime());
  if (next === undefined) return null;

  return {
    weekNo: next.weekNo,
    opensAt: next.opensAt,
    remainingLabel: formatRemaining(next.opensAt.getTime() - now.getTime()),
  };
}

/** The archive: briefs whose judging has finished. Public. */
export async function listPastDrops(
  _actor: Actor,
  categoryId: string,
  now: Date = new Date(),
): Promise<Drop[]> {
  const rows = await db
    .select(dropColumns)
    .from(setPieces)
    .leftJoin(tracks, eq(tracks.id, setPieces.trackId))
    .where(
      and(
        eq(setPieces.categoryId, categoryId),
        ne(setPieces.status, 'draft'),
        ne(setPieces.status, 'scheduled'),
        lte(setPieces.judgingEndsAt, now),
      ),
    )
    .orderBy(desc(setPieces.weekNo));

  const drops: Drop[] = [];
  for (const row of rows) {
    drops.push(toDrop(row, await countEntries(row.id), now));
  }
  return drops;
}

/** One brief by id, provided it is visible. Public. */
export async function getDrop(
  _actor: Actor,
  setPieceId: string,
  now: Date = new Date(),
): Promise<Drop | null> {
  const rows = await db
    .select(dropColumns)
    .from(setPieces)
    .leftJoin(tracks, eq(tracks.id, setPieces.trackId))
    .where(
      and(
        eq(setPieces.id, setPieceId),
        ne(setPieces.status, 'draft'),
        ne(setPieces.status, 'scheduled'),
        lte(setPieces.opensAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  return toDrop(row, await countEntries(row.id), now);
}

/**
 * Every category currently running a season, for the scheduled drop-guard.
 *
 * System-facing but harmless to expose: it is a list of disciplines, which is public
 * anyway.
 */
export async function listActiveCategories(
  _actor: Actor,
): Promise<Array<{ categoryId: string; categoryName: string; seasonId: string }>> {
  return db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      seasonId: seasons.id,
    })
    .from(seasons)
    .innerJoin(categories, eq(categories.id, seasons.categoryId))
    .where(eq(seasons.status, 'open'));
}

/* ---------------------------------------------------------------------------------
 * For the scheduled lifecycle functions
 * ------------------------------------------------------------------------------- */

export type LifecycleCandidate = {
  id: string;
  categoryId: string;
  categoryName: string;
  weekNo: number;
  status: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived';
  opensAt: Date;
  submitBy: Date;
  judgingEndsAt: Date;
};

/**
 * Every brief a scheduled job might need to act on.
 *
 * System-only. Drafts are included because the guard needs to know a brief exists at all,
 * even unpublished — "there is a draft for next week" and "there is nothing" are very
 * different things to wake somebody up about.
 */
export async function listLifecycleCandidates(actor: Actor): Promise<LifecycleCandidate[]> {
  if (actor.kind !== 'system') {
    throw new ForbiddenError('read the lifecycle queue — scheduled jobs only');
  }

  return db
    .select({
      id: setPieces.id,
      categoryId: setPieces.categoryId,
      categoryName: categories.name,
      weekNo: setPieces.weekNo,
      status: setPieces.status,
      opensAt: setPieces.opensAt,
      submitBy: setPieces.submitBy,
      judgingEndsAt: setPieces.judgingEndsAt,
    })
    .from(setPieces)
    .innerJoin(categories, eq(categories.id, setPieces.categoryId))
    .orderBy(asc(setPieces.opensAt));
}

/**
 * Apply one lifecycle transition. System-only.
 *
 * Guarded on the CURRENT status as well as the id, so a retry that arrives after the
 * first attempt succeeded changes nothing. Drops are the product's heartbeat and these
 * jobs must be safe to run twice.
 */
export async function advanceSetPieceStatus(
  actor: Actor,
  input: {
    setPieceId: string;
    from: LifecycleCandidate['status'];
    to: LifecycleCandidate['status'];
  },
): Promise<boolean> {
  if (actor.kind !== 'system') {
    throw new ForbiddenError('move a brief through its lifecycle — scheduled jobs only');
  }

  const updated = await db
    .update(setPieces)
    .set({ status: input.to })
    .where(and(eq(setPieces.id, input.setPieceId), eq(setPieces.status, input.from)))
    .returning({ id: setPieces.id });

  return updated.length > 0;
}

/** Eligible entry count, for the event payload. System-only. */
export async function countEligibleEntries(actor: Actor, setPieceId: string): Promise<number> {
  if (actor.kind !== 'system') {
    throw new ForbiddenError('count entries for a brief — scheduled jobs only');
  }
  return countEntries(setPieceId);
}

export type { DropRow };
