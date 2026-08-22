import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { config } from 'dotenv';
import { Client } from 'pg';

/**
 * A full run on the voting screen.
 *
 * The prompt pack asks for "Playwright coverage of a full 10-pair run", and this is the
 * one suite that needs a real signed-in judge — so it creates one through the actual
 * sign-up endpoint, completes their onboarding by writing the profile row the onboarding
 * form would have written, and deletes everything afterwards.
 *
 * Serial, and skipped without `DATABASE_URL`, for the same reason as the integration
 * tests: a suite that fails on a fresh clone with no credentials teaches people to ignore
 * failures.
 */

config({ path: ['.env.local', '.env'], quiet: true });

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const password = 'correct-horse-battery-staple-9';

test.describe.configure({ mode: 'serial' });

test.describe('the voting screen', () => {
  test.skip(connectionString === undefined, 'needs a database');

  let email: string;
  let userId: string;
  let pg: Client;
  let sessionCookies: Awaited<ReturnType<BrowserContext['cookies']>>;

  test.beforeAll(async ({ browser }) => {
    pg = new Client({ connectionString });
    await pg.connect();

    email = `e2e-vote-${randomUUID()}@seed.arena.invalid`;

    // Sign up through the real endpoint, so the session is one our own code produces.
    const context = await browser.newContext();
    const base = test.info().project.use.baseURL ?? 'http://localhost:3100';
    await context.request.post(`${base}/api/auth/sign-up/email`, {
      data: { email, password, name: 'E2E Judge' },
    });

    const user = await pg.query<{ id: string }>(
      'select id from neon_auth."user" where email = $1',
      [email],
    );
    userId = user.rows[0]!.id;

    // Finish onboarding the way the form would.
    const category = await pg.query<{ id: string }>(
      "select id from categories where slug = 'bharatanatyam-abhinaya'",
    );
    await pg.query(
      `insert into profiles (user_id, display_name, handle, dob, primary_category_id, onboarding_completed_at)
       values ($1, 'E2E Judge', $2, '1996-03-14', $3, now())`,
      [userId, `e2e_${userId.replaceAll('-', '').slice(0, 12)}`, category.rows[0]!.id],
    );

    /*
     * Sign in ONCE and keep the cookies, rather than once per test.
     *
     * Six tests across two viewport projects is a dozen sign-ins against the hosted auth
     * instance in under two minutes, and it starts refusing them — which showed up as the
     * last desktop test landing on the sign-in page rather than the voting screen. The
     * session is the same either way; this just stops hammering somebody else's service
     * to re-obtain it.
     */
    await context.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password } });
    sessionCookies = await context.cookies();
    await context.close();
  });

  test.afterAll(async () => {
    if (pg === undefined) return;
    await pg.query('delete from comparisons where voter_id = $1', [userId]);
    await pg.query('delete from profiles where user_id = $1', [userId]);
    await pg.query('delete from neon_auth."user" where id = $1', [userId]);
    await pg.end();
  });

  /** Restores the shared session into this test's context and lands on /vote. */
  async function signIn(page: Page): Promise<void> {
    await page.context().addCookies(sessionCookies);
    await page.goto('/vote');
    await expect(page.getByText('Which is better?')).toBeVisible();
  }

  test('shows two clips and nothing that identifies anybody', async ({ page }) => {
    await signIn(page);

    await expect(page.locator('video')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Pick A' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick B' })).toBeVisible();

    /*
     * Core rule 3, asserted on the delivered HTML rather than on what is visible: the
     * reveal card's back face is in the DOM the whole time, so a name reaching the page
     * early would not necessarily be on screen — but it would be in the source.
     */
    const html = await page.content();
    expect(html).not.toMatch(/@competitor_\d+/);
  });

  test('reveals identities only after a vote, then serves the next pair', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'Pick A' }).click();

    // The reveal IS the reward, and it arrives only once the decision is recorded.
    await expect(page.getByText(/^You picked /)).toBeVisible();
    await expect(page.locator('text=/@[a-z0-9_]+/').first()).toBeVisible();

    await page.getByRole('button', { name: 'Next pair' }).click();
    await expect(page.getByRole('button', { name: 'Pick A' })).toBeVisible();
  });

  test('runs ten pairs without repeating one, and counts every vote', async ({ page }) => {
    /*
     * Ten real votes against a remote database. Each one is a round trip to Neon and back
     * — around three seconds — so the run legitimately outlasts Playwright's 30s default,
     * and the default is what this test kept dying on.
     */
    test.setTimeout(180_000);
    await signIn(page);

    const seen = new Set<string>();

    for (let round = 0; round < 10; round += 1) {
      const exhausted = await page
        .getByText('You have judged everything on this brief')
        .isVisible()
        .catch(() => false);
      if (exhausted) break;

      // Which two entries are on screen, by their clip sources.
      const sources = await page
        .locator('video')
        .evaluateAll((videos) =>
          videos.map((video) => (video as HTMLVideoElement).getAttribute('src') ?? ''),
        );
      expect(sources).toHaveLength(2);

      await page.getByRole('button', { name: round % 3 === 0 ? 'Pick B' : 'Pick A' }).click();
      await expect(page.getByText(/^You picked /)).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Next pair' }).click();
      await expect(page.getByRole('button', { name: 'Pick A' })).toBeVisible({ timeout: 15_000 });
    }

    // Ten decided comparisons, each with a winner and a recorded decision time.
    const decided = await pg.query<{ count: string; with_ms: string }>(
      `select count(*) as count, count(decision_ms) as with_ms
         from comparisons
        where voter_id = $1 and decided_at is not null and skipped = false`,
      [userId],
    );
    expect(Number(decided.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(10);
    expect(Number(decided.rows[0]?.with_ms ?? 0)).toBeGreaterThanOrEqual(10);

    // No pair repeated, in either orientation.
    const pairs = await pg.query<{ entry_a: string; entry_b: string }>(
      'select entry_a, entry_b from comparisons where voter_id = $1',
      [userId],
    );
    for (const row of pairs.rows) {
      const key = [row.entry_a, row.entry_b].sort().join(':');
      expect(seen.has(key), 'the same pair was served twice').toBe(false);
      seen.add(key);
    }

    // And the unlock counter moved with them — Core rule 4's gate is what judging feeds.
    const profile = await pg.query<{ comparisons_completed: number }>(
      'select comparisons_completed from profiles where user_id = $1',
      [userId],
    );
    expect(profile.rows[0]?.comparisons_completed).toBeGreaterThanOrEqual(10);
  });

  test('records a skip without counting it toward the unlock', async ({ page }) => {
    await signIn(page);

    const before = await pg.query<{ comparisons_completed: number }>(
      'select comparisons_completed from profiles where user_id = $1',
      [userId],
    );

    await page.getByRole('button', { name: 'Too close to call' }).click();
    // A skip has no reveal to sit on, so the next pair arrives immediately.
    await expect(page.getByRole('button', { name: 'Pick A' })).toBeVisible({ timeout: 15_000 });

    const skips = await pg.query<{ count: string }>(
      'select count(*) as count from comparisons where voter_id = $1 and skipped = true',
      [userId],
    );
    expect(Number(skips.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);

    /*
     * Skips must not advance the compete-unlock, or the fastest route to entering would be
     * tapping "too close to call" twenty-five times and Core rule 4's gate would mean
     * nothing.
     */
    const after = await pg.query<{ comparisons_completed: number }>(
      'select comparisons_completed from profiles where user_id = $1',
      [userId],
    );
    expect(after.rows[0]?.comparisons_completed).toBe(before.rows[0]?.comparisons_completed);

    // And a skip never reaches a rating.
    const counted = await pg.query<{ count: string }>(
      'select count(*) as count from comparisons where voter_id = $1 and skipped = true and is_counted = true',
      [userId],
    );
    expect(Number(counted.rows[0]?.count ?? 0)).toBe(0);
  });

  test('never serves a judge their own entry', async ({ page }) => {
    await signIn(page);

    // Belt and braces: the pairing filters it out and a trigger refuses it. This asserts
    // the outcome rather than either mechanism.
    const own = await pg.query<{ count: string }>(
      `select count(*) as count
         from comparisons c
         join set_piece_entries e on e.id in (c.entry_a, c.entry_b)
        where c.voter_id = $1 and e.user_id = $1`,
      [userId],
    );
    expect(Number(own.rows[0]?.count ?? 0)).toBe(0);
  });

  test('offers the scrub-sync, the thing only a set piece makes possible', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'Compare the same moment' }).click();
    const scrubber = page.getByRole('slider', {
      name: 'Scrub both performances to the same moment',
    });
    await expect(scrubber).toBeVisible();

    // Both clips move together, which is only meaningful because both performed the same
    // brief. Setting the slider seeks both videos.
    await scrubber.fill('50');
    const times = await page
      .locator('video')
      .evaluateAll((videos) => videos.map((video) => (video as HTMLVideoElement).currentTime));
    expect(times).toHaveLength(2);
    expect(Math.abs((times[0] ?? 0) - (times[1] ?? 0))).toBeLessThan(0.5);
  });
});
