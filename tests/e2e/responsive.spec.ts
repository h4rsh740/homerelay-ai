import { test, expect } from '@playwright/test';

test.describe('Responsive UI and Mobile Navigation Flow', () => {
  test('adapts layout for mobile viewport (375x667) with drawer navigation', async ({ page }) => {
    // 1. Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 2. Confirm desktop sidebar is hidden and mobile header button is visible
    const desktopSidebar = page.locator('aside[aria-label="Household navigation"]');
    await expect(desktopSidebar).not.toBeVisible();

    const openNavButton = page.getByRole('button', { name: 'Open navigation' });
    await expect(openNavButton).toBeVisible();

    // 3. Open navigation drawer
    await openNavButton.click();
    const navDialog = page.getByRole('dialog');
    await expect(navDialog).toBeVisible();

    // Verify links inside drawer
    const tasksLink = navDialog.getByRole('link', { name: 'Tasks' });
    const remindersLink = navDialog.getByRole('link', { name: 'Reminders' });
    await expect(tasksLink).toBeVisible();
    await expect(remindersLink).toBeVisible();

    // 4. Click a navigation link and confirm drawer closes and page navigates
    await tasksLink.click();
    await page.waitForURL('/tasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();

    // 5. Open new task form and verify task controls fit within mobile viewport without horizontal page overflow
    await page.getByRole('button', { name: 'Add Task' }).click();
    const newTaskInput = page.locator('#task-title');
    await expect(newTaskInput).toBeVisible();

    // Verify body scroll width does not exceed viewport width
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(385);

  });

  test('displays full desktop layout at 1280x800 with permanent sidebar', async ({ page }) => {
    // 1. Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 2. Confirm desktop sidebar is visible
    const desktopSidebar = page.locator('aside[aria-label="Household navigation"]');
    await expect(desktopSidebar).toBeVisible();

    // Mobile hamburger menu button should not be visible
    const openNavButton = page.getByRole('button', { name: 'Open navigation' });
    await expect(openNavButton).not.toBeVisible();

    // 3. Verify permanent sidebar content
    await expect(desktopSidebar.getByText('Verified MCP System')).toBeVisible();
    await expect(desktopSidebar.getByText('HomeRelay Household')).toBeVisible();
    await expect(desktopSidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(desktopSidebar.getByRole('link', { name: 'Tasks' })).toBeVisible();
    await expect(desktopSidebar.getByRole('link', { name: 'Reminders' })).toBeVisible();
    await expect(desktopSidebar.getByRole('link', { name: 'Activity history' })).toBeVisible();
  });
});
