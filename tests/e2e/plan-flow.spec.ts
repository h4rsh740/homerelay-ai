import { test, expect } from '@playwright/test';

test.describe('Natural-Language Request and Plan Approval Flow', () => {
  test('submits request, reviews plan and arguments, approves plan, and verifies execution', async ({ page }) => {
    const promptText = 'Clean the kitchen and remind me at 6 PM to turn off oven';
    const planId = `test-plan-${Date.now()}`;
    const sessionId = `test-session-${Date.now()}`;

    // Mock /api/plan to return a deterministic structured plan
    await page.route('**/api/plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plan_id: planId,
          status: 'pending_approval',
          created_at: new Date().toISOString(),
          plan: {
            summary: 'Clean kitchen and schedule reminder',
            estimated_duration_seconds: 4,
            steps: [
              {
                step_index: 0,
                tool_name: 'create_task',
                description: 'Add kitchen cleaning task',
                tool_input: {
                  title: 'Clean the kitchen counters and sink',
                  priority: 'high',
                },
              },
              {
                step_index: 1,
                tool_name: 'schedule_reminder',
                description: 'Schedule oven reminder',
                tool_input: {
                  message: 'Turn off oven',
                  remind_at: '2026-10-18T18:00:00.000Z',
                },
              },
            ],
          },
        }),
      });
    });

    // Mock /api/approve to return successful execution report
    await page.route('**/api/approve', async (route) => {
      const requestData = JSON.parse(route.request().postData() || '{}');
      if (requestData.action === 'cancel') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            status: 'cancelled',
            message: 'Plan approval was cancelled by user. No actions were executed.',
            plan_id: planId,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: sessionId,
          plan_id: planId,
          overall_status: 'completed',
          summary: 'Executed 2 household actions successfully via MCP.',
          completed_steps: [
            {
              step_index: 0,
              tool_name: 'create_task',
              description: 'Add kitchen cleaning task',
              result: { id: 'task-mock-1', title: 'Clean the kitchen counters and sink', status: 'pending' },
              duration_ms: 15,
            },
            {
              step_index: 1,
              tool_name: 'schedule_reminder',
              description: 'Schedule oven reminder',
              result: { id: 'rem-mock-1', message: 'Turn off oven', is_sent: false },
              duration_ms: 12,
            },
          ],
          failed_steps: [],
          pending_steps: [],
        }),
      });
    });

    // 1. Submit request from the Dashboard command center
    await page.goto('/');
    const commandInput = page.locator('#household-command');
    await expect(commandInput).toBeVisible();

    const submitButton = page.getByRole('button', { name: 'Generate & Review Plan' });
    await expect(submitButton).toBeDisabled();

    await commandInput.fill(promptText);
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // 2. Navigates to /plan and displays structured plan
    await page.waitForURL('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Review the details.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Clean kitchen and schedule reminder' })).toBeVisible();
    await expect(page.getByText(`“${promptText}”`)).toBeVisible();
    await expect(page.getByText('Pending Approval')).toBeVisible();

    // 3. Verify proposed actions and their parameters
    const stepsList = page.locator('ol[aria-label="Planned action steps"]');
    await expect(stepsList).toBeVisible();
    await expect(stepsList.getByText('Add kitchen cleaning task')).toBeVisible();
    await expect(stepsList.getByText('create_task')).toBeVisible();
    await expect(stepsList.getByText('Schedule oven reminder')).toBeVisible();
    await expect(stepsList.getByText('schedule_reminder')).toBeVisible();

    // 4. Open approval modal
    const approveButton = page.getByRole('button', { name: 'Approve & Execute Plan' });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Confirm Plan Approval')).toBeVisible();
    await expect(dialog.getByText('You are explicitly authorizing HomeRelay to execute 2 actions via the MCP server.')).toBeVisible();

    // 5. Confirm approval
    await dialog.getByRole('button', { name: 'Confirm Approval & Run' }).click();
    await expect(dialog).not.toBeVisible();

    // 6. Execution screen starts and executes
    await page.waitForURL('/execution');
    await expect(page.getByRole('heading', { level: 1, name: 'Real-time Execution Ledger' })).toBeVisible();
    const executionList = page.getByRole('list', { name: 'Execution steps' });
    await expect(executionList.getByText('Add kitchen cleaning task')).toBeVisible();
    await expect(executionList.getByText('Schedule oven reminder')).toBeVisible();

    // 7. View results page
    await page.getByRole('link', { name: /View Detailed Results Receipt/i }).click();
    await page.waitForURL('/results');
    await expect(page.getByRole('heading', { level: 1, name: 'Verified Execution Results' })).toBeVisible();
    await expect(page.getByText('Executed 2 household actions successfully via MCP.')).toBeVisible();
    await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('actions completed')).toBeVisible();
  });
});
