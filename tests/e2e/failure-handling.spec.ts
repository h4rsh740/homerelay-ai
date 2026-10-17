import { test, expect } from '@playwright/test';

test.describe('Failure Handling and Recovery Flow', () => {
  test('handles execution error with descriptive alert and retry button', async ({ page }) => {
    const planId = `failure-test-plan-${Date.now()}`;

    // Mock plan generation
    await page.route('**/api/plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plan_id: planId,
          status: 'pending_approval',
          created_at: new Date().toISOString(),
          plan: {
            summary: 'Chore coordination plan',
            estimated_duration_seconds: 5,
            steps: [
              {
                step_index: 0,
                tool_name: 'create_task',
                description: 'Organize household supplies',
                tool_input: { title: 'Organize household supplies' },
              },
            ],
          },
        }),
      });
    });

    let attemptCount = 0;
    // On first execution attempt, return 500 error; on second, return success
    await page.route('**/api/approve', async (route) => {
      attemptCount++;
      if (attemptCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'MCP Gateway Timeout: failed to reach household MCP worker daemon.',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session_id: 'retry-session-ok',
            plan_id: planId,
            overall_status: 'completed',
            summary: 'Action completed after retry.',
            completed_steps: [
              {
                step_index: 0,
                tool_name: 'create_task',
                description: 'Organize household supplies',
                result: { id: 'task-recovered-1' },
                duration_ms: 18,
              },
            ],
            failed_steps: [],
            pending_steps: [],
          }),
        });
      }
    });

    // 1. Submit request
    await page.goto('/new-request');
    const input = page.locator('#new-request');
    await input.fill('Organize household supplies');
    await page.getByRole('button', { name: 'Generate Action Plan' }).click();

    // 2. Review and approve plan
    await page.waitForURL('/plan');
    await page.getByRole('button', { name: 'Approve & Execute Plan' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Confirm Approval & Run' }).click();

    // 3. Execution screen shows error alert and retry button
    await page.waitForURL('/execution');
    const alertBanner = page.getByRole('alert').filter({ hasText: 'Execution error' });
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText('MCP Gateway Timeout');

    // 4. Click Retry Execution and verify recovery
    const retryButton = alertBanner.getByRole('button', { name: 'Retry Execution' });
    await expect(retryButton).toBeVisible();
    await retryButton.click();

    // 5. Verify successful recovery after retry
    const viewResultsLink = page.getByRole('link', { name: 'View Detailed Results Receipt' });
    await expect(viewResultsLink).toBeVisible({ timeout: 15000 });
  });

  test('records partial failures accurately in ledger without misreporting failed actions as completed', async ({ page }) => {
    const planId = `partial-fail-plan-${Date.now()}`;

    // Mock plan generation
    await page.route('**/api/plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plan_id: planId,
          status: 'pending_approval',
          created_at: new Date().toISOString(),
          plan: {
            summary: 'Multi-action routine',
            estimated_duration_seconds: 6,
            steps: [
              {
                step_index: 0,
                tool_name: 'create_task',
                description: 'Water indoor plants',
                tool_input: { title: 'Water indoor plants' },
              },
              {
                step_index: 1,
                tool_name: 'schedule_reminder',
                description: 'Remind to fertilize soil',
                tool_input: { message: 'Fertilize soil', remind_at: '2026-11-01T10:00' },
              },
            ],
          },
        }),
      });
    });

    // Mock approve returning partial failure
    await page.route('**/api/approve', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: 'session-partial-123',
          plan_id: planId,
          overall_status: 'partial_failure',
          summary: '1 step succeeded, 1 step failed.',
          completed_steps: [
            {
              step_index: 0,
              tool_name: 'create_task',
              description: 'Water indoor plants',
              status: 'completed',
              result: { id: 'task-ok-1' },
              duration_ms: 12,
            },
          ],
          failed_steps: [
            {
              step_index: 1,
              tool_name: 'schedule_reminder',
              description: 'Remind to fertilize soil',
              status: 'failed',
              error_message: 'MCP Tool Error: reminder daemon refused connection',
            },
          ],
          pending_steps: [],
        }),
      });
    });


    // 1. Submit request and approve
    await page.goto('/new-request');
    const input = page.locator('#new-request');
    await input.fill('Water indoor plants and remind to fertilize soil');
    await page.getByRole('button', { name: 'Generate Action Plan' }).click();

    await page.waitForURL('/plan');
    await page.getByRole('button', { name: 'Approve & Execute Plan' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Confirm Approval & Run' }).click();

    // 2. On Execution screen, verify partial failure status and step breakdown
    await page.waitForURL('/execution');
    await expect(page.getByRole('heading', { level: 2, name: 'Completed with partial failures.' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Partial failure').first()).toBeVisible();
    await expect(page.getByText('Error: MCP Tool Error: reminder daemon refused connection')).toBeVisible();

    // 3. Navigate to Results Receipt
    const viewResultsLink = page.getByRole('link', { name: 'View Detailed Results Receipt' });
    await expect(viewResultsLink).toBeVisible();
    await viewResultsLink.click();

    // 4. On Results Receipt, confirm failed action is segregated and never claimed as completed
    await page.waitForURL('/results');
    await expect(page.getByRole('heading', { level: 1, name: 'Verified Execution Results' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Completed Actions (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Failed Actions (1)' })).toBeVisible();

    // Failed step is shown under Failed Actions with its error message
    await expect(page.getByRole('heading', { level: 3, name: 'Remind to fertilize soil' })).toBeVisible();
    await expect(page.getByText('Error: MCP Tool Error: reminder daemon refused connection').first()).toBeVisible();
  });
});


