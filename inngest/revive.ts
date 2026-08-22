import type { LifecycleCandidate } from '@/lib/db';

/**
 * Turn a step's result back into real `Date`s.
 *
 * **Anything returned from `step.run()` has been through JSON.** Inngest memoises step
 * results so a retried run can skip work that already succeeded, and memoising means
 * serialising — so a `Date` goes in and an ISO string comes out. TypeScript notices
 * (`JsonifyObject<…>`), which is the only reason this was caught rather than shipped as
 * `dropPhase()` silently comparing a string to a number.
 *
 * The data-access layer keeps returning `Date`s, because that is right for every other
 * caller. The conversion belongs here, at the boundary where the serialisation actually
 * happens.
 */
type Jsonified<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K];
};

export function reviveCandidate(row: Jsonified<LifecycleCandidate>): LifecycleCandidate {
  return {
    ...row,
    opensAt: new Date(row.opensAt),
    submitBy: new Date(row.submitBy),
    judgingEndsAt: new Date(row.judgingEndsAt),
  };
}
