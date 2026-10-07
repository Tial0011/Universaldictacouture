import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {evaluateSection11Gate} from '../scripts/section11-final-gate.mjs';
const root=new URL('../',import.meta.url);
const source=file=>readFileSync(new URL(file,root),'utf8');
const report=()=>JSON.parse(source('docs/section11-final-coverage.json'));
test('all 31 flows have actor/target/authority/owner/state/result/error/code/test mapping, not a fabricated journey register',()=>{
  const value=report();const gate=evaluateSection11Gate(value,{closedAccountStub:true});assert.equal(gate.mappedFlows,31);assert.equal(gate.mappedVisuals,15);assert.equal(gate.lockCandidate,false);assert.equal(value.physicalMapping.startsWith('COMPLETED'),true);assert.equal(value.formalJourneyRegister,false);
  for(const flow of value.flows){for(const key of ['actor','target','currentPrincipal','authorization','purpose','dataOwner','scope','currentState','authoritativeResult','failure','stale','unknown','section16Guarantee'])assert.ok(flow[key]);for(const file of [...flow.code,...flow.tests])assert.ok(existsSync(new URL(file,root)),file);}
});
test('counts/architecture PASS cannot override incomplete behavior or unresolved HIGH/CRITICAL defects',()=>{
  const value=report();value.verdict='PASS';assert.equal(evaluateSection11Gate(value,{closedAccountStub:true}).verdict,'PARTIAL');value.flows.forEach(flow=>flow.completion=true);value.visuals.forEach(visual=>visual.implementationValidated=true);assert.equal(evaluateSection11Gate(value).lockCandidate,false);value.defects.forEach(defect=>defect.resolved=true);assert.equal(evaluateSection11Gate(value,{closedAccountStub:true}).lockCandidate,false);
});
test('gate rejects malformed flow/visual/module mappings and missing executable validation',()=>{
  for(const mutate of [value=>value.flows.pop(),value=>value.visuals.push(value.visuals[0]),value=>value.modules.push({id:11,flowCount:0}),value=>value.validation.buildPassed=false,value=>value.flows[0].scope='',value=>value.modules[0].flowCount=11]){const value=report();mutate(value);assert.ok(evaluateSection11Gate(value).problems.length);assert.equal(evaluateSection11Gate(value).lockCandidate,false);}
});
test('synthetic fully evidenced input can pass the evaluator; evaluator itself is not runtime authorization',()=>{
  const value=report();value.flows.forEach(flow=>flow.completion=true);value.visuals.forEach(visual=>visual.implementationValidated=true);value.defects.forEach(defect=>defect.resolved=true);assert.equal(evaluateSection11Gate(value).verdict,'PASS');assert.equal(evaluateSection11Gate(report(),{closedAccountStub:true}).verdict,'PARTIAL');
});
test('provider session tagged explicitly; Staff authority cannot become private Customer mode',()=>{
  const hook=source('src/hooks/useCustomerSession.js');assert.match(hook,/principalKind: principal.user \? "provider" : "guest"/);assert.match(hook,/customerPrincipal: null/);assert.match(hook,/user: null/);
  const chat=source('src/services/chats.js');assert.match(chat,/if \(!admin\) \{\s*requireCustomerAccountAuthority\(\)/);assert.doesNotMatch(chat,/customerName: \(user.displayName|customerEmail: user.email/);
});
test('current policy rejects old Personal Details fields, dormant email Rules, stale terms, fake authority and raw diagnostic payloads',()=>{
  const rules=source('firestore.rules');const profile=rules.slice(rules.indexOf('match /customerProfiles'),rules.indexOf('match /conversations'));assert.doesNotMatch(profile,/token.email|hasOnly.*email|false &&/);assert.match(profile,/allow write: if false/);assert.match(rules,/\.trim\(\)\.size\(\) > 0/);
  assert.doesNotMatch(source('src/services/styleCircle.js'),/console\.error\(error\)/);
  assert.doesNotMatch(source('src/pages/Profile/Profile.jsx'),/Dicta Stylist|Data Stylist|Deactivate Account|Pause Account|Reactivate Account|dangerouslySetInnerHTML/);
});
test('authentication icons use existing real artwork without new canonical references or invented state glyphs',()=>{
  const auth=source('src/pages/Auth/Auth.jsx');assert.match(auth,/<AccountIcon name=\{name\} className="auth-icon"/);assert.match(source('src/components/account/AccountVisuals.jsx'),/artwork = import.meta.glob/);assert.match(auth,/<AuthIcon name=\{visible \? "eye-off" : "eye"\}/);assert.doesNotMatch(auth,/mark="[✓●⌁✉◆◇]"|<svg viewBox/);
  assert.equal(report().visualSource.newCanonicalCount,0);for(const icon of ['lock','shield','users','check-circle','alert-circle','eye','eye-off'])assert.ok(existsSync(new URL('src/assets/admin/icons/'+icon+'.svg',root)));
});
