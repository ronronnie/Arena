/**
 * Set pieces (briefs), categories and seasons.
 *
 * Nearly everything here is genuinely public: a brief is an advertisement for the drop,
 * and the whole product depends on being able to read one before signing up. The
 * exception is publishing, which is system-only and additionally policed by a database
 * trigger — see `publishSetPiece`.
 */

import { and, asc, eq, lte } from 'drizzle-orm';
import { type Actor, ForbiddenError } from '../actor';
import { db } from '../client';
import { categories, seasons, setPieces } from '../schema';
import type { SeasonStatus, SetPieceStatus } from '../types';

export type PublicSetPiece = {
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
  status: SetPieceStatus;
};

const publicSetPieceColumns = {
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
};

/** Public: the disciplines Arena runs. */
export async function listCategories(
  _actor: Actor,
): Promise<Array<{ id: string; slug: string; name: string; parentId: string | null }>> {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
    })
    .from(categories)
    .orderBy(asc(categories.name));
}

/**
 * The discipline a drop actually hangs off.
 *
 * Onboarding stores the MOST SPECIFIC category a judge picked — "Abhinaya", not
 * "Bharatanatyam" — because that is what decides who they are shown. But seasons and
 * briefs are run per discipline, one level up, so looking up a drop by the stored category
 * finds nothing at all. This resolves a sub-style to its parent and leaves a top-level
 * category alone.
 *
 * Returns the slug as well, because the slug is what `data-category` needs for the accent
 * ramp — and the ramps are keyed by discipline, not by sub-style.
 */
export async function resolveDropCategory(
  _actor: Actor,
  categoryId: string,
): Promise<{ id: string; slug: string } | null> {
  const rows = await db
    .select({ id: categories.id, slug: categories.slug, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  const category = rows[0];
  if (category === undefined) return null;
  if (category.parentId === null) return { id: category.id, slug: category.slug };

  const parents = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, category.parentId))
    .limit(1);

  return parents[0] ?? { id: category.id, slug: category.slug };
}

/** Public: the current season for a category, if one is running. */
export async function getCurrentSeason(
  _actor: Actor,
  categoryId: string,
): Promise<{
  id: string;
  number: number;
  startsAt: Date;
  endsAt: Date;
  status: SeasonStatus;
} | null> {
  const rows = await db
    .select({
      id: seasons.id,
      number: seasons.number,
      startsAt: seasons.startsAt,
      endsAt: seasons.endsAt,
      status: seasons.status,
    })
    .from(seasons)
    .where(and(eq(seasons.categoryId, categoryId), eq(seasons.status, 'open')))
    .orderBy(asc(seasons.number))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Public: briefs that have actually opened.
 *
 * The `opensAt <= now()` filter is not cosmetic. A published-but-not-yet-open brief is
 * embargoed content, and the drop is the ritual the whole product is built around —
 * leaking next week's brief early would spoil it for everyone.
 */
export async function listOpenSetPieces(
  _actor: Actor,
  seasonId: string,
): Promise<PublicSetPiece[]> {
  return db
    .select(publicSetPieceColumns)
    .from(setPieces)
    .where(
      and(
        eq(setPieces.seasonId, seasonId),
        eq(setPieces.status, 'published'),
        lte(setPieces.opensAt, new Date()),
      ),
    )
    .orderBy(asc(setPieces.weekNo));
}

/** Public: one brief, provided it is open. */
export async function getOpenSetPiece(
  _actor: Actor,
  setPieceId: string,
): Promise<PublicSetPiece | null> {
  const rows = await db
    .select(publicSetPieceColumns)
    .from(setPieces)
    .where(
      and(
        eq(setPieces.id, setPieceId),
        eq(setPieces.status, 'published'),
        lte(setPieces.opensAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Publish a brief. System-only.
 *
 * The licensing rule — a brief may not publish unless its track's licence covers the
 * entire drop — is NOT checked here. It is enforced by the trigger
 * `set_pieces_require_valid_license`, so that a publish attempted from a migration, a
 * seed, Drizzle Studio, or a future admin tool hits the same wall as one attempted from
 * this function. Application-code licensing checks protect only the code paths somebody
 * remembered to route through them.
 *
 * The expected failure surfaces as a Postgres exception. That is the intended behaviour:
 * publishing an unlicensed performance is not a validation message, it is a stop.
 */
export async function publishSetPiece(actor: Actor, setPieceId: string): Promise<void> {
  if (actor.kind !== 'system') {
    throw new ForbiddenError('publish a brief — only scheduled drop jobs may do this');
  }

  await db.update(setPieces).set({ status: 'published' }).where(eq(setPieces.id, setPieceId));
}
