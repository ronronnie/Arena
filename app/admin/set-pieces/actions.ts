'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/session';
import { ForbiddenError, publishSetPieceAsAdmin, unpublishSetPiece } from '@/lib/db';

/**
 * Publishing, from the admin screen.
 *
 * The licence check is not here. It is a database trigger (ADR 0004), so it holds for a
 * seed, for Drizzle Studio, and for anything written later — this action just turns the
 * refusal into a sentence.
 */
export type AdminActionResult = { problem: string } | { done: string } | undefined;

export async function publishBrief(
  _previous: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const actor = await getActor();
  const setPieceId = String(formData.get('setPieceId') ?? '');

  try {
    await publishSetPieceAsAdmin(actor, setPieceId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { problem: error.message };
    throw error;
  }

  revalidatePath('/admin/set-pieces');
  return { done: 'Published.' };
}

export async function unpublishBrief(
  _previous: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const actor = await getActor();
  const setPieceId = String(formData.get('setPieceId') ?? '');

  try {
    await unpublishSetPiece(actor, setPieceId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { problem: error.message };
    throw error;
  }

  revalidatePath('/admin/set-pieces');
  return { done: 'Taken back to draft.' };
}
