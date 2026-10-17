import { test, expect } from '@playwright/test';

test.describe('Simulated Parcel Tracking Flow', () => {
  test('looks up seeded demo parcel DEMO-TRK-001 through plan execution with honest simulated disclaimers', async ({
    page,
    request,
  }) => {
    // 1. Direct API verification: verify seeded parcel details and explicit simulated warnings
    const validRes = await request.get('/api/parcels?tracking_number=DEMO-TRK-001');
    expect(validRes.status()).toBe(200);
    const validJson = await validRes.json();
    expect(validJson.simulated).toBe(true);
    expect(validJson.warning).toContain('[SIMULATED DATA]');
    expect(validJson.warning).toContain('No real carrier APIs were called');
    expect(validJson.parcel.tracking_number).toBe('DEMO-TRK-001');
    expect(validJson.parcel.status).toBe('in_transit');

    // 2. Direct API verification: unknown tracking number returns honest 404
    const unknownRes = await request.get('/api/parcels?tracking_number=UNKNOWN-PARCEL-999');
    expect(unknownRes.status()).toBe(404);
    const unknownJson = await unknownRes.json();
    expect(unknownJson.simulated).toBe(true);
    expect(unknownJson.warning).toContain('No demo parcel found with this tracking number');

    // 3. Natural-language flow: submit parcel inquiry through assistant
    await page.route('**/api/approve', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: `test-parcel-session-${Date.now()}`,
          plan_id: 'test-parcel-plan',
          overall_status: 'completed',
          summary: 'Looked up parcel status in simulation database.',
          completed_steps: [
            {
              step_index: 0,
              tool_name: 'get_parcel_status',
              description: 'Check tracking status for parcel DEMO-TRK-001',
              result: {
                simulated: true,
                parcel: {
                  tracking_number: 'DEMO-TRK-001',
                  carrier: 'Amazon Logistics (Simulated)',
                  status: 'in_transit',
                  item: 'Kitchen blender',
                },
              },
              disclaimer:
                '[SIMULATED DATA] Parcel record was retrieved from the local simulation database. No live carrier API was called.',
              duration_ms: 22,
            },
          ],
          failed_steps: [],
          pending_steps: [],
        }),
      });
    });

    await page.goto('/new-request');
    const input = page.locator('#new-request');
    await expect(input).toBeVisible();
    await input.fill('Check tracking status for parcel DEMO-TRK-001');
    await page.getByRole('button', { name: 'Generate Action Plan' }).click();


    // 4. Verify plan page displays parcel status tool and arguments
    await page.waitForURL('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Review the details.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Check status for parcel DEMO-TRK-001/ })).toBeVisible();
    await expect(page.locator('pre').filter({ hasText: 'DEMO-TRK-001' })).toBeVisible();


    // 5. Approve plan
    await page.getByRole('button', { name: 'Approve & Execute Plan' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Confirm Approval & Run' }).click();


    // 6. Wait for execution completion and proceed to Results Receipt
    await expect(page).toHaveURL(/\/execution/);
    const viewResultsLink = page.getByRole('link', { name: 'View Detailed Results Receipt' });
    await expect(viewResultsLink).toBeVisible({ timeout: 15000 });
    await viewResultsLink.click();

    // 7. On Results Receipt, confirm honest simulated disclaimer is prominently displayed
    await page.waitForURL('/results');
    await expect(page.getByRole('heading', { level: 1, name: 'Verified Execution Results' })).toBeVisible();
    await expect(page.getByText('get_parcel_status', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/\[SIMULATED DATA\] Parcel record was retrieved/).first()).toBeVisible();


  });
});

