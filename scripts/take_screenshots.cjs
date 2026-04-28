const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

(async () => {
  console.log("Starting screenshot session...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log("Navigating to AlphaTrader...");
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Wait for the app to be ready
    console.log("Waiting for app to initialize...");
    await page.waitForSelector('.main-layout', { timeout: 45000 });
    await page.waitForTimeout(5000); // Give time for full load

    // 1. Terminal Main
    console.log("Capturing Terminal Main...");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'terminal_main.png') });

    // 2. Open Sidebar to ensure visibility
    console.log("Expanding sidebar...");
    const sidebarToggle = page.locator('div:has-text("ALPHATRADER")').first();
    await sidebarToggle.click().catch(() => console.log("Branding click failed, trying alternative..."));

    // 3. News Edge
    console.log("Capturing News Edge...");
    // Direct selector for sidebar items
    await page.locator('.sidebar-item').nth(1).click(); // 2nd item is News
    await page.waitForTimeout(3000); 
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'news_edge.png') });

    // 4. Alpha Scanner
    console.log("Capturing Alpha Scanner...");
    await page.locator('.sidebar-item').nth(2).click(); // 3rd item is Scanner
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'alpha_scanner.png') });

    // 5. Market Detail
    console.log("Capturing Market Detail...");
    await page.locator('.sidebar-item').nth(0).click(); // 1st item is Terminal
    await page.waitForTimeout(2000);
    // Click first market row to open detail 
    const marketRow = page.locator('tr.mkt-row').first();
    if (await marketRow.count() > 0) {
        await marketRow.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'market_detail.png') });
    }

    console.log("Screenshots captured successfully in /screenshots directory.");

  } catch (err) {
    console.error("Error during screenshot session:", err);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error_state.png') });
  } finally {
    await browser.close();
  }
})();
