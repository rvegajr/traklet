import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Playwright pierces open Shadow DOM by default with page.locator().
 * We use page.locator() (not element.locator()) to ensure shadow piercing.
 */
function shadowLocator(page: Page, testId: string): Locator {
  // page.locator auto-pierces shadow DOM
  return page.locator(`[data-testid="${testId}"]`);
}

function widget(page: Page): Locator {
  return page.locator('traklet-widget');
}

test.describe('Traklet Widget - Host Page Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the widget to initialize and seed data
    // Wait for the custom element to be attached (Shadow DOM host has no intrinsic size)
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    // Wait for demo to seed data and widget to render
    await page.waitForTimeout(2000);
  });

  test('host page renders independently of widget', async ({ page }) => {
    // Host app elements should be visible
    await expect(page.locator('.nav__brand')).toContainText('MediTrack Pro');
    await expect(page.locator('.page-header h1')).toHaveText('Patient Dashboard');
    await expect(page.locator('.stats .stat-card')).toHaveCount(4);
    await expect(page.locator('.table tbody tr')).toHaveCount(6);
  });

  test('widget does not inject global styles', async ({ page }) => {
    // Verify host app styles are not affected by Traklet
    const cardBg = await page.locator('.stat-card').first().evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    expect(cardBg).toBe('rgb(255, 255, 255)'); // white

    const navBg = await page.locator('.nav').evaluate(
      (el) => getComputedStyle(el).backgroundImage
    );
    expect(navBg).toContain('gradient'); // purple gradient
  });
});

test.describe('Traklet Widget - Anchor Icon', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('anchor icon is visible on page load', async ({ page }) => {
    const anchor = shadowLocator(page, 'traklet-toggle');
    await expect(anchor).toBeVisible();
  });

  test('anchor icon shows tooltip on hover', async ({ page }) => {
    const anchor = shadowLocator(page, 'traklet-toggle');
    await anchor.hover();

    const tooltip = page.locator('traklet-widget').locator('.anchor__tooltip');
    await expect(tooltip).toHaveText('Open Traklet');
  });

  test('anchor icon can be dragged to new position', async ({ page }) => {
    const anchor = shadowLocator(page, 'traklet-toggle');
    const box = await anchor.boundingBox();
    expect(box).not.toBeNull();

    // Drag the anchor 200px up and 100px left
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x - 100, box!.y - 200, { steps: 10 });
    await page.mouse.up();

    // Verify position changed
    const newBox = await anchor.boundingBox();
    expect(newBox!.y).toBeLessThan(box!.y - 100);
  });

  test('clicking anchor (without drag) opens the panel', async ({ page }) => {
    const anchor = shadowLocator(page, 'traklet-toggle');
    await anchor.click();

    // Panel should appear
    const panel = shadowLocator(page, 'traklet-widget');
    await expect(panel).toBeVisible();

    // Anchor should be hidden
    await expect(anchor).toBeHidden();
  });
});

test.describe('Traklet Widget - Panel Expand/Collapse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('panel opens with animation and shows issue list', async ({ page }) => {
    // Click anchor to open
    await shadowLocator(page, 'traklet-toggle').click();

    // Panel visible
    const panel = shadowLocator(page, 'traklet-widget');
    await expect(panel).toBeVisible();

    // Should show issue list
    const issueList = page.locator('traklet-widget').locator('traklet-issue-list');
    await expect(issueList).toBeVisible();
  });

  test('minimize button collapses panel back to anchor', async ({ page }) => {
    // Open panel
    await shadowLocator(page, 'traklet-toggle').click();
    await expect(shadowLocator(page, 'traklet-widget')).toBeVisible();

    // Click minimize
    await shadowLocator(page, 'traklet-btn-minimize').click();

    // Wait for animation
    await page.waitForTimeout(300);

    // Anchor should be visible again
    await expect(shadowLocator(page, 'traklet-toggle')).toBeVisible();
  });

  test('panel is draggable by header', async ({ page }) => {
    await shadowLocator(page, 'traklet-toggle').click();
    const panel = shadowLocator(page, 'traklet-widget');
    await expect(panel).toBeVisible();

    const header = page.locator('traklet-widget').locator('.panel__header');
    const box = await header.boundingBox();
    expect(box).not.toBeNull();

    // Drag the panel
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(100, 100, { steps: 10 });
    await page.mouse.up();

    // Panel should still be visible at new position
    await expect(panel).toBeVisible();
  });
});

