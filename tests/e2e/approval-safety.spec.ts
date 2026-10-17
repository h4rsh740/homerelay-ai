import { test, expect } from '@playwright/test';

test.describe('Approval Safety and Server Guardrails', () => {
  test('cancels proposed plan from UI and verifies execution is blocked', async ({ page }) => {
    const promptText = 'Set up a high-stakes task';
    const planId = `safety-plan-${Date.now()}`;

    await page.route('**/api/plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plan_id: planId,
          status: 'pending_approval',
          created_at: new Date().toISOString(),
          plan: {
            summary: 'High-stakes maintenance action',
            estimated_duration_seconds: 3,
            steps: [
              {
                step_index: 0,
                tool_name: 'create_task',
                description: 'Reset router config',
                tool_input: { title: 'Reset router', priority: 'high' },
              },
            ],
          },
        }),
      });
    });

    await page.route('**/api/approve', async (route) => {
      const data = JSON.parse(route.request().postData() || '{}');
      if (data.action === 'cancel') {
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
      // If execution was attempted after cancel, reject
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Execution rejected: Plan was cancelled by the user.', code: 'CANCELLED' }),
      });
    });

    // 1. Submit request
    await page.goto('/new-request');
    await page.locator('#new-request').fill(promptText);
    await page.getByRole('button', { name: 'Generate Action Plan' }).click();

    // 2. Arrive on plan review page
    await page.waitForURL('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Review the details.' })).toBeVisible();
    await expect(page.getByText('High-stakes maintenance action')).toBeVisible();

    // 3. Cancel plan
    const cancelButton = page.getByRole('button', { name: 'Cancel Plan' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // 4. Verify cancelled status banner and blocked execution controls
    await expect(page.getByRole('status')).toContainText('Plan was cancelled. No actions were executed.');
    await expect(page.getByText('Cancelled').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & Execute Plan' })).not.toBeVisible();
  });

  test('backend rejects unapproved, non-existent, and cancelled plan execution', async ({ request }) => {
    // 1. Attempt to execute an unapproved plan with a random plan ID
    const randomPlanId = '00000000-0000-0000-0000-000000000000';
    const rejectRes = await request.post('/api/approve', {
      data: {
        plan_id: randomPlanId,
        action: 'approve',
        prompt: 'Test prompt',
        plan: {
          summary: 'Unapproved plan',
          steps: [
            {
              step_index: 0,
              tool_name: 'create_task',
              description: 'Malicious task injection',
              tool_input: { title: 'Unauthorized' },
            },
          ],
        },
      },
    });

    // Server must reject with 404 (plan not found in server registry)
    expect(rejectRes.status()).toBe(404);
    const rejectData = await rejectRes.json();
    expect(rejectData.code).toBe('NOT_FOUND');

    // 2. Generate a real plan via /api/plan
    const planRes = await request.post('/api/plan', {
      data: { prompt: 'Clean the kitchen tomorrow' },
    });
    expect(planRes.status()).toBe(200);
    const { plan_id, plan } = await planRes.json();
    expect(plan_id).toBeTruthy();

    // 3. Explicitly cancel the plan via /api/approve
    const cancelRes = await request.post('/api/approve', {
      data: {
        plan_id,
        action: 'cancel',
        prompt: 'Clean the kitchen tomorrow',
        plan,
      },
    });
    expect(cancelRes.status()).toBe(200);
    const cancelData = await cancelRes.json();
    expect(cancelData.status).toBe('cancelled');

    // 4. Attempt to execute the now-cancelled plan -> must be rejected with 403 CANCELLED
    const postCancelExecRes = await request.post('/api/approve', {
      data: {
        plan_id,
        action: 'approve',
        prompt: 'Clean the kitchen tomorrow',
        plan,
      },
    });
    expect(postCancelExecRes.status()).toBe(403);
    const postCancelData = await postCancelExecRes.json();
    expect(postCancelData.code).toBe('CANCELLED');
  });
});
