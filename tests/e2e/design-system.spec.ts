import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression and accessibility over the design system gallery.
 *
 * The gallery is addressed entirely by URL, so each combination is a plain navigation
 * rather than a script of clicks that quietly rots. Three axes are covered because they
 * are the three claims this design language makes: it works in both themes, it survives
 * 200% dynamic type, and the accent ramp re-themes per category.
 *
 * Video tiles are masked. Their first frame depends on decoder timing, and a screenshot
 * suite that fails one run in five stops being read.
 */

const MOTION_SETTLE_MS = 2200;

async function gallery(
  page: Page,
  params: { theme?: string; scale?: string; category?: string } = {},
): Promise<void> {
  const query = new URLSearchParams({
    theme: params.theme ?? 'light',
    scale: params.scale ?? '100',
    category: params.category ?? 'default',
  });

  await page.goto(`/design-system?${query.toString()}`);
  await expect(page.getByRole('heading', { name: 'Broadcast, not feed' })).toBeVisible();
  // The ResultReveal choreography runs on timers; screenshot it settled, not mid-stage.
  await page.waitForTimeout(MOTION_SETTLE_MS);
}

const snapshot = async (page: Page, name: string): Promise<void> => {
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: 'disabled',
    mask: [page.locator('video')],
    // Font rendering and sub-pixel layout vary a little between runs and machines.
    maxDiffPixelRatio: 0.02,
  });
};

test.describe('visual regression', () => {
  /*
   * Screenshots are captured on the mobile viewport only.
   *
   * Mobile is the primary target — Arena is one-handed and bottom-anchored by design — and
   * every baseline is a committed PNG, so covering both viewports doubles the binary churn
   * in the repository for every deliberate design change. The desktop project still runs
   * the accessibility and layout tests below, which is where real desktop breakage (type
   * scaling, overflow, focus order) would actually show up.
   */
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-chrome',
      'Baselines are captured on the primary (mobile) viewport only.',
    );
  });

  test('light theme, 100% type', async ({ page }) => {
    await gallery(page);
    await snapshot(page, 'gallery-light-100.png');
  });

  test('dark theme, 100% type', async ({ page }) => {
    await gallery(page, { theme: 'dark' });
    await snapshot(page, 'gallery-dark-100.png');
  });

  test('150% type does not break layout', async ({ page }) => {
    await gallery(page, { scale: '150' });
    await snapshot(page, 'gallery-light-150.png');
  });

  test('200% type does not break layout', async ({ page }) => {
    await gallery(page, { scale: '200' });
    await snapshot(page, 'gallery-light-200.png');
  });

  test('the bharatanatyam accent ramp', async ({ page }) => {
    await gallery(page, { category: 'bharatanatyam' });
    await snapshot(page, 'gallery-bharatanatyam.png');
  });

  test('the metal vocals accent ramp', async ({ page }) => {
    await gallery(page, { category: 'metal-vocals' });
    await snapshot(page, 'gallery-metal-vocals.png');
  });

  test('reduced motion renders the non-animated equivalents', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gallery(page);
    await snapshot(page, 'gallery-reduced-motion.png');
  });
});

