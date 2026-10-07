import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as profile from '../src/services/profileExperience.js';
import * as authority from '../src/services/customerAccountAuthority.js';
const source = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Personal Details has exactly five concepts; credentials, demographics and privilege fields are rejected',()=>{
  assert.deepEqual(profile.PERSONAL_DETAILS_FIELDS,['profilePhoto','fullName','preferredName','phoneNumber','publicDisplayName']);
  for(const field of ['email','password','dob','gender','country','measurements','role','accountId','lifecycle','staffNotes'])assert.throws(()=>profile.personalDetailsPayload({[field]:'private'}),{code:'invalid-argument'});
  assert.deepEqual(profile.personalDetailsPayload({fullName:' Private Name ',phoneNumber:'+234 123',preferredName:'',publicDisplayName:' Public '}),{fullName:'Private Name',phoneNumber:'+234 123',preferredName:'',publicDisplayName:'Public'});
});
test('private identity never becomes public fallback and response serialization excludes unknown sensitive fields',()=>{
  const raw={fullName:'PRIVATE',preferredName:'PRIVATE',publicDisplayName:'',email:'SECRET',staffNotes:'SECRET',roles:['Admin'],password:'SECRET'};
  assert.equal(profile.publicProfileIdentity(raw),null);
  assert.deepEqual(profile.personalDetailsProjection(raw),{fullName:'PRIVATE',preferredName:'PRIVATE',publicDisplayName:''});
  assert.equal(profile.publicProfileIdentity({...raw,publicDisplayName:'Public'}),'Public');
});
test('only meaningful conflicting local edits need Current Saved versus Your Unsaved handling',()=>{
  const baseline={fullName:'Old',phoneNumber:'One',preferredName:'A'};
  assert.deepEqual(profile.meaningfulPersonalConflict(baseline,{...baseline,phoneNumber:'Two'},{...baseline,fullName:'Local'}),[]);
  assert.deepEqual(profile.meaningfulPersonalConflict(baseline,{...baseline,fullName:'Remote'},{...baseline,fullName:'Local'}),['fullName']);
  assert.deepEqual(profile.meaningfulPersonalConflict(baseline,{...baseline,fullName:'Local'},{...baseline,fullName:'Local'}),[]);
});
test('late response and older photo selection cannot become current under another principal',()=>{
  const scope=profile.identityBoundRequests();scope.reset('A');const first=scope.begin('photo');const latest=scope.begin('photo');
  assert.equal(scope.current(first),false);assert.equal(scope.current(latest),true);const oldInfo=scope.begin('information');scope.reset('B');
  assert.equal(scope.current(latest),false);assert.equal(scope.current(oldInfo),false);scope.reset('A');assert.equal(scope.current(latest),false);
});
test('presets are a single mutually exclusive unset group when current persistence is unavailable',()=>{
  assert.deepEqual(profile.COMMUNICATION_PRESETS,['Important Only','Balanced','All Updates']);const jsx=source('src/pages/Profile/ProfileContent.jsx');
  assert.match(jsx,/type="radio" name="communication-preset"/);assert.match(jsx,/<fieldset disabled/);assert.doesNotMatch(jsx,/defaultChecked|checked=\{true\}/);
});
test('continuity stays in My Closet; missing transaction routes are not silently retargeted',()=>{
  assert.equal(profile.CLOSET_LINKS[0].to,'/my-closet/my-pieces');assert.equal(profile.CLOSET_LINKS[1].to,'/my-closet/saved-reviews');
  assert.ok(profile.CLOSET_LINKS.slice(2).every(link=>link.to===null));assert.equal(profile.profileArea('//foreign'),'overview');
});
test('authenticated account navigation is not blanket blocked, but private data and consequential writes remain separately enforced',()=>{
  assert.match(source('src/App.jsx'),/path="\/profile" element=\{<Profile \/>\}/);
  const jsx=source('src/pages/Profile/Profile.jsx');assert.match(jsx,/if \(!user\) return <Navigate/);assert.match(jsx,/\["unverifiable", "revoked"\]/);assert.match(jsx,/scope.current\(ticket\)/);
  assert.doesNotMatch(jsx,/user.displayName|profile\?\.phoneNumber|sendAccountVerification|setPassword|deleteUser|setDoc|fetch\(/);
});
test('profile service cannot re-enable unsafe UID upserts or raw database dumps when the integration boundary changes',async()=>{
  const context=vm.createContext({Error});
  const synth=entries=>new vm.SyntheticModule(Object.keys(entries),function(){for(const[k,v]of Object.entries(entries))this.setExport(k,v);},{context});
  for(const available of [false,true]){
    const module=new vm.SourceTextModule(source('src/services/customerProfile.js'),{context});
    await module.link(name=>name.includes('customerAccountAuthority')?synth(available?{requireCustomerAccountAuthority:()=>({accountId:'bound'})}:authority):synth(profile));await module.evaluate();
    const code=available?'profile-source-unavailable':'account-source-unavailable';
    await assert.rejects(module.namespace.fetchCustomerProfile('A'),{code});await assert.rejects(module.namespace.saveCustomerProfile({uid:'A'},{}),{code});
  }
  assert.doesNotMatch(source('src/services/customerProfile.js'),/setDoc|\.displayName|user\.email|getDoc/);
});
