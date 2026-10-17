import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
async function adapter(request) {
  const context = createContext({ crypto: { randomUUID } });
  const module = new SourceTextModule(readFileSync('src/services/pretransaction.js', 'utf8'), { context });
  await module.link(() => new SyntheticModule(['accountRequest'], function() { this.setExport('accountRequest', request); }, { context })); await module.evaluate();
  return module.namespace.createContinuityAdapter('provider-A', 'piece');
}
test('M05 lost acknowledgement reconciles the same logical effect without blind mutation replay', async () => {
  let saved = false, writes = 0;
  const client = await adapter(async action => {
    if (action === 'save-state') return { version: saved ? 1 : 0, epoch: 1, saved };
    if (action === 'save-mutate') { writes++; saved = true; throw Object.assign(Error('Lost acknowledgement'), { code: 'auth/outcome-unknown' }); }
    if (action === 'cluster-operation') return { state: 'committed', version: 1, saved: true };
  });
  await assert.rejects(client.set('piece', true), { code: 'auth/outcome-unknown' });
  assert.equal((await client.set('piece', true)).saved, true); assert.equal(writes, 1);
});
test('M05 still unknown blocks an opposite save intent; newer other-device state is not regressed', async () => {
  let known = false, writes = 0;
  const client = await adapter(async action => {
    if (action === 'save-state') return { version: 2, epoch: 1, saved: false };
    if (action === 'save-mutate') { writes++; throw Object.assign(Error('Lost acknowledgement'), { code: 'auth/outcome-unknown' }); }
    if (action === 'cluster-operation') return { state: known ? 'committed' : 'unknown', saved: true, version: 1 };
  });
  await assert.rejects(client.set('piece', true)); await assert.rejects(client.set('other', true), { code: 'outcome-unknown' }); assert.equal(writes, 1);
  known = true; await assert.rejects(client.set('piece', true), { code: 'stale-conflict' }); assert.equal(writes, 1);
});
test('M01/M05 late Account-A response cannot leave the actual API adapter under Account B', async () => {
  let finish;
  const auth = { currentUser: { uid: 'A', getIdToken: async () => 'synthetic-test-token' } };
  const context = createContext({ URL, AbortSignal, window: { location: { origin: 'http://localhost' } }, fetch: async () => new Promise(resolve => { finish = resolve; }) });
  const module = new SourceTextModule(readFileSync('src/services/accountApi.js', 'utf8'), { context });
  await module.link(specifier => specifier === 'firebase/auth'
    ? new SyntheticModule(['getAuth'], function() { this.setExport('getAuth', () => auth); }, { context })
    : new SyntheticModule(['default', 'isFirebaseConfigured'], function() { this.setExport('default', {}); this.setExport('isFirebaseConfigured', true); }, { context }));
  await module.evaluate();
  const pending = module.namespace.accountRequest('saves', { kind: 'piece' }, { principalUid: 'A' });
  await new Promise(resolve => setImmediate(resolve)); auth.currentUser = { uid: 'B' };
  finish({ ok: true, json: async () => ({ records: [{ targetId: 'Private-A' }] }) });
  await assert.rejects(pending, { code: 'auth/principal-changed' });
});
