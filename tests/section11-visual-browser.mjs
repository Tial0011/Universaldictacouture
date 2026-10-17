// Isolated loopback/emulator QA. Never use a user profile or production credentials.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:5182';
const target = (await (await fetch('http://127.0.0.1:9228/json')).json()).find(page => page.type === 'page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let serial = 0;
const pending = new Map(), exceptions = [], findings = [], captures = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  const request = pending.get(message.id);
  if (request) { pending.delete(message.id); clearTimeout(request.timer); if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result); }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject, timer: setTimeout(() => reject(Error(method + ' timed out')), 30000) }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
async function until(expression) {
  for (let step = 0; step < 150; step++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error('Condition failed: ' + expression);
}
async function navigate(route, title) {
  await evaluate(`history.pushState({},'',${JSON.stringify(route)});dispatchEvent(new PopStateEvent('popstate'));`);
  await until(`document.querySelector('h1')?.textContent===${JSON.stringify(title)}`);
}
async function capture(name) {
  await evaluate('scrollTo(0,0);document.fonts.ready.then(()=>true)');
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const path = `.tools.local/section11-visual-${name}.png`;
  await writeFile(path, Buffer.from(result.data, 'base64')); captures.push(path);
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Accessibility.enable');
  await send('Page.navigate', { url: base + '/tests/section11-browser.html' });
  await until("!!document.querySelector('#auth-email')");
  await until("import('/src/firebase/auth.js').then(m=>m.auth.emulatorConfig?.port===9099 && m.auth.app.options.projectId==='demo-udc-section12')");
  const password = 'Profile-Local-QA-Only!', email = 'profile-module2-a@example.test';
  await evaluate(`import('/src/firebase/auth.js').then(m=>m.signIn(${JSON.stringify(email)},${JSON.stringify(password)})).then(()=>true)`);
  await until("document.body.innerText.includes('already signed in')");
  await navigate('/profile?area=personal', 'Personal Details');
  const widths = [320, 390, 768, 900, 1024, 1280, 1440, 1920];
  for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    for (const [area, title] of [['personal', 'Personal Details'], ['communications', 'Communications'], ['privacy', 'Privacy & Account']]) {
      await navigate('/profile?area=' + area, title);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      assert.equal(await evaluate("[...document.querySelectorAll('.profile-content img')].every(image=>image.complete && image.naturalWidth>0)"), true, 'Shared artwork loads');
      assert.equal(await evaluate("[...document.querySelectorAll('.profile-content label[for]')].every(label=>!!document.getElementById(label.htmlFor))"), true, 'Persistent associated labels');
      assert.equal(await evaluate("[...document.querySelectorAll('a,button,input,select')].filter(node=>node.closest('[hidden],[inert],[aria-hidden=true]')).every(node=>node.getClientRects().length===0 || node.closest('[inert]')?.inert || node.disabled || node.tabIndex<0)"), true);
      assert.equal(await evaluate("(()=>{const previous=document.activeElement;document.querySelector('[inert] button')?.focus();return document.activeElement===previous;})()"), true, 'Native inert drawer cannot take focus');
      if (area === 'personal') {
        assert.equal(await evaluate("[...document.querySelectorAll('.profile-details-form input')].every(input=>input.disabled && input.value==='')"), true);
        assert.equal(await evaluate("document.querySelectorAll('.profile-details-form input').length"), 4);
      }
      if (width === 390 || width === 1440) await capture(area + '-' + width);
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/profile?area=security', 'Sign-in & Security');
  // Inject a single unknown local provider acknowledgement; no production effect.
  await evaluate(`import('/src/firebase/auth.js').then(({auth})=>{const original=auth.signOut;window.__visualRestoreSignOut=()=>{auth.signOut=original;};window.__visualSignOutCalls=0;auth.signOut=async()=>{window.__visualSignOutCalls++;throw Object.assign(new Error('Local lost acknowledgement fixture'),{code:'auth/network-request-failed'});};})`);
  await evaluate("[...document.querySelectorAll('.profile-content button')].find(node=>node.textContent==='Sign out this session').click()");
  await until("document.querySelector('.account-notice[data-state=unknown]')?.textContent.includes('Sign-out could not be confirmed')");
  assert.equal(await evaluate("document.querySelector('.profile-navigation .btn').disabled"), true);
  assert.equal(await evaluate("[...document.querySelectorAll('.profile-content button')].find(node=>node.textContent==='Sign out this session').disabled"), true);
  assert.equal(await evaluate("document.querySelector('.account-notice[data-state=unknown]').textContent.includes('Changes saved')"), false);
  await capture('unknown-signout-1440');
  await evaluate("document.querySelector('.profile-navigation .btn').click();window.__visualSignOutCalls").then(value => assert.equal(value, 1));
  await evaluate('window.__visualRestoreSignOut()');
  await evaluate("[...document.querySelectorAll('.account-notice button')].find(node=>node.textContent==='Check current session').click()");
  await until("!!document.querySelector('.profile-workspace') && !document.querySelector('.account-notice[data-state=unknown]')");
  assert.equal(await evaluate("document.querySelector('.profile-field-contract dd').textContent"), email);
  assert.equal(await evaluate("dispatchEvent(new Event('offline'));!document.querySelector('.profile-workspace')"), true);
  const ax = (await send('Accessibility.getFullAXTree')).nodes.filter(node => !node.ignored).map(node => node.name?.value || '').join('\n');
  assert.equal(ax.includes(email), false); assert.equal(ax.includes('Full Name'), false);
  await capture('privacy-shield-1440');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await capture('privacy-shield-390');
  await evaluate("dispatchEvent(new Event('online'))"); await until("!!document.querySelector('.profile-workspace')");
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('/profile?area=communications', 'Communications'); await capture('forced-colors-390');
  await send('Emulation.setEmulatedMedia', { features: [] });
  assert.deepEqual(exceptions, []);
  findings.push('24 Profile state/width checks; private fields remain blank/disabled on unavailable source; artwork and labels resolve; unknown sign-out suppresses repeat and exposes real session recheck; shield clears DOM and AX');
  await writeFile('.tools.local/section11-visual-browser-result.json', JSON.stringify({ widths, findings, captures, runtimeExceptions: 0, privateOwnerPositiveFlows: 'unavailable; not claimed', result: 'available-runtime-checks-passed' }, null, 2));
  console.log('Section-11 visual runtime, unknown-signout and shield checks passed.');
} finally {
  await evaluate('window.__visualRestoreSignOut?.()').catch(() => {});
  await send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
  socket.close();
}
