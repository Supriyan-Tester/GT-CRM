const { test, expect } = require('@playwright/test');

const phone = process.env.GMCRM_E2E_PHONE;
const password = process.env.GMCRM_E2E_PASSWORD;

test.describe('GM-CRM staging browser smoke', () => {
  test('login page loads without browser errors on desktop and mobile', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto('/login.html');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#pw')).toBeVisible();
    await expect(page.locator('#go')).toBeDisabled();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('body')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, 'login page should not overflow horizontally on a mobile viewport').toBeFalsy();
    expect(errors, 'browser JavaScript errors').toEqual([]);
  });

  test('theme toggle switches light and dark modes', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('client-side phone validation blocks malformed input', async ({ page }) => {
    await page.goto('/login.html');
    await page.locator('#phone').fill('123');
    await page.locator('#pw').fill('test-password');
    await page.locator('#form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#msg')).toContainText('valid 10-digit mobile number');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('synthetic staging account can sign in', async ({ page }) => {
    test.skip(!phone || !password, 'Set GMCRM_E2E_PHONE and GMCRM_E2E_PASSWORD for a dedicated staging test account.');
    await page.goto('/login.html');
    await page.locator('#phone').fill(phone);
    await page.locator('#pw').fill(password);
    await expect(page.locator('#go')).toBeEnabled();
    await page.locator('#form').evaluate(form => form.requestSubmit());
    await expect(page).not.toHaveURL(/\/login\.html(?:$|[?#])/ , { timeout: 20000 });
    await expect(page.locator('body')).toBeVisible();
  });
});
