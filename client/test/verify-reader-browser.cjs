const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const origin = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || '')) throw new Error('Use the local fixture origin only.');
const output = path.resolve(__dirname, '../../.superpowers/sdd/2026-10-03-novel-reader/browser');
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, 'profile-' + Date.now()); fs.mkdirSync(profile);
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate,MediaRouter', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket, sequence = 0;
const pending = new Map(), errors = [], evidence = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function request(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
(async () => {
  let port;
  for (let i = 0; i < 100; i++) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); break; }
    if (browser.exitCode !== null) throw new Error('Local Edge renderer exited: ' + browser.exitCode);
    await pause(200);
  }
  if (!port) throw new Error('Local Edge unavailable.');
  const version = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', async event => {
    const data = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
    if (data.id && pending.has(data.id)) { const item = pending.get(data.id); clearTimeout(item.timer); pending.delete(data.id); data.error ? item.reject(new Error(data.error.message)) : item.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
  });
  const { targetId } = await request('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await request('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => request(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(`!!(${expression})`)) return; await pause(100); } throw new Error('Timed out: ' + expression); };
  const click = async text => { await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}) && !b.disabled); if(!b)throw Error('Missing button'); b.click()})()`); await pause(240); };
  const capture = async name => { const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(result.data, 'base64')); };
  const state = () => evaluate(`(()=>{const a=readerAcceptance, r=a.reader.getState();return {bookId:r.bookId,sectionId:r.sectionId,windows:r.windows.map(w=>[w.startOffset,w.endOffset]),anchor:r.anchorOffset,visible:r.visibleOffset,status:r.saveStatus,error:r.error,saveError:r.saveError,preview:r.preview,view:a.books.getState().view,requests:a.requests}})()`);
  try {
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: origin + '/reader.acceptance.html' });
    await until("document.querySelectorAll('.bookshelf-open').length === 3"); await evaluate('document.fonts.ready.then(()=>true)');
    await capture('home');
    for (const width of [375,768]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width,height:900,deviceScaleFactor:1,mobile:false }); await pause(250);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate("[...document.querySelectorAll('.feature-action button')].every(b=>{const r=b.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth})"), true);
      await capture(`home-${width}-reading-actions`);
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width:1440,height:900,deviceScaleFactor:1,mobile:false }); await pause(200);
    await evaluate("document.querySelector('.bookshelf-open').click()"); await until("document.querySelector('.book-space-actions button:not(:disabled)')");
    assert.equal(await evaluate('readerAcceptance.books.getState().view'), 'book');
    assert.equal(await evaluate("readerAcceptance.requests.some(r=>r.path.endsWith('/content')||r.path.endsWith('/sessions'))"), false);
    await capture('book-space');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
    await evaluate("readerAcceptance.appearance.getState().setTheme('dark')"); await pause(280);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await capture('book-space-375-dark');
    await evaluate("document.querySelector('[aria-label=选择背景]').click()"); await pause(180);
    assert.equal(await evaluate("!!document.querySelector('.background-menu')"), true);
    await evaluate("document.querySelector('input[value=city]').click();document.querySelector('[aria-label=关闭背景菜单]')?.click()");
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate("readerAcceptance.appearance.getState().setTheme('light')"); await pause(200);
    await pause(300);
    assert.equal(await evaluate('readerAcceptance.appearance.getState().background'), 'city');
    await click('开始阅读'); await until("document.querySelector('[data-reader-window]')"); await pause(400);
    assert.equal(await evaluate('!!window.fixtureInjection'), false);
    assert.equal(await evaluate("readerAcceptance.requests.filter(r=>r.path.endsWith('/content')).length <= 2"), true);
    assert.equal(await evaluate("readerAcceptance.requests.some(r=>r.method==='PUT')"), false);
    await capture('reader-desktop');
    evidence.push({ initial: await state() });
    await evaluate("(()=>{const root=document.querySelector('.reader-scroll');root.dispatchEvent(new WheelEvent('wheel',{deltaY:1000}));root.scrollTop=root.scrollHeight*.75})()");
    await until('readerAcceptance.reader.getState().windows[0]?.startOffset > 40000'); await pause(200);
    assert.equal(await evaluate("readerAcceptance.measure(document.querySelector('.reader-scroll')) !== null"), true);
    await evaluate("(()=>{const root=document.querySelector('.reader-scroll');root.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000}));root.scrollTop=0})()");
    await until('readerAcceptance.reader.getState().windows[0]?.startOffset===0'); await pause(200);
    evidence.push({ scrollbarJump: 'Both unloaded spacers loaded the requested visible text.' });
    // Every window must be a lossless slice; observer loading and eviction use the actual UI.
    await evaluate("window.readerLongTasks=[];window.readerObserver=new PerformanceObserver(l=>readerLongTasks.push(...l.getEntries().map(e=>e.duration)));readerObserver.observe({type:'longtask',buffered:false})");
    for (let i = 0; i < 7; i++) {
      await evaluate("(()=>{const root=document.querySelector('.reader-scroll'),edge=document.querySelector('[data-reader-edge=next]'); root.dispatchEvent(new WheelEvent('wheel',{deltaY:1000}));root.scrollTop+=edge.getBoundingClientRect().top-root.getBoundingClientRect().top-root.clientHeight+200})()");
      await pause(360);
      assert.equal(await evaluate('document.querySelectorAll("[data-reader-window]").length <= 3'), true);
      assert.equal(await evaluate("readerAcceptance.reader.getState().windows.every(w=>w.text===readerAcceptance.text(w.sectionId).slice(w.startOffset,w.endOffset))"), true);
      assert.equal(await evaluate("(()=>{let w=readerAcceptance.reader.getState().windows;return w.every((x,i)=>i===0||(w[i-1].sectionId===x.sectionId?w[i-1].endOffset===x.startOffset:w[i-1].nextOffset===null&&x.startOffset===0))})()"), true);
      if (await evaluate("readerAcceptance.reader.getState().windows.some(w=>w.sectionId==='fixture-1-section-1'&&w.endOffset===80000)")) break;
    }
    assert.equal(await evaluate("readerAcceptance.reader.getState().windows.some(w=>w.sectionId==='fixture-1-section-1'&&w.endOffset===80000)"), true);
    evidence.push({ traversal: await state(), scrollLongTasksMs: await evaluate('readerLongTasks') });
    // Enter the next chapter by scrolling, without using chapter navigation.
    await evaluate("readerAcceptance.reader.getState().previewSection('fixture-1-section-1',79900)");
    await until("readerAcceptance.reader.getState().windows.some(w=>w.sectionId==='fixture-1-section-1'&&w.endOffset===80000)");
    await evaluate("readerAcceptance.reader.getState().continueFromPreview()");
    await until("readerAcceptance.reader.getState().windows.some(w=>w.sectionId==='fixture-1-section-2')");
    assert.equal(await evaluate('readerAcceptance.reader.getState().sectionId'), 'fixture-1-section-1');
    assert.equal(await evaluate("document.querySelectorAll('.reader-section-heading').length >= 1"), true);
    assert.equal(await evaluate("document.querySelectorAll('.reader-scroll').length===1 && [...document.querySelectorAll('[data-reader-chapter]')].every(chapter=>chapter.closest('.reader-scroll')===document.querySelector('.reader-scroll') && getComputedStyle(chapter).backgroundColor==='rgba(0, 0, 0, 0)')"), true);
    await capture('reader-chapter-boundary');
    await evaluate("(()=>{const a=readerAcceptance,root=document.querySelector('.reader-scroll');a.restore(root,100,'fixture-1-section-2');root.dispatchEvent(new WheelEvent('wheel',{deltaY:40}));root.scrollTop+=38})()");
    await until("readerAcceptance.reader.getState().sectionId==='fixture-1-section-2'");
    await evaluate('readerAcceptance.reader.getState().flushSave()');
    assert.equal(await evaluate('readerAcceptance.positions()["fixture-1"].sectionId'), 'fixture-1-section-2');
    assert.equal(await evaluate("readerAcceptance.positions()['fixture-1'].contentHash===readerAcceptance.reader.getState().windows.find(w=>w.sectionId==='fixture-1-section-2').contentHash"), true);
    await evaluate("(()=>{const a=readerAcceptance,root=document.querySelector('.reader-scroll');a.restore(root,79800,'fixture-1-section-1');root.dispatchEvent(new WheelEvent('wheel',{deltaY:-40}));root.scrollTop-=38})()");
    await until("readerAcceptance.reader.getState().sectionId==='fixture-1-section-1'");
    evidence.push({ continuousChapters: 'Prefetch preserved the original chapter; native scroll adopted the next chapter with its own hash, then returned to the previous chapter.' });
    await evaluate("readerAcceptance.reader.getState().goToSection('fixture-1-section-2')"); await pause(350);
    await until("readerAcceptance.reader.getState().windows.some(w=>w.sectionId==='fixture-1-section-1')");
    assert.equal(await evaluate('readerAcceptance.reader.getState().sectionId'), 'fixture-1-section-2');
    await evaluate("(()=>{const a=readerAcceptance,root=document.querySelector('.reader-scroll');a.restore(root,79800,'fixture-1-section-1');root.dispatchEvent(new WheelEvent('wheel',{deltaY:-40}));root.scrollTop-=38})()");
    await until("readerAcceptance.reader.getState().sectionId==='fixture-1-section-1'");
    assert.equal(await evaluate('document.querySelectorAll("[data-reader-window]").length <= 3'), true);
    evidence.push({ previousChapterReload: 'Scrolling upward fetched the previous chapter tail and restored the original visible chapter before the reader entered it.' });
    for (let i = 0; i < 5; i++) {
      if (await evaluate('readerAcceptance.reader.getState().windows[0].startOffset===0')) break;
      await evaluate("(()=>{const root=document.querySelector('.reader-scroll'),prefix=root.querySelector('[data-reader-spacer=before]');root.dispatchEvent(new WheelEvent('wheel',{deltaY:-1000}));root.scrollTop=prefix.getBoundingClientRect().height+4})()");
      await pause(380);
    }
    assert.equal(await evaluate('readerAcceptance.reader.getState().windows[0].startOffset'), 0);
    evidence.push({ reverse: { windows: await evaluate('readerAcceptance.reader.getState().windows.map(w=>[w.startOffset,w.endOffset])') } });
    await evaluate("readerAcceptance.reader.getState().previewSection('fixture-1-section-1',60000)");
    await until("readerAcceptance.reader.getState().windows[0]?.startOffset > 50000");
    await evaluate("readerAcceptance.reader.getState().continueFromPreview()");
    // Place a word in the long paragraph near the first visible line, then exercise native scroll/save.
    await evaluate("(()=>{const a=readerAcceptance,root=document.querySelector('.reader-scroll');a.restore(root,60000);root.dispatchEvent(new WheelEvent('wheel',{deltaY:40}));root.scrollTop+=38})()"); await pause(1300);
    await until("readerAcceptance.reader.getState().saveStatus==='saved'");
    const offset = await evaluate('readerAcceptance.positions()["fixture-1"].offset');
    assert.equal(offset > 59000 && offset < 61000, true);
    await evaluate("readerAcceptance.preferences.getState().setPreference('fontSizePx',28);readerAcceptance.preferences.getState().setPreference('widthPx',480)"); await pause(350);
    const measured = await evaluate("readerAcceptance.measure(document.querySelector('.reader-scroll'))");
    assert.equal(Math.abs(measured - offset) <= 32, true);
    evidence.push({ typography: { savedOffset: offset, measuredOffset: measured, delta: measured - offset } });
    await capture('reader-large-type');
    const anchorBeforePanels = await evaluate("readerAcceptance.measurePosition(document.querySelector('.reader-scroll'))");
    await click('目录'); await pause(280);
    const anchorAfterPanels = await evaluate("readerAcceptance.measurePosition(document.querySelector('.reader-scroll'))");
    assert.equal(anchorAfterPanels.sectionId, anchorBeforePanels.sectionId);
    assert.equal(Math.abs(anchorAfterPanels.offset - anchorBeforePanels.offset) <= 32, true);
    evidence.push({ directoryReflow: { before: anchorBeforePanels, after: anchorAfterPanels } });
    await cdp('Page.reload'); await until("document.querySelector('.bookshelf-open')");
    await click('继续阅读'); await until("document.querySelector('[data-reader-window]')"); await pause(400);
    assert.equal(await evaluate('readerAcceptance.books.getState().view'), 'reader');
    assert.equal(await evaluate('readerAcceptance.reader.getState().bookId'), 'fixture-1');
    assert.equal(await evaluate("readerAcceptance.requests.some(r=>r.path.endsWith('/sessions'))"), false);
    const quickRestored = await evaluate("readerAcceptance.measure(document.querySelector('.reader-scroll'))");
    assert.equal(Math.abs(quickRestored-offset)<=32, true);
    evidence.push({ homeQuickReading:{savedOffset:offset,restoredOffset:quickRestored,chatPrepared:false} });
    await evaluate('readerAcceptance.books.getState().backToLibrary()'); await until("document.querySelector('.bookshelf-open')");
    await evaluate("document.querySelector('.bookshelf-open').click()"); await until("document.querySelector('.book-space-actions button:not(:disabled)')"); await click('继续阅读'); await until("document.querySelector('[data-reader-window]')"); await pause(400);
    const restored = await evaluate("readerAcceptance.measure(document.querySelector('.reader-scroll'))");
    assert.equal(Math.abs(restored - offset) <= 32, true); evidence.push({ refresh: { savedOffset: offset, restoredOffset: restored } });
    await evaluate("readerAcceptance.control.failNextContent=true;readerAcceptance.reader.getState().loadAdjacent('next')");
    await until("readerAcceptance.reader.getState().error !== null");
    assert.equal(await evaluate('document.querySelectorAll("[data-reader-window]").length'), 1);
    await click('重试加载'); await until("readerAcceptance.reader.getState().windows.length===2");
    evidence.push({ recovery: { windows: await evaluate('readerAcceptance.reader.getState().windows.map(w=>[w.startOffset,w.endOffset])') } });
    await click('阅读助手'); await until("document.querySelector('.reader-assistant-panel textarea')");
    await evaluate("readerAcceptance.chat.getState().setDraftInput('这封信代表什么？')");
    await evaluate("document.querySelector('.reader-assistant-panel form').requestSubmit()"); await until('readerAcceptance.chat.getState().messages.length===2 && !readerAcceptance.chat.getState().isLoading');
    const revision = await evaluate('readerAcceptance.positions()["fixture-1"].revision');
    await click('查看原文引用'); await click('阅读这段原文'); await until('readerAcceptance.reader.getState().preview'); await pause(300);
    assert.equal(await evaluate('readerAcceptance.positions()["fixture-1"].revision'), revision);
    assert.equal(await evaluate('!!document.querySelector(".reader-window mark")'), true);
    await click('返回续读处'); await pause(400);
    assert.equal(await evaluate('readerAcceptance.positions()["fixture-1"].revision'), revision);
    await evaluate("readerAcceptance.chat.getState().setDraftInput('未发送的草稿')");
    await click('聊天页'); await until("document.querySelector('.workspace-sidebar')");
    assert.equal(await evaluate('readerAcceptance.chat.getState().draftInput'), '未发送的草稿');
    assert.equal(await evaluate('readerAcceptance.chat.getState().messages.length'), 2);
    await capture('original-chat');
    await click('阅读本书'); await until("document.querySelector('.reader-scroll')"); await pause(350);
    assert.equal(await evaluate('readerAcceptance.chat.getState().draftInput'), '未发送的草稿');
    assert.equal(await evaluate('readerAcceptance.chat.getState().messages.length'), 2);
    evidence.push({ session: await evaluate('({sessionId:readerAcceptance.chat.getState().sessionId,messages:readerAcceptance.chat.getState().messages.length,draft:readerAcceptance.chat.getState().draftInput})') });
    // Card layouts must leave the novel and controls usable at the desktop breakpoint.
    await cdp('Emulation.setDeviceMetricsOverride', { width:1024,height:768,deviceScaleFactor:1,mobile:false }); await pause(350);
    await click('阅读助手'); await until("document.querySelector('.reader-assistant-panel textarea')");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await evaluate("document.querySelector('.reader-scroll').clientWidth >= 300 && document.querySelector('.reader-scroll').clientHeight >= 300"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('.reader-chapter-navigation button,.reader-tools button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight})"), true);
    await capture('reader-1024-assistant');
    await cdp('Input.dispatchKeyEvent', { type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27 });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27 }); await pause(300);
    await cdp('Emulation.setDeviceMetricsOverride', { width:1440,height:500,deviceScaleFactor:1,mobile:false }); await pause(350);
    await click('目录');
    assert.equal(await evaluate("document.querySelector('.reader-directory .reader-contents-list').clientHeight >= 44"), true);
    await evaluate("document.querySelector('.reader-bookmark-card').scrollIntoView({block:'nearest'})");
    assert.equal(await evaluate("document.querySelector('.reader-bookmark-card').getBoundingClientRect().bottom <= innerHeight"), true);
    await capture('reader-short-desktop');
    evidence.push({ desktopGeometry:'1024px with assistant and 1440×500px with directory leave controls accessible.' });
    for (const [width,height] of [[1440,900],[768,1024],[375,812]]) for (const theme of ['light','dark']) {
      await cdp('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
      await evaluate(`readerAcceptance.appearance.getState().setTheme('${theme}')`); await pause(350);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      await capture(`reader-${width}-${theme}`);
      if (width === 375) {
        await click('目录'); await until('!!document.querySelector(".reader-contents-dialog")');
        await capture(`contents-${width}-${theme}`);
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(350);
        assert.equal(await evaluate('!!document.querySelector(".reader-contents-dialog")'), false);
        assert.equal(await evaluate('document.activeElement.textContent'), '目录');
        await click('阅读助手'); await until('!!document.querySelector(".reader-mobile-dialog")');
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
        await capture(`assistant-${width}-${theme}`);
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(350);
        assert.equal(await evaluate('!!document.querySelector(".reader-mobile-dialog")'), false);
        assert.equal(await evaluate('document.activeElement.classList.contains("reader-assistant-toggle")'), true);
      }
    }
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await click('排版'); await until('!!document.querySelector(".reader-format-dialog")');
    // The shared reduced-motion rule uses 0.01ms so transition completion still fires.
    assert.equal(await evaluate("parseFloat(getComputedStyle(document.querySelector('.reader-tools button')).transitionDuration) <= .00001"), true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.reader-format-dialog')).transform"), 'none');
    await capture('reader-format-reduced-motion');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(150);
    assert.equal(await evaluate('!!document.querySelector(".reader-format-dialog")'), false);
    // Conflict and offline behavior are fixture UI checks, not PostgreSQL CAS claims.
    await evaluate("readerAcceptance.control.conflictNextSave=true;readerAcceptance.reader.getState().recordVisibleOffset(60200)"); await pause(1300);
    assert.equal(await evaluate('readerAcceptance.reader.getState().saveStatus'), 'conflict');
    const puts = await evaluate('readerAcceptance.requests.filter(r=>r.method===\'PUT\').length'); await pause(1300);
    assert.equal(await evaluate('readerAcceptance.requests.filter(r=>r.method===\'PUT\').length'), puts);
    await click('使用本窗口的位置'); await until("readerAcceptance.reader.getState().saveStatus==='saved'");
    await evaluate("readerAcceptance.control.failNextSave=true;readerAcceptance.reader.getState().recordVisibleOffset(60300)"); await pause(1300);
    assert.equal(await evaluate('readerAcceptance.reader.getState().saveStatus'), 'error');
    await click('重试同步'); await until("readerAcceptance.reader.getState().saveStatus==='saved'");
    assert.equal(await evaluate("readerAcceptance.requests.some(r=>r.method==='PUT' && r.path.endsWith('/reading-progress'))"), false);
    await evaluate("readerAcceptance.preferences.getState().setPreference('fontSizePx',20);readerAcceptance.preferences.getState().setPreference('widthPx',640);readerAcceptance.appearance.getState().setTheme('light')");
    await cdp('Emulation.setDeviceMetricsOverride', { width:1440,height:900,deviceScaleFactor:1,mobile:false });
    await evaluate("readerAcceptance.reader.getState().goToSection('fixture-1-section-1')"); await pause(350);
    await click('目录'); await evaluate('document.activeElement.blur()'); await capture('reader-polished-desktop');
    await evaluate("readerAcceptance.appearance.getState().setBackground('mountains')"); await pause(300); await capture('reader-cards-desktop');
    await click('阅读助手'); await until("document.querySelector('.reader-assistant-panel textarea')"); await evaluate('document.activeElement.blur()');
    assert.equal(await evaluate("document.querySelector('.reader-assistant-panel textarea').clientHeight <= 80"), true, 'A short draft must not retain the height measured at a narrower panel width.');
    await capture('reader-cards-assistant');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(300);
    assert.equal(await evaluate('!!document.querySelector(".reader-assistant-panel")'), false);
    await cdp('Emulation.setDeviceMetricsOverride', { width:375,height:812,deviceScaleFactor:1,mobile:false }); await pause(350);
    await capture('reader-polished-mobile');
    await evaluate("readerAcceptance.appearance.getState().setTheme('dark')"); await pause(350); await capture('reader-polished-mobile-dark');
    evidence.push({ final: await state(), browser: version.Browser, errors });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS: home/book/reader/chat, continuous chapters forward/backward, bounded windows, UTF-16 slices, refresh/type/directory anchors, shared appearance, reference preview, session/draft, responsive themes, mobile Escape/focus, reduced motion, conflict/offline, no spoiler writes.');
  } catch (error) {
    await capture('failure').catch(()=>{});
    console.log(JSON.stringify({ failure: error.message, state: await state().catch(()=>null), errors }, null, 2)); throw error;
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if(socket?.readyState===1) await request('Browser.close').catch(()=>{}); socket?.close(); browser.kill(); });
