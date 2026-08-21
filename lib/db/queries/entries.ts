/**
 * Entry queries. Two lanes, two tables, two sets of functions — on purpose.
 *
 * There is no `listEntries(actor, { lane })` here, and there should not be one. A single
 * function switching on a lane parameter is exactly how set piece state and signature
 * state end up sharing a code path, and from there a rating query is one forgotten
 * argument away from counting freeform work. Core rule 1 is cheaper to keep than to
 * recover.
 */

import { and, desc, eq } from 'drizzle-orm';
import { type Actor, ForbiddenError, requireSelfOrSystem, requireUser } from '../actor';
import { db } from '../client';
import { setPieceEntries, signatureEntries } from '../schema';
import type { EntryStatus, VideoSource } from '../types';
import { hasCompeteUnlock } from './profiles';

export type OwnSetPieceEntry = {
  id: string;
  setPieceId: string;
  status: EntryStatus;
  videoSource: VideoSource;
  muxPlaybackId: string | null;
  fixturePath: string | null;
  durationMs: number | null;
  rejectionReason: string | null;
  createdAt: Date;
};

/* ---------------------------------------------------------------------------------
 * The ranked lane
 * ------------------------------------------------------------------------------- */

/**
 * Submit an entry to a brief.
 *
 * Core rule 4 is enforced here rather than in the UI: an account that has not judged
 * `UNLOCK_THRESHOLD` pairs cannot enter, whatever screen it came from. A hidden button is
 * not a gate.
 */
export async function createSetPieceEntry(
  actor: Actor,
  input: {
    userId: string;
    setPieceId: string;
    seasonId: string;
    categoryId: string;
    videoSource: VideoSource;
    muxAssetId?: string | null;
    muxPlaybackId?: string | null;
    fixturePath?: string | null;
    durationMs?: number | null;
  },
): Promise<{ id: string }> {
  requireSelfOrSystem(actor, input.userId, 'enter a brief as another user');

  const unlocked = await hasCompeteUnlock(actor, input.userId);
  if (!unlocked) {
    throw new ForbiddenError('enter a brief before the compete lane is unlocked');
  }

  const rows = await db
    .insert(setPieceEntries)
    .values({
      userId: input.userId,
      setPieceId: input.setPieceId,
      seasonId: input.seasonId,
      categoryId: input.categoryId,
      videoSource: input.videoSource,
      muxAssetId: input.muxAssetId ?? null,
      muxPlaybackId: input.muxPlaybackId ?? null,
      fixturePath: input.fixturePath ?? null,
      durationMs: input.durationMs ?? null,
    })
    .returning({ id: setPieceEntries.id });

  const row = rows[0];
  if (row === undefined) throw new Error('Failed to create entry');
  return row;
}

/** A competitor's own entries, including ones nobody else may see yet. */
export async function listMySetPieceEntries(actor: Actor): Promise<OwnSetPieceEntry[]> {
  const user = requireUser(actor, 'list your entries');

  return db
    .select({
      id: setPieceEntries.id,
      setPieceId: setPieceEntries.setPieceId,
      status: setPieceEntries.status,
      videoSource: setPieceEntries.videoSource,
      muxPlaybackId: setPieceEntries.muxPlaybackId,
      fixturePath: setPieceEntries.fixturePath,
      durationMs: setPieceEntries.durationMs,
      rejectionReason: setPieceEntries.rejectionReason,
      createdAt: setPieceEntries.createdAt,
    })
    .from(setPieceEntries)
    .where(eq(setPieceEntries.userId, user.id))
    .orderBy(desc(setPieceEntries.createdAt));
}

/**
 * One entry, for its owner (or the system).
 *
 * Ownership is checked against the row AFTER reading it, because the actor cannot be
 * trusted to tell us who owns it. The row is discarded rather than returned if the
 * check fails.
 */
