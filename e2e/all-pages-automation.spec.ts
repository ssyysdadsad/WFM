import { expect, test } from '@playwright/test';
import { loginToApp } from './helpers/auth';

const testRunId = Date.now().toString().slice(-6);

test.describe('全页面批量接口全自动测试', () => {
  test.beforeEach(async ({ page }) => {
    await loginToApp(page);
  });

  test('1. 字典管理 - 批量读取及写入测试', async ({ page }) => {
    page.on('response', async (response) => {
      if (response.url().includes('/rest/v1/') && response.status() >= 400) {
        console.error(`[API ERROR] ${response.url()} -> ${response.status()}`);
        console.error(await response.text().catch(() => 'No Body'));
      }
    });

    await page.getByRole('menuitem', { name: '字典管理' }).click();
    await expect(page.getByText('字典管理').first()).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();

    const addTypeBtn = page.getByRole('button', { name: '新增' }).first();
    await addTypeBtn.click();
    const typeModalTitle = page.getByText('新增字典类型').first();
    await expect(typeModalTitle).toBeVisible();

    await page.getByLabel('类型编码').fill(`AUTO_TYPE_${testRunId}`);
    await page.getByLabel('类型名称').fill(`自动化测试字典${testRunId}`);
    await page.getByRole('button', { name: 'OK' }).click();
    
    try {
      await expect(typeModalTitle).toBeHidden({ timeout: 10_000 });
    } catch {
      const errors = await page.locator('.ant-form-item-explain-error').allTextContents();
      const popups = await page.locator('.ant-message-error').allTextContents();
      throw new Error(`字典类型保存失败: validation=[${errors.join(', ')}], popup=[${popups.join(', ')}]`);
    }
    
    // 选中新字典测试字典项新增
    await page.getByText(`AUTO_TYPE_${testRunId}`).click();
    
    const addItemBtn = page.getByRole('button', { name: '新增' }).nth(1);
    await addItemBtn.click();
    const itemModalTitle = page.getByText('新增字典项').first();
    await expect(itemModalTitle).toBeVisible();
    
    await page.getByLabel('编码', { exact: true }).fill(`ITEM_1`);
    await page.getByLabel('名称', { exact: true }).fill(`项1`);
    await page.getByRole('button', { name: 'OK' }).click();
    
    try {
      await expect(itemModalTitle).toBeHidden({ timeout: 10_000 });
    } catch {
      const errors = await page.locator('.ant-form-item-explain-error').allTextContents();
      const popups = await page.locator('.ant-message-error').allTextContents();
      throw new Error(`字典项保存失败: validation=[${errors.join(', ')}], popup=[${popups.join(', ')}]`);
    }
  });

  test('2. 组织架构与基础数据 - 部门读取与写入', async ({ page }) => {
    page.on('response', async (response) => {
      if (response.url().includes('/rest/v1/') && response.status() >= 400) {
        console.error(`[API ERROR] ${response.url()} -> ${response.status()}`);
        console.error(await response.text().catch(() => 'No Body'));
      }
    });

    await page.getByRole('menuitem', { name: '部门管理' }).click();
    await expect(page.getByText('部门管理').first()).toBeVisible();

    const addBtn = page.getByRole('button', { name: '新增' });
    await addBtn.click();
    
    const deptModalTitle = page.getByText('新增部门管理').first(); 
    await expect(deptModalTitle).toBeVisible();

    await page.getByLabel('部门编码').fill(`AUTO_DEPT_${testRunId}`);
    await page.getByLabel('部门名称').fill('自动测试部门');
    await page.getByRole('button', { name: 'OK' }).click();
    
    try {
      await expect(deptModalTitle).toBeHidden({ timeout: 10_000 });
    } catch {
      const errors = await page.locator('.ant-form-item-explain-error').allTextContents();
      const popups = await page.locator('.ant-message-error').allTextContents();
      throw new Error(`部门保存失败: validation=[${errors.join(', ')}], popup=[${popups.join(', ')}]`);
    }
  });

  test('3. 报表与看板 - API探测(纯读)', async ({ page }) => {
     await page.getByRole('menuitem', { name: '统计报表' }).click();
     await expect(page.getByRole('tab', { name: '员工工时画像' })).toBeVisible();
     await page.getByRole('tab', { name: '任务与设备' }).click();
     await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15_000 });
  });

});
