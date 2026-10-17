import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNT_NOTICE_STATES } from '../src/components/account/accountVisualContract.js';

let server, visuals, content;
before(async () => {
  server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  visuals = await server.ssrLoadModule('/src/components/account/AccountVisuals.jsx');
  content = await server.ssrLoadModule('/src/pages/Profile/ProfileContent.jsx');
});
after(async () => { await server?.close(); });
const render = (component, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(component, props)));

test('all shared notice states render distinct truthful titles without consequential effects', () => {
  assert.equal(Object.keys(ACCOUNT_NOTICE_STATES).length, 10);
  for (const [state, value] of Object.entries(ACCOUNT_NOTICE_STATES)) {
    const html = render(visuals.AccountNotice, { state });
    assert.ok(html.includes(value.title.replaceAll('…', '…')));
    assert.ok(html.includes(`data-state="${state}"`));
    assert.equal((html.match(/role="status"/g) || []).length, 1);
    assert.ok(!html.includes('<button'));
    if (['pending', 'longer', 'checking', 'unknown'].includes(state)) assert.ok(!html.includes('Changes saved'));
  }
});
test('shared notice treats text as inert data and renders one announcement', () => {
  const html = render(visuals.AccountNotice, { title: '<script>PRIVATE()</script>', children: '<img onerror=PRIVATE()>' });
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;img'));
});
test('privacy shield renders no child Profile or account data and keeps states distinct', () => {
  for (const state of ['checking', 'unavailable', 'revoked']) {
    const html = render(visuals.AccountAccessState, { state, children: React.createElement('p', null, 'PRIVATE-OLD-DATA') });
    assert.ok(!html.includes('PRIVATE-OLD-DATA')); assert.ok(!html.includes('profile-workspace'));
    assert.ok(html.includes(state === 'revoked' ? 'Session revoked' : state === 'checking' ? 'Checking current access' : 'Your information is currently unavailable'));
  }
});

test('loaded Profile overview never claims that its working source is unavailable', () => {
  const html=render(content.ProfileOverview,{profileState:'loaded',openArea(){},onRefresh(){}});
  assert.ok(html.includes('Your account is connected'));
  assert.ok(!html.includes('We can’t load your Profile right now'));
});
test('unavailable Personal Details has five concepts, associated native labels and no inferred credential/profile data', () => {
  const html = render(content.PersonalDetails, { profileState: 'unavailable', profile: { fullName: 'STALE-PRIVATE', email: 'secret@example.test' } });
  assert.equal((html.match(/<dt>/g) || []).length, 5); assert.equal((html.match(/<input/g) || []).length, 4);
  for (const key of ['fullName', 'preferredName', 'phoneNumber', 'publicDisplayName']) {
    assert.ok(html.includes(`for="profile-${key}"`)); assert.ok(html.includes(`id="profile-${key}-hint"`));
  }
  assert.ok(!html.includes('STALE-PRIVATE')); assert.ok(!html.includes('secret@example.test'));
  assert.ok(!html.includes('type="password"')); assert.ok(!html.includes('type="email"'));
});
test('confirmed text projection does not authorize writes or turn a photo reference into a public URL', () => {
  const html = render(content.PersonalDetails, { profileState: 'loaded', profile: { fullName: '<PRIVATE>', preferredName: 'Current', phoneNumber: '+234', publicDisplayName: 'Public', profilePhoto: 'SECRET-REFERENCE' } });
  assert.ok(html.includes('value="&lt;PRIVATE&gt;"')); assert.ok(html.includes('value="Public"'));
  assert.ok(!html.includes('SECRET-REFERENCE')); assert.equal((html.match(/<input[^>]*disabled=""/g) || []).length, 4);
});
test('communication presets are one disabled, unset radio group and essential channels are bounded', () => {
  const html = render(content.Communications);
  assert.equal((html.match(/name="communication-preset"/g) || []).length, 3);
  assert.ok(html.includes('<fieldset disabled=""')); assert.ok(!html.includes('checked=""'));
  assert.ok(html.includes('Email and in-site notifications')); assert.ok(!/SMS|WhatsApp|Push/.test(html));
});
test('continuity links carry no private snapshot and missing commercial destinations stay unavailable', () => {
  const html = render(content.ClosetContinuity);
  assert.ok(html.includes('/my-closet/my-pieces')); assert.ok(html.includes('/my-closet/saved-reviews'));
  assert.ok(!html.includes('href="/orders')); assert.ok(!html.includes('href="/payments'));
  assert.ok(html.includes('/my-closet/orders'));assert.equal((html.match(/Not available yet/g) || []).length, 1);
});
test('privacy groups distinguish unavailable from empty, and deletion never claims historical erasure', () => {
  const html = render(content.PrivacyAccount);
  assert.equal((html.match(/Source unavailable/g) || []).length, 4);
  assert.ok(html.includes('not a complete view')); assert.ok(html.includes('does not automatically cancel orders'));
  assert.ok(!html.includes('No information')); assert.ok(!html.includes('Everything UDC has'));
});
test('sign-in security exposes only the current provider email, not device or credential secrets', () => {
  const html = render(content.SignInSecurity, { user: { email: 'fixture@example.test', password: 'SECRET', accessToken: 'SECRET', displayName: 'PRIVATE' }, busy: false, logout() {} });
  assert.ok(html.includes('fixture@example.test')); assert.ok(!html.includes('SECRET')); assert.ok(!html.includes('PRIVATE'));
  assert.ok(html.includes('Sign out this session')); assert.ok(html.includes('No remote sign-out'));
});
test('actual UI uses shared tokens/artwork rather than screenshot interfaces or a parallel palette', () => {
  const source = readFileSync('src/pages/Profile/ProfileContent.jsx', 'utf8') + readFileSync('src/components/account/AccountVisuals.jsx', 'utf8');
  assert.ok(!/section11-final-reference|\.tools\.local|dangerouslySetInnerHTML|<svg|Alexandra|Adaeze/.test(source));
  const css = readFileSync('src/components/account/AccountVisuals.css', 'utf8');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css)); assert.ok(css.includes('var(--color-brand)'));
});
