import { StackHandler } from '@stackframe/stack';
import { getStackServerApp } from '@/lib/auth/stack';

/**
 * Neon Auth's built-in routes (sign-in, sign-up, password reset, email verification).
 *
 * Prompt 3 replaces the default screens with Arena's audience-first onboarding. Until
 * then these exist so auth is testable end to end.
 */
export const dynamic = 'force-dynamic';

export default function Handler(props: unknown) {
  return <StackHandler fullPage app={getStackServerApp()} routeProps={props} />;
}
