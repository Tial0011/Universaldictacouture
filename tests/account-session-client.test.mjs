import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function fixture({outage=false}={}) {
  const auth={currentUser:{uid:'existing',getIdToken:async()=>'local-token'}},storage=new Map();let admissions=0,ready=false,release;
  const barrier=new Promise(resolve=>{release=resolve;});
  const context=vm.createContext({URL,AbortSignal,Map,CustomEvent:class{},window:{location:{origin:'http://localhost'},dispatchEvent(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:key=>storage.get(key),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url)=>{
    const action=url.searchParams.get('action');
    if(action==='session-end'&&outage)throw Error('offline');
    if(action==='session-start'){admissions++;await barrier;ready=true;return Response.json({sessionRef:'a'.repeat(64)});}
    return ready?Response.json({state:'ready'}):Response.json({error:'session-required'},{status:401});
  }});
  context.Event=Event;
  const module=new vm.SourceTextModule(await readFile(new URL('../src/services/accountApi.js',import.meta.url),'utf8'),{context});
  const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});
  await module.link(name=>name==='firebase/auth'?synthetic({getAuth:()=>auth}):synthetic({default:{},isFirebaseConfigured:true}));await module.evaluate();
  return {api:module.namespace,storage,release,admissions:()=>admissions,auth};
}
test('simultaneous owner hooks establish one session and each rechecks its original request',async()=>{
  const f=await fixture();const requests=Array.from({length:8},()=>f.api.accountRequest('profile'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.admissions(),1);f.release();
  assert.ok((await Promise.all(requests)).every(value=>value.state==='ready'));
});
test('account switch during session admission discards the old response and does not establish its private client context',async()=>{
  const f=await fixture();const request=f.api.accountRequest('profile');await new Promise(resolve=>setImmediate(resolve));
  f.auth.currentUser={uid:'other'};f.release();await assert.rejects(request,{code:'auth/principal-changed'});assert.equal(f.storage.size,0);
});
test('server outage cannot trap a user in local sign-in; remote revocation is explicitly unconfirmed',async()=>{
  const f=await fixture({outage:true});f.storage.set('udc:managed-session:existing:customer','1');
  const result=await f.api.endManagedSessions(f.auth.currentUser);assert.equal(result.confirmed,false);assert.equal(f.storage.size,0);
});
