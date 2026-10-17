import { test, expect } from '@playwright/test';

test.describe('Task Management Flow', () => {
  test('creates a task, marks it completed, verifies persistence across reload, and deletes it', async ({ page }) => {
    const taskTitle = `Clean air intake ${Date.now()}`;
    const taskDetails = 'Check filters in the master hallway';

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks', exact: true })).toBeVisible();

    // 1. Validation test: button is disabled when title is empty
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('#task-title')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Task' })).toBeDisabled();

    // 2. Create valid task
    await page.locator('#task-title').fill(taskTitle);
    await expect(page.getByRole('button', { name: 'Save Task' })).toBeEnabled();
    await page.locator('#task-priority').selectOption('high');
    await page.locator('#task-description').fill(taskDetails);
    await page.getByRole('button', { name: 'Save Task' }).click();

    // 3. Verify task appears in task board and notice banner is shown
    await expect(page.getByRole('status')).toContainText(`Task "${taskTitle}" saved to database.`);
    const taskArticle = page.getByRole('article').filter({ hasText: taskTitle });
    await expect(taskArticle).toBeVisible();
    await expect(taskArticle.getByRole('heading', { name: taskTitle })).toBeVisible();
    await expect(taskArticle).toContainText('High priority');

    // 4. Complete the task
    const completeButton = taskArticle.getByRole('button', { name: `Mark ${taskTitle} complete` });
    await expect(completeButton).toBeVisible();
    await completeButton.click();

    // Verify task is now marked completed and server update confirmed
    await expect(page.getByRole('status')).toContainText(`Marked "${taskTitle}" as completed.`);
    await expect(taskArticle.getByRole('button', { name: `Reopen ${taskTitle}` })).toBeVisible();
    await expect(taskArticle.getByRole('heading', { name: taskTitle })).toHaveClass(/line-through/);

    // 5. Reload the page and confirm persistence
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks', exact: true })).toBeVisible();
    const persistedArticle = page.getByRole('article').filter({ hasText: taskTitle });
    await expect(persistedArticle).toBeVisible();
    await expect(persistedArticle.getByRole('button', { name: `Reopen ${taskTitle}` })).toBeVisible();

    // 6. Test task deletion
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(`Delete task "${taskTitle}"?`);
      await dialog.accept();
    });

    const deleteButton = persistedArticle.getByRole('button', { name: `Remove ${taskTitle}` });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Verify task is removed from UI
    await expect(page.getByRole('article').filter({ hasText: taskTitle })).not.toBeVisible();
    await expect(page.getByRole('status')).toContainText(`Deleted task "${taskTitle}".`);
  });
});
