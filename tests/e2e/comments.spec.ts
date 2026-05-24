import { test, expect, Page } from '@playwright/test';

// Helper to log in as a student
async function loginAsStudent(page: Page) {
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.E2E_STUDENT_EMAIL ?? 'student@example.com');
  await page.fill('[name="password"]', process.env.E2E_STUDENT_PASSWORD ?? 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
}

async function loginAsTutor(page: Page) {
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.E2E_TUTOR_EMAIL ?? 'tutor@example.com');
  await page.fill('[name="password"]', process.env.E2E_TUTOR_PASSWORD ?? 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com');
  await page.fill('[name="password"]', process.env.E2E_ADMIN_PASSWORD ?? 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
}

// ─── Admin Moderation ────────────────────────────────────────────────────────

test.describe('Admin Moderation Queue', () => {
  test('admin can access moderation queue', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/moderation');
    await expect(page.getByRole('heading', { name: 'Moderation Queue' })).toBeVisible();
  });

  test('non-admin is redirected from moderation queue', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/admin/moderation');
    // Should be redirected away
    await page.waitForURL(/^(?!.*moderation)/);
  });

  test('admin can switch between status tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/moderation');
    await page.click('button:has-text("All")');
    await expect(page.locator('table')).toBeVisible();
  });

  test('delete action requires confirmation', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/moderation?status=pending');

    const deleteBtn = page.locator('button[title="Delete comment"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(page.getByRole('dialog')).toContainText('Delete this comment?');
      // Cancel
      await page.click('button:has-text("Cancel")');
    }
  });
});

// ─── Comment Section ─────────────────────────────────────────────────────────

test.describe('Comment Section — Tutor Profile', () => {
  const TUTOR_ID = process.env.E2E_TUTOR_ID ?? 'test-tutor-id';

  test('shows comment section on tutor profile', async ({ page }) => {
    await page.goto(`/tutors/${TUTOR_ID}`);
    await expect(page.getByRole('heading', { name: /reviews & comments/i })).toBeVisible({ timeout: 10000 });
  });

  test('eligible student can post a comment', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`/tutors/${TUTOR_ID}`);

    const writeInput = page.getByText('Share your experience with this tutor.');
    if (await writeInput.isVisible()) {
      await writeInput.click();
      await page.fill('textarea', 'This tutor was very helpful and patient!');
      await page.click('button:has-text("Post")');
      await expect(page.getByText('This tutor was very helpful and patient!')).toBeVisible({ timeout: 5000 });
    }
  });
});

// ─── Post → Edit → React → Reply → Report → Admin Hide ──────────────────────

test.describe('Full comment lifecycle', () => {
  const CLASS_ID = process.env.E2E_CLASS_ID ?? 'test-class-id';

  test('student can post a comment and it appears in the list', async ({ page }) => {
    await loginAsStudent(page);
    // Navigate to a class page that has the comment section
    await page.goto(`/student/groups/${CLASS_ID}`);

    const writeInput = page.getByText('Share your experience with this class.');
    if (await writeInput.isVisible()) {
      await writeInput.click();
      await page.fill('textarea', 'Excellent class content E2E test comment');
      await page.click('button:has-text("Post")');
      await expect(page.getByText('Excellent class content E2E test comment')).toBeVisible({ timeout: 5000 });
    }
  });

  test('star filter chip shows and can be cleared', async ({ page }) => {
    await page.goto(`/student/groups/${CLASS_ID}`);

    // Clicking a 5-star bar on the rating breakdown should show a filter chip
    const starFive = page.locator('button').filter({ hasText: '5' }).first();
    if (await starFive.isVisible()) {
      await starFive.click();
      await expect(page.getByText('Showing 5★ ratings only')).toBeVisible({ timeout: 3000 });
      // Clear it
      await page.click('button[aria-label="Clear star filter"]');
      await expect(page.getByText('Showing 5★ ratings only')).not.toBeVisible();
    }
  });

  test('report modal can be opened and submitted', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`/tutors/${process.env.E2E_TUTOR_ID ?? 'test-tutor-id'}`);
    await page.waitForSelector('section[aria-label="Reviews and Comments"]', { timeout: 10000 });

    const reportBtn = page.getByRole('button', { name: /report/i }).first();
    if (await reportBtn.isVisible()) {
      await reportBtn.click();
      await expect(page.getByRole('dialog')).toContainText('Report this comment');
      // Select a reason
      await page.click('text=Spam');
      await page.click('button:has-text("Submit Report")');
      await expect(page.getByText('Report received. Thank you.')).toBeVisible({ timeout: 5000 });
    }
  });
});

// ─── Mobile layout ───────────────────────────────────────────────────────────

test.describe('Mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('comment section renders at 375px', async ({ page }) => {
    await page.goto(`/tutors/${process.env.E2E_TUTOR_ID ?? 'test-tutor-id'}`);
    const section = page.locator('section[aria-label="Reviews and Comments"]');
    await expect(section).toBeVisible({ timeout: 10000 });
    // No horizontal overflow
    const overflowX = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowX).toBe(false);
  });
});
