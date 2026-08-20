import { expect, test } from '@playwright/test';

/**
 * Scaffold smoke test. Proves the app boots, renders, and reads the hypotheses file.
 * Real journeys (judge 25 pairs, unlock competing, submit an entry) arrive with the
 * features that make them possible.
 */
test('the app boots and states what it is', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Arena', level: 1 })).toBeVisible();
  await expect(page.getByText('blind pairwise voting')).toBeVisible();
});

test('hypotheses are surfaced, not buried', async ({ page }) => {
  await page.goto('/');

  // Core rule 6: every number shown to a user must be explainable.
  await expect(page.getByText('UNLOCK_THRESHOLD')).toBeVisible();
  await expect(page.getByText('lib/config/hypotheses.ts')).toBeVisible();
});
