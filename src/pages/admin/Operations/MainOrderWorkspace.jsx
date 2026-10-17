import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useOrderWorkspace } from '../../../hooks/useOrderWorkspace';
import { accountRequest } from '../../../services/accountApi';
import { editionDifferences, frozenOrderCommand, nextOrderAction, targetStillCurrent, workLabel } from '../../../services/orderWorkspaceModel';
import { ownerErrorCopy, ownerErrorState } from '../../../services/ownerOperation';
import { formatNaira } from '../../../utils/formatters';
import Button from '../../../components/common/Button';
import SourceStatus from '../../../components/common/SourceStatus';
import ConfirmationDialog from '../../../components/admin/Confirmation';
import AdminIcon from '../../../components/admin/AdminIcon';
import { useStaff } from '../../../context/StaffContext';
import { allows } from '../../../services/staffAuthorization';
import './OrderOperations.css';

const Conversation = lazy(() => import('../../../components/chat/TransactionConversation'));
const money = amount => amount == null ? 'Not confirmed' : formatNaira(amount / 100);
const date = value => value ? new Date(value).toLocaleString() : 'Time not available';
const label = value => value.replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase());
const tabs = [['overview','Overview'],['commercial','Editions & Changes'],['provenance','Product / Provenance'],['payments','Payments'],['extensions','Extensions'],['operations','Fulfilment & Delivery'],['activity','Activity'],['chat','Order Chat'],['governance','Governance & Notes']];

