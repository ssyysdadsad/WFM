import { expect, test } from '@playwright/test';
import { loginToApp } from './helpers/auth';

test('调班审批页面对已处理记录显示幂等错误', async ({ page }) => {
  test.setTimeout(60_000);

  await loginToApp(page);
  await page.getByRole('menuitem', { name: '调班审批' }).click();
  await expect(page.getByRole('heading', { name: '调班审批' })).toBeVisible({ timeout: 15_000 });

  const processedRow = page
    .locator('.ant-table-tbody > tr')
    .filter({ hasText: '已通过' })
    .first();

  test.skip((await processedRow.count()) === 0, '当前没有已处理调班记录，无法验证幂等错误');

  await expect(processedRow).toBeVisible();
  await processedRow.getByRole('button', { name: '通过' }).click();

  const confirmDialog = page.getByRole('dialog', { name: '确认通过' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByPlaceholder('审批意见（选填）').fill('playwright guard validation');
  await confirmDialog.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('该调班申请已处理，禁止重复审批')).toBeVisible();
  await expect(confirmDialog).toBeHidden();
  await expect(processedRow).toContainText('已通过');
});
