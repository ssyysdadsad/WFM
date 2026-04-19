import { expect, test, type Page } from '@playwright/test';

export async function loginToApp(page: Page) {
  const supabaseEmail = process.env.E2E_SUPABASE_EMAIL;
  const supabasePassword = process.env.E2E_SUPABASE_PASSWORD;

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('WFM 后台登录')).toBeVisible();

  const loginButton = page.getByRole('button', { name: '登录系统' });
  const mockEntryButton = page.getByRole('button', { name: '进入系统' }).first();
  const workbench = page.getByText('工作台');

  if (await loginButton.isVisible().catch(() => false)) {
    test.skip(!supabaseEmail || !supabasePassword, 'supabase 模式需要 E2E_SUPABASE_EMAIL 和 E2E_SUPABASE_PASSWORD');

    await page.getByRole('textbox', { name: '邮箱' }).fill(supabaseEmail!);
    await page.getByRole('textbox', { name: '密码' }).fill(supabasePassword!);

    await loginButton.click();
    
    // 等待或者出现目标
    try {
      await expect(workbench).toBeVisible({ timeout: 20_000 });
      return;
    } catch {
      const errorAlert = page.locator('.ant-alert-message').first();
      if (await errorAlert.isVisible()) {
        const text = await errorAlert.innerText();
        console.log("LOGIN ERROR ALERT: ", text);
        throw new Error("登录报错: " + text);
      }
      throw new Error("登录超时未跳转到工作台，也未发现明确报错弹窗。");
    }
  } else {
    await expect(mockEntryButton).toBeVisible({ timeout: 10_000 });
    await mockEntryButton.click();
  }

  await expect(workbench).toBeVisible({ timeout: 15_000 });
}
