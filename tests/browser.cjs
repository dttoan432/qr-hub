// Run against the static server; Playwright and Chrome are test-only requirements.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json')));
const base = process.env.QR_TEST_URL || 'http://localhost:8765';
const output = process.env.QR_TEST_OUTPUT || '/tmp/qr-hub-checks';
fs.mkdirSync(output, { recursive: true });
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const failedAssets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedAssets.push(response.url()); });
    const load = async (suffix = '') => { await page.goto(`${base}/index.html${suffix}`); await page.waitForFunction(() => document.querySelector('#personalGrid').getAttribute('aria-busy') === 'false'); };
    const isOpen = () => page.locator('dialog').evaluate(el => el.open);
    const closed = () => page.waitForFunction(() => !document.querySelector('dialog').open && !new URL(location.href).searchParams.has('qr'));
    const checkModal = async item => {
      await page.waitForFunction(id => new URL(location.href).searchParams.get('qr') === id && document.querySelector('dialog').open, item.id);
      same(await page.locator('#modalName').innerText(), item.owner, 'Modal owner');
      same(await page.locator('#modalBank').innerText(), item.bank, 'Modal bank');
      same(await page.locator('#modalAccount').innerText(), item.accountNumber, 'Modal account');
      same(await page.locator('#modalQR').getAttribute('src'), item.qrImage, 'Modal original image');
      await page.waitForFunction(() => document.querySelector('#modalQR').complete && document.querySelector('#modalQR').naturalWidth > 0);
    };
    const baseline = JSON.parse(execFileSync('git', ['show', 'HEAD:data.json'], { cwd: root, encoding: 'utf8' }));
    same(data.map(({ id, ...item }) => item), baseline.map(({ id, ...item }) => item), 'All existing data preserved');
    same(new Set(data.map(item => item.id)).size, data.length, 'Unique persistent IDs');
    ok(data.every(item => /^qr-[a-z0-9-]+$/.test(item.id)), 'Valid IDs');
    same(execFileSync('git', ['diff', '--name-only', '--', 'images'], { cwd: root, encoding: 'utf8' }), '', 'Images unchanged');
    await load();
    same(await page.locator('.qr-card').count(), 12, 'Personal card count');
    for (const type of ['personal', 'group']) {
      await page.locator(type === 'personal' ? '#tabPersonal' : '#tabGroup').click();
      const expected = data.filter(item => item.type === type).sort((a,b)=>a.owner.localeCompare(b.owner,'vi',{sensitivity:'accent'}));
      same(await page.locator('.card-title').allTextContents(), expected.map(item => item.owner), `${type} owner mapping`);
      same(await page.locator('.account-number').allTextContents(), expected.map(item => item.accountNumber), `${type} accounts`);
      same(await page.locator('.bank-name').allTextContents(), expected.map(item => item.bank), `${type} banks`);
      for (const item of expected) {
        await page.locator(`[data-qr-id="${item.id}"]`).click();
        await checkModal(item);
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#btnDownloadQR').click();
        const download = await downloadPromise;
        same(fs.readFileSync(await download.path()), fs.readFileSync(path.join(root,item.qrImage)), 'Downloaded bytes match original');
        await page.locator('#btnCopyModal').click();
        same(await page.evaluate(()=>navigator.clipboard.readText()), item.accountNumber.replace(/\s/g,''), 'Copied account preserves leading zeros');
        await page.locator('#btnShareQR').click();
        same(await page.evaluate(()=>navigator.clipboard.readText()), page.url(), 'Exact share URL');
        await page.locator('#closeModal').click(); await closed();
      }
    }
    await page.locator('#tabPersonal').click();
    for (const [term, count] of [['do tien toan',1],['ĐỖ TIẾN TOÀN',1],[' 1088 6543 2000 ',1],['techcombank',5],['<script> & % 💳',0]]) {
      await page.locator('#searchInput').fill(term);
      same(await page.locator('.qr-card').count(),count,`Search ${term}`);
    }
    await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();
    same(await page.locator('.qr-card').count(),12,'Reset filters');
    for (const bank of new Set(data.map(item=>item.bank))) {
      await page.getByRole('button',{name:bank,exact:true}).click();
      same(await page.locator('.qr-card').count(),data.filter(item=>item.type==='personal'&&item.bank===bank).length,`Filter ${bank}`);
    }
    await page.getByRole('button',{name:'Techcombank',exact:true}).click();
    await page.locator('#searchInput').fill('Bui');
    same(await page.locator('.qr-card').count(),1,'Combined search and bank');
    await page.locator('#tabGroup').click(); same(await page.locator('.qr-card').count(),0,'Group preserves filters');
    await page.locator('#tabPersonal').click(); same(await page.locator('.qr-card').count(),1,'Return tab preserves filters');
    await page.locator('#clearSearch').click(); same(await page.locator('.qr-card').count(),5,'Clear search keeps bank');
    await page.getByRole('button',{name:'Tất cả',exact:true}).click();
    await page.locator('.btn-copy').first().click(); ok(!await isOpen(),'Card copy does not open modal');
    const firstId = await page.locator('.card-open').first().getAttribute('data-qr-id');
    const first = data.find(item=>item.id===firstId);
    await load('?theme=light#section');
    await page.locator('.card-open').first().click();
    await checkModal(first);
    await page.goBack(); await closed();
    await page.goForward(); await checkModal(first);
    same(new URL(page.url()).searchParams.get('theme'),'light','Preserve unrelated query');
    same(new URL(page.url()).hash,'#section','Preserve hash');
    await page.reload(); await checkModal(first);
    await page.locator('#closeModalBottom').click(); await closed();
    same(new URL(page.url()).searchParams.get('theme'),'light','Direct close preserves query');
    same(new URL(page.url()).hash,'#section','Direct close preserves hash');
    const historyLength = await page.evaluate(()=>history.length);
    for(let n=0;n<5;n++) {await page.locator('.card-open').first().click();await page.keyboard.press('Escape');await closed();}
    ok(await page.evaluate(()=>history.length)<=historyLength+1,'Repeated open/close bounded history');
    for (const item of data) { await load(`?qr=${item.id}`); await checkModal(item); }
    const fresh = await context.newPage(); await fresh.goto(`${base}/?qr=${first.id}`); await fresh.waitForSelector('dialog[open]');
    await fresh.locator('#closeModal').click(); await fresh.waitForFunction(()=>!document.querySelector('dialog').open);
    same(new URL(fresh.url()).pathname,'/','Fresh tab close stays on site'); await fresh.close();
    for(const value of ['', 'unknown', '%E0%A4%A', '%3Cscript%3E', `${first.id}&qr=${first.id}`, '%00']) {
      await load(`?other=keep&qr=${value}#fragment`); await closed();
      same(new URL(page.url()).searchParams.get('other'),'keep','Invalid link preserves other query');
      same(new URL(page.url()).hash,'#fragment','Invalid link preserves fragment');
      same(await page.locator('.qr-card').count(),12,'Invalid link retains cards');
    }
    await load(`?qr=${encodeURIComponent(first.id).replace('q','%71')}`); await checkModal(first);
    await page.locator('#closeModal').click(); await closed();
    // Resolve from full data despite an active filter and synchronize A -> B -> A.
    await page.getByRole('button',{name:'ACB',exact:true}).click();
    await page.evaluate(id=>{history.pushState({},'',`?qr=${id}`);dispatchEvent(new PopStateEvent('popstate'));},first.id);
    await checkModal(first);
    const other = data.find(item=>item.type==='personal'&&item.id!==first.id);
    await page.evaluate(id=>{history.pushState({},'',`?qr=${id}`);dispatchEvent(new PopStateEvent('popstate'));},other.id);
    await checkModal(other); await page.goBack(); await checkModal(first);
    await page.locator('#closeModal').click(); await closed();
    same(await page.getByRole('button',{name:'ACB',exact:true}).getAttribute('aria-pressed'),'true','Modal keeps filter');
    await load();
    // Keyboard tabs, modal containment, focus restoration and scroll preservation.
    await page.locator('#tabPersonal').focus(); await page.keyboard.press('ArrowRight');
    same(await page.locator('#tabGroup').getAttribute('aria-selected'),'true','Arrow tab selection');
    await page.keyboard.press('Home');
    await page.locator('.card-open').nth(6).focus(); await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    const scroll = await page.evaluate(()=>scrollY);
    for(let n=0;n<12;n++) {await page.keyboard.press('Tab');ok(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)),'Focus stays in dialog');}
    await page.keyboard.press('Shift+Tab'); ok(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)),'Reverse focus stays in dialog');
    await page.mouse.wheel(0,300); same(await page.evaluate(()=>scrollY),scroll,'Background scroll locked');
    await page.keyboard.press('Escape'); await closed(); same(await page.evaluate(()=>scrollY),scroll,'Scroll restored');
    ok(await page.locator('.card-open').nth(6).evaluate(el=>document.activeElement===el),'Focus returns to opener');
    await page.locator('.card-open').first().click(); await page.mouse.click(2,2); await closed();
    // Real denied clipboard API: verify fallback and truthful failure UI.
    await page.evaluate(()=>{window.originalClipboard=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw new Error('denied')};window.originalExec=document.execCommand.bind(document);document.execCommand=()=>false;});
    await page.locator('.btn-copy').first().click(); ok((await page.locator('#toast').innerText()).startsWith('Không thể'),'Failed clipboard not reported as success');
    await page.evaluate(()=>{document.execCommand=window.originalExec;});
    await page.locator('.btn-copy').first().click(); same(await page.locator('#toast').innerText(),'Đã sao chép số tài khoản.','Clipboard fallback success feedback');
    same(await page.evaluate(()=>navigator.clipboard.readText()),first.accountNumber.replace(/\s/g,''),'Fallback writes real clipboard');
    await load();
    await page.locator('.qr-card img').evaluateAll(images=>images.forEach(img=>{img.loading='eager'}));
    await page.waitForFunction(()=>[...document.querySelectorAll('.qr-card img')].every(img=>img.complete&&img.naturalWidth>0));
    for(const width of [320,375,390,430,768,1024,1280,1440,1920]) {
      await page.setViewportSize({width,height:900});
      ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Page no overflow ${width}`);
      await page.locator('.card-open').first().click(); await page.waitForSelector('dialog[open]');
      ok(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),`Dialog no horizontal overflow ${width}`);
      ok(await page.locator('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}),`Dialog fits viewport ${width}`);
      await page.locator('#closeModalBottom').click(); await closed();
    }
    await page.setViewportSize({width:844,height:390}); await page.locator('.card-open').first().click(); await page.locator('#closeModalBottom').click(); await closed();
    await page.setViewportSize({width:390,height:844});
    await page.addStyleTag({content:'body {font-size: 24px} button,input {font-size: 24px}'});
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Large text no page overflow');
    await load();
    await page.locator('.qr-card img').evaluateAll(images=>images.forEach(img=>{img.loading='eager'}));
    await page.waitForFunction(()=>[...document.querySelectorAll('.qr-card img')].every(img=>img.complete&&img.naturalWidth>0));
    await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
    await page.locator('.card-open').first().click(); await page.screenshot({path:path.join(output,'mobile-modal.png')});
    await page.locator('#closeModal').click(); await closed();
    await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    await page.locator('.card-open').first().click();await page.screenshot({path:path.join(output,'modal.png')});
    same(errors,[],'No runtime errors');same(failedAssets,[],'No asset errors');
    // Delayed, reordered, duplicate, missing IDs, failed data and image responses.
    const fixturePage = await context.newPage();
    let fixture = [...data].reverse();
    await fixturePage.route('**/data.json',async route=>route.fulfill({json:fixture}));
    await fixturePage.goto(`${base}/?qr=${first.id}`);await fixturePage.waitForSelector('dialog[open]');
    same(await fixturePage.locator('#modalName').innerText(),first.owner,'IDs independent of array order');
    fixture = data.map(item=>({...item}));fixture[1].id=fixture[0].id;
    await fixturePage.goto(`${base}/?qr=${fixture[0].id}`);await fixturePage.waitForSelector('.qr-card');
    ok(!await fixturePage.locator('dialog').evaluate(el=>el.open),'Duplicate ID cannot select wrong QR');
    same(await fixturePage.locator('.qr-card').count(),12,'Duplicate data keeps cards');
    fixture = data.map(({id,...item})=>item);
    await fixturePage.goto(`${base}/?qr=${first.id}`);await fixturePage.waitForSelector('.qr-card');
    same(await fixturePage.locator('.qr-card').count(),12,'Missing IDs keep cards');
    await fixturePage.unroute('**/data.json');
    await fixturePage.route('**/data.json',route=>route.fulfill({status:503,body:'Unavailable'}));
    await fixturePage.goto(`${base}/?qr=${first.id}`);await fixturePage.waitForSelector('#loadError:not([hidden])');
    same(new URL(fixturePage.url()).searchParams.get('qr'),first.id,'Failed data does not normalize valid link too early');
    await fixturePage.unroute('**/data.json');
    await fixturePage.locator('#retryLoad').click();await fixturePage.waitForSelector('dialog[open]');
    same(await fixturePage.locator('#modalName').innerText(),first.owner,'Retry resolves original deep link');
    await fixturePage.close();
    const delayed = await context.newPage();let release;const gate=new Promise(resolve=>{release=resolve});
    await delayed.route('**/data.json',async route=>{await gate;await route.fulfill({json:data})});
    await delayed.goto(`${base}/?qr=${first.id}`,{waitUntil:'domcontentloaded'});
    same(new URL(delayed.url()).searchParams.get('qr'),first.id,'Pending data preserves URL');
    await delayed.evaluate(id=>{history.replaceState({},'',`?qr=${id}`);dispatchEvent(new PopStateEvent('popstate'));},other.id);
    release();await delayed.waitForSelector('dialog[open]');
    same(await delayed.locator('#modalName').innerText(),other.owner,'Latest URL wins after delayed data');await delayed.close();
    const broken = await context.newPage();await broken.route('**/images/**',route=>route.fulfill({status:404,body:'missing'}));
    await broken.goto(`${base}/?qr=${first.id}`);await broken.waitForSelector('#modalQR[hidden]',{state:'attached'});
    ok(await broken.locator('.modal-image-frame .image-error').isVisible(),'Broken QR has visible error');
    await broken.locator('#btnDownloadQR').click();await broken.waitForFunction(()=>document.querySelector('#modalToast').textContent.startsWith('Không thể tải'));
    ok(!await broken.locator('#btnDownloadQR').isDisabled(),'Download failure allows retry');await broken.close();
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,status:'passed',runtimeErrors:errors,assetErrors:failedAssets,viewports:[320,375,390,430,768,1024,1280,1440,1920]},null,2));
    console.log(`PASS: ${checks} assertions; screenshots and results: ${output}`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
