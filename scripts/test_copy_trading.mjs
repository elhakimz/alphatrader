import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- STARTING COPY TRADING TEST ---');

  try {
    // 1. Navigate to app
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for loading screen to disappear
    console.log('Waiting for app to load...');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 30000 });
    await page.screenshot({ path: 'initial_load.png' });
    
    // 2. Click Copy Trading in sidebar
    console.log('Selecting Copy Trading tab (nth-3)...');
    const copySidebarItem = page.locator('.sidebar-item').nth(3);
    await copySidebarItem.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'copy_trading_tab.png' });

    // 3. Switch to DISCOVER tab
    console.log('Switching to DISCOVER tab...');
    // Find button inside the header area
    const discoverBtn = page.locator('button:has-text("DISCOVER")');
    await discoverBtn.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'discover_tab.png' });

    // 4. Verify Leaderboard
    console.log('Checking Leaderboard...');
    // Use a partial match for the header
    const leaderboardHeader = await page.locator('h3:has-text("LEADERBOARD")');
    await leaderboardHeader.waitFor({ state: 'visible', timeout: 10000 });
    const headerText = await leaderboardHeader.textContent();
    console.log('✅ Leaderboard Header Found: ' + headerText.trim());

    const wallets = await page.$$('.market-card');
    console.log(`Found ${wallets.length} suggested wallets.`);
    if (wallets.length === 0) throw new Error('❌ No suggested wallets found in leaderboard');

    // 5. Open Profile
    console.log('Opening first wallet profile...');
    await page.click('.market-card button:has-text("PROFILE")');
    await page.waitForTimeout(3000);

    // 6. Verify Profile Modal & Chart
    const modal = page.locator('div[style*="fixed"]').filter({ hasText: "Trader Profile" });
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    
    const profileHeader = await modal.locator('h2').first();
    const profileText = await profileHeader.textContent();
    console.log(`✅ Profile Modal Opened for: ${profileText}`);
    
    // Check for the specific header text in the chart area
    const chartHeader = await modal.locator('div:has-text("EQUITY CURVE (CUMULATIVE PNL)")').last();
    if (await chartHeader.isVisible()) {
      console.log('✅ Equity Curve header visible.');
    } else {
      throw new Error('❌ Equity Curve header NOT found');
    }

    // 7. Test Follow/Unfollow Flow
    console.log('Testing Follow/Unfollow flow...');
    const unfollowBtn = modal.locator('button:has-text("UNFOLLOW")');
    const isFollowing = await unfollowBtn.isVisible();

    if (isFollowing) {
      console.log('Wallet is already followed. Clicking UNFOLLOW to reset...');
      await unfollowBtn.click();
      await page.waitForTimeout(2000);
    }

    console.log('Clicking FOLLOW...');
    const followBtn = modal.locator('button:has-text("FOLLOW")');
    await followBtn.click({ force: true });
    await page.waitForTimeout(3000);
    
    // Check if it changed to UNFOLLOW
    if (await unfollowBtn.isVisible()) {
      console.log('✅ Follow successful (UNFOLLOW button visible)');
    } else {
       console.log('⚠️ UNFOLLOW button not found after follow click');
       await page.screenshot({ path: 'follow_failure_state.png' });
    }

    // 8. Close Modal
    await modal.locator('button:has-text("×")').click();
    await page.waitForTimeout(1000);

    // 9. Check Following Tab
    console.log('Switching to FOLLOWING tab...');
    await page.click('button:has-text("FOLLOWING")');
    await page.waitForTimeout(1000);

    const followingRows = await page.$$('tr');
    console.log(`Found ${followingRows.length - 1} followed wallets.`);
    if (followingRows.length > 1) {
      console.log('✅ Wallet successfully added to Following list.');
    } else {
      throw new Error('❌ Following list is empty');
    }

    console.log('--- TEST COMPLETE: SUCCESS ---');
  } catch (err) {
    console.error('--- TEST FAILED ---');
    console.error(err);
    // Take screenshot on failure
    await page.screenshot({ path: 'copy_trading_test_failure.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
