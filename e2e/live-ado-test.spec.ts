import { test, expect } from '@playwright/test';

/**
 * Live integration tests.
 *
 * Test 1: UI create flow (localStorage adapter, no backend needed)
 * Test 2: ADO adapter round trip (requires az CLI login)
 */

test.describe('Live Integration Tests', () => {

  test('Create issue through Traklet UI form', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open widget
    page.locator('[data-testid="traklet-toggle"]').click();
    await page.waitForTimeout(1000);

    // Navigate to create
    await page.evaluate(() => {
      document.querySelector('traklet-widget')?.dispatchEvent(
        new CustomEvent('navigate', { detail: { view: 'create' }, bubbles: true, composed: true })
      );
    });
    await page.waitForTimeout(1000);

    // Fill form
    const title = 'E2E Test Issue - ' + new Date().toISOString().slice(0, 16);
    await page.locator('[data-testid="traklet-input-title"]').fill(title);
    await page.locator('[data-testid="traklet-input-body"]').fill(
      'Created via E2E test.\n\n1. Step one\n2. Step two\n\n**Expected:** Issue created.'
    );
    await page.locator('[data-testid="traklet-select-priority"]').selectOption('high');

    const labelInput = page.locator('[data-testid="traklet-input-labels"]');
    await labelInput.fill('e2e-test');
    await labelInput.press('Enter');

    // Submit
    await page.locator('[data-testid="traklet-btn-submit"]').click();
    await page.waitForTimeout(2000);

    // Go back to list
    const backBtn = page.locator('[data-testid="traklet-btn-back"]');
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify issue in list
    const found = await page.evaluate(() => {
      const w = document.querySelector('traklet-widget');
      const list = w?.shadowRoot?.querySelector('traklet-issue-list');
      const items = list?.shadowRoot?.querySelectorAll('[data-testid="traklet-issue-item"]');
      if (!items) return false;
      return Array.from(items).some(el => el.textContent?.includes('E2E Test Issue'));
    });

    expect(found).toBe(true);
  });

  test('Click issue navigates to detail with content', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Open widget
    page.locator('[data-testid="traklet-toggle"]').click();
    await page.waitForTimeout(1000);

    // Click first issue
    await page.evaluate(() => {
      const w = document.querySelector('traklet-widget');
      const list = w?.shadowRoot?.querySelector('traklet-issue-list');
      const item = list?.shadowRoot?.querySelector('[data-testid="traklet-issue-item"]');
      (item as HTMLElement)?.click();
    });
    await page.waitForTimeout(2000);

    // Verify detail view has content (not just spinner)
    const hasContent = await page.evaluate(() => {
      const w = document.querySelector('traklet-widget');
      const detail = w?.shadowRoot?.querySelector('traklet-issue-detail');
      const header = detail?.shadowRoot?.querySelector('[data-testid="traklet-detail-header"]');
      return !!header;
    });

    expect(hasContent).toBe(true);
  });
});
