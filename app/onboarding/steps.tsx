'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { firstHandleProblemMessage } from '@/lib/domain/handle';
import { MIN_SIGNUP_AGE } from '@/lib/policy/minorPolicy';
import { cn } from '@/lib/ui/cn';
import { submitCategory, submitDateOfBirth, submitIdentity, type StepResult } from './actions';

const field = cn(
  'border-line-strong bg-surface-raised text-text w-full rounded-md border',
  'min-h-[var(--arena-touch-target)] px-3 text-base',
);

function Problem({ children }: { children: React.ReactNode }) {
  if (children === null || children === undefined) return null;
  return (
    <p role="alert" className="text-negative text-sm">
      {children}
    </p>
  );
}

/**
 * Step 1 — date of birth.
 *
 * It is asked FIRST, before anything else, because every later decision depends on the
 * answer: what the profile shows, whether a judge can make contact, what notifications
 * arrive. Asking it after a user has already chosen a handle and picked a discipline
 * would mean building an account and then retrospectively restricting it.
 *
 * The explanation next to the field is not decoration. A fifteen-year-old typing their
 * birthday into a website deserves to be told why it is being asked.
 */
export function DateOfBirthStep() {
  const [state, action, pending] = useActionState<StepResult, FormData>(
    submitDateOfBirth,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="arena-label">Date of birth</span>
        <input type="date" name="dob" required className={field} />
      </label>

      <p className="text-text-muted text-sm leading-normal">
        Arena works differently for under-18s: no location on your profile, and no way for judges to
        contact you. We ask once, and it is not shown to anyone. You need to be at least{' '}
        {MIN_SIGNUP_AGE} to have an account.
      </p>

      <Problem>{state?.problem}</Problem>

      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? 'Checking' : 'Continue'}
      </Button>
    </form>
  );
}

export type CategoryOption = { id: string; name: string; hasSubStyles: boolean };

/**
 * Steps 2 and 3 — discipline, then sub-style.
 *
 * A radio group rather than a select: on a phone, a list you can thumb through beats a
 * native picker, and every option stays visible so the choice is a comparison rather than
 * a memory test.
 */
export function CategoryStep({
  options,
  heading,
  hint,
}: {
  options: CategoryOption[];
  heading: string;
  hint: string;
}) {
  const [state, action, pending] = useActionState<StepResult, FormData>(submitCategory, undefined);
  const [selected, setSelected] = useState<CategoryOption | null>(null);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="categoryId" value={selected?.id ?? ''} />
      <input type="hidden" name="hasSubStyles" value={String(selected?.hasSubStyles ?? false)} />

      <fieldset className="flex flex-col gap-2">
        <legend className="arena-label mb-2">{heading}</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex min-h-[var(--arena-touch-target)] cursor-pointer items-center gap-3 rounded-md border px-4',
              selected?.id === option.id
                ? 'border-accent-base bg-accent-soft text-accent-text font-semibold'
                : 'border-line hover:bg-surface-sunken',
            )}
          >
            <input
              type="radio"
              name="category-choice"
              value={option.id}
              checked={selected?.id === option.id}
              onChange={() => setSelected(option)}
              className="accent-[var(--arena-accent-base)]"
            />
            <span className="text-base">{option.name}</span>
          </label>
        ))}
      </fieldset>

      <p className="text-text-muted text-sm">{hint}</p>

      <Problem>{state?.problem}</Problem>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={pending || selected === null}
      >
        {pending ? 'Saving' : 'Continue'}
      </Button>
    </form>
  );
}

/**
 * Step 4 — handle and display name, and the last screen before judging.
 *
 * The handle is validated as you type using the same module the server uses
 * (`lib/domain/handle.ts`), so the rules cannot disagree between the two. What the client
 * cannot know is whether the handle is already taken — that answer belongs to the unique
 * index, and it arrives as a problem message if someone takes it first.
 */
export function IdentityStep({ suggestedName }: { suggestedName: string }) {
  const [state, action, pending] = useActionState<StepResult, FormData>(submitIdentity, undefined);
  const [handle, setHandle] = useState('');

  const localProblem = handle === '' ? null : firstHandleProblemMessage(handle);

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="arena-label">Display name</span>
        <input
          name="displayName"
          required
          defaultValue={suggestedName}
          autoComplete="nickname"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="arena-label">Handle</span>
        <div className="flex items-center gap-1">
          <span className="text-text-subtle text-lg">@</span>
          <input
            name="handle"
            required
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={field}
          />
        </div>
        <span className="text-text-muted text-sm">
          This appears next to your rating and on your results. Lowercase letters, numbers and
          underscores.
        </span>
      </label>

      <Problem>{localProblem ?? state?.problem}</Problem>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={pending || handle === '' || localProblem !== null}
      >
        {pending ? 'Setting up' : 'Start judging'}
      </Button>
    </form>
  );
}
