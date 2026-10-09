import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';

test('every deployed function loads with require(ESM) disabled, matching the observed live failure',()=>{
  const result=spawnSync(process.execPath,['--no-experimental-require-module','scripts/check-function-startup.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/account.js/);assert.match(result.stdout,/owner-maintenance.js/);
});
test('compatible JWKS dependency validates a real RSA signature and rejects tampering',async()=>{
  const require=createRequire(import.meta.url),adminRequire=createRequire(require.resolve('firebase-admin/app'));
  const jwks=adminRequire('jwks-rsa'),{publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const key={...publicKey.export({format:'jwk'}),kid:'local-repair-key',alg:'RS256',use:'sig'};
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[key]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const client=jwks({jwksUri:`http://127.0.0.1:${server.address().port}/keys`}),keys=await client.getSigningKeys();
    const jwt=adminRequire('jsonwebtoken'),token=jwt.sign({sub:'synthetic-user'},privateKey,{algorithm:'RS256',keyid:key.kid,expiresIn:60});
    assert.equal(jwt.verify(token,keys[0].getPublicKey(),{algorithms:['RS256']}).sub,'synthetic-user');
    const pieces=token.split('.');pieces[1]=Buffer.from(JSON.stringify({sub:'attacker'})).toString('base64url');
    assert.throws(()=>jwt.verify(pieces.join('.'),keys[0].getPublicKey(),{algorithms:['RS256']}));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
