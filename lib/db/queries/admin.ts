/**
 * Admin: authoring briefs and licensing tracks.
 *
 * Every function here goes through `requireAdmin`, which accepts an administrator or the
 * system and refuses an ordinary signed-in user however the request arrived. A hidden nav
 * link is not a permission.
 *
 * The licensing rule is deliberately NOT re-implemented here. `set_pieces_require_valid_license`
 * is a database trigger (ADR 0004), so it holds for this file, for a seed, for Drizzle
 * Studio and for anything written later. What this file adds is the part a trigger cannot
 * do: turning the refusal into a sentence an administrator can act on.
 */

import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { type Actor, ForbiddenError, requireAdmin } from '../actor';
import { db } from '../client';
import { setPieces, tracks } from '../schema';
import type { LicenseType, SetPieceStatus } from '../types';

/* ---------------------------------------------------------------------------------
 * Tracks — the licensed catalogue
 * ------------------------------------------------------------------------------- */

export type TrackSummary = {
  id: string;
  title: string;
  artist: string;
  licensor: string;
  licenseType: LicenseType;
  licenseStartsAt: Date;
  licenseExpiresAt: Date;
  territory: string[];
  contractRef: string | null;
  /** Null once expired. Negative is not possible — see `expiresInDays`. */
  expiresInDays: number;
  /** Lapsing within 30 days, or already lapsed. The reason this screen exists. */
  needsAttention: boolean;
  hasExpired: boolean;
};

/** A licence lapsing inside this window is worth an administrator's attention. */
export const LICENCE_WARNING_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * The whole catalogue, with expiry surfaced.
 *
 * Sorted by expiry rather than by title on purpose: the useful question on this screen is
 * never "where is that track" but "what is about to stop being usable".
 */
export async function listTracks(actor: Actor, now: Date = new Date()): Promise<TrackSummary[]> {
  requireAdmin(actor, 'read the track licence catalogue');

  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      licensor: tracks.licensor,
      licenseType: tracks.licenseType,
      licenseStartsAt: tracks.licenseStartsAt,
      licenseExpiresAt: tracks.licenseExpiresAt,
      territory: tracks.territory,
      contractRef: tracks.contractRef,
    })
    .from(tracks)
    .orderBy(asc(tracks.licenseExpiresAt));

  return rows.map((row) => {
    const msLeft = row.licenseExpiresAt.getTime() - now.getTime();
    const expiresInDays = Math.floor(msLeft / DAY_MS);

    return {
      ...row,
      expiresInDays,
      hasExpired: msLeft <= 0,
      needsAttention: msLeft <= LICENCE_WARNING_DAYS * DAY_MS,
    };
  });
}

/** Tracks whose licence still covers a whole window — the ones a brief may actually use. */
export async function listTracksCovering(
  actor: Actor,
  window: { opensAt: Date; judgingEndsAt: Date },
): Promise<TrackSummary[]> {
  requireAdmin(actor, 'read the track licence catalogue');

  const rows = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(
      and(
        lte(tracks.licenseStartsAt, window.opensAt),
        gte(tracks.licenseExpiresAt, window.judgingEndsAt),
      ),
    );

  const usable = new Set(rows.map((row) => row.id));
  return (await listTracks(actor)).filter((track) => usable.has(track.id));
}

export async function createTrack(
  actor: Actor,
  input: {
    title: string;
    artist: string;
    licensor: string;
    licenseType: LicenseType;
    licenseStartsAt: Date;
    licenseExpiresAt: Date;
    territory: string[];
    usageTerms: string;
    contractRef?: string | null;
    fingerprintRef?: string | null;
  },
): Promise<{ id: string }> {
  requireAdmin(actor, 'license a track');

  const rows = await db
    .insert(tracks)
    .values({
      ...input,
      contractRef: input.contractRef ?? null,
      fingerprintRef: input.fingerprintRef ?? null,
    })
    .returning({ id: tracks.id });

  const row = rows[0];
  if (row === undefined) throw new Error('Failed to license track');
  return row;
}

/* ---------------------------------------------------------------------------------
 * Set pieces
 * ------------------------------------------------------------------------------- */

export type AdminSetPiece = {
  id: string;
  seasonId: string;
  categoryId: string;
  weekNo: number;
  title: string;
  status: SetPieceStatus;
  opensAt: Date;
  submitBy: Date;
  judgingEndsAt: Date;
  trackId: string | null;
  trackTitle: string | null;
  licenseStartsAt: Date | null;
  licenseExpiresAt: Date | null;
  /** Null when it could publish. A sentence when it could not. */
  publishBlockedBecause: string | null;
};

/**
 * Why this brief cannot be published, in words.
 *
 * Computed here purely for the ADMIN UI. The actual refusal is the database trigger; this
 * exists so the screen can say "the licence ends three days before judging does" instead
 * of surfacing a Postgres exception, and so the publish button can be disabled before
 * somebody presses it.
 *
 * If these two ever disagree, the trigger is right.
 */
