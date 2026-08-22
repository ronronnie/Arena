/**
 * Authorization tests for the data-access layer.
 *
 * CLAUDE.md: "Every query touching personal data needs a test proving the WRONG actor
 * gets a ForbiddenError. Test the authorization, not just the result."
 *
 * These tests go one step further than that. The Drizzle client is replaced with a stub
 * whose every method throws, so each test asserts two things at once:
 *
 *   1. the wrong actor is refused, and
 *   2. the refusal happened BEFORE the database was touched.
 *
 * The second point is the one that actually matters. A query that runs, fetches a minor's
 * city, and then decides not to return it has already lost — it has put the row on the
 * wire, into a log, and into a query plan. `touchedDatabase` failing a test is the signal
 * that an authorization check has drifted below the query it was meant to guard.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let touchedDatabase = false;

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db/client', () => {
  const explode = (): never => {
    touchedDatabase = true;
    throw new Error('The database was queried before authorization ran.');
  };

  return {
    db: new Proxy({}, { get: explode }),
    schema: {},
  };
});

import { ForbiddenError, anonymous, system, type UserActor } from '@/lib/db/actor';
import {
  countMyDecidedComparisons,
  nextBlindPair,
  recordVote,
  revealComparison,
} from '@/lib/db/queries/comparisons';
import {
  createSignatureEntry,
  listMySetPieceEntries,
  setSetPieceEntryStatus,
} from '@/lib/db/queries/entries';
import { follow, isFollowing, listMyFollowing } from '@/lib/db/queries/follows';
import {
  completeOnboarding,
  getMyProfile,
  getOnboardingState,
  getProfile,
  isHandleAvailable,
  setPhoneVerified,
  setPrimaryCategory,
  startOnboarding,
} from '@/lib/db/queries/profiles';
import { getMyRating } from '@/lib/db/queries/ratings';
import { publishSetPiece } from '@/lib/db/queries/setPieces';

const alice: UserActor = {
  kind: 'user',
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  isMinor: false,
};
const bob: UserActor = { kind: 'user', id: 'bbbbbbbb-0000-0000-0000-000000000002', isMinor: true };

beforeEach(() => {
  touchedDatabase = false;
});

/** Every refusal must satisfy both halves of the contract. */
async function expectRefusal(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toBeInstanceOf(ForbiddenError);
  expect(touchedDatabase, 'authorization must run before the query').toBe(false);
}

describe('profiles — personal data (Core rule 7)', () => {
  it('refuses one user reading another user’s profile', async () => {
    await expectRefusal(() => getProfile(alice, bob.id));
  });

  it('refuses an anonymous visitor reading any profile', async () => {
    await expectRefusal(() => getProfile(anonymous(), bob.id));
  });

  it('refuses an anonymous visitor asking for "my" profile', async () => {
    await expectRefusal(() => getMyProfile(anonymous()));
  });

  it('lets the system read a profile — Inngest and moderation need this', async () => {
    // Not refused, so it proceeds to the query and hits the exploding stub instead.
    await expect(getProfile(system('rating recomputation'), bob.id)).rejects.toThrow(
      /database was queried/,
    );
    expect(touchedDatabase).toBe(true);
  });
});

