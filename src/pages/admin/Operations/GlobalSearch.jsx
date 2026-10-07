import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStaff } from "../../../context/StaffContext";
import { useOperations } from "../../../hooks/useOperations";
import { readCurrentStaff, readOperationalRecord } from "../../../services/operations";
import { resultState } from "../../../services/operationsModel";
import { interpretSearch, searchDomains, searchMatches, recentEntityReferences, rememberEntity, searchActor, searchHandoffQuery } from "../../../services/operationalSearch";
import { DOMAIN_CONTRACTS } from "../../../services/staffAuthorization";
import { SourceStatus, OperationalCards, MoreSources } from "../../../components/admin/OperationalViews";
import Button from "../../../components/common/Button";
import { resolveOperationalOpen, safeContextCapsule } from "../../../services/operationalActions";

function SearchSurface({ initialQuery }) {
  const { staff, uid } = useStaff();
  const actor = uid + "/" + staff.staffId;
  const { domains, sources, items, load } = useOperations("", true);
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(Boolean(initialQuery));
  const [category, setCategory] = useState("all");
  const [recent, setRecent] = useState([]);
  const [recentState, setRecentState] = useState("loading");
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState("");
  const input = useRef(null);
  const mounted = useRef(false);
  const openLock = useRef(false);
  const navigate = useNavigate();
  const interpretation = useMemo(() => interpretSearch(query), [query]);
  const ready = submitted || query.trim().length >= 2;
  const matches = ready ? searchMatches(items, interpretation, category) : [];
  const relevant = domains.filter(domain => (category === "all" || category === domain) && (!interpretation.domain || interpretation.domain === domain));
  const anyLoading = relevant.some(domain => !sources[domain] || sources[domain].state === "initial-loading");
  const anyUnavailable = relevant.some(domain => sources[domain] && !["success", "empty", "initial-loading"].includes(sources[domain].state));
  useEffect(() => {
    mounted.current = true;
    input.current?.focus();
    const handles = recentEntityReferences(actor).filter(item => domains.includes(item.domain));
    Promise.allSettled(handles.map(item => readOperationalRecord(item.domain, item.id))).then(results => {
      if (!mounted.current) return;
      setRecent(results.filter(result => result.status === "fulfilled" && result.value).map(result => result.value));
      setRecentState(results.some(result => result.status === "rejected" && resultState(result.reason) !== "restricted") ? "unavailable" : "checked");
    });
    return () => { mounted.current = false; };
  }, [actor, domains]);
  async function openReference(domain, id) {
    if (openLock.current || !domains.includes(domain)) return;
    openLock.current = true; setOpening(`${domain}:${id}`); setNotice("");
    try {
      const result = await resolveOperationalOpen(safeContextCapsule({ domain, id }), readOperationalRecord);
      const current = result.current;
      if (!mounted.current) return;
      if (!current) { setNotice("No currently accessible result for that reference."); void load(domain); return; }
      rememberEntity(actor, current);
      navigate(result.href);
    } catch (error) {
      if (mounted.current) {
        setNotice(resultState(error) === "restricted" ? "Current access does not permit this context. No protected result is disclosed."
          : "The owner source is unavailable or could not be verified. This does not establish that no record exists.");
        void load(domain);
      }
    } finally { openLock.current = false; if (mounted.current) setOpening(""); }
  }
  async function submit(event) {
    event.preventDefault(); setSubmitted(true); setNotice("");
    if (interpretation.kind === "exact") {
      if (!domains.includes(interpretation.domain)) { setNotice("No currently accessible destination for this command."); return; }
      await openReference(interpretation.domain, interpretation.reference);
    } else if (interpretation.kind === "navigation") {
      try {
        const current = await readCurrentStaff();
        if (!mounted.current) return;
        const available = searchDomains(current);
        const backed = available.some(domain => DOMAIN_CONTRACTS[domain].collection);
        if (interpretation.destination !== "dashboard" && !(interpretation.destination === "search" ? available.length : backed)) { setNotice("No currently accessible destination for this command."); return; }
        navigate(interpretation.destination === "dashboard" ? "/admin" : "/admin/" + interpretation.destination);
      } catch { if (mounted.current) setNotice("Current destination access could not be verified."); }
    }
  }
  return <div className="admin-stack admin-search-page"><header className="admin-page-heading"><div><p className="admin-eyebrow">Find · understand · route</p><h1>Global Search</h1><p>Find minimum-necessary context, then independently check the exact owner destination.</p></div></header>
    {!domains.length ? <section className="admin-panel"><h2>Search unavailable for current access</h2><p>No accessible entity types are disclosed.</p><Button to="/admin" variant="secondary">Return to Dashboard</Button></section> : <>
      <form className="admin-search-form" role="search" aria-label="Global operational Search" onSubmit={submit}>
        <div className="field"><label htmlFor="operations-query">Find authorized work</label><input ref={input} id="operations-query" type="search" value={query} maxLength={200} aria-describedby="operational-search-help" onChange={event => { setQuery(event.target.value); setSubmitted(false); setNotice(""); }} /></div>
        <Button type="submit" disabled={!query.trim() || Boolean(opening)}>Search or open</Button>
      </form>
      <p id="operational-search-help" className="admin-search-help">Type at least two characters or press Search. Examples: “find products named Aso”, “chats waiting on staff”, “open attention”. Exact commands use “open product” followed by a known owner reference. This bounded Search covers loaded authorized pages, not a complete cross-domain index.</p>
      <div className="field"><label htmlFor="operations-category">Entity type</label><select id="operations-category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All accessible entity types</option>{domains.map(domain => <option key={domain} value={domain}>{DOMAIN_CONTRACTS[domain].label}</option>)}</select></div>
      <details className="admin-panel"><summary>Exact owner reference lookup</summary><form className="admin-list-tools" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void openReference(form.get("domain"), String(form.get("reference") || "").trim()); }}>
        <div className="field"><label htmlFor="exact-source">Exact lookup source</label><select id="exact-source" name="domain">{domains.map(domain => <option key={domain} value={domain}>{DOMAIN_CONTRACTS[domain].label}</option>)}</select></div>
        <div className="field"><label htmlFor="exact-reference">Known stable owner reference</label><input id="exact-reference" name="reference" required maxLength={200} /></div><Button type="submit" disabled={Boolean(opening)}>Open exact reference</Button></form></details>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {!query.trim() && <section className="admin-search-group" aria-labelledby="recent-entities-heading"><h2 id="recent-entities-heading">Recent authorized entities</h2>
        <p role="status">{recentState === "loading" ? "Checking current authorization and owner state…" : recentState === "unavailable" ? "Some recent contexts could not be verified. No unavailable preview is shown." : !recent.length ? "No recent context is currently available in this session." : "These contexts were checked again for your current access."}</p>
        <OperationalCards items={recent} headingLevel={3} onOpen={item => openReference(item.domain, item.id)} opening={opening} /></section>}
      {ready && interpretation.kind === "find" && <section className="admin-stack" aria-label="Search results" aria-busy={anyLoading}>
        <p role="status">{anyLoading ? "Loading authorized sources; checked results remain usable." : anyUnavailable ? "Partial results. Some owner sources are unavailable or restricted; absence here is not proof of no records." : `${matches.length} matches in loaded authorized pages.`}</p>
        {!matches.length && !anyLoading && <p role="status">{anyUnavailable ? "No matches in the sources that could be checked." : "No results in loaded authorized pages. Check the reference or load another page."}</p>}
        {relevant.filter(domain => matches.some(item => item.domain === domain)).map(domain => <section key={domain} className="admin-search-group" aria-labelledby={`search-group-${domain}`}><h2 id={`search-group-${domain}`}>{DOMAIN_CONTRACTS[domain].label}</h2><OperationalCards items={matches.filter(item => item.domain === domain)} headingLevel={3} onOpen={item => openReference(item.domain, item.id)} opening={opening} /></section>)}
      </section>}
      <SourceStatus sources={sources} domains={domains} onRefresh={load} /><MoreSources sources={sources} domains={relevant} onLoad={load} />
    </>}
  </div>;
}
export default function GlobalSearch() {
  const location = useLocation();
  const { uid, staff } = useStaff();
  // Reset only for an intentional new Search entry, not ordinary typing.
  return <SearchSurface key={location.key} initialQuery={searchHandoffQuery(searchActor(uid, staff), location.state?.searchRequest)} />;
}
