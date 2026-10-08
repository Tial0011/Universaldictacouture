// Local QA only. Deliberately cannot run against a production project/host.
import { createServer } from 'node:http';
import { accountRuntime } from '../netlify/lib/firebase-admin-runtime.js';
import { createAccountHandler } from '../netlify/lib/account-handler.js';
process.env.FIREBASE_PROJECT_ID='demo-udc-section12';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.UDC_SITE_ORIGIN='http://127.0.0.1:5182';process.env.UDC_IDENTITY_HMAC_KEY='local-section16-qa-only-secret-not-production';
const runtime=accountRuntime(), delivered=[];
const handler=createAccountHandler(runtime,{minimumPublicMs:10,deliverProof:async message=>delivered.push(message)});
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,runtime.origin);
    if(url.pathname==='/_section16_test/proof'){
      const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];const claims=await runtime.auth.verifyIdToken(token,true);const user=await runtime.auth.getUser(claims.uid);
      const item=delivered.findLast(message=>message.email===user.email);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(item?{url:item.url}:{}));return;
    }
    if(url.pathname!=='/.netlify/functions/account'){res.writeHead(404);res.end();return;}
    let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413);res.end();return;}parts.push(chunk);}
    const response=await handler(new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})}),{ip:req.socket.remoteAddress});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'local-qa-unavailable'}));}
}).listen(5183,'127.0.0.1',()=>console.log('Section-16 isolated emulator API listening on loopback 5183. No production credentials/data.'));
