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
test('account startup failure logs only safe fixed stage identifier and preserves generic 503 without disclosing secrets', async () => {
  const { accountRuntime, STARTUP_STAGES } = await import('../netlify/lib/firebase-admin-runtime.js');
  const accountHandlerModule = await import('../netlify/functions/account.js');
  const accountHandler = accountHandlerModule.default;

  // Verify all documented stages are recognized
  assert.deepEqual(STARTUP_STAGES, [
    "project-resolution",
    "credential-validation",
    "firebase-initialization",
    "origin-validation",
    "hmac-validation",
    "client-creation",
  ]);

  const sensitiveEnv = {
    FIREBASE_PROJECT_ID: 'fake-prod-project',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: 'fake-prod-project',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...SECRET_PRIVATE_KEY...\n-----END PRIVATE KEY-----',
      client_email: 'firebase-adminsdk-xyz@fake-prod-project.iam.gserviceaccount.com',
    }),
    UDC_SITE_ORIGIN: 'https://universaldictacouture.com',
    UDC_IDENTITY_HMAC_KEY: 'super-sensitive-hmac-secret-at-least-32-chars-long',
  };

  const testCases = [
    {
      description: 'fails at project-resolution when FIREBASE_PROJECT_ID is missing',
      env: {},
      expectedStage: 'project-resolution',
    },
    {
      description: 'fails at credential-validation when SERVICE_ACCOUNT_JSON is invalid or project mismatch',
      env: { FIREBASE_PROJECT_ID: 'fake-prod-project', FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"mismatch"}' },
      expectedStage: 'credential-validation',
    },
    {
      description: 'fails at credential-validation when SERVICE_ACCOUNT_JSON is corrupted or missing',
      env: { FIREBASE_PROJECT_ID: 'fake-prod-project' },
      expectedStage: 'credential-validation',
    },
    {
      description: 'fails at origin-validation when UDC_SITE_ORIGIN is invalid',
      env: {
        FIREBASE_PROJECT_ID: 'demo-local',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8089',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        UDC_SITE_ORIGIN: 'http://invalid-scheme.test',
        UDC_IDENTITY_HMAC_KEY: sensitiveEnv.UDC_IDENTITY_HMAC_KEY,
      },
      expectedStage: 'origin-validation',
    },
    {
      description: 'fails at hmac-validation when UDC_IDENTITY_HMAC_KEY is too short or missing',
      env: {
        FIREBASE_PROJECT_ID: 'demo-local',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8089',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        UDC_SITE_ORIGIN: 'http://127.0.0.1:5173/',
        UDC_IDENTITY_HMAC_KEY: 'too-short',
      },
      expectedStage: 'hmac-validation',
    },
  ];

  for (const tc of testCases) {
    const errorLogs = [];
    const origError = console.error;
    console.error = (...args) => errorLogs.push(args.join(' '));
    try {
      let thrown;
      try {
        accountRuntime(tc.env);
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown, `Expected accountRuntime to throw for: ${tc.description}`);
      assert.equal(thrown.code, 'account-source-unavailable');
      assert.equal(thrown.status, 503);
      assert.equal(thrown.stage, tc.expectedStage, `Expected stage ${tc.expectedStage} for: ${tc.description}`);

      assert.equal(errorLogs.length, 1);
      assert.equal(errorLogs[0], `[account-startup-failure] stage=${tc.expectedStage}`);

      // Confirm non-disclosure of any secrets or values
      for (const val of Object.values(sensitiveEnv)) {
        assert.ok(!errorLogs[0].includes(val), `Log disclosed secret: ${val}`);
      }
      assert.ok(!errorLogs[0].includes('private_key'));
      assert.ok(!errorLogs[0].includes('super-sensitive'));
      assert.ok(!errorLogs[0].includes('SECRET_PRIVATE_KEY'));
      assert.ok(!errorLogs[0].includes('Bearer'));
    } finally {
      console.error = origError;
    }
  }

  // Also verify that invoking the account Netlify function entry point preserves the generic public 503
  const origProjectId = process.env.FIREBASE_PROJECT_ID;
  const origViteProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const origError = console.error;
  const functionLogs = [];
  console.error = (...args) => functionLogs.push(args.join(' '));
  try {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.VITE_FIREBASE_PROJECT_ID;
    const req = new Request('https://universaldictacouture.com/.netlify/functions/account?action=catalogue');
    const res = await accountHandler(req, {});
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.deepEqual(body, { error: 'account-source-unavailable' });
    // Verify headers
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    // Verify no secret leak in logs
    assert.ok(functionLogs.some(log => log === '[account-startup-failure] stage=project-resolution'));
  } finally {
    if (origProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = origProjectId;
    if (origViteProjectId === undefined) delete process.env.VITE_FIREBASE_PROJECT_ID;
    else process.env.VITE_FIREBASE_PROJECT_ID = origViteProjectId;
    console.error = origError;
  }
});
