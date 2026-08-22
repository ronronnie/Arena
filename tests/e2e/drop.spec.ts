import { expect, test } from '@playwright/test';

/**
 * The drop, from the outside.
 *
 * Runs against the seeded database, where week 3 is open and weeks 1 and 2 have finished.
 * The admin screens need an administrator session, which is verified against the live
 * database rather than here — the same reasoning as the signed-in onboarding flow in
 * `auth.spec.ts`.
 */

test.describe('/drop', () => {
  test('is readable signed out — the funnel is audience-first', async ({ page }) => {
    const response = await page.goto('/drop');

    expect(response?.status()).toBe(200);
    expect(page.url()).not.toContain('/sign-in');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('states the phase in words, not by colour', async ({ page }) => {
    await page.goto('/drop');

    // One of the real phases. Never a bare coloured dot.
    await expect(page.getByText(/^(Open|Judging|Results|Opens soon)$/).first()).toBeVisible();
  });

  test('shows the brief and the requirements as a checklist', async ({ page }) => {
    await page.goto('/drop');

    await expect(page.getByText('The brief')).toBeVisible();
    await expect(page.getByText('What it has to meet')).toBeVisible();
    // The conditions the eligibility engine will actually check, one at a time.
    await expect(page.getByText(/One unbroken take|Up to \d+ takes/)).toBeVisible();
  });

  test('shows a countdown in words and never a ticking clock', async ({ page }) => {
    await page.goto('/drop');

    const countdown = page.getByText(/\d+ (day|hour|minute)s? left|Less than a minute left/);
    await expect(countdown.first()).toBeVisible();

    // Core rule 8: no manufactured urgency. A seconds counter is exactly that.
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/\d+ seconds? left/);
  });

  test('publishes the entry count but not who entered', async ({ page }) => {
    await page.goto('/drop');

    await expect(page.getByText('Entries so far')).toBeVisible();

    /*
     * Core rule 3. The count is the social proof that makes a drop feel alive; the
     * identities stay behind the blind view until a vote is recorded. A handle on this
     * page would let a voter learn who entered before judging them.
     */
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/@competitor_\d+/);
  });

  test('credits the licensed track', async ({ page }) => {
    // A brief cannot publish without a licence covering the whole drop, so the credit
    // should always be there to show.
    await page.goto('/drop');
    await expect(page.getByText(/Licensed from/)).toBeVisible();
  });

  test('offers judging, and never an entry shortcut', async ({ page }) => {
    await page.goto('/drop');

    /*
     * Core rule 4. Entering is what judging unlocks, so it is never offered as an
     * alternative route on this page.
     */
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/enter now|submit your entry|upload your/i);
    await expect(page.getByRole('link', { name: /judg/i }).first()).toBeVisible();
  });

  test('links to the archive, which lists finished briefs', async ({ page }) => {
    await page.goto('/drop');
    await page.getByRole('link', { name: /Past briefs/i }).click();

    await expect(page.getByRole('heading', { name: 'Briefs that have finished' })).toBeVisible();
    await expect(page.getByText(/entries judged/).first()).toBeVisible();
  });

  test('does not name a winner it cannot explain', async ({ page }) => {
    await page.goto('/drop/archive');

    /*
     * The pack asks for "past set pieces archive with the winning entries". Ratings are
     * seeded rather than computed until Prompt 10, so there is no honest winner to name —
     * and Core rule 6 says every number must be explainable. The page says so instead.
     */
    await expect(page.getByText(/rating engine in Prompt 10/)).toBeVisible();
  });
});

test.describe('/admin', () => {
  test('is invisible to a signed-out visitor', async ({ page }) => {
    const response = await page.goto('/admin/set-pieces');

    expect(response?.url()).toContain('/sign-in');
  });
});
