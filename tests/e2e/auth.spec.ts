import { expect, test } from '@playwright/test';

/**
 * Auth and onboarding, from the outside.
 *
 * What is covered here is what can be exercised without a live mailbox or a Google
 * account: route protection, the shape of the sign-in screen, and — most importantly —
 * the absence of anything that would break Core rule 4.
 *
 * The signed-in half of onboarding needs a real session. It is verified against the live
 * database by the flow described in PROGRESS.md rather than here, because faking a Neon
 * Auth session in Playwright would mean asserting against a session our own code does not
 * produce.
 */

test.describe('route protection', () => {
  for (const path of ['/vote', '/onboarding', '/settings']) {
    test(`${path} sends a signed-out visitor to sign-in`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.url()).toContain('/sign-in');
      // And remembers where they were going.
      expect(new URL(page.url()).searchParams.get('next')).toBe(path);
    });
  }

  test('the audience-facing pages stay open to everyone', async ({ page }) => {
    // Core rule 4 is audience-first. An audience product that demands an account before
    // showing anything has the funnel backwards.
    for (const path of ['/', '/design-system']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(page.url(), path).not.toContain('/sign-in');
    }
  });
});

test.describe('the sign-in screen', () => {
  test('offers exactly two ways in, and no role choice', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();

    /*
     * Core rule 4, asserted rather than assumed. There is no "sign up as a performer"
     * path, and if one is ever added this test is what says so. The absence is the
     * feature: competing is unlocked by judging, so offering it here would promise
     * something the product does not allow yet.
     */
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/become a competitor|sign up to compete|i'?m a (performer|creator)/i);
    expect(page.getByRole('button', { name: /compete|perform|upload|enter/i })).toHaveCount(0);
  });

  test('says what the first session will actually be', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByRole('heading', { name: 'Start by judging' })).toBeVisible();
    await expect(page.getByText(/without knowing whose they are/)).toBeVisible();
  });

  test('explains why a date of birth is coming', async ({ page }) => {
    // Asking a fifteen-year-old for their birthday without saying why is the kind of
    // thing that makes a parent close the tab.
    await page.goto('/sign-in');
    await expect(page.getByText(/date of birth on the next screen/)).toBeVisible();
  });

  test('refuses an off-site redirect target', async ({ page }) => {
    // An open redirect on a sign-in page hands an attacker a credible-looking link: the
    // domain is real, the page is real, and the user lands somewhere else once they are in.
    await page.goto('/sign-in?next=https://example.com/phish');
    await expect(page.getByRole('heading', { name: 'Start by judging' })).toBeVisible();

    /*
     * Asserted on things that can actually navigate. The string does appear in the page —
     * Next's RSC payload echoes the request's own search params — but an echoed query
     * string is not a destination, and asserting on the raw HTML failed on exactly that.
     */
    const offsite = page.locator(
      '[href*="example.com"], [action*="example.com"], [src*="example.com"]',
    );
    await expect(offsite).toHaveCount(0);
  });

  test('every control clears the 48px touch floor', async ({ page }) => {
    await page.goto('/sign-in');

    const undersized = await page.evaluate(() => {
      const results: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('main button, main input'),
      )) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.height < 47.5) {
          results.push(
            `${el.tagName.toLowerCase()} "${el.textContent?.trim() ?? ''}" ${rect.height}px`,
          );
        }
      }
      return results;
    });

    expect(undersized).toEqual([]);
  });
});