function useOwnerRead(endpoint, input, frame, enabled = true) {
  const serialized=JSON.stringify(input), [result,setResult]=useState(null), [state,setState]=useState({code:'checking',text:'Checking current source…'}), [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;const ticket=frame.fence.begin();
    accountRequest(endpoint,JSON.parse(serialized),{principalUid:ticket.uid}).then(value=>{if(active&&frame.fence.current(ticket)){setResult({key:serialized,epoch:frame.refreshEpoch,value});setState({code:'ready',text:'Current source checked.'});}}).catch(error=>{if(active&&frame.fence.current(ticket)){setResult(null);setState({code:ownerErrorState(error),text:ownerErrorCopy(error,'This source section')});}});
    return()=>{active=false;};
  },[endpoint,serialized,frame.fence,frame.refreshEpoch,enabled,attempt]);
  return { value:enabled&&result?.key===serialized&&result.epoch===frame.refreshEpoch?result.value:null,state,refresh:()=>{setResult(null);setAttempt(v=>v+1);} };
}
function Entries({ entries }) {
  return !entries?.length ? <p>Commercial Entries have not been established in this view.</p> : <ul className="order-entry-list">{entries.map(entry=><li key={entry.rootId} className="order-entry"><div><h3>{entry.label}</h3><p>Quantity {entry.quantity} · {money(entry.unitAmountMinor)} per unit</p><details><summary>Selected transaction options</summary><dl>{Object.entries(entry.options||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl></details></div><strong>{money(entry.quantity*entry.unitAmountMinor)}</strong></li>)}</ul>;
}
function TermsForm({ initial, submitLabel, disabled, onSubmit }) {
  const [entries,setEntries]=useState(()=>structuredClone(initial?.entries||[{label:'',quantity:1,unitAmountMinor:0}]));
  const [due,setDue]=useState(()=>String((initial?.amountDueNowMinor||0)/100));
  const [notes,setNotes]=useState(initial?.notes||''), [error,setError]=useState('');
  function submit(event){
    event.preventDefault();setError('');
    if(!/^\d+(\.\d{1,2})?$/.test(due)||!entries.length||entries.some(entry=>!entry.label.trim()||!Number.isSafeInteger(entry.quantity)||entry.quantity<1||!Number.isSafeInteger(entry.unitAmountMinor)||entry.unitAmountMinor<0)){setError('Check each label, whole-number quantity and non-negative amount.');return;}
    const amountDueNowMinor=Math.round(Number(due)*100),total=entries.reduce((sum,entry)=>sum+entry.quantity*entry.unitAmountMinor,0);
    if(!Number.isSafeInteger(total)||amountDueNowMinor>total){setError('Amount Due Now must be within the proposed commercial total.');return;}
    onSubmit({entries,amountDueNowMinor,notes});
  }
  return <form className="admin-stack order-terms" onSubmit={submit}><fieldset disabled={disabled}><legend>Structured commercial terms</legend>
    {entries.map((entry,index)=><div className="order-terms-entry" key={entry.rootId||index}><label>Entry {index+1} title<input required value={entry.label} maxLength={240} onChange={event=>setEntries(rows=>rows.map((row,i)=>i===index?{...row,label:event.target.value}:row))}/></label>
      <label>Quantity<input type="number" min="1" step="1" required value={entry.quantity} onChange={event=>setEntries(rows=>rows.map((row,i)=>i===index?{...row,quantity:Number(event.target.value)}:row))}/></label>
      <label>Unit amount (NGN)<input type="number" min="0" step="0.01" required value={entry.unitAmountMinor/100} onChange={event=>setEntries(rows=>rows.map((row,i)=>i===index?{...row,unitAmountMinor:Math.round(Number(event.target.value)*100)}:row))}/></label>
      <Button variant="ghost" disabled={entries.length===1} onClick={()=>setEntries(rows=>rows.filter((_,i)=>i!==index))}>Remove Entry {index+1} from proposal</Button>
    </div>)}
    <Button variant="secondary" disabled={entries.length>=50} onClick={()=>setEntries(rows=>[...rows,{label:'',quantity:1,unitAmountMinor:0}])}>Add commercial Entry</Button>
    <label>Amount Due Now (NGN)<input required inputMode="decimal" value={due} onChange={event=>setDue(event.target.value)}/></label>
    <label>Customer-reviewable commercial notes<textarea value={notes} maxLength={4000} onChange={event=>setNotes(event.target.value)}/></label>
    <p>These are proposed terms, not established truth. Product and historical transaction records are not edited by this form.</p>
    {error&&<p role="alert">{error}</p>}<Button type="submit">{submitLabel}</Button>
  </fieldset></form>;
}
function Difference({ from, to, fromLabel, toLabel }) {
  const difference=editionDifferences(from,to);
  return <section className="order-comparison"><h3>Difference Lens</h3><p>FROM: {fromLabel} · TO: {toLabel}</p>
    <SourceStatus state={difference.state==='incomplete'?'unavailable':'ready'}>{difference.state==='incomplete'?'Comparison incomplete. Required historical evidence is not available.':difference.state==='unchanged'?'No semantic Entry changes in this comparison.':'Structured Entry differences. This comparison does not authorize establishment.'}</SourceStatus>
    <ul>{difference.records.map((row,index)=><li key={row.rootId+row.field+index}><strong>{label(row.field)} · {row.state}</strong><div><p>From: {typeof row.from==='object'?JSON.stringify(row.from):String(row.from??'Not present')}</p><p>To: {typeof row.to==='object'?JSON.stringify(row.to):String(row.to??'Not present')}</p></div></li>)}</ul>
  </section>;
}
function Commercial({ frame, propose }) {
  const order=frame.current;
  const [viewed,setViewed]=useState(order.currentEdition), [older,setOlder]=useState(''), [originalOpen,setOriginalOpen]=useState(false), [editor,setEditor]=useState(null);
  const history=useOwnerRead('staff-edition',{orderId:order.orderId,componentId:order.componentId,number:viewed},frame,viewed>0&&viewed!==order.currentEdition);
  const original=useOwnerRead('staff-order-original',{orderId:order.orderId},frame,originalOpen);
  const viewedEdition=viewed===order.currentEdition?order.edition:history.value?.edition;
  const permits=action=>order.actions.includes(action);
  const eligible=!order.completed&&!order.cancelled&&(order.componentId==='base'||order.activeExtensionId===order.componentId);
  const currentTerms=order.working||order.edition;
  function startEditor(amendment=false){setEditor({base:structuredClone(order),amendment,nonce:crypto.randomUUID(),terms:currentTerms});}
  return <div className="admin-stack"><section className="admin-panel"><h2>Bounded Edition Navigator</h2><p>{workLabel(order.componentId)} · Current: Edition {order.currentEdition||'not established'} · Viewed: {viewed?`Edition ${viewed}`:'No Edition'}</p>
    <div className="order-actions">{Array.from({length:Math.min(order.currentEdition,4)},(_,i)=>order.currentEdition-i).reverse().map(number=><Button key={number} variant={viewed===number?'primary':'secondary'} aria-pressed={viewed===number} onClick={()=>setViewed(number)}>Edition {number}{number===order.currentEdition?' · Current':''}</Button>)}<Button variant="secondary" onClick={()=>setOriginalOpen(value=>!value)}>{originalOpen?'Close':'View'} Original Snapshot</Button></div>
    {order.currentEdition>4&&<form className="order-tools" onSubmit={event=>{event.preventDefault();const number=Number(older);if(Number.isInteger(number)&&number>0&&number<=order.currentEdition)setViewed(number);}}><label>Older Edition number<input type="number" min="1" max={order.currentEdition} value={older} required onChange={event=>setOlder(event.target.value)}/></label><Button type="submit">Open historical Edition</Button></form>}
    {viewed!==order.currentEdition&&<SourceStatus state="read-only">Historical Edition · Read Only. Protected actions target current source truth separately.</SourceStatus>}
    {viewed!==order.currentEdition&&<SourceStatus state={history.state.code}>{history.state.text}</SourceStatus>}
    {viewedEdition&&<><Entries entries={viewedEdition.entries}/><Difference from={viewedEdition} to={order.edition} fromLabel={`Viewed Edition ${viewed}`} toLabel={`Current Edition ${order.currentEdition}`}/></>}
    {originalOpen&&<section className="order-original"><h3>Original Snapshot · Historical</h3><SourceStatus state={original.state.code}>{original.state.text}</SourceStatus>{original.value&&<><p>Captured {date(original.value.capturedAt)} · {original.value.sourceType}</p><Entries entries={original.value.entries}/><Difference from={original.value} to={order.edition} fromLabel="Original Snapshot" toLabel={`Current Edition ${order.currentEdition}`}/><p>Current Profile/Product changes do not rewrite this evidence. Private request data is not exposed in this comparison.</p></>}</section>}
  </section>
    {order.working&&<section className="admin-panel"><h2>Working Change · Not established</h2><Entries entries={order.working.entries}/><Difference from={order.edition} to={order.working} fromLabel={`Edition ${order.currentEdition}`} toLabel="Working Change"/>
      <div className="order-actions">{eligible&&permits(order.workingAmendment?'establish-amendment':'establish-edition')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>propose('staff-commercial',order.workingAmendment?'establish-amendment':'establish-edition',{expectedWorkingVersion:order.workingVersion},'Establish these exact Working Changes? Old approvals and Payment Enablement do not carry forward.')}>Establish {order.workingAmendment?'Amendment':'new Edition'}</Button>}
      {eligible&&permits('undo-working')&&<Button variant="secondary" disabled={frame.busy||Boolean(frame.pending)} onClick={()=>propose('staff-commercial','undo-working',{expectedWorkingVersion:order.workingVersion},'Discard only mutable Working Changes? Historical Editions, approvals and Payment evidence remain preserved.')}>Discard Working Changes</Button>}</div>
    </section>}
    {eligible&&<section className="admin-panel"><h2>Commercial actions</h2><div className="order-actions">
      {!order.paymentEnabled&&permits('save-working')&&<Button variant="secondary" onClick={()=>startEditor()}>Edit Working Changes</Button>}
      {order.paymentEnabled&&permits('save-amendment-working')&&<Button variant="secondary" onClick={()=>startEditor(true)}>Review no-new-charge Amendment</Button>}
      {!order.working&&order.currentEdition>0&&permits('business-approve')&&order.businessApproval?.edition!==order.currentEdition&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>propose('staff-commercial','business-approve',{},'Business approve this exact current Edition? This is not Customer Final Approval or Payment Enablement.')}>Business Approve current Edition</Button>}
      {!order.working&&order.customerApproval?.edition===order.currentEdition&&order.businessApproval?.edition===order.currentEdition&&permits('enable-payment')&&!order.paymentEnabled&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>propose('staff-commercial','enable-payment',{},'Enable Payment for this exact approved Edition? This creates no Payment Record and does not start fulfilment.')}>Enable Payment</Button>}
    </div><p>Business Approval, Customer Final Approval and Enable Payment are three separate gates.</p></section>}
    {editor&&<section className="admin-panel"><h2>{editor.amendment?'No-new-charge Amendment':'Working Change editor'}</h2>
      {!targetStillCurrent(frozenOrderCommand(editor.base,'save-working'),order)&&<SourceStatus state="stale">Changed Elsewhere. Your unsaved work has not been merged into the current source. Review current terms before starting a fresh editor.</SourceStatus>}
      <TermsForm key={editor.nonce} initial={editor.terms} submitLabel="Review Save of Working Changes" disabled={frame.busy||Boolean(frame.pending)||!targetStillCurrent(frozenOrderCommand(editor.base,'save-working'),order)} onSubmit={terms=>propose('staff-commercial',editor.amendment?'save-amendment-working':'save-working',{terms,expectedWorkingVersion:editor.base.workingVersion},'Save these proposed Working Changes? They remain unestablished.',editor.base)}/>
      <Button variant="secondary" onClick={()=>setEditor(null)}>Close unsaved editor</Button>
    </section>}
  </div>;
}
function PaymentReview({ frame, paymentId, propose, onClose }) {
  const {staff}=useStaff();
  const mayReview=allows(staff,'payments.verify',{purpose:'payment-evidence',objectId:paymentId,dataClass:'payment-proof',action:'verify',state:frame.current.status});
  const detail=useOwnerRead('staff-payment',{paymentId},frame), [decision,setDecision]=useState('UNDER REVIEW'), [proof,setProof]=useState(null), [proofState,setProofState]=useState(''), urlRef=useRef(null);
  useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
  async function loadProof(){
    const ticket=frame.fence.begin();setProofState('Checking protected proof access…');
    try {
      const {auth}=await import('../../../firebase/auth');const token=await auth.currentUser.getIdToken();
      const response=await fetch(`/.netlify/functions/account?action=staff-media-deliver&referenceId=${encodeURIComponent(detail.value.proofReferenceId)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error();const bytes=await response.blob();if(!frame.fence.current(ticket))return;
      if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current=URL.createObjectURL(bytes);setProof(urlRef.current);setProofState('Protected evidence loaded for this exact review.');
    }catch{if(frame.fence.current(ticket)){setProof(null);setProofState('Proof could not be checked. No verification result is inferred.');}}
  }
  return <section className="admin-panel"><h3>Exact Payment Review</h3><SourceStatus state={detail.state.code}>{detail.state.text}</SourceStatus>{detail.value&&<><p>{detail.value.paymentId} · {detail.value.paymentState} · {money(detail.value.amountMinor)}</p><Button variant="secondary" disabled={frame.busy} onClick={loadProof}>Open protected proof</Button><p role="status">{proofState}</p>{proof&&<img className="order-proof" src={proof} alt="Submitted bank-transfer evidence for the selected Payment Record"/>}
    {mayReview&&detail.value.paymentState!=='VERIFIED'&&<form className="admin-stack" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);const payload={paymentId,expectedVersion:detail.value.version,decision,reason:String(data.get('reason')),...(decision==='VERIFIED'?{verifiedAmountMinor:Math.round(Number(data.get('amount'))*100),bankTransferReference:String(data.get('bankReference'))}:{})};propose('staff-payment-review','payment-review',{},`Review Payment ${paymentId}, revision ${detail.value.version}, as ${decision}? This does not complete the Order.`,frame.current,payload);}}><fieldset disabled={frame.busy||Boolean(frame.pending)}>
      <label>Review decision<select value={decision} onChange={event=>setDecision(event.target.value)}><option>UNDER REVIEW</option><option>VERIFIED</option><option>NEEDS ATTENTION</option></select></label>
      <label>Decision reason<textarea name="reason" required maxLength={2000}/></label>
      {decision==='VERIFIED'&&<><label>Verified contribution (NGN)<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Matched bank transfer reference<input name="bankReference" required maxLength={240}/></label></>}
      <Button type="submit">Review exact decision</Button>
    </fieldset></form>}
  </>}<Button variant="secondary" onClick={onClose}>Close Payment Review</Button></section>;
}
function Payments({ frame, propose }) {
  const order=frame.current, [before,setBefore]=useState(null), [selected,setSelected]=useState(null);
  const ledger=useOwnerRead('staff-order-payments',{orderId:order.orderId,componentId:order.componentId,before},frame);
  return <section className="admin-panel admin-stack"><h2>Payment Records · {workLabel(order.componentId)}</h2><p>Bank Transfer only. A Payment Record is not its proof. Only eligible Verified contributions count.</p><Finance order={order}/><SourceStatus state={ledger.state.code}>{ledger.state.text}</SourceStatus>
    {ledger.value&&<><ul className="order-entry-list">{ledger.value.records.map(payment=><li key={payment.paymentId} className="order-entry"><div><h3>{payment.paymentId}</h3><p>{payment.paymentState} · {money(payment.amountMinor)} · {date(payment.submittedAt)}</p>{payment.correctsPaymentId&&<p>Corrected submission for {payment.correctsPaymentId}. Prior evidence remains protected.</p>}{payment.supersededBy&&<p>Later submission: {payment.supersededBy}</p>}</div><Button variant="secondary" onClick={()=>setSelected(payment.paymentId)}>Open exact Payment Review</Button></li>)}</ul>{!ledger.value.records.length&&<p>No Payment Records in this checked page.</p>}{ledger.value.next&&<Button variant="secondary" onClick={()=>setBefore(ledger.value.next)}>Next Payment page</Button>}{before&&<Button variant="secondary" onClick={()=>setBefore(null)}>Return to first Payment page</Button>}</>}
    {selected&&<PaymentReview key={selected} paymentId={selected} frame={frame} propose={propose} onClose={()=>{setSelected(null);ledger.refresh();}}/>}
  </section>;
}
function CurrentProduct({ productId,frame }) {
  const data=useOwnerRead('catalogue',{productId},frame);
  const product=data.value?.product;
  return <section className="admin-panel"><h3>Product Now · Optional current catalogue context</h3><SourceStatus state={data.state.code}>{data.state.text}</SourceStatus>
    {product?<><h4>{product.name}</h4><p>Current public price: {formatNaira(product.price)}. This does not change the transaction’s agreed amount.</p><Button to={`/shop/${encodeURIComponent(product.id)}`} variant="secondary">Open current public Product</Button></>:data.value&&<p>Current public Product context is not available. This does not prove deletion and does not alter Ordered As.</p>}
    <Button variant="secondary" onClick={data.refresh}>Recheck current Product</Button>
  </section>;
}
function Provenance({frame}) {
  const order=frame.current,data=useOwnerRead('staff-order-original',{orderId:order.orderId},frame);
  return <section className="admin-stack"><section className="admin-panel"><h2>Ordered As · Historical transaction origin</h2><SourceStatus state={data.state.code}>{data.state.text}</SourceStatus>
    {data.value&&<><p>{data.value.sourceType} · Captured {date(data.value.capturedAt)}. Original evidence is not a mutable Product copy.</p><Entries entries={data.value.entries}/>{!data.value.entries&&<p>Commercial Product provenance is incomplete for this Custom Style origin. Private measurements, inspiration and request text are not generic Product context.</p>}</>}
  </section>{data.value?.entries?.filter(entry=>entry.productId).map(entry=><CurrentProduct key={entry.rootId} productId={entry.productId} frame={frame}/>)}
    <p>Order-time media anchors and private Product-working context are separate protected source integrations; current imagery is not substituted for missing historical evidence.</p>
  </section>;
}
function Finance({ order }) { return <>{order.financialState==='unavailable'&&<SourceStatus state="unavailable">Financial source temporarily unavailable. No paid value, zero balance or readiness is inferred.</SourceStatus>}<dl className="order-finance"><div><dt>Amount Due Now</dt><dd>{money(order.amountDueNowMinor)}</dd></div><div><dt>Verified paid</dt><dd>{money(order.totalPaidMinor)}</dd></div><div><dt>Outstanding</dt><dd>{money(order.outstandingMinor)}</dd></div></dl></>; }
function Extensions({ frame, propose }) {
  const order=frame.current, data=useOwnerRead('staff-order-extensions',{orderId:order.orderId},frame), [creating,setCreating]=useState(false);
  const can=action=>order.actions.includes(`extension-${action}`);
  function extension(action,row,terms){const payload={orderId:order.orderId,expectedVersion:order.version,action,...(row?{extensionId:row.extensionId,expectedRevision:row.revision}:{}),...(terms?{terms}:{})};propose('staff-extension',`extension-${action}`,{},`${label(action)} this exact Extension proposal${row?`, revision ${row.revision}`:''}? The Base and canonical Chat remain unchanged.`,order,payload);}
  return <section className="admin-panel admin-stack"><h2>Related Extensions</h2><p>Base completion remains historical. At most one Extension may be active; proposal acceptance is not Customer Final Approval.</p><SourceStatus state={data.state.code}>{data.state.text}</SourceStatus>
    {data.value&&<><ul className="order-entry-list">{data.value.records.map(row=><li key={row.extensionId} className="order-extension"><h3>{workLabel(row.extensionId)}</h3><p>{row.state} · Proposal revision {row.revision} · {row.acceptedRevision===row.revision?'Exact revision accepted':'Not accepted for this revision'}</p><Entries entries={row.terms?.entries}/><p>Proposed Amount Due Now: {money(row.terms?.amountDueNowMinor)}</p><div className="order-actions">
      {row.state==='ACTIVE'&&<Button to={`?work=${encodeURIComponent(row.extensionId)}&section=overview`} variant="secondary">Open Extension work</Button>}
      {row.state==='PROPOSED'&&row.acceptedRevision===row.revision&&!order.activeExtensionId&&can('activate')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>extension('activate',row)}>Review activation</Button>}
      {row.state==='PROPOSED'&&can('close')&&<Button variant="secondary" disabled={frame.busy||Boolean(frame.pending)} onClick={()=>extension('close',row)}>Review formal closure</Button>}
    </div>{row.state==='PROPOSED'&&can('revise')&&<details><summary>Revise this proposal</summary><TermsForm initial={row.terms} submitLabel="Review new proposal revision" disabled={frame.busy||Boolean(frame.pending)} onSubmit={terms=>extension('revise',row,terms)}/></details>}</li>)}</ul>{!data.value.records.length&&<p>No Extensions in this checked source page. Availability alone does not create one.</p>}{!data.value.complete&&<p>This is a bounded Extension history view; older records are not included.</p>}</>}
    {can('propose')&&!order.cancelled&&<Button variant="secondary" onClick={()=>setCreating(value=>!value)}>{creating?'Close unsaved proposal':'Prepare related payable proposal'}</Button>}
    {creating&&<TermsForm submitLabel="Review Extension proposal" disabled={frame.busy||Boolean(frame.pending)} onSubmit={terms=>extension('propose',null,terms)}/>}
    <p>Customer Extension requests and exact Customer acceptance remain separate owning interfaces; Staff cannot accept on the Customer’s behalf.</p>
  </section>;
}
function OperationsPanel({ frame, propose }) {
  const order=frame.current, can=action=>order.actions.includes(action), live=!order.completed&&!order.cancelled, [deliveryEditor,setDeliveryEditor]=useState(null);
  const invoke=(action,extra={},text)=>propose('staff-operations',action,extra,text||`${label(action)} for this exact work context and Edition?`);
  return <div className="admin-stack"><section className="admin-panel"><h2>Current responsibility</h2><p>{order.assignedStaffId?`Assigned Dicta Couturier: ${order.assignedStaffId}`:'Unassigned. Viewing does not claim this Order.'}</p><div className="order-actions">
    {live&&!order.assignedStaffId&&can('claim')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('claim',{},'Claim the exact current work? First valid Claim wins; eligibility does not automatically assign.')}>Review Claim</Button>}
    {order.assignedStaffId&&can('remove-assignment')&&<Button variant="secondary" disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('remove-assignment')}>Review assignment removal</Button>}
  </div>{order.assignedStaffId&&can('transfer')&&<form className="order-tools" onSubmit={event=>{event.preventDefault();invoke('transfer',{targetStaffId:String(new FormData(event.currentTarget).get('staffId')).trim()},'Transfer responsibility to this exact Staff identity? The Main Order, Chat and history stay unchanged; previous assignment-derived authority ends.');}}><label>Approved target Staff identity<input name="staffId" required maxLength={180}/></label><Button type="submit" disabled={frame.busy||Boolean(frame.pending)}>Review Transfer</Button></form>}</section>
    <section className="admin-panel"><h2>Fulfilment · {workLabel(order.componentId)}</h2><p>{order.fulfilment}</p><p>Payment readiness does not start work. Every operation rechecks current readiness at the trusted boundary.</p><div className="order-actions">
      {live&&order.fulfilment==='NOT STARTED'&&can('start-fulfilment')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('start-fulfilment')}>Review Start Fulfilment</Button>}
      {live&&order.fulfilment==='IN FULFILMENT'&&can('work-complete')&&order.operational&&<Button variant="secondary" disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('work-complete')}>Review Work Complete</Button>}
      {live&&order.operational?.workComplete&&can('delivery-preparation')&&order.fulfilment==='IN FULFILMENT'&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('delivery-preparation')}>Review Delivery Preparation</Button>}
    </div>
    {order.operational&&<><ul className="order-entry-list">{Object.entries(order.operational.fulfilmentComponents).map(([id,component])=><li key={id}><h3>{component.label}</h3><p>{component.complete?'Work Complete':'In Fulfilment'} · {date(component.at)}</p>{live&&can('fulfilment-component')&&<Button variant="secondary" disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('fulfilment-component',{fulfilmentComponentId:id,label:component.label,completed:!component.complete})}>Review {component.complete?'progress correction':'Component Work Complete'}</Button>}</li>)}</ul>
      {live&&order.fulfilment==='IN FULFILMENT'&&can('fulfilment-component')&&<form className="order-tools" onSubmit={event=>{event.preventDefault();invoke('fulfilment-component',{fulfilmentComponentId:crypto.randomUUID(),label:String(new FormData(event.currentTarget).get('label')),completed:false});}}><label>New fulfilment component label<input name="label" required maxLength={240}/></label><Button type="submit" disabled={frame.busy||Boolean(frame.pending)}>Review component creation</Button></form>}
      <h3>Blocker · Hold · Delay</h3><ul className="order-entry-list">{Object.entries(order.operational.issues).map(([id,issue])=><li key={id}><strong>{issue.kind} · {issue.resolved?'Resolved · historical':'Unresolved'}</strong><p>{issue.reason}</p>{live&&!issue.resolved&&can('issue')&&<Button variant="secondary" disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('issue',{issueId:id,issueKind:issue.kind,reason:issue.reason,resolved:true},'Resolve this exact issue? Source-owned blockers must independently be satisfied. This does not fabricate resumed work.')}>Review resolution</Button>}</li>)}</ul>
      {live&&can('issue')&&<form className="admin-stack" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);invoke('issue',{issueId:crypto.randomUUID(),issueKind:String(data.get('kind')),sourceCondition:String(data.get('source'))||null,reason:String(data.get('reason')),resolved:false});}}><fieldset disabled={frame.busy||Boolean(frame.pending)}><legend>Record exact operational issue</legend><label>Issue kind<select name="kind"><option>BLOCKER</option><option>HOLD</option><option>DELAY</option></select></label><label>Authoritative blocker source<select name="source"><option value="">No source link</option><option value="payment">Payment</option><option value="approval">Current approval</option></select></label><label>Internal reason<textarea name="reason" required maxLength={2000}/></label><Button type="submit">Review issue</Button></fieldset></form>}
    </>}
  </section>
    <section className="admin-panel"><h2>Delivery Context &amp; Dispatch</h2><p>{order.delivery} · Delivered is not Order Completed.</p>
      {Object.hasOwn(order,'deliveryContext')&&<><p>Current Delivery Context revision: {order.deliveryContextVersion}</p>{order.deliveryContext&&<dl>{Object.entries(order.deliveryContext).map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>)}</dl>}
        {live&&!['DISPATCHED','DELIVERED'].includes(order.delivery)&&can('delivery-context')&&<Button variant="secondary" onClick={()=>setDeliveryEditor(structuredClone(order))}>Review Delivery Context update</Button>}
        {live&&order.delivery==='READY FOR DISPATCH'&&order.dispatchReadinessCurrent&&can('dispatch')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('dispatch',{expectedDeliveryVersion:order.deliveryContextVersion},'Dispatch this exact work and Delivery Context revision? The frozen Dispatch Snapshot cannot later be rewritten.')}>Review Dispatch</Button>}
        {live&&order.delivery==='READY FOR DISPATCH'&&!order.dispatchReadinessCurrent&&can('ready-dispatch')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('ready-dispatch')}>Recheck exact Dispatch readiness</Button>}
      </>}
      {live&&order.fulfilment==='READY FOR DELIVERY PREPARATION'&&order.deliveryContext&&can('ready-dispatch')&&!['READY FOR DISPATCH','DISPATCHED','DELIVERED'].includes(order.delivery)&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('ready-dispatch')}>Review Ready for Dispatch</Button>}
      {deliveryEditor&&<form className="admin-stack" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget),context=Object.fromEntries(['recipientName','phoneNumber','address','provider','route'].map(key=>[key,String(data.get(key)||'')]));propose('staff-operations','delivery-context',{deliveryContext:context,expectedDeliveryVersion:deliveryEditor.deliveryContextVersion},'Commit this exact Delivery Context revision? Saved Address/Profile changes do not rewrite this context.',deliveryEditor);}}><fieldset disabled={frame.busy||Boolean(frame.pending)||!targetStillCurrent(frozenOrderCommand(deliveryEditor,'delivery-context'),order)}><legend>Proposed Delivery Context · Not saved</legend>{['recipientName','phoneNumber','address','provider','route'].map(key=><label key={key}>{label(key)}<input name={key} required={key==='address'} defaultValue={deliveryEditor.deliveryContext?.[key]||''} maxLength={key==='address'?1500:240}/></label>)}<Button type="submit">Review exact update</Button></fieldset><Button variant="secondary" onClick={()=>setDeliveryEditor(null)}>Close unsaved Delivery Context</Button></form>}
      {order.delivery==='DISPATCHED'&&<p>Tracking/provider results require exact Dispatch-attempt evidence and owner reconciliation. This screen cannot manually fabricate Delivered.</p>}
    </section>
    <section className="admin-panel"><h2>Completion &amp; Cancellation</h2><p>{order.completed?'Order work Completed · historical':order.cancelled?'Cancelled · settlement remains separate':'No terminal completion/cancellation has been committed.'}</p>
      {live&&order.delivery==='DELIVERED'&&can('complete')&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('complete',{},'Complete this exact work context? Delivery, verified financial obligations and current eligibility will be checked independently.')}>Review Complete Order</Button>}
      {order.delivery==='DELIVERED'&&<p>Ordinary Cancellation Not Currently Available. Post-delivery or settlement concerns remain separate owner workflows.</p>}
      {order.operational?.cancellationRequested&&<p>Cancellation Requested · {date(order.operational.cancellationRequested.at)}. A request is not a terminal decision.</p>}
      {live&&order.delivery!=='DELIVERED'&&order.operational?.cancellationRequested&&can('cancel')&&<ReasonAction title="Review terminal Cancellation" disabled={frame.busy||Boolean(frame.pending)} onSubmit={reason=>invoke('cancel',{reason},'Cancel this exact Base/Extension target? Payment/Dispatch history remains intact. Cancelled does not mean Refunded or Settlement Resolved.')}/>}
      {order.completed&&can('completion-correction')&&<ReasonAction title="Review Completion Correction" disabled={frame.busy||Boolean(frame.pending)} onSubmit={reason=>invoke('completion-correction',{reason},'Correct this exact Completion evidence through an append-only owner transition? This is not generic Base reopening or an Extension.')}/>}
      {order.completed&&can('enable-review')&&!order.reviewEnabled&&<Button disabled={frame.busy||Boolean(frame.pending)} onClick={()=>invoke('enable-review')}>Review Enable Review</Button>}
    </section>
  </div>;
}
function ReasonAction({ title,disabled,onSubmit }) { return <form className="admin-stack" onSubmit={event=>{event.preventDefault();onSubmit(String(new FormData(event.currentTarget).get('reason')));}}><label>{title} reason<textarea name="reason" required maxLength={2000} disabled={disabled}/></label><Button type="submit" disabled={disabled}>{title}</Button></form>; }
function Activity({ frame }) {
  const order=frame.current,[after,setAfter]=useState(null),data=useOwnerRead('staff-order-activity',{orderId:order.orderId,componentId:order.componentId,after},frame);
  return <section className="admin-panel admin-stack"><h2>Operational transition history</h2><p>Owner transition metadata only; this is not the complete Activity stream, formal Audit, private Notes or Chat.</p><SourceStatus state={data.state.code}>{data.state.text}</SourceStatus>{data.value&&<><ul className="order-entry-list">{data.value.records.map(row=><li key={row.id}><h3>{label(row.action)}</h3><p>{date(row.at)} · Edition {row.edition} · {row.actor?.kind==='staff'?'Staff':row.actor?.kind==='customer'?'Customer':'System'}</p></li>)}</ul>{!data.value.records.length&&<p>No operational transitions in this authorized page.</p>}{data.value.next&&<Button variant="secondary" onClick={()=>setAfter(data.value.next)}>Next transition page</Button>}{after&&<Button variant="secondary" onClick={()=>setAfter(null)}>Return to first page</Button>}</>}</section>;
}
function Governance({ frame,propose }) {
  const order=frame.current,can=action=>order.governanceActions?.includes(action),disabled=frame.busy||Boolean(frame.pending);
  const notes=useOwnerRead('staff-order-notes',{orderId:order.orderId,componentId:order.componentId},frame,can('notes-read'));
  const escalations=useOwnerRead('staff-order-escalations',{orderId:order.orderId,componentId:order.componentId},frame,can('escalation-read'));
  const [correction,setCorrection]=useState(null),[historyId,setHistoryId]=useState(null);
  const noteDraft=useRef(null);
  const history=useOwnerRead('staff-order-note-history',{orderId:order.orderId,noteId:historyId},frame,Boolean(historyId)&&can('notes-history'));
  function note(action,row,body,reason){const payload={orderId:order.orderId,componentId:order.componentId,expectedVersion:order.version,action,
    ...(row?{noteId:row.noteId,expectedRevision:row.revision}:{}),...(body?{body}:{}),...(reason?{reason}:{})};
    propose('staff-order-note-change',`notes-${action}`,{},`${label(action)} this exact Staff Operational Note${row?`, revision ${row.revision}`:''}? It cannot change Payment, Delivery, assignment, Chat or other business truth.`,order,payload,action==='add'?()=>noteDraft.current?.reset():null);}
  function escalate(action,row,extra={}){const payload={orderId:order.orderId,componentId:order.componentId,expectedVersion:order.version,action,
    ...(row?{escalationId:row.escalationId,expectedRevision:row.revision,expectedSourceVersion:row.source.version}:{}),...extra};
    propose('staff-order-escalation-change',`escalation-${action}`,{},`${label(action)} this exact governance review? Resolving Escalation does not resolve its underlying source issue or Attention.`,order,payload);}
  const correctionCurrent=correction&&notes.value?.records.some(row=>row.noteId===correction.noteId&&row.state!=='REDACTED');
  return <div className="admin-stack order-governance">
    {can('notes-read')&&<section className="admin-panel admin-stack" aria-label="Staff Operational Notes"><h2>Staff Operational Notes</h2><p>Exact scope: {workLabel(order.componentId)}. Notes are private narrative context, not business truth, Chat, Activity or formal Audit.</p><SourceStatus state={notes.state.code}>{notes.state.text}</SourceStatus>
      {notes.value&&<><ul className="order-entry-list">{notes.value.records.map(row=><li key={row.noteId}><h3>{row.state} · Revision {row.revision}</h3>{row.body&&<p>{row.body}</p>}<p>Original Author: {row.originalAuthor?.staffId} · {date(row.createdAt)}</p>{row.correctionActor&&<p>Correction Actor: {row.correctionActor.staffId} · {date(row.correctedAt)}</p>}<div className="order-actions">
        {can('notes-history')&&<Button variant="secondary" onClick={()=>setHistoryId(row.noteId)}>View exact Note history</Button>}
        {row.state!=='REDACTED'&&can('notes-correct')&&<Button variant="secondary" onClick={()=>setCorrection(structuredClone(row))}>Correct exact revision</Button>}
      </div>{row.state!=='REDACTED'&&can('notes-redact')&&<ReasonAction title="Review controlled redaction" disabled={disabled} onSubmit={reason=>note('redact',row,null,reason)}/>}</li>)}</ul>{!notes.value.records.length&&<p>No Notes in this authorized source page.</p>}{!notes.value.complete&&<p>Older Note records are outside this bounded view.</p>}</>}
      {can('notes-add')&&<form ref={noteDraft} className="admin-stack" onSubmit={event=>{event.preventDefault();note('add',null,String(new FormData(event.currentTarget).get('body')));}}><label>Local Note Draft · Not saved<textarea name="body" required maxLength={4000} disabled={disabled}/></label><Button type="submit" disabled={disabled}>Review Add Note</Button></form>}
      {correctionCurrent&&can('notes-correct')&&<form className="admin-stack" onSubmit={event=>{event.preventDefault();note('correct',correction,String(new FormData(event.currentTarget).get('body')));}}><p>Frozen correction target: Revision {correction.revision}. A newer revision will not be overwritten.</p><label>Proposed correction<textarea name="body" required maxLength={4000} defaultValue={correction.body} disabled={disabled}/></label><Button type="submit" disabled={disabled}>Review exact correction</Button><Button variant="secondary" onClick={()=>setCorrection(null)}>Close unsaved correction</Button></form>}
      {historyId&&can('notes-history')&&<section><h3>Exact Note revision history</h3><SourceStatus state={history.state.code}>{history.state.text}</SourceStatus>{history.value&&<ul className="order-entry-list">{history.value.records.map(row=><li key={row.revision}><strong>Revision {row.revision} · {label(row.action)}</strong><p>{date(row.at)} · {row.actor?.staffId}</p>{row.body&&<p>{row.body}</p>}</li>)}</ul>}<Button variant="secondary" onClick={()=>setHistoryId(null)}>Close Note history</Button></section>}
    </section>}
    {can('escalation-read')&&<section className="admin-panel admin-stack" aria-label="Escalation Governance"><h2>Exact-source Escalations</h2><p>OPEN → UNDER REVIEW → RESOLVED describes governance only. Review Handler is not Main Order Assignee. Source work and Attention remain independent.</p><SourceStatus state={escalations.state.code}>{escalations.state.text}</SourceStatus>
      {escalations.value&&<><ul className="order-entry-list">{escalations.value.records.map(row=><li key={row.escalationId}><h3>{row.state} · Revision {row.revision}</h3><p>Source: {row.source.kind} · {row.source.state}</p><p>Required responsibility: {row.requiredResponsibility}</p>{row.reviewHandler&&<p>Current Review Handler (orientation only): {row.reviewHandler}</p>}{row.outcome&&<p>Governance outcome: {row.outcome}. Source state remains {row.source.state}.</p>}
        {row.state==='OPEN'&&can('escalation-review')&&<Button disabled={disabled} onClick={()=>escalate('review',row)}>Review exact Escalation</Button>}
        {row.state!=='RESOLVED'&&can('escalation-resolve')&&<ReasonAction title="Review governance resolution" disabled={disabled} onSubmit={outcome=>escalate('resolve',row,{outcome})}/>}
      </li>)}</ul>{!escalations.value.records.length&&<p>No Escalations in this authorized page.</p>}</>}
      {can('escalation-create')&&order.operational&&<div className="admin-stack">{Object.entries(order.operational.issues).filter(([,issue])=>!issue.resolved).map(([sourceId,issue])=><form key={sourceId} className="admin-stack" onSubmit={event=>{event.preventDefault();escalate('create',null,{sourceKind:'work-issue',sourceId,expectedSourceVersion:order.operational.workVersion,reason:String(new FormData(event.currentTarget).get('reason'))});}}><h3>Qualifying source {issue.kind}</h3><p>{issue.reason}</p><label>Why ordinary authority/workflow is insufficient<textarea name="reason" required maxLength={4000} disabled={disabled}/></label><Button type="submit" disabled={disabled}>Review exact Escalation creation</Button></form>)}</div>}
      <p>Delivery Exception governance requires its own authoritative source integration; tracking or free text cannot manufacture that condition. No Change Handler or Escalation Chat exists.</p>
    </section>}
    {!can('notes-read')&&!can('escalation-read')&&<SourceStatus state="restricted">This context is unavailable under current access. No protected record, count or preview is disclosed.</SourceStatus>}
  </div>;
}
export default function MainOrderWorkspace() {
  const {orderId}=useParams(),[params,setParams]=useSearchParams(),componentId=params.get('work')||'base';
  const frame=useOrderWorkspace(orderId,componentId),order=frame.current;
  const section=tabs.some(([key])=>key===params.get('section'))?params.get('section'):'overview';
  const [confirmation,setConfirmation]=useState(null);
  function propose(endpoint,action,extra={},message='',basis=order,payload=null,onCommitted=null){const target=frozenOrderCommand(basis,action,extra);setConfirmation({scope:frame.scope,endpoint,target,payload:payload?structuredClone(payload):target,message,onCommitted});}
  const next=nextOrderAction(order),disabled=frame.busy||Boolean(frame.pending);
  function changeSection(key){setParams(previous=>{const nextParams=new URLSearchParams(previous);nextParams.set('section',key);return nextParams;});}
  return <div className="admin-stack main-order-workspace"><nav aria-label="Order breadcrumb"><Link to="/admin/orders">Orders &amp; Operations</Link><span> / Main Order</span></nav>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">One durable transaction</p><h1>Main Order {order?.reference||orderId}</h1>{order?.edition?.entries?.[0]?.label&&<p>{order.edition.entries[0].label}</p>}</div><Button variant="secondary" disabled={frame.busy} onClick={frame.refresh}>Check current source</Button></header>
    <SourceStatus state={frame.state.code}>{frame.state.text}</SourceStatus>{frame.pending&&<Button disabled={frame.busy} onClick={frame.check}>Check original action outcome</Button>}
    {order&&<><section className="order-context-anchor" aria-label="Exact Order context"><div><strong>Main Order</strong><p>{order.reference||order.orderId}</p></div><div><strong>Current Work</strong><p>{workLabel(order.currentWork)}</p></div><div><strong>Viewed Work</strong><p>{workLabel(componentId)}</p></div><div><strong>Current Edition for viewed work</strong><p>{order.currentEdition||'Not established'}</p></div></section>
      {order.currentWork!==componentId&&<SourceStatus state="read-only">This is separate from current work. <Link to={`?work=${encodeURIComponent(order.currentWork)}`}>Open exact Current Work</Link>. Historical Base completion is not undone by an Extension.</SourceStatus>}
      <section className="order-next-action"><AdminIcon name="activity"/><div><p className="admin-eyebrow">Current source orientation · not authorization</p><h2>{next.title}</h2><p>{order.status} · {order.fulfilment} · {order.delivery}</p></div></section>
      <nav className="order-sections" aria-label="Main Order sections">{tabs.map(([key,title])=><Button key={key} variant={section===key?'primary':'ghost'} aria-current={section===key?'page':undefined} onClick={()=>changeSection(key)}>{title}</Button>)}</nav>
      {section==='overview'&&<div className="order-workspace-grid"><section className="admin-panel"><h2>Current commercial Entries</h2><Entries entries={order.edition?.entries}/><Button variant="secondary" onClick={()=>changeSection('commercial')}>Review Editions &amp; Working Changes</Button></section><aside className="admin-stack"><section className="admin-panel"><h2>Exact financial context</h2><p>{workLabel(componentId)} · Bank Transfer</p><Finance order={order}/><Button variant="secondary" onClick={()=>changeSection('payments')}>Open Payment context</Button></section><section className="admin-panel"><h2>One canonical Order Chat</h2><p>Discussion does not approve terms, verify Payment or change operational truth.</p><Button variant="secondary" onClick={()=>changeSection('chat')}>Open Order Chat</Button></section><section className="admin-panel"><h2>Responsibility &amp; next work</h2><p>{order.assignedStaffId?'A current assignment is established.':'No current assignment.'}</p><Button variant="secondary" onClick={()=>changeSection('operations')}>Open current operational context</Button></section></aside></div>}
      {section==='commercial'&&<Commercial key={frame.scope} frame={frame} propose={propose}/>}
      {section==='payments'&&<Payments key={frame.scope} frame={frame} propose={propose}/>}
      {section==='provenance'&&<Provenance key={frame.scope} frame={frame}/>}
      {section==='extensions'&&<Extensions key={frame.scope} frame={frame} propose={propose}/>}
      {section==='operations'&&<OperationsPanel key={frame.scope} frame={frame} propose={propose}/>}
      {section==='activity'&&<Activity key={frame.scope} frame={frame}/>}
      {section==='governance'&&<Governance key={frame.scope} frame={frame} propose={propose}/>}
      {section==='chat'&&<section className="admin-panel"><h2>Main Order Chat</h2><p>Discussing {workLabel(componentId)} in the same canonical transaction conversation. No private transcript is loaded before opening this section.</p><Suspense fallback={<SourceStatus>Checking Chat access…</SourceStatus>}><Conversation key={frame.scope+order.chatId} chatId={order.chatId} staff/></Suspense></section>}
    </>}
    {confirmation?.scope===frame.scope&&order&&!disabled&&<ConfirmationDialog disabled={!targetStillCurrent(confirmation.target,order)} message={`${confirmation.message} Main Order ${confirmation.target.orderId} · ${workLabel(confirmation.target.componentId)} · Edition ${confirmation.target.expectedEdition} · source revision ${confirmation.target.expectedVersion}.${targetStillCurrent(confirmation.target,order)?'':' Changed Elsewhere: this confirmation cannot proceed.'}`} onResult={async accepted=>{const frozen=confirmation;setConfirmation(null);if(accepted&&await frame.run(frozen.endpoint,frozen.target,frozen.payload))frozen.onCommitted?.();}}/>}
  </div>;
}
