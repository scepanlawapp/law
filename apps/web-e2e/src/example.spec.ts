import { test, expect } from '@playwright/test';

test('shows the sign-in screen for anonymous users', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('Sign in');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('exposes password recovery without authentication', async ({ page }) => {
  await page.goto('/forgot-password');

  await expect(page.locator('h1')).toHaveText('Reset password');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});