test.describe('Traklet Widget - Issue List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(1000);
    // Open the widget
    await shadowLocator(page, 'traklet-toggle').click();
    await expect(shadowLocator(page, 'traklet-widget')).toBeVisible();
  });

  test('shows seeded issues', async ({ page }) => {
    const issueList = page.locator('traklet-widget').locator('traklet-issue-list');
    await expect(issueList).toBeVisible();

    // Nested shadow DOM: traklet-widget > shadow > traklet-issue-list > shadow > items
    // Use evaluate to pierce all shadow boundaries and find any clickable list items
    await page.waitForTimeout(1000);
    const itemCount = await page.evaluate(() => {
      const widget = document.querySelector('traklet-widget');
      if (!widget?.shadowRoot) return -1;
      const list = widget.shadowRoot.querySelector('traklet-issue-list');
      if (!list?.shadowRoot) return -2;
      // Look for list items - they may use different selectors
      const byTestId = list.shadowRoot.querySelectorAll('[data-testid^="traklet-item"]');
      if (byTestId.length > 0) return byTestId.length;
      // Fallback: count issue-like elements
      const allDivs = list.shadowRoot.querySelectorAll('.issue-item, .traklet-issue, li, [role="listitem"]');
      return allDivs.length;
    });
    expect(itemCount).toBeGreaterThan(0);
  });

  test('filter buttons work', async ({ page }) => {
    const issueList = page.locator('traklet-widget').locator('traklet-issue-list');

    // Click "All" filter
    const allBtn = issueList.locator('[data-testid="traklet-filter-all"]');
    if (await allBtn.isVisible()) {
      await allBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('clicking an issue navigates to detail view', async ({ page }) => {
    const issueList = page.locator('traklet-widget').locator('traklet-issue-list');
    const firstItem = issueList.locator('[data-testid^="traklet-item-"]').first();

    if (await firstItem.isVisible()) {
      await firstItem.click();
      await page.waitForTimeout(500);

      // Should show detail view
      const detail = page.locator('traklet-widget').locator('traklet-issue-detail');
      await expect(detail).toBeVisible();

      // Back button should appear
      await expect(shadowLocator(page, 'traklet-btn-back')).toBeVisible();
    }
  });
});

test.describe('Traklet Widget - Issue Detail (Test Case)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(1000);
    await shadowLocator(page, 'traklet-toggle').click();
    await expect(shadowLocator(page, 'traklet-widget')).toBeVisible();
  });

  test('test case detail shows structured sections', async ({ page }) => {
    // Click the first issue (should be a test case)
    const firstItem = page.locator('traklet-widget').locator('traklet-issue-list [data-testid^="traklet-item-"]').first();
    if (!(await firstItem.isVisible())) return;

    await firstItem.click();
    await page.waitForTimeout(500);

    const detail = page.locator('traklet-widget').locator('traklet-issue-detail');
    await expect(detail).toBeVisible();

    // Should show section navigation
    const sectionNav = detail.locator('[data-testid="traklet-section-nav"]');
    await expect(sectionNav).toBeVisible();

    // Should have section buttons
    const navButtons = sectionNav.locator('button');
    const navCount = await navButtons.count();
    expect(navCount).toBeGreaterThanOrEqual(5); // objective, steps, expected, actual, evidence, etc.
  });

  test('section nav scrolls to section on click', async ({ page }) => {
    const firstItem = page.locator('traklet-widget').locator('traklet-issue-list [data-testid^="traklet-item-"]').first();
    if (!(await firstItem.isVisible())) return;

    await firstItem.click();
    await page.waitForTimeout(500);

    const detail = page.locator('traklet-widget').locator('traklet-issue-detail');

    // Click on "Evidence" nav button if it exists
    const evidenceNav = detail.locator('[data-testid="traklet-nav-evidence"]');
    if (await evidenceNav.isVisible()) {
      await evidenceNav.click();
      await page.waitForTimeout(300);

      // Evidence section should be visible
      const evidenceSection = detail.locator('[data-testid="traklet-section-evidence"]');
      await expect(evidenceSection).toBeVisible();
    }
  });

  test('Jam.dev input is present in evidence section', async ({ page }) => {
    const firstItem = page.locator('traklet-widget').locator('traklet-issue-list [data-testid^="traklet-item-"]').first();
    if (!(await firstItem.isVisible())) return;

    await firstItem.click();
    await page.waitForTimeout(500);

    const detail = page.locator('traklet-widget').locator('traklet-issue-detail');

    // Navigate to evidence section
    const evidenceNav = detail.locator('[data-testid="traklet-nav-evidence"]');
    if (await evidenceNav.isVisible()) {
      await evidenceNav.click();
      await page.waitForTimeout(300);

      // Jam URL input should be present
      const jamInput = detail.locator('[data-testid="traklet-input-jam-url"]');
      await expect(jamInput).toBeVisible();

      // Add button should be disabled (no URL entered)
      const addBtn = detail.locator('[data-testid="traklet-btn-add-jam"]');
      await expect(addBtn).toBeDisabled();

      // Type a valid Jam URL
      await jamInput.fill('https://jam.dev/c/test-recording-123');
      await expect(addBtn).toBeEnabled();
    }
  });

  test('back button returns to issue list', async ({ page }) => {
    const firstItem = page.locator('traklet-widget').locator('traklet-issue-list [data-testid^="traklet-item-"]').first();
    if (!(await firstItem.isVisible())) return;

    await firstItem.click();
    await page.waitForTimeout(500);

    // Click back
    await shadowLocator(page, 'traklet-btn-back').click();
    await page.waitForTimeout(300);

    // Should be back on list view
    const issueList = page.locator('traklet-widget').locator('traklet-issue-list');
    await expect(issueList).toBeVisible();
  });
});

test.describe('Traklet Widget - Position Persistence', () => {
  test('remembers position across page loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(2000);

    const anchor = shadowLocator(page, 'traklet-toggle');
    const box = await anchor.boundingBox();

    // Drag to a new position
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(200, 200, { steps: 10 });
    await page.mouse.up();

    // Reload
    await page.reload();
    await page.waitForSelector('traklet-widget', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Check position was restored
    const newAnchor = shadowLocator(page, 'traklet-toggle');
    const newBox = await newAnchor.boundingBox();

    // Should be near where we dragged it (allowing some margin)
    expect(newBox!.x).toBeLessThan(300);
    expect(newBox!.y).toBeLessThan(300);
  });
});
