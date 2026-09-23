import { useEffect, useState } from "react";
import { fetchPublishedReviews } from "../../services/content";
import ProductImage from "../../components/product/ProductImage";
import Button from "../../components/common/Button";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import "../Profile/Profile.css";
export default function ReviewsFeeds() {
  useDocumentMeta({ title: "Customer reviews | Universal Dicta Couture", description: "Read published customer reviews from Universal Dicta Couture.", canonicalPath: "/reviews-feeds" });
  const [state,setState] = useState({entries:[],loading:true,error:""});
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{ let active=true; fetchPublishedReviews(50,true).then(entries=>{if(active)setState({entries,loading:false,error:""});}).catch(()=>{if(active)setState({entries:[],loading:false,error:"Reviews could not be loaded. Please try again."});});return()=>{active=false;};},[attempt]);
  return <section className="account-page container"><div className="account-card"><h1>Customer reviews</h1>
    {state.loading ? <p role="status">Loading reviews…</p> : state.error ? <><p role="alert">{state.error}</p><Button onClick={()=>{setState({...state,loading:true});setAttempt(value=>value+1);}}>Try again</Button></> : state.entries.length ? state.entries.map(entry=><article key={entry.id}><blockquote>{entry.body}</blockquote><p>{entry.author}</p>{entry.image && <ProductImage image={entry.image} alt={entry.author} />}</article>) : <p>No customer reviews have been published yet.</p>}
  </div></section>;
}
