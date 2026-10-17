import { test, expect } from '@playwright/test';

test.describe('Navigation & Responsive Shell', () => {
  test('navigates through household and preview screens', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'A calmer command center for home.' })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/tasks"]')).toHaveAttribute('href', '/tasks');
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks', exact: true })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/reminders"]')).toHaveAttribute('href', '/reminders');
    await page.goto('/reminders');
    await expect(page.getByRole('heading', { level: 1, name: 'Gentle nudges for the moments that matter.' })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/history"]')).toHaveAttribute('href', '/history');
    await page.goto('/history');
    await expect(page.getByRole('heading', { level: 1, name: 'A clear trail of what changed.' })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/new-request"]')).toHaveAttribute('href', '/new-request');
    await page.goto('/new-request');
    await expect(page.getByRole('heading', { level: 1, name: 'A little less to remember.' })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/plan"]')).toHaveAttribute('href', '/plan');
    await page.goto('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'No active plan to review.' })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/execution"]')).toHaveAttribute('href', '/execution');
    await page.goto('/execution');
    await expect(page.getByRole('heading', { level: 1, name: 'No plan is queued for execution.' })).toBeVisible();

    await expect(page.locator('aside[aria-label="Household navigation"] a[href="/results"]')).toHaveAttribute('href', '/results');
    await page.goto('/results');
    await expect(page.getByRole('heading', { level: 1, name: 'No execution results found.' })).toBeVisible();
  });

  test('shows verified MCP system status in the sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Verified MCP System')).toBeVisible();
    await expect(page.getByText('Actions require explicit approval before execution.', { exact: false })).toBeVisible();
    await expect(page.getByText('HomeRelay Household')).toBeVisible();
    await expect(page.getByText('Alexa+ Track · MCP Connected')).toBeVisible();
  });
});