test.describe('accessibility in the primitives', () => {
  test('every interactive control clears the 48px touch floor', async ({ page }) => {
    await gallery(page);

    /*
     * Measures the HIT AREA, not the visual box. The compact `sm` button is deliberately
     * 36px tall and reaches 48px through an absolutely positioned ::after overlay — a
     * dense scoreboard row still has to be pressable by someone whose hands are not
     * steady. `boundingBox()` cannot see a pseudo-element, so an earlier version of this
     * test failed those buttons for being exactly as designed.
     *
     * Scoped to [data-gallery] so Next's dev overlay is not measured as if it were ours.
     * Video tiles are excluded: their target is the whole frame.
     */
    const undersized = await page.evaluate(() => {
      const selector =
        '[data-gallery] button:not([aria-pressed]), [data-gallery] a[href^="/design-system"], [data-gallery] [role="tab"]';
      const results: string[] = [];
      const controls = Array.from(document.querySelectorAll<HTMLElement>(selector));

      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const overlay = window.getComputedStyle(control, '::after');
        const overlayHeight =
          overlay.content === 'none' ? 0 : Number.parseFloat(overlay.height) || 0;

        const effective = Math.max(rect.height, overlayHeight);
        if (effective < 47.5) {
          results.push(`"${control.textContent?.trim() ?? ''}" has a ${effective}px hit area`);
        }
      }

      return { results, count: controls.length };
    });

    expect(undersized.count, 'found too few controls to be measuring the gallery').toBeGreaterThan(
      15,
    );
    expect(undersized.results, 'controls below the 48px floor').toEqual([]);
  });

  test('the rating badge opens its explanation, by keyboard alone', async ({ page }) => {
    await gallery(page);

    // Core rule 6: every number opens an explanation. A mouse-only path is not enough.
    const badge = page.getByRole('button', { name: 'Rating 1512. Tap for an explanation.' });
    await badge.focus();
    await page.keyboard.press('Enter');

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Where this number comes from')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('a provisional rating is announced as a range, in words', async ({ page }) => {
    await gallery(page);

    // Not "1500". A rating we are unsure about must not claim a precision it lacks.
    await expect(
      page.getByRole('button', { name: /Provisional rating, between 1320 and 1680/ }),
    ).toBeVisible();
  });

  test('tabs are operable with arrow keys', async ({ page }) => {
    await gallery(page);

    const setPiece = page.getByRole('tab', { name: 'Set piece' });
    await setPiece.focus();
    await expect(setPiece).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Signature' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the blind face is unreachable by keyboard once revealed', async ({ page }) => {
    await gallery(page);

    /*
     * Core rule 3 through the back door. Both faces of the flip stay mounted — the
     * animation needs something to reveal — so the one facing away must be out of the tab
     * order and out of the accessibility tree. Otherwise a screen reader or a Tab press
     * reaches the competitor's name before the vote, and the rule is broken by a route
     * nobody looked at.
     *
     * Asserted on the attributes rather than on visibility: a rotated element is still
     * "visible" to a geometric check, which is exactly why this needs its own test. An
     * earlier version of this component set `inert=""`, which React treats as false —
     * this assertion is what caught it.
     */
    const front = page.locator('[data-slot="reveal-front"]');
    const back = page.locator('[data-slot="reveal-back"]');

    await expect(front).toHaveAttribute('aria-hidden', 'false');
    await expect(back).toHaveAttribute('aria-hidden', 'true');
    await expect(back).toHaveAttribute('inert', '');

    await page.getByRole('button', { name: 'Reveal identity' }).click();

    await expect(front).toHaveAttribute('aria-hidden', 'true');
    await expect(front).toHaveAttribute('inert', '');
    await expect(back).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByText('@competitor_12')).toBeVisible();
  });

  test('the page never scrolls sideways, at any type scale', async ({ page }) => {
    for (const scale of ['100', '150', '200']) {
      await gallery(page, { scale });

      // Names the culprits rather than just the number — "22px of overflow" sends you
      // hunting, "the hero numeral in ResultReveal is 434px wide" does not.
      const { overflow, culprits } = await page.evaluate(() => {
        const doc = document.documentElement;
        const limit = doc.clientWidth;
        const offenders: string[] = [];

        /*
         * Two different failures look identical from the outside. An element can stick out
         * past the viewport (rect.right), or it can sit inside the viewport while its own
         * CONTENT overflows it (scrollWidth) — an unbreakable string at 200% type does the
         * second, and a rect-only check reports nothing at all while the page still
         * scrolls sideways.
         */
        const elements = Array.from(document.querySelectorAll<HTMLElement>('body *'));

        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.right > limit + 1) {
            offenders.push(
              `past viewport: <${element.tagName.toLowerCase()} class="${element.className}"> right=${Math.round(rect.right)}`,
            );
            // `clientWidth > 8` skips sr-only text, which is clipped to a 1px box on
            // purpose and always "overflows" it.
          } else if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 8) {
            offenders.push(
              `content overflows: <${element.tagName.toLowerCase()} class="${element.className}"> ${element.scrollWidth}>${element.clientWidth}`,
            );
          }
        }

        return { overflow: doc.scrollWidth - limit, culprits: offenders.slice(0, 6) };
      });

      expect(
        overflow,
        `horizontal overflow at ${scale}% type. Widest: ${culprits.join(' | ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
