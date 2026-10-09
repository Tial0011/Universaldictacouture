// Default dry-run. Uses the site's existing server credentials, never passwords.
// Counts only are printed. No production secret/account records enter source control.
import { accountRuntime } from '../netlify/lib/firebase-admin-runtime.js';
import { createExistingAccountRepair } from '../netlify/lib/existing-account-repair.js';

const requestedProject = process.argv.find(arg => arg.startsWith('--project='))?.slice(10);
const commit = process.argv.includes('--apply');
try {
  const runtime = accountRuntime();
  if (!requestedProject || runtime.projectId !== requestedProject) throw Error('Exact --project= value must match the configured Firebase project.');
  const repair = createExistingAccountRepair(runtime), members = await runtime.db.collection('admins').get();
  const owners=await Promise.all(['universaldictacouture@gmail.com','akinolachris8@gmail.com'].map(email=>runtime.auth.getUserByEmail(email)));
  if(owners.some(user=>user.disabled||!members.docs.some(row=>row.id===user.uid&&row.data().active===true)))throw Error('Both owner accounts must be existing active admins.');
  const ownerIds=new Set(owners.map(user=>user.uid));
  const adminIds = new Set(members.docs.filter(row => row.data().active === true).map(row => row.id));
  const paymentReview = true; // explicit owner decision in this repair request
  const counts = { mode: commit ? 'apply' : 'dry-run', project: runtime.projectId, customers: {}, admins: {}, conflicts: 0 };
  const count = (group, state) => { group[state] = (group[state] || 0) + 1; };
  let pageToken;
  do {
    const page = await runtime.auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      try { count(counts.customers, (await repair.customer(user.uid, { commit })).state); }
      catch { count(counts.customers, 'review-required'); counts.conflicts++; }
      if (adminIds.has(user.uid)) {
        try { count(counts.admins, (await repair.admin(user.uid, { commit, paymentReview, owner:ownerIds.has(user.uid) })).state); }
        catch { count(counts.admins, 'review-required'); counts.conflicts++; }
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(JSON.stringify(counts, null, 2));
  if (counts.conflicts) process.exitCode = 1;
  await runtime.db.terminate();
} catch (error) {
  console.error(error.code === 'account-source-unavailable'
    ? 'Trusted runtime is not configured. Supply server-only Firebase credentials, project, stable identity key and site origin. No accounts were changed.'
    : 'Repair could not finish. Reconcile the protected migration evidence before retry.');
  process.exitCode = 1;
}