function publishBlockedReason(row: {
  trackId: string | null;
  trackTitle: string | null;
  licenseStartsAt: Date | null;
  licenseExpiresAt: Date | null;
  opensAt: Date;
  judgingEndsAt: Date;
}): string | null {
  if (row.trackId === null) {
    return 'No track is attached, so there is no licence to check. Attach a licensed track first.';
  }
  if (row.licenseStartsAt === null || row.licenseExpiresAt === null) {
    return 'The attached track has no licence window on record.';
  }
  if (row.licenseStartsAt.getTime() > row.opensAt.getTime()) {
    return `The licence for “${row.trackTitle}” starts after this brief opens. Move the opening date, or license the track earlier.`;
  }
  if (row.licenseExpiresAt.getTime() < row.judgingEndsAt.getTime()) {
    const shortBy = Math.ceil(
      (row.judgingEndsAt.getTime() - row.licenseExpiresAt.getTime()) / DAY_MS,
    );
    return `The licence for “${row.trackTitle}” ends ${shortBy} day${shortBy === 1 ? '' : 's'} before judging does. Entries would still be public after it lapses.`;
  }
  return null;
}

/** Every brief, in every state — the only place drafts are visible. */
export async function listSetPiecesForAdmin(actor: Actor): Promise<AdminSetPiece[]> {
  requireAdmin(actor, 'read unpublished briefs');

  const rows = await db
    .select({
      id: setPieces.id,
      seasonId: setPieces.seasonId,
      categoryId: setPieces.categoryId,
      weekNo: setPieces.weekNo,
      title: setPieces.title,
      status: setPieces.status,
      opensAt: setPieces.opensAt,
      submitBy: setPieces.submitBy,
      judgingEndsAt: setPieces.judgingEndsAt,
      trackId: setPieces.trackId,
      trackTitle: tracks.title,
      licenseStartsAt: tracks.licenseStartsAt,
      licenseExpiresAt: tracks.licenseExpiresAt,
    })
    .from(setPieces)
    .leftJoin(tracks, eq(tracks.id, setPieces.trackId))
    .orderBy(desc(setPieces.opensAt));

  return rows.map((row) => ({ ...row, publishBlockedBecause: publishBlockedReason(row) }));
}

export async function createSetPiece(
  actor: Actor,
  input: {
    seasonId: string;
    categoryId: string;
    weekNo: number;
    title: string;
    briefText: string;
    requirements: Record<string, unknown>;
    trackId: string | null;
    tutorialMuxAssetId?: string | null;
    creatorCredit?: string | null;
    opensAt: Date;
    submitBy: Date;
    judgingEndsAt: Date;
  },
): Promise<{ id: string }> {
  requireAdmin(actor, 'write a brief');

  if (input.submitBy.getTime() <= input.opensAt.getTime()) {
    throw new ForbiddenError('a brief must close after it opens');
  }
  if (input.judgingEndsAt.getTime() <= input.submitBy.getTime()) {
    throw new ForbiddenError('judging must end after entries close');
  }

  const rows = await db
    .insert(setPieces)
    .values({
      ...input,
      tutorialMuxAssetId: input.tutorialMuxAssetId ?? null,
      creatorCredit: input.creatorCredit ?? null,
      // Always a draft. Publishing is a separate, deliberate act with a licence check.
      status: 'draft',
    })
    .returning({ id: setPieces.id });

  const row = rows[0];
  if (row === undefined) throw new Error('Failed to write brief');
  return row;
}

/**
 * Publish a brief, or explain why not.
 *
 * The trigger is what actually refuses. This catches the Postgres exception and re-throws
 * it as the sentence the admin screen shows, because "check_violation" is not something to
 * put in front of a person who is trying to run a drop.
 */
export async function publishSetPieceAsAdmin(actor: Actor, setPieceId: string): Promise<void> {
  requireAdmin(actor, 'publish a brief');

  try {
    await db.update(setPieces).set({ status: 'published' }).where(eq(setPieces.id, setPieceId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/licence covers|no track_id|does not exist/i.test(message)) {
      throw new ForbiddenError(
        'This brief cannot be published: its track licence does not cover the whole drop. Attach a track whose licence runs from before it opens until after judging ends.',
      );
    }
    throw error;
  }
}

/** Take a brief back out of public view. Only before it opens — never mid-drop. */
export async function unpublishSetPiece(
  actor: Actor,
  setPieceId: string,
  now: Date = new Date(),
): Promise<void> {
  requireAdmin(actor, 'unpublish a brief');

  const rows = await db
    .select({ opensAt: setPieces.opensAt, status: setPieces.status })
    .from(setPieces)
    .where(eq(setPieces.id, setPieceId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) throw new ForbiddenError('unpublish a brief that does not exist');

  if (row.opensAt.getTime() <= now.getTime()) {
    /*
     * Withdrawing a brief people have already started performing is not an editorial
     * decision, it is breaking a promise. If a live brief genuinely has to come down —
     * a licence revoked, something unsafe — that is a moderation action with an audit
     * trail, which is Prompt 15.
     */
    throw new ForbiddenError('unpublish a brief that has already opened');
  }

  await db.update(setPieces).set({ status: 'draft' }).where(eq(setPieces.id, setPieceId));
}
