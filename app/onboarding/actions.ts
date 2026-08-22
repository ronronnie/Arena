'use server';

import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/session';
import { ForbiddenError, completeOnboarding, setPrimaryCategory, startOnboarding } from '@/lib/db';
import { assessAge, signupRefusalMessage } from '@/lib/policy/minorPolicy';

/**
 * The onboarding steps, as server actions.
 *
 * Every one of these re-validates on the server. The forms validate too, for the person
 * filling them in, but that is a courtesy — the age gate in particular is the single
 * check in this product with an obvious motive to bypass, and a `<form>` is not a
 * security boundary.
 *
 * The actions return `{ problem }` rather than throwing, so the step can render the
 * message next to the field. A `ForbiddenError` from the data-access layer already
 * carries wording meant for a person.
 */
export type StepResult = { problem: string } | undefined;

async function actorOrSignIn() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/sign-in?next=/onboarding');
  return actor;
}

/** Step 1 — date of birth, and the age gate. */
export async function submitDateOfBirth(
  _previous: StepResult,
  formData: FormData,
): Promise<StepResult> {
  const actor = await actorOrSignIn();
  const dob = String(formData.get('dob') ?? '');

  /*
   * Assessed here as well as inside `startOnboarding`. The duplication is intentional:
   * this call produces the message the user reads, and the one in the data-access layer
   * is the rule that holds for every caller, including ones that do not exist yet.
   */
  const { band } = assessAge(dob);
  const refusal = signupRefusalMessage(band);
  if (refusal !== null) return { problem: refusal };

  try {
    await startOnboarding(actor, { userId: actor.id, dob });
  } catch (error) {
    if (error instanceof ForbiddenError) return { problem: error.message };
    throw error;
  }

  redirect('/onboarding?step=category');
}

/** Step 2 and 3 — discipline, then sub-style. Both land here. */
export async function submitCategory(
  _previous: StepResult,
  formData: FormData,
): Promise<StepResult> {
  const actor = await actorOrSignIn();
  const categoryId = String(formData.get('categoryId') ?? '');
  const hasSubStyles = formData.get('hasSubStyles') === 'true';

  if (categoryId === '') return { problem: 'Please choose a category to continue.' };

  await setPrimaryCategory(actor, { userId: actor.id, categoryId });

  // A discipline with no sub-styles skips the step rather than showing an empty list.
  redirect(
    hasSubStyles ? `/onboarding?step=sub-style&parent=${categoryId}` : '/onboarding?step=identity',
  );
}

/** Step 4 — handle and display name, then straight into judging. */
export async function submitIdentity(
  _previous: StepResult,
  formData: FormData,
): Promise<StepResult> {
  const actor = await actorOrSignIn();
  const handle = String(formData.get('handle') ?? '');
  const displayName = String(formData.get('displayName') ?? '');

  try {
    await completeOnboarding(actor, { userId: actor.id, handle, displayName });
  } catch (error) {
    if (error instanceof ForbiddenError) return { problem: error.message };
    // The unique index on `handle` is the real guarantee, so a race lands here.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return { problem: 'Someone just took that handle. Please pick another.' };
    }
    throw error;
  }

  /*
   * Core rule 4, and the most important redirect in the product: a new account goes
   * STRAIGHT to the voting screen. Not to a profile, not to a tour, not to an invitation
   * to enter something. The first meaningful action in Arena is judging.
   */
  redirect('/vote');
}
