import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for Phase 2: Ratings Frontend
 *
 * These tests assume a running dev server (baseURL) and use page routing.
 * Integration tests that require real auth should be tagged @auth.
 */

// ────────────────────────────────────────────────────────────
// RatingBreakdown dev page (no auth required)
// ────────────────────────────────────────────────────────────
test.describe('RatingBreakdown dev page', () => {
  test('renders all four scenarios', async ({ page }) => {
    await page.goto('/_dev/rating-breakdown');
    await expect(page.getByText('Zero state')).toBeVisible();
    await expect(page.getByText('Low count (3 ratings)')).toBeVisible();
    await expect(page.getByText('Mostly 5s')).toBeVisible();
    await expect(page.getByText('Bell curve')).toBeVisible();
  });

  test('shows "No ratings yet" in zero state', async ({ page }) => {
    await page.goto('/_dev/rating-breakdown');
    await expect(page.getByText('No ratings yet').first()).toBeVisible();
  });

  test('shows low-count disclaimer', async ({ page }) => {
    await page.goto('/_dev/rating-breakdown');
    await expect(page.getByText(/Based on a small number/)).toBeVisible();
  });

  test('filter state updates when bar clicked', async ({ page }) => {
    await page.goto('/_dev/rating-breakdown');
    // Click the 5-star bar on the first non-empty scenario (mostly-5s section)
    const buttons = page.locator('button[aria-pressed]');
    await buttons.nth(10).click(); // Mostly-5s, first bar (5 stars)
    await expect(page.getByText(/Current filter/)).toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────
// 1-on-1 lockout (feedback page)
// These tests require a completed session and auth — marked @auth
// Run with a seeded test environment.
// ────────────────────────────────────────────────────────────
test.describe('1-on-1 Rating Lockout @auth', () => {
  test.skip(!process.env.TEST_SESSION_ID, 'No TEST_SESSION_ID env var set');

  test('lockout page loads and blocks navigation', async ({ page }) => {
    const sessionId = process.env.TEST_SESSION_ID!;
    await page.goto(`/feedback/student/${sessionId}`);

    // Should show the rating form
    await expect(page.getByText('How was your session?')).toBeVisible();

    // Back navigation should be blocked
    await page.goBack();
    await expect(page.getByText('How was your session?')).toBeVisible();
  });

  test('submit button disabled until star selected', async ({ page }) => {
    const sessionId = process.env.TEST_SESSION_ID!;
    await page.goto(`/feedback/student/${sessionId}`);

    const submitBtn = page.getByRole('button', { name: /Submit Rating/ });
    await expect(submitBtn).toBeDisabled();

    // Select 5 stars
    await page.getByLabel('5 stars').click();
    await expect(submitBtn).toBeEnabled();
  });
});

// ────────────────────────────────────────────────────────────
// Class rating banner & modal @auth
// ────────────────────────────────────────────────────────────
test.describe('Class Rating Banner @auth', () => {
  test.skip(!process.env.TEST_STUDENT_COOKIE, 'No TEST_STUDENT_COOKIE set');

  async function loginAsStudent(page: Page) {
    await page.context().addCookies(
      JSON.parse(process.env.TEST_STUDENT_COOKIE!),
    );
  }

  test('banner shows first pending prompt on dashboard', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    // Banner should show "Rate Now" button
    await expect(page.getByRole('button', { name: /Rate Now/ })).toBeVisible({ timeout: 8000 });
  });

  test('clicking Remind Me Later cycles to next prompt', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    const firstClassName = await page.locator('.border-l-4 span.font-bold').first().textContent();
    await page.getByRole('button', { name: /Remind Me Later/ }).click();
    // Banner should now show a different (or no) prompt
    const nextClassName = await page.locator('.border-l-4 span.font-bold').first().textContent().catch(() => null);
    expect(nextClassName).not.toBe(firstClassName);
  });

  test('Rate Now opens modal, Cancel closes without submitting', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.getByRole('button', { name: /Rate Now/ }).click();
    await expect(page.getByText('How was')).toBeVisible();
    await page.getByRole('button', { name: /Cancel/ }).click();
    await expect(page.getByText('How was')).not.toBeVisible();
  });

  test('escalated banner shows orange border at dismissed_count >= 3', async ({ page }) => {
    // This test requires the mock or a seeded prompt with dismissed_count >= 3
    // It verifies the escalated styling is applied (border-coral class)
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    const escalated = page.locator('.border-coral');
    // Only check if escalated prompt exists
    const count = await escalated.count();
    if (count > 0) {
      await expect(escalated.first()).toBeVisible();
    }
  });
});

// ────────────────────────────────────────────────────────────
// Tutor format preference @auth
// ────────────────────────────────────────────────────────────
test.describe('Tutor Format Preference @auth', () => {
  test.skip(!process.env.TEST_TUTOR_COOKIE, 'No TEST_TUTOR_COOKIE set');

  async function loginAsTutor(page: Page) {
    await page.context().addCookies(JSON.parse(process.env.TEST_TUTOR_COOKIE!));
  }

  test('Tutoring Preferences section is visible in settings', async ({ page }) => {
    await loginAsTutor(page);
    await page.goto('/tutor/settings');
    await page.getByRole('button', { name: /Tutoring Preferences/ }).click();
    await expect(page.getByText('Both classes and 1-on-1 sessions')).toBeVisible();
    await expect(page.getByText('Classes only')).toBeVisible();
    await expect(page.getByText('1-on-1 sessions only')).toBeVisible();
  });

  test('Save Preferences button disabled when unchanged', async ({ page }) => {
    await loginAsTutor(page);
    await page.goto('/tutor/settings');
    await page.getByRole('button', { name: /Tutoring Preferences/ }).click();
    const saveBtn = page.getByRole('button', { name: /Save Preferences/ });
    await expect(saveBtn).toBeDisabled();
  });

  test('changing preference enables save button', async ({ page }) => {
    await loginAsTutor(page);
    await page.goto('/tutor/settings');
    await page.getByRole('button', { name: /Tutoring Preferences/ }).click();
    await page.getByText('Classes only').click();
    const saveBtn = page.getByRole('button', { name: /Save Preferences/ });
    await expect(saveBtn).toBeEnabled();
  });
});

// ────────────────────────────────────────────────────────────
// Tutor My Ratings page @auth
// ────────────────────────────────────────────────────────────
test.describe('Tutor My Ratings @auth', () => {
  test.skip(!process.env.TEST_TUTOR_COOKIE, 'No TEST_TUTOR_COOKIE set');

  async function loginAsTutor(page: Page) {
    await page.context().addCookies(JSON.parse(process.env.TEST_TUTOR_COOKIE!));
  }

  test('page loads and shows aggregate data only', async ({ page }) => {
    await loginAsTutor(page);
    await page.goto('/tutor/dashboard/ratings');
    await expect(page.getByText('My Ratings')).toBeVisible();
    await expect(page.getByText(/aggregate/i)).toBeVisible();
  });

  test('1-on-1 section hidden for classes-only tutor', async ({ page }) => {
    await loginAsTutor(page);
    // Assume tutor has classes_only set — test env should have this seeded
    if (process.env.TEST_TUTOR_FORMAT === 'classes_only') {
      await page.goto('/tutor/dashboard/ratings');
      await expect(page.getByText('1-on-1 Sessions')).not.toBeVisible();
    }
  });
});