describe('onboarding — Core rules 4 and 7', () => {
  const adultDob = '1995-04-01';

  it('refuses starting onboarding for somebody else', async () => {
    await expectRefusal(() => startOnboarding(alice, { userId: bob.id, dob: adultDob }));
  });

  it('refuses an anonymous visitor starting onboarding', async () => {
    await expectRefusal(() => startOnboarding(anonymous(), { userId: bob.id, dob: adultDob }));
  });

  it('refuses an under-age date of birth BEFORE touching the database', async () => {
    /*
     * The age gate is an authorization outcome, not a validation message, and it has to
     * fire before any write. A blocked signup must leave no profile row and no stored
     * date of birth for a child we have just told we cannot serve.
     */
    const twelveYearsAgo = new Date();
    twelveYearsAgo.setFullYear(twelveYearsAgo.getFullYear() - 12);
    const dob = twelveYearsAgo.toISOString().slice(0, 10);

    await expectRefusal(() => startOnboarding(alice, { userId: alice.id, dob }));
  });

  it('refuses a date of birth in the future', async () => {
    await expectRefusal(() => startOnboarding(alice, { userId: alice.id, dob: '2035-01-01' }));
  });

  it('refuses choosing a category for somebody else', async () => {
    await expectRefusal(() => setPrimaryCategory(alice, { userId: bob.id, categoryId: 'c1' }));
  });

  it('refuses completing onboarding for somebody else', async () => {
    await expectRefusal(() =>
      completeOnboarding(alice, { userId: bob.id, handle: 'someone', displayName: 'Someone' }),
    );
  });

  it('refuses an invalid handle before touching the database', async () => {
    await expectRefusal(() =>
      completeOnboarding(alice, { userId: alice.id, handle: 'no spaces', displayName: 'A' }),
    );
  });

  it('refuses a reserved handle', async () => {
    await expectRefusal(() =>
      completeOnboarding(alice, { userId: alice.id, handle: 'admin', displayName: 'A' }),
    );
  });

  it('refuses an empty display name', async () => {
    await expectRefusal(() =>
      completeOnboarding(alice, { userId: alice.id, handle: 'valid_handle', displayName: '   ' }),
    );
  });

  it('refuses an anonymous visitor reading onboarding state', async () => {
    await expectRefusal(() => getOnboardingState(anonymous()));
  });

  it('refuses an anonymous visitor checking handle availability', async () => {
    await expectRefusal(() => isHandleAvailable(anonymous(), 'meera'));
  });

  it('refuses marking somebody else’s phone as verified', async () => {
    // Vote weight follows phone verification, so this is a route to inflating the weight
    // of an account you control by verifying it as somebody else.
    await expectRefusal(() => setPhoneVerified(alice, bob.id));
  });
});

describe('comparisons — blind before, revealed after (Core rule 3)', () => {
  it('refuses an anonymous visitor drawing a pair', async () => {
    await expectRefusal(() => nextBlindPair(anonymous(), 'set-piece-1'));
  });

  it('refuses an anonymous visitor recording a vote', async () => {
    await expectRefusal(() => recordVote(anonymous(), { comparisonId: 'c1', winnerEntryId: 'e1' }));
  });

  it('refuses an anonymous visitor revealing identities', async () => {
    await expectRefusal(() => revealComparison(anonymous(), 'c1'));
  });

  it('refuses the system revealing identities — reveal belongs to the voter alone', async () => {
    await expectRefusal(() => revealComparison(system('audit'), 'c1'));
  });

  it('refuses an anonymous visitor counting comparisons', async () => {
    await expectRefusal(() => countMyDecidedComparisons(anonymous()));
  });
});

describe('entries — two lanes (Core rule 1)', () => {
  it('refuses listing entries without a signed-in user', async () => {
    await expectRefusal(() => listMySetPieceEntries(anonymous()));
  });

  it('refuses posting to the signature lane as someone else', async () => {
    await expectRefusal(() =>
      createSignatureEntry(alice, {
        userId: bob.id,
        categoryId: 'cat-1',
        title: 'not mine to post',
        videoSource: 'fixture',
        fixturePath: '/fixtures/clip-01.mp4',
      }),
    );
  });

  it('refuses a user changing entry status — that is the eligibility engine’s job', async () => {
    await expectRefusal(() => setSetPieceEntryStatus(alice, { entryId: 'e1', status: 'eligible' }));
  });
});

describe('set pieces — publishing', () => {
  it('refuses a user publishing a brief', async () => {
    await expectRefusal(() => publishSetPiece(alice, 'sp-1'));
  });

  it('refuses an anonymous visitor publishing a brief', async () => {
    await expectRefusal(() => publishSetPiece(anonymous(), 'sp-1'));
  });
});

describe('ratings', () => {
  it('refuses reading another competitor’s rating deviation', async () => {
    await expectRefusal(() => getMyRating(alice, { userId: bob.id, categoryId: 'cat-1' }));
  });
});

describe('follows — the unranked graph (Core rule 7)', () => {
  it('refuses an anonymous visitor following someone', async () => {
    await expectRefusal(() => follow(anonymous(), bob.id));
  });

  it('refuses an anonymous visitor checking a follow relationship', async () => {
    await expectRefusal(() => isFollowing(anonymous(), bob.id));
  });

  it('refuses an anonymous visitor listing a following list', async () => {
    await expectRefusal(() => listMyFollowing(anonymous()));
  });

  it('has no function that lists a user’s FOLLOWERS', async () => {
    // Core rule 7: no contact surface. Counts are public; the list of who follows a
    // possibly-underage competitor is not, and the safest way to keep it that way is for
    // the function not to exist. If this import ever succeeds, that decision was undone.
    const followsModule = await import('@/lib/db/queries/follows');
    expect(Object.keys(followsModule)).not.toContain('listFollowers');
  });
});
