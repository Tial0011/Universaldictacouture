import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Audit guardrail only. This never grants runtime access or changes product
// architecture. Counts and a locked specification cannot manufacture PASS.
const moduleCounts = [[1,10],[2,8],[10,13]];
const expectedIds = moduleCounts.flatMap(([module,count])=>Array.from({length:count},(_,i)=>`S11-M${String(module).padStart(2,'0')}-F${String(i+1).padStart(2,'0')}`));
export function evaluateSection11Gate(report,{closedAccountStub=false}={}) {
  const problems=[];
  const ids=(report.flows||[]).map(flow=>flow.id);
  if(ids.length!==31 || new Set(ids).size!==31 || expectedIds.some(id=>!ids.includes(id)))problems.push('31 official flow mappings are incomplete or duplicated');
  if(JSON.stringify((report.modules||[]).map(module=>module.id))!==JSON.stringify([1,2,10]))problems.push('Final module structure must remain 1, 2 and 10');
  if(moduleCounts.some(([id,count])=>(report.modules||[]).find(module=>module.id===id)?.flowCount!==count))problems.push('Per-module flow counts must remain 10, 8 and 13');
  const required=['actor','target','currentPrincipal','authorization','purpose','dataOwner','scope','currentState','authoritativeResult','failure','stale','unknown','section16Guarantee'];
  if((report.flows||[]).some(flow=>required.some(key=>typeof flow[key]!=='string'||!flow[key].trim()) || !flow.code?.length || !flow.tests?.length))problems.push('An important operation lacks physical/actor/result/error traceability');
  const visuals=report.visuals||[];
  if(visuals.length!==15 || new Set(visuals.map(v=>v.id)).size!==15 || visuals.filter(v=>v.kind==='direct').length!==11 || visuals.filter(v=>v.kind==='supporting').length!==4)problems.push('Retained visual mapping is incomplete or duplicated');
  if(visuals.some(v=>!v.sourceAvailable))problems.push('A required retained source is unavailable');
  if(!report.validation?.testsPassed || !report.validation?.buildPassed || !report.validation?.browserPassed)problems.push('Required executable validation has not passed');
  const blockers=(report.defects||[]).filter(defect=>!defect.resolved && ['HIGH','CRITICAL'].includes(defect.severity));
  const incomplete=(report.flows||[]).filter(flow=>flow.completion!==true);
  if(closedAccountStub)problems.push('The real repository still contains the unavailable Account-authority stub');
  const fidelityIncomplete=visuals.some(visual=>visual.implementationValidated!==true);
  const canLock=!problems.length && !blockers.length && !incomplete.length && !fidelityIncomplete;
  return {verdict:canLock?'PASS':'PARTIAL',lockCandidate:canLock,mappedFlows:ids.length,expectedFlows:31,mappedVisuals:visuals.length,completedFlows:ids.length-incomplete.length,
    blockingDefects:blockers.map(defect=>defect.id),incompleteFlowIds:incomplete.map(flow=>flow.id),visualImplementationComplete:!fidelityIncomplete,problems};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const report=JSON.parse(readFileSync(resolve(root,'docs/section11-final-coverage.json'),'utf8'));
  const accountSource=readFileSync(resolve(root,'src/services/customerAccountAuthority.js'),'utf8');
  const closedAccountStub=/export function requireCustomerAccountAuthority\(\)\s*\{\s*throw/.test(accountSource);
  const result=evaluateSection11Gate(report,{closedAccountStub});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.lockCandidate)process.exitCode=2; // Explicit withheld lock, not a passing business gate.
}
