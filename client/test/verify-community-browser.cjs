// Runs the built client against an in-memory HTTP/WS fixture, never the application server.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('../../server/node_modules/ws');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.superpowers/sdd/2026-10-05-community-chat-interaction/browser');
fs.mkdirSync(output, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const user = { id: 'fixture-reader-a', email: 'fixture@example.invalid', name: '窗边读者', emailVerifiedAt: null };
const ownMember = 'b830361c-448c-403a-8ef0-e35fb4c2998c';
const receipts = new Set();
let joined = false, readSeq = 1000, seq = 1000;
let historyCalls = 0, ticketCalls = 0, sendCalls = 0, contextCalls = 0;
const rows = Array.from({ length: 1000 }, (_, index) => ({ id: randomUUID(), seq: String(index + 1), clientMessageId: randomUUID(), author: { memberId: ['b83693dc-d48d-4011-b79d-259ddc69b397','d91c4cf7-9b5a-4a1d-b9e6-505cdd82fb44','e525dd4c-0489-4ab1-94ca-4bef257e6530'][index%3], name: ['青禾', '北窗', '小满'][index % 3] }, content: ['今天读到一个很喜欢的句子，合上书之后，还在心里停留。', '读书像给日常开了一扇窗。你们最近在读什么？', '想聊聊那些陪我们走了很远的人物。\n有时候，一页书也能装下整片天空。'][index % 3], status: 'ACTIVE', createdAt: new Date(Date.now() - (1000 - index) * 60000).toISOString(), replyTo: null }));
const summary = () => ({ memberId: ownMember, isModerator: false, mutedUntil: null, lastReadSeq: String(readSeq), unreadCount: rows.filter(m => +m.seq > readSeq && m.status === 'ACTIVE' && m.author.memberId !== ownMember && !receipts.has(m.id)).length, replyUnreadCount: 0, mentionUnreadCount: rows.filter(m => +m.seq > readSeq && m.status === 'ACTIVE' && !receipts.has(m.id) && m.author.memberId !== ownMember && m.mentions?.some(t=>t.memberId===ownMember)).length, consentVersion: '2026-10-05', latestEventSeq: String(seq) });
let wss;
const broadcast = frame => { for (const client of wss.clients) if (client.readyState === 1) client.send(JSON.stringify(frame)); };
function incoming(content, mentions = []) { const message = { ...rows[0], id: randomUUID(), seq: String(++seq), clientMessageId: randomUUID(), content, mentions, createdAt: new Date().toISOString(), replyTo: null }; rows.push(message); broadcast({ event: 'message.created', data: { seq: message.seq, message } }); return message; }
const headerAsset = fs.readdirSync(path.join(root,'client/dist/assets')).find(n=>/^AppHeader-.*\.js$/.test(n));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid');
  if (url.pathname.startsWith('/api/')) {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    let data, status = 200;
    if (url.pathname === '/api/auth/me') data = { user };
    else if (url.pathname === '/api/auth/refresh') data = { user, accessToken: 'synthetic-fixture-access' };
    else if (url.pathname === '/api/users/me/profile') data = { user, revision: 0, avatar: null, wallpapers: [], wallpaper: { mode: 'FIXED', kind: 'SYSTEM', id: 'anime-town' }, mediaUploadsAvailable: false, mediaReadError: null };
    else if (url.pathname === '/api/books') data = [];
    else if (url.pathname === '/api/community/membership') { assert.equal(input.consentVersion, '2026-10-05'); joined = true; data = summary(); }
    else if (!joined && url.pathname.startsWith('/api/community/')) { status = 403; data = { code: 'COMMUNITY_JOIN_REQUIRED' }; }
    else if (url.pathname === '/api/community/members') data = [{memberId:rows[0].author.memberId,name:'青禾',avatarRevision:'0'}];
    else if (/^\/api\/community\/members\/[^/]+\/avatar$/.test(url.pathname)) { res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(root,'client/public/backgrounds/coast.webp')));return; }
    else if (url.pathname === '/api/community/visible-read') { for(const id of input.messageIds) { assert(rows.some(m=>m.id===id));receipts.add(id); }data=summary(); }
    else if (url.pathname === '/api/community/unread-target') { const m=rows.find(m=>+m.seq>readSeq&&m.status==='ACTIVE'&&m.author.memberId!==ownMember&&!receipts.has(m.id)&&(url.searchParams.get('kind')!=='mentions'||m.mentions?.some(t=>t.memberId===ownMember))&&(!url.searchParams.get('after')||+m.seq>+url.searchParams.get('after')));data=m?{id:m.id,seq:m.seq}:null; }
    else if (/^\/api\/community\/messages\/[^/]+\/context$/.test(url.pathname)) { contextCalls++;const id=url.pathname.split('/').at(-2),index=rows.findIndex(m=>m.id===id);assert(index>=0);data={messages:rows.slice(Math.max(0,index-25),index+25),hasOlder:index>25,hasNewer:index+25<rows.length,latestEventSeq:String(seq)}; }
    else if (url.pathname === '/api/community/me') data = summary();
    else if (url.pathname === '/api/community/messages') {
      historyCalls++; const before = url.searchParams.get('before'), after = url.searchParams.get('after'); const matches = rows.filter(m => (!before || +m.seq < +before) && (!after || +m.seq > +after));
      const messages = after ? matches.slice(0, 50) : matches.slice(-50); data = { messages, hasMore: matches.length > 50, nextCursor: messages.length ? (after ? messages.at(-1).seq : messages[0].seq) : null, latestEventSeq: String(seq) };
    } else if (url.pathname === '/api/community/ws-tickets') { ticketCalls++; data = { ticket: 'x'.repeat(43), protocol: 'booksoul.community.v1', expiresAt: new Date(Date.now() + 30000).toISOString() }; }
    else if (url.pathname === '/api/community/read') { readSeq = Math.max(readSeq, +input.throughSeq); data = summary(); }
    else if (req.method === 'DELETE' && url.pathname.startsWith('/api/community/messages/')) {
      const message = rows.find(m => m.id === url.pathname.split('/').pop()); assert(message); message.status = 'REMOVED'; message.content = null;
      for (const m of rows) if (m.replyTo?.id === message.id) { m.replyTo.status = 'REMOVED'; m.replyTo.excerpt = null; }
      data = message; broadcast({ event: 'message.removed', data: { seq: String(++seq), message } });
    } else { status = 404; data = { code: 'FIXTURE_UNEXPECTED_ROUTE' }; }
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(status === 200 ? { success: true, data } : data)); return;
  }
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const file = path.resolve(root, 'client/dist', relative); const allowed = path.resolve(root, 'client/dist') + path.sep;
  if (!file.startsWith(allowed) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'; res.writeHead(200, { 'Content-Type': mime }); fs.createReadStream(file).pipe(res);
});
wss = new WebSocketServer({ server, path: '/api/community/ws', handleProtocols: () => 'booksoul.community.v1' });
wss.on('connection', client => {
  client.send(JSON.stringify({ event: 'connection.ready', data: { protocolVersion: 1 } }));
  client.on('message', raw => {
    const frame = JSON.parse(raw.toString());
    if (frame.event === 'connection.resume') client.send(JSON.stringify({ event: 'sync.complete', data: { throughSeq: String(seq) } }));
    if (frame.event === 'message.send') {
      sendCalls++; let message = rows.find(m => m.author.memberId === ownMember && m.clientMessageId === frame.data.clientMessageId);
      if (!message) {
        const reply = rows.find(m => m.id === frame.data.replyToId);
        message = { id: randomUUID(), seq: String(++seq), clientMessageId: frame.data.clientMessageId, author: { memberId: ownMember, name: user.name }, content: frame.data.content, mentions: (frame.data.mentionMemberIds||[]).map(memberId=>({memberId,name:rows.find(m=>m.author.memberId===memberId)?.author.name||'青禾'})), status: 'ACTIVE', createdAt: new Date().toISOString(), replyTo: reply ? { id: reply.id, memberId: reply.author.memberId, name: reply.author.name, excerpt: reply.content.slice(0, 120), status: reply.status } : null }; rows.push(message);
        broadcast({ event: 'message.created', data: { seq: message.seq, message } });
      }
      client.send(JSON.stringify({ event: 'message.ack', data: { clientMessageId: message.clientMessageId, message } }));
    }
  });
});
async function connect(url) {
  const socket = new WebSocket(url); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); clearTimeout(waiter.timer); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); });
  return { errors, close: () => socket.close(), send(method, params = {}) { return new Promise((resolve, reject) => { const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 10000); pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params })); }); } };
}
(async () => {
  let browser, cdp;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9423', `--user-data-dir=${path.join(output, 'edge-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let target; for (let n = 0; n < 40; n++) { try { target = await (await fetch('http://127.0.0.1:9423/json/new?about:blank', { method: 'PUT' })).json(); break; } catch {} await delay(250); } if (!target) throw new Error('Isolated Edge did not expose CDP');
    cdp = await connect(target.webSocketDebuggerUrl); await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    const evaluate = async expression => { let result;try{result=await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });}catch(error){throw new Error(`${error.message}: ${expression}`);} if (result.exceptionDetails) throw new Error((result.exceptionDetails.exception?.description || result.exceptionDetails.text)+': '+expression); return result.result.value; };
    const waitFor = async expression => { for (let n = 0; n < 100; n++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(50); } throw new Error('Condition not reached: ' + expression); };
    const screenshot = async name => { const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(result.data, 'base64')); };
    await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('booksoul-auth',JSON.stringify({version:2,state:{user:${JSON.stringify(user)},accessToken:'synthetic-fixture-access',isAuthenticated:true}}));` });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.send('Page.navigate', { url: origin + '/#community' }); await waitFor(`document.querySelector('.community-primary') && !document.querySelector('.community-primary').disabled`);
    assert.equal(historyCalls, 0); assert.equal(ticketCalls, 0); await screenshot('join');
    await evaluate(`document.querySelector('.community-primary').focus();document.querySelector('.community-primary').click()`); await waitFor(`document.querySelector('[role=dialog]')`);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor(`!document.querySelector('[role=dialog]')`);await delay(100);assert(await evaluate(`document.activeElement === document.querySelector('.community-primary')`));
    await evaluate(`document.querySelector('.community-primary').click()`);await waitFor(`document.querySelector('[role=dialog]')`);await evaluate(`document.querySelector('.dialog-primary').click()`);
    await waitFor(`document.querySelector('.community-send') && document.querySelector('.community-room-top').textContent.includes('聊天已连接')`); await delay(200);
    assert.equal(wss.clients.size, 1); assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));assert.equal(await evaluate(`getComputedStyle(document.querySelector('.community-heading h1')).color`),'rgb(36, 36, 36)'); await screenshot('desktop');
    await evaluate(`document.querySelector('.community-message-actions button').click()`);assert(await evaluate(`document.querySelector('.community-draft-mentions').textContent.includes('@')`));await evaluate(`document.querySelector('.community-draft-mentions button').click()`);assert(await evaluate(`!!document.querySelector('.community-reply-draft')`));await evaluate(`document.querySelector('.community-reply-draft button').click()`);await evaluate(`document.querySelector('.community-message-actions button').click()`);await evaluate(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'给大家倒杯茶，慢慢聊 🍵');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);assert.equal(sendCalls,0);
    await evaluate(`document.querySelector('.community-send').click()`); await waitFor(`[...document.querySelectorAll('.community-own .community-message-text')].some(n=>n.textContent === '给大家倒杯茶，慢慢聊 🍵')`); assert.equal(sendCalls, 1);await delay(250);await screenshot('desktop');
    await evaluate(`document.querySelector('.community-own .community-message-actions button:last-child').click()`); await waitFor(`document.querySelector('[role=dialog]')`); await evaluate(`document.querySelector('.dialog-primary').click()`); await waitFor(`document.querySelector('.community-own .community-tombstone')`);
    await evaluate(`document.querySelector('.community-message-list').scrollTop = 0`); await delay(100); const top = await evaluate(`document.querySelector('.community-message-list').scrollTop`); const count = await evaluate(`document.querySelectorAll('[data-community-message]').length`);
    incoming('测试书友的新消息'); await delay(150); assert.equal(await evaluate(`document.querySelector('.community-message-list').scrollTop`), top); assert.equal(await evaluate(`document.querySelectorAll('[data-community-message]').length`), count); assert(await evaluate(`!!document.querySelector('.community-new-messages')`));
    const anchor = await evaluate(`(()=>{const list=document.querySelector('.community-message-list'),top=list.getBoundingClientRect().top,node=[...list.querySelectorAll('[data-community-message]')].find(n=>n.getBoundingClientRect().bottom>top);return {id:node.dataset.communityMessage,top:node.getBoundingClientRect().top-top}})()`);
    await evaluate(`document.querySelector('.community-history').click()`); await waitFor(`document.querySelectorAll('[data-community-message]').length >= 99`); assert(await evaluate(`document.querySelectorAll('[data-community-message]').length <= 100`));
    const anchorAfter = await evaluate(`(()=>{const list=document.querySelector('.community-message-list'),node=[...list.querySelectorAll('[data-community-message]')].find(n=>n.dataset.communityMessage===${JSON.stringify(anchor.id)});return node.getBoundingClientRect().top-list.getBoundingClientRect().top})()`);assert(Math.abs(anchorAfter-anchor.top)<=8,'prepend anchor moved more than 8px');
    for(let n=0;n<10;n++){
      const first=await evaluate(`document.querySelector('[data-community-message]').dataset.communityMessage`);
      await evaluate(`(()=>{const list=document.querySelector('.community-message-list');list.scrollTop=0;list.dispatchEvent(new Event('scroll'));document.querySelector('.community-history').click()})()`);
      await waitFor(`document.querySelector('[data-community-message]').dataset.communityMessage!==${JSON.stringify(first)}`);assert.equal(await evaluate(`document.querySelectorAll('[data-community-message]').length`),100);
    }
    for(let n=0;n<10;n++){
      const first=await evaluate(`document.querySelector('[data-community-message]').dataset.communityMessage`);
      await evaluate(`(()=>{const list=document.querySelector('.community-message-list');list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'));[...list.querySelectorAll('.community-history')].find(b=>b.textContent.includes('后续')).click()})()`);
      await waitFor(`document.querySelector('[data-community-message]').dataset.communityMessage!==${JSON.stringify(first)}`);assert.equal(await evaluate(`document.querySelectorAll('[data-community-message]').length`),100);
    }
    await evaluate(`document.querySelector('.community-new-messages').click()`); await waitFor(`document.querySelector('.community-message-list').textContent.includes('测试书友的新消息')`);
    await evaluate(`(()=>{const list=document.querySelector('.community-message-list');list.scrollTop=0;list.dispatchEvent(new Event('scroll'))})()`);await delay(100);await evaluate(`(async()=>{const m=await import('/assets/${headerAsset}');window.__fixtureCommunityStore=Object.values(m).find(v=>typeof v==='function'&&v.getState&&v.getState().jumpToMessage);return true})()`);const mention=incoming('有一句话想分享给你。',[{memberId:ownMember,name:user.name}]);for(let n=0;n<60;n++)incoming('继续聊聊今天的阅读 '+n);await delay(200);assert(!receipts.has(mention.id));await evaluate(`document.querySelector('.community-new-messages').click()`);await waitFor(`document.querySelector('.community-message-list').textContent.includes('继续聊聊今天的阅读 59')`);await delay(2200);assert(!receipts.has(mention.id),'latest must preserve older offscreen mention');assert(await evaluate(`!!document.querySelector('.community-mentions-jump')`));await evaluate(`document.querySelector('.community-mentions-jump').click()`);await waitFor(`!!document.querySelector('[data-community-message=\"${mention.id}\"].community-jump-highlight')`);assert(contextCalls>0);await waitFor(`document.querySelector('.community-message-list').textContent.includes('有一句话想分享给你。')`);await delay(2200);await waitFor(`window.__fixtureCommunityStore.getState().readMessageIds.includes('${mention.id}')`);assert(receipts.has(mention.id),'target is marked only after visible dwell');await screenshot('mention-jump');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }); await delay(100); assert(await evaluate('document.documentElement.scrollWidth <= innerWidth')); assert(await evaluate(`document.querySelector('.community-send').getBoundingClientRect().bottom <= innerHeight`));assert(await evaluate(`document.querySelector('.account-capsule').getBoundingClientRect().right<=innerWidth`)); await screenshot('mobile');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true }); await delay(100); assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await evaluate(`document.querySelector('.appearance-theme').click()`); await delay(100); await screenshot('dark');
    await cdp.send('Page.navigate',{url:origin+'/#account'});await cdp.send('Page.reload',{ignoreCache:true});await waitFor(`document.querySelector('.community-unread-badge')`);assert(!(await evaluate(`[...document.styleSheets].some(s=>s.href?.includes('CommunityChatPage'))`)));assert.equal(await evaluate(`getComputedStyle(document.querySelector('.community-unread-badge')).backgroundColor`),'rgb(163, 79, 63)','unread badge must be styled without chat-page CSS');
    assert.equal(cdp.errors.length, 0); console.log(JSON.stringify({ passed: ['explicit consent before history/WS', 'Escape restores confirmation trigger focus', 'one WS host', 'native WS send and removal', 'quote auto mention and deletion independence', 'held window on incoming message', 'latest visible read preserves older mention', 'mention jumps load context and acknowledge visible target', 'historical window <=100 across 500-row boundary with 1000-row fixture', 'desktop/mobile/320px bounds', 'light/dark', 'no runtime errors'], prependAnchorDelta:Math.abs(anchorAfter-anchor.top),output })); await cdp.send('Browser.close').catch(() => {});
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally { cdp?.close(); browser?.kill(); for (const client of wss.clients) client.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); }
})();