export async function getSetPieceEntryForOwner(
  actor: Actor,
  entryId: string,
): Promise<OwnSetPieceEntry | null> {
  const rows = await db
    .select({
      id: setPieceEntries.id,
      userId: setPieceEntries.userId,
      setPieceId: setPieceEntries.setPieceId,
      status: setPieceEntries.status,
      videoSource: setPieceEntries.videoSource,
      muxPlaybackId: setPieceEntries.muxPlaybackId,
      fixturePath: setPieceEntries.fixturePath,
      durationMs: setPieceEntries.durationMs,
      rejectionReason: setPieceEntries.rejectionReason,
      createdAt: setPieceEntries.createdAt,
    })
    .from(setPieceEntries)
    .where(eq(setPieceEntries.id, entryId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  requireSelfOrSystem(actor, row.userId, 'read another competitor’s entry');

  const { userId: _userId, ...entry } = row;
  return entry;
}

/** Move an entry through its lifecycle. System-only: the eligibility engine owns this. */
export async function setSetPieceEntryStatus(
  actor: Actor,
  input: { entryId: string; status: EntryStatus; rejectionReason?: string | null },
): Promise<void> {
  if (actor.kind !== 'system') {
    throw new ForbiddenError('change entry status — only the eligibility engine may do this');
  }

  await db
    .update(setPieceEntries)
    .set({
      status: input.status,
      rejectionReason: input.rejectionReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(setPieceEntries.id, input.entryId));
}

/* ---------------------------------------------------------------------------------
 * The unranked lane
 * ------------------------------------------------------------------------------- */

/**
 * Post to the signature lane. Note what this does NOT check: there is no unlock gate,
 * because signature work is not competing. And note what it cannot touch: nothing in this
 * function can reach a rating, because `signatureEntries` has no path to one.
 */
export async function createSignatureEntry(
  actor: Actor,
  input: {
    userId: string;
    categoryId: string;
    title: string;
    caption?: string | null;
    videoSource: VideoSource;
    muxAssetId?: string | null;
    muxPlaybackId?: string | null;
    fixturePath?: string | null;
    durationMs?: number | null;
  },
): Promise<{ id: string }> {
  requireSelfOrSystem(actor, input.userId, 'post to the signature lane as another user');

  const rows = await db
    .insert(signatureEntries)
    .values({
      userId: input.userId,
      categoryId: input.categoryId,
      title: input.title,
      caption: input.caption ?? null,
      videoSource: input.videoSource,
      muxAssetId: input.muxAssetId ?? null,
      muxPlaybackId: input.muxPlaybackId ?? null,
      fixturePath: input.fixturePath ?? null,
      durationMs: input.durationMs ?? null,
    })
    .returning({ id: signatureEntries.id });

  const row = rows[0];
  if (row === undefined) throw new Error('Failed to create signature entry');
  return row;
}

/**
 * A competitor's public signature work. Genuinely public — this is the lane that is
 * meant to be browsable — but only entries that passed review, and never the columns
 * that would say why something did not.
 */
export async function listPublicSignatureEntries(
  _actor: Actor,
  userId: string,
): Promise<
  Array<{
    id: string;
    title: string;
    caption: string | null;
    videoSource: VideoSource;
    muxPlaybackId: string | null;
    fixturePath: string | null;
    durationMs: number | null;
    createdAt: Date;
  }>
> {
  return db
    .select({
      id: signatureEntries.id,
      title: signatureEntries.title,
      caption: signatureEntries.caption,
      videoSource: signatureEntries.videoSource,
      muxPlaybackId: signatureEntries.muxPlaybackId,
      fixturePath: signatureEntries.fixturePath,
      durationMs: signatureEntries.durationMs,
      createdAt: signatureEntries.createdAt,
    })
    .from(signatureEntries)
    .where(and(eq(signatureEntries.userId, userId), eq(signatureEntries.status, 'eligible')))
    .orderBy(desc(signatureEntries.createdAt));
}
