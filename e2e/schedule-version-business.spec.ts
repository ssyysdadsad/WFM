import { expect, test } from '@playwright/test';
import XLSX from 'xlsx';
import { loginToApp } from './helpers/auth';

function buildImportWorkbookBuffer() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['工号', '姓名', '部门', '2026-04-01', '2026-04-02'],
    ['EMP0001', '张晨', '采集运营部', '休', '作业A'],
    ['EMP0002', '李雅', '采集运营部', '训', '休'],
    ['EMP0003', '王敏', '质检部', '作业A', '训'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ImportDemo');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('排班版本页面可完成导入和发布', async ({ page }) => {
  test.setTimeout(90_000);

  page.on('response', async (response) => {
    if (response.url().includes('/rest/v1/') && response.status() >= 400) {
      console.error(`[API ERROR] ${response.url()} -> ${response.status()}`);
      console.error(await response.text().catch(() => 'No Body'));
    }
  });

  await loginToApp(page);
  await page.getByRole('menuitem', { name: '排班版本' }).click();
  await expect(page.getByRole('heading', { name: '排班版本管理' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: '导入 Excel' }).click();
  await expect(page.getByRole('dialog', { name: '导入 Excel' })).toBeVisible();

  await page.getByLabel('项目').click();
  await page.locator('.ant-select-dropdown .ant-select-item-option').first().click();

  await page.getByLabel('排班月份').click();
  await page.getByTitle('2026-04').click();

  await page.getByLabel('导入模式').click();
  await page.getByText('新建导入版本').click();

  const importDialog = page.getByRole('dialog', { name: '导入 Excel' });
  const fileInput = importDialog.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'business-e2e.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: buildImportWorkbookBuffer(),
  });

  await importDialog.getByRole('button', { name: 'OK' }).click();

  const resultDialog = page.getByRole('dialog', { name: '导入结果' });
  try {
    await expect(resultDialog).toBeVisible({ timeout: 10_000 });
  } catch {
    const popups = await page.locator('.ant-message-error').allTextContents();
    throw new Error(`导入结果未弹出，页面可能出错。报错提示: [${popups.join(', ')}]`);
  }
  
  await expect(resultDialog.getByRole('alert')).toContainText('导入成功');
  await expect(resultDialog.getByText('本次导入未发现错误。')).toBeVisible();
  await resultDialog.getByRole('button', { name: 'OK' }).click();
  await expect(resultDialog).toBeHidden();

  const versionRows = page.locator('.ant-table').first().locator('.ant-table-tbody > tr');
  await expect(versionRows.first()).toBeVisible();
  await expect(versionRows.first()).toContainText('2026-04');
  await expect(versionRows.first()).toContainText('Excel');

  await versionRows.first().getByRole('button', { name: '发布' }).click();
  const publishDialog = page.getByRole('dialog', { name: /发布排班版本/ });
  await expect(publishDialog).toBeVisible();
  await publishDialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('发布成功')).toBeVisible();
  await expect(publishDialog).toBeHidden();

  await expect(versionRows.first()).toContainText(/发布|已发布/);

  const batchRow = page.locator('.ant-card .ant-table-tbody > tr').filter({ hasText: 'business-e2e.xlsx' }).first();
  await expect(batchRow).toBeVisible();
  await expect(batchRow).toContainText('completed');
});
