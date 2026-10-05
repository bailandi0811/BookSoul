const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const origin = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || '')) throw new Error('Use a local Vite origin only.');
const imagePath = path.join(root, 'client/public/backgrounds/winter.webp');
const bytes = fs.readFileSync(imagePath);
const out = path.join(root, '.superpowers/profile-media/screenshots');
fs.mkdirSync(out, { recursive: true });
const uid = '10000000-0000-4000-8000-000000000001';
const media = n => ({ id: `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`, url: `https://media.fixture.invalid/${n}.webp`, expiresAt: new Date(Date.now() + 900000).toISOString(), width: 1280, height: 720 });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const user = { id: uid, name: '测试读者', email: 'reader@example.invalid', emailVerifiedAt: null };
      const profile = { user, revision: 0, avatar: media(99), wallpapers: Array.from({ length: 20 }, (_, i) => media(i + 1)), wallpaper: { mode: 'RANDOM' }, mediaUploadsAvailable: true, mediaReadError: null };
      let uploadPurpose = 'AVATAR';
      let directUploads = 0;
      await context.addInitScript(({ user }) => {
        if (!localStorage.getItem('booksoul-auth')) localStorage.setItem('booksoul-auth', JSON.stringify({ version: 2, state: { user, accessToken: 'synthetic-test-token', isAuthenticated: true, guestUserId: 'guest_30000000-0000-4000-8000-000000000001', claimState: 'idle', claimMessage: null } }));
      }, { user });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        return route.abort('blockedbyclient');
      });
      await context.route('https://media.fixture.invalid/**', route => route.fulfill({ contentType: 'image/webp', body: bytes }));
      await context.route('https://upload.fixture.invalid/**', async route => {
        assert.equal(route.request().method(), 'POST');
        assert.equal(route.request().headers().authorization, undefined);
        assert.equal(route.request().headers().cookie, undefined);
        directUploads++;
        await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      });
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        let data;
        if (url.pathname === '/api/users/me/profile') {
          if (method === 'PATCH') {
            const input = request.postDataJSON();
            assert.equal(input.expectedRevision, profile.revision);
            if (input.name) user.name = input.name;
            if (input.wallpaper) profile.wallpaper = input.wallpaper;
            if (input.resetAvatar) profile.avatar = null;
            profile.revision++;
          }
          data = profile;
        } else if (url.pathname === '/api/users/me/media/uploads') {
          uploadPurpose = request.postDataJSON().purpose;
          data = { assetId: media(100).id, uploadExpiresAt: new Date(Date.now() + 300000).toISOString(), commitExpiresAt: new Date(Date.now() + 1800000).toISOString(), upload: { method: 'POST', url: 'https://upload.fixture.invalid/', fields: { key: 'synthetic-test-object', policy: 'synthetic-policy' } } };
        } else if (/\/commit$/.test(url.pathname)) {
          assert.equal(uploadPurpose, 'AVATAR');
          profile.avatar = media(100); profile.revision++;
          data = { alreadyCommitted: false, profile };
        } else if (/\/wallpapers\//.test(url.pathname) && method === 'DELETE') {
          const id = url.pathname.split('/').pop();
          profile.wallpapers = profile.wallpapers.filter(item => item.id !== id);
          if (profile.wallpaper.id === id) profile.wallpaper = { mode: 'RANDOM' };
          profile.revision++;
          data = profile;
        } else if (url.pathname === '/api/auth/me') data = { user };
        else if (url.pathname === '/api/auth/refresh') data = { accessToken: 'synthetic-test-token', user };
        else if (url.pathname === '/api/books') data = [];
        else throw new Error(`Unexpected synthetic API: ${method} ${url.pathname}`);
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      });
      await page.goto(`${origin}/#account`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `${label}-initial.png`), fullPage: true });
      await page.getByRole('textbox', { name: '名称', exact: true }).waitFor();
      await page.getByRole('textbox', { name: '名称', exact: true }).fill('名字很长的阅读爱好者'.repeat(4));
      await page.getByRole('button', { name: '保存名称', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#profile-name')?.value?.length === 40);
      await page.getByLabel('选择头像文件', { exact: true }).setInputFiles(imagePath);
      await page.getByRole('button', { name: '确认上传', exact: true }).click();
      await page.getByRole('button', { name: '恢复默认头像', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.media-preview'));
      assert.equal(directUploads, 1);
      await page.screenshot({ path: path.join(out, `${label}-account.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} account horizontal overflow`);
      await page.getByLabel('选择背景', { exact: true }).click();
      await page.locator('.user-wallpaper-item').last().waitFor();
      assert.equal(await page.locator('.user-wallpaper-item').count(), 20);
      await page.screenshot({ path: path.join(out, `${label}-gallery.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} menu horizontal overflow`);
      const menu = await page.locator('.background-menu').boundingBox();
      assert(menu && menu.x >= 0 && menu.x + menu.width <= width && menu.y + menu.height <= height, `${label} menu viewport bounds`);
      await page.locator('.user-wallpaper-item').last().scrollIntoViewIfNeeded();
      const last = await page.locator('.user-wallpaper-item').last().boundingBox();
      assert(last && last.y >= menu.y && last.y + last.height <= menu.y + menu.height, `${label} final wallpaper reachable`);
      await page.screenshot({ path: path.join(out, `${label}-gallery-bottom.png`), fullPage: true });
      await page.locator(`input[value="${media(1).id}"]`).click();
      await page.waitForFunction(() => !document.querySelector('.background-menu'));
      assert.deepEqual(profile.wallpaper, { mode: 'FIXED', kind: 'USER', id: media(1).id });
      await page.reload();
      await page.getByRole('textbox', { name: '名称', exact: true }).waitFor();
      await page.getByLabel('选择背景', { exact: true }).click();
      await page.locator(`input[value="${media(1).id}"]`).waitFor();
      assert(await page.locator(`input[value="${media(1).id}"]`).isChecked(), 'fixed preference restored');
      await page.getByRole('button', { name: '删除壁纸 1', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.user-wallpaper-item').length === 19);
      assert.deepEqual(profile.wallpaper, { mode: 'RANDOM' });
      assert(await page.getByRole('button', { name: '随机壁纸', exact: true }).getAttribute('aria-pressed') === 'true');
      await page.getByRole('button', { name: '随机壁纸', exact: true }).focus();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.background-menu'));
      assert.equal(await page.locator('.background-menu').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '选择背景');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('img[src^="https://media.fixture.invalid"]')].filter(img => img.complete && img.naturalWidth > 0).length > 0), true);
      assert.deepEqual(errors, []);
      console.log(`${label}: name/avatar direct upload, 20-item gallery, fixed reload, delete to random, Escape, images, overflow PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
