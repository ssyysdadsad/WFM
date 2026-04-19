import { expect, test } from '@playwright/test';
import { loginToApp } from './helpers/auth';

test('登录并进入核心页面入口', async ({ page }) => {
  await loginToApp(page);
  await expect(page.getByRole('menuitem', { name: '排班版本' })).toBeVisible();
  await page.getByRole('menuitem', { name: '公告管理' }).click();
  await expect(page.getByText('公告管理')).toBeVisible();

  await page.getByRole('menuitem', { name: '统计报表' }).click();
  await expect(page.getByText('统计报表')).toBeVisible();
});
