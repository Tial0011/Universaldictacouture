import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as flow from '../src/services/authFlow.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
async function controller(){
  const slots=[],events=new Map(),storage=new Map(),checks=[],writes=[];let cursor=0,observer,timer,cleanup,flushes=0,expired=false;
  const auth={currentUser:null};
  const react={createContext:value=>value,Fragment:()=>{},useContext:value=>value,useState(initial){const slot=cursor++;if(!(slot in slots))slots[slot]=initial;return [slots[slot],value=>{slots[slot]=typeof value==='function'?value(slots[slot]):value;writes.push({slot,value:slots[slot]});}];},useCallback:fn=>fn,useEffect:fn=>{if(!cleanup)cleanup=fn();},useLayoutEffect:()=>{}};
  const context=vm.createContext({Date,Error,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{history:{state:null},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:()=>{},setInterval:fn=>{timer=fn;return 1;}},document:{visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:()=>{},querySelector:()=>null},clearInterval:()=>{}});
  const sdk={auth,expireSession:async()=>{auth.currentUser=null;},sessionPolicyExpired:()=>expired,revalidateFirebasePrincipal:user=>{const request=deferred();checks.push({user,...request});return request.promise;},subscribeToAuthChanges:fn=>{observer=fn;return ()=>{};}};
  // Run the actual production controller; replace only its final JSX render
  // with a snapshot. Browser tests separately exercise real React/DOM focus.
  let code=readFileSync(new URL('../src/context/AuthContext.jsx',import.meta.url),'utf8');
  const start=code.indexOf('  return (\n    <AuthContext.Provider');const end=code.indexOf('\nexport function useAuth');assert.ok(start>0&&end>start);
  code=code.slice(0,start)+'  return { user, isLoading, sessionState, sessionExpired, verificationRevision };\n}\n'+code.slice(end);
  const synthetic=entries=>new vm.SyntheticModule(Object.keys(entries),function(){for(const[k,v]of Object.entries(entries))this.setExport(k,v);},{context});
  const module=new vm.SourceTextModule(code,{context});await module.link(name=>name==='react'?synthetic(react):name==='react-dom'?synthetic({flushSync:fn=>{flushes++;fn();}}):name.includes('authFlow')?synthetic(flow):synthetic(sdk));await module.evaluate();
  const snapshot=()=>{cursor=0;return module.namespace.AuthProvider({children:null});};snapshot();
  return {auth,checks,writes,snapshot,emit(user){auth.currentUser=user;observer(user);},notify(user){observer(user);},timer(){timer();},event(name,value={}){events.get(name)?.(value);},expire(){expired=true;},intentionalSignOut(){storage.set('udc:auth:intentional-signout',String(Date.now()));auth.currentUser=null;observer(null);events.get('udc:auth:signed-out')?.();},flushes:()=>flushes,async confirm(uid){checks.at(-1).resolve({uid});await tick();},async reject(code){checks.at(-1).reject({code});await tick();}};
}
test('routine current-session refresh retains same-principal local subtree while still revalidating',async()=>{
  const c=await controller();c.emit({uid:'A'});await c.confirm('A');const revision=c.snapshot().verificationRevision;c.writes.length=0;
  c.timer();assert.equal(c.snapshot().user.uid,'A');assert.equal(c.snapshot().isLoading,false);assert.equal(c.writes.some(w=>w.slot===0&&w.value===null),false);
  await c.confirm('A');assert.ok(c.snapshot().verificationRevision>revision);assert.equal(c.snapshot().user.uid,'A');
});
test('BFCache/foreground/offline genuinely uncertain authority withdraws synchronously and old success cannot restore it',async()=>{
  const c=await controller();c.emit({uid:'A'});await c.confirm('A');c.event('pageshow',{persisted:true});assert.equal(c.snapshot().user,null);assert.ok(c.flushes()>0);
  const old=c.checks.at(-1);c.event('offline');assert.equal(c.snapshot().sessionState,'unverifiable');old.resolve({uid:'A'});await tick();assert.equal(c.snapshot().user,null);
});
test('late A success/failure cannot overwrite confirmed B; opaque A continuations are invalidated on actual principal transition',async()=>{
  const c=await controller();c.emit({uid:'A'});const old=c.checks.at(-1);const state=flow.createAuthContinuation('/chats','A');c.emit({uid:'B'});assert.equal(c.snapshot().user,null);await c.confirm('B');old.reject({code:'auth/user-disabled'});await tick();assert.equal(c.snapshot().user.uid,'B');assert.equal(flow.continuationTarget({authContinuation:state.authContinuation},'A'),'');
});
test('routine check failure revokes preserved presentation instead of leaving stale authority',async()=>{
  const c=await controller();c.emit({uid:'A'});await c.confirm('A');c.timer();await c.reject('auth/network-request-failed');assert.equal(c.snapshot().user,null);assert.equal(c.snapshot().sessionState,'unverifiable');
});
test('out-of-order A/null notifications cannot regress current B or create a duplicate revalidation request',async()=>{
  const c=await controller();c.emit({uid:'B'});await c.confirm('B');const count=c.checks.length;c.notify({uid:'A'});c.notify(null);await tick();assert.equal(c.snapshot().user.uid,'B');assert.equal(c.checks.length,count);
});
test('expired policy is not prolonged by soft refresh; sign-out defeats delayed revocation callback',async()=>{
  const c=await controller();c.emit({uid:'A'});await c.confirm('A');c.expire();c.timer();await tick();assert.equal(c.snapshot().user,null);assert.equal(c.snapshot().sessionState,'expired');
  const other=await controller();other.emit({uid:'A'});await other.confirm('A');other.timer();const old=other.checks.at(-1);other.intentionalSignOut();old.reject({code:'auth/user-disabled'});await tick();assert.equal(other.snapshot().user,null);assert.equal(other.snapshot().sessionState,'signed-out');
});
