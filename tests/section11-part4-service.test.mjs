import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as policy from '../src/services/staffAuthorization.js';
import * as model from '../src/services/operationsModel.js';
import * as activity from '../src/services/operationalActivity.js';
import {currentReadDeadline} from '../src/services/operationalRuntime.js';
import {studioStaff,route} from './staff-fixtures.mjs';
async function reader({records=20,status=200,onRows,onToken,onJson,onNative}={}){
  const requests=[];let membership={...studioStaff(),staffId:'staff-A'},jsonReads=0;
  const user=uid=>({uid,getIdToken:async()=>{onToken?.(control);return 'synthetic-token';}});
  const auth={currentUser:user('A'),app:{options:{projectId:'fixture'}}};
  const control={switchPrincipal(uid){auth.currentUser=user(uid);membership={...studioStaff(),staffId:'staff-'+uid};},membership(value){membership=value;}};
  const rows=Array.from({length:records},(_,index)=>({document:{name:'projects/fixture/databases/(default)/documents/products/p'+index,fields:{name:{stringValue:'Product'},status:{stringValue:'draft'},actorStaffId:{stringValue:'staff-A'},execution:{stringValue:'staff'},targetCollection:{stringValue:'products'},targetId:{stringValue:'p0'},action:{stringValue:'archive'},outcome:{stringValue:'committed'},createdAt:{timestampValue:'2026-01-01T00:00:00Z'}}}}));
  const context=vm.createContext({Date,AbortSignal,fetch:async(url,options)=>{
    requests.push({url,options});onRows?.(control);
    return {status,ok:status===200,json:async()=>{jsonReads++;onJson?.(control);return url.includes(':runQuery')?rows:rows[0]?.document;}};
  }});
  const synthetic=entries=>new vm.SyntheticModule(Object.keys(entries),function(){for(const[k,v]of Object.entries(entries))this.setExport(k,v);},{context});
  const sdk={collection:(_db,name)=>name,doc:(_db,name,id)=>({name,id}),documentId:()=> '__name__',getDocFromServer:async()=>({exists:()=>true,data:()=>membership}),getDocsFromServer:async()=>{onRows?.(control);const docs=rows.map((row,i)=>({id:'p'+i,data:()=>({name:'Product',status:'draft'}),metadata:{}}));return {docs,size:docs.length};},limit:n=>({limit:n}),orderBy:value=>({orderBy:value}),query:(...args)=>args,startAfter:after=>({after}),where:(field,op,value)=>({field,op,value})};
  const dependencies={'firebase/firestore':synthetic(sdk),'../firebase/firestore':synthetic({db:{}}),'../firebase/auth':synthetic({auth}),'./staffAuthorization':synthetic(policy),'./operationsModel':synthetic(model),'./operationalActivity':synthetic(activity),'./operationalRuntime':synthetic({currentReadDeadline})};
  dependencies['./accountApi']=synthetic({accountRequest:async(action,input)=>{
    requests.push({url:'native:'+action,input});onNative?.(control);
    const source={orderId:'native-owner',reference:'UDC-NATIVE',status:'OPEN',currentWork:'base',currentEdition:1,assignedStaffId:'staff-A',fulfilment:'NOT STARTED',delivery:'NOT PREPARED',workCompleted:false,workCancelled:false,privateNote:'DO NOT DISCLOSE',proofReferenceId:'PRIVATE PROOF'};
    return action==='staff-order-summary'?source:{records:[source],complete:false};
  }});
  const module=new vm.SourceTextModule(readFileSync(new URL('../src/services/operations.js',import.meta.url),'utf8'),{context,initializeImportMeta(meta){meta.env={DEV:false};}});await module.link(name=>dependencies[name]);await module.evaluate();
  return {service:module.namespace,requests,control,jsonReads:()=>jsonReads};
}
test('SDK owner pages do not transplant A records/cursors into B even when B has overlapping grants',async()=>{
  const subject=await reader({onRows:c=>c.switchPrincipal('B')});await assert.rejects(subject.service.loadScopedOwnerPage('products'),{code:'permission-denied'});
});
test('scope narrowing discards the entire REST response rather than disclose old hasMore or false empty state',async()=>{
  const subject=await reader({onRows:c=>c.membership({...studioStaff(),staffId:'staff-A',capabilities:{'products.read':{selectedObject:{active:true,purpose:'catalogue',ids:['different']}}}})});await assert.rejects(subject.service.loadOperationalPage('products'),{code:'permission-denied'});
});
test('My Activity remains bound to its original Staff identity across migration/rebinding',async()=>{
  const subject=await reader({onRows:c=>c.membership({...studioStaff(),staffId:'new-staff'})});await assert.rejects(subject.service.loadActivityPage('mine'),{code:'permission-denied'});
});
test('principal switch during JSON delivery cannot present/cache the decoded old response',async()=>{
  const subject=await reader({onJson:c=>c.switchPrincipal('B')});await assert.rejects(subject.service.loadOperationalPage('products'),{code:'permission-denied'});assert.equal(subject.jsonReads(),1);
});
test('principal switch while token is being prepared prevents any old-principal owner fetch',async()=>{
  const subject=await reader({onToken:c=>c.switchPrincipal('B')});await assert.rejects(subject.service.loadOperationalPage('products'),{code:'permission-denied'});assert.equal(subject.requests.length,0);
});
test('no-result exact lookup still rechecks current capability instead of returning stale absence',async()=>{
  const subject=await reader({status:404,onRows:c=>c.membership({...studioStaff(),staffId:'staff-A',capabilities:{}})});await assert.rejects(subject.service.readOperationalRecord('products','missing'),{code:'permission-denied'});
});
test('unchanged Staff scope works; generic Chat projections request no transcript/contact/private media',async()=>{
  const subject=await reader({records:1});const result=await subject.service.loadOperationalPage('chats');assert.equal(result.items.length,1);const request=JSON.parse(subject.requests[0].options.body);assert.deepEqual(request.structuredQuery.select.fields.map(field=>field.fieldPath),['lastSenderRole','updatedAt','assignedStaffId']);assert.equal(subject.requests[0].options.cache,'no-store');
});
test('malformed selected IDs cannot alter owner paths or create broad-query fallback',async()=>{
  const subject=await reader();subject.control.membership({active:true,staffId:'staff-A',capabilities:{'products.read':{selectedObject:{active:true,purpose:'catalogue',ids:['../other','x/y','']}}}});await assert.rejects(subject.service.loadOperationalPage('products'),{code:'permission-denied'});assert.equal(subject.requests.length,0);
  subject.control.membership({active:true,staffId:'staff-A',capabilities:{'products.read':route('catalogue')}});assert.equal((await subject.service.loadOperationalPage('products')).items.length,20);
});
test('malformed cached plan indices cannot access array prototypes or cause a broad-query fallback',async()=>{
  for(const cursor of [{planIndex:'__proto__'},{planIndex:-1},{planIndex:0.5},[],'wrong',0,false,'']){const subject=await reader();await assert.rejects(subject.service.loadOperationalPage('products',cursor),{code:'permission-denied'});assert.equal(subject.requests.length,0);}
});
test('native Order API responses retain the original principal fence and cannot transplant A data into B',async()=>{
  const subject=await reader({onNative:control=>control.switchPrincipal('B')});
  await assert.rejects(subject.service.loadOperationalPage('orders'),{code:'permission-denied'});
});
test('native Order Search uses trusted reads, excludes private fields and never turns a queue row into Attention',async()=>{
  const subject=await reader();const page=await subject.service.loadOperationalPage('orders');
  assert.equal(page.complete,false);assert.equal(page.items.length,1);assert.equal(page.items[0].needsAction,false);assert.ok(!JSON.stringify(page).includes('DO NOT DISCLOSE'));assert.ok(!JSON.stringify(page).includes('PRIVATE PROOF'));
  const current=await subject.service.readOperationalRecord('orders','native-owner');assert.equal(current.href,'/admin/orders/native-owner?work=base');assert.equal(subject.requests[0].url,'native:staff-order-queue');
});
