import { redirect } from 'next/navigation';
import { SectionLabel } from '@/components/ui/card';
import { getActor, getSessionUser } from '@/lib/auth/session';
import { listCategories } from '@/lib/db';
import { CategoryStep, DateOfBirthStep, IdentityStep, type CategoryOption } from './steps';

/**
 * Onboarding. Four steps, in the order the prompt pack fixes them:
 *
 *   date of birth -> category -> sub-style -> handle and display name -> THE VOTING SCREEN
 *
 * Two things are absent on purpose and should stay absent. There is no upload, and there
 * is no way to say "I want to compete". Core rule 4 says competing is unlocked by judging,
 * so offering it here would be offering something the product does not yet allow — and it
 * would tell a new user that judging is the tax they pay to get to the real thing, which
 * is exactly backwards.
 *
 * The step comes from the URL rather than from component state, so a refresh, a back
 * button, or a link resumed the next day all land in the same place.
 */
// Reads the session cookie — never prerenderable. See the note in app/vote/page.tsx.
export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; parent?: string }>;
}) {
  const { step, parent } = await searchParams;
  const user = await getSessionUser();

  // The proxy already redirects a request with no session cookie. This catches the case
  // where the cookie exists but does not verify — expired, or forged.
  if (user === null) redirect('/sign-in?next=/onboarding');
  if (user.onboarding.isComplete) redirect('/vote');

  const actor = await getActor();
  const categories = await listCategories(actor);

  const topLevel: CategoryOption[] = categories
    .filter((category) => category.parentId === null)
    .map((category) => ({
      id: category.id,
      name: category.name,
      hasSubStyles: categories.some((child) => child.parentId === category.id),
    }));

  const subStyles: CategoryOption[] =
    parent === undefined
      ? []
      : categories
          .filter((category) => category.parentId === parent)
          .map((category) => ({ id: category.id, name: category.name, hasSubStyles: false }));

  const current = resolveStep({
    requested: step,
    needsDateOfBirth: user.onboarding.needsDateOfBirth,
    needsCategory: user.onboarding.needsCategory,
    hasSubStyleOptions: subStyles.length > 0,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <header className="flex flex-col gap-2">
        <SectionLabel>Step {current.number} of 4</SectionLabel>
        <h1 className="font-display text-2xl leading-snug font-bold tracking-tight">
          {current.heading}
        </h1>
      </header>

      {current.name === 'dob' && <DateOfBirthStep />}

      {current.name === 'category' && (
        <CategoryStep
          options={topLevel}
          heading="Discipline"
          hint="You can judge anything. This is the one you will see first, and it sets the colours."
        />
      )}

      {current.name === 'sub-style' && (
        <CategoryStep
          options={subStyles}
          heading="Sub-style"
          hint="Competitors are only ever compared within the same style, so this is who you will be shown."
        />
      )}

      {current.name === 'identity' && (
        <IdentityStep suggestedName={user.profile?.displayName ?? ''} />
      )}
    </main>
  );
}

type Step = {
  name: 'dob' | 'category' | 'sub-style' | 'identity';
  number: number;
  heading: string;
};

/**
 * Which step to render.
 *
 * The URL asks, but the profile decides: a user who has not given a date of birth cannot
 * skip to the handle step by editing the query string. The rule is "the earliest step
 * still outstanding, unless the URL asks for one that is already reachable".
 */
function resolveStep(input: {
  requested: string | undefined;
  needsDateOfBirth: boolean;
  needsCategory: boolean;
  hasSubStyleOptions: boolean;
}): Step {
  if (input.needsDateOfBirth) {
    return { name: 'dob', number: 1, heading: 'How old are you?' };
  }

  if (input.requested === 'sub-style' && input.hasSubStyleOptions) {
    return { name: 'sub-style', number: 3, heading: 'Which style?' };
  }

  if (input.requested === 'identity' || !input.needsCategory) {
    if (input.requested === 'category') {
      return { name: 'category', number: 2, heading: 'What do you want to judge?' };
    }
    return { name: 'identity', number: 4, heading: 'What should we call you?' };
  }

  return { name: 'category', number: 2, heading: 'What do you want to judge?' };
}
