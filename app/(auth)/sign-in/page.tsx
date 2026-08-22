import Link from 'next/link';
import { SectionLabel } from '@/components/ui/card';
import { SignInForm } from './sign-in-form';

/**
 * The way in.
 *
 * The copy is doing deliberate work. It says what the first session actually is — you
 * will be judging — because Core rule 4 means that IS the product for a new user, and a
 * signup screen that implies otherwise sets up a disappointment on the very next screen.
 * Nothing here mentions entering, uploading, or competing.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Only same-origin paths. An open redirect on a sign-in page hands an attacker a
  // credible-looking link that lands somewhere else entirely.
  const destination =
    next !== undefined && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>Arena</SectionLabel>
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
          Start by judging
        </h1>
        <p className="text-text-muted text-balance">
          Everyone here begins as a judge. You will compare two performances of the same task,
          without knowing whose they are, and pick the one you think is better.
        </p>
      </div>

      <SignInForm next={destination} />

      <p className="text-text-subtle text-xs text-balance">
        By continuing you agree to the contest rules. We ask your date of birth on the next screen
        because parts of Arena work differently for under-18s.{' '}
        <Link href="/" className="underline">
          Back to the home page
        </Link>
      </p>
    </main>
  );
}
