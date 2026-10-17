import { test, expect } from '@playwright/test';

test.describe('Reminders Management Flow', () => {
  test('creates a reminder, validates date and time, confirms persistence on reload, and tests invalid inputs', async ({ page }) => {
    const reminderMsg = `Pick up package from locker ${Date.now()}`;
    const futureDate = '2026-11-20T17:30';

    await page.goto('/reminders');
    await expect(page.getByRole('heading', { level: 1, name: 'Gentle nudges for the moments that matter.' })).toBeVisible();

    // 1. Open reminder form and verify validation prevents invalid submissions (button disabled)
    await page.getByRole('button', { name: 'Add Reminder' }).click();
    await expect(page.locator('#reminder-message')).toBeVisible();
    await expect(page.locator('#reminder-at')).toBeVisible();

    const submitBtn = page.getByRole('button', { name: 'Schedule Reminder' });
    await expect(submitBtn).toBeDisabled();

    // 2. Validation test: missing date keeps submit disabled
    await page.locator('#reminder-message').fill(reminderMsg);
    await expect(submitBtn).toBeDisabled();

    // 3. Create valid reminder with date & time
    await page.locator('#reminder-at').fill(futureDate);
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 4. Verify reminder appears in list with saved date & time
    await expect(page.getByRole('status')).toContainText('Reminder saved to database');
    const reminderArticle = page.getByRole('article').filter({ hasText: reminderMsg });
    await expect(reminderArticle).toBeVisible();
    await expect(reminderArticle).toContainText(reminderMsg);

    // 5. Reload page and confirm persistence
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Gentle nudges for the moments that matter.' })).toBeVisible();
    const persistedArticle = page.getByRole('article').filter({ hasText: reminderMsg });
    await expect(persistedArticle).toBeVisible();
    await expect(persistedArticle).toContainText(reminderMsg);

    // 6. Confirm honest labeling: reminders are labeled as scheduled, not claimed delivered
    await expect(persistedArticle).toContainText('Scheduled');
    await expect(page.getByText('Scheduled nudges saved in your PostgreSQL database.')).toBeVisible();

    // 7. Delete the reminder
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(`Delete reminder "${reminderMsg}"?`);
      await dialog.accept();
    });

    const deleteButton = persistedArticle.getByRole('button', { name: `Remove ${reminderMsg}` });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    await expect(page.getByRole('article').filter({ hasText: reminderMsg })).not.toBeVisible();
    await expect(page.getByRole('status')).toContainText('Reminder deleted from database.');
  });
});

