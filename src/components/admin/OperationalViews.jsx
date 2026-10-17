import { DOMAIN_CONTRACTS } from "../../services/staffAuthorization";
import Button from "../common/Button";
import StatusChip from "./StatusChip";

export function SourceStatus({ sources, domains, onRefresh }) {
  return <section className="admin-source-status" aria-label="Source freshness"><ul>{domains.map(domain => {
    const source = sources[domain];
    const state = source?.state || "initial-loading";
    return <li key={domain}><strong>{DOMAIN_CONTRACTS[domain].label}</strong>
      <span role="status">{state === "initial-loading" ? "Loading" : state === "success" || state === "empty"
        ? `Checked ${new Date(source.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${source.hasMore ? " · More available" : ""}`
        : state === "restricted" ? "Access changed" : state === "connection-problem" ? "Connection problem" : "Source unavailable"}</span>
      <Button variant="ghost" disabled={state === "initial-loading" || source?.loadingMore} onClick={() => onRefresh(domain)}>Refresh {DOMAIN_CONTRACTS[domain].label}</Button></li>;
  })}</ul></section>;
}
export function OperationalCards({ items, onOpen, onPreview, opening, headingLevel = 2 }) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return <ul className="admin-operational-list">{items.map(item => <li className="admin-panel admin-operational-card" key={`${item.domain}:${item.id}`}>
    <div><p className="admin-eyebrow">{DOMAIN_CONTRACTS[item.domain].label}</p><Heading>{item.label}</Heading>{item.reference && <p className="admin-reference">{item.reference}</p>}{item.updatedAt > 0 && <small>Owner update: <time dateTime={new Date(item.updatedAt).toISOString()}>{new Date(item.updatedAt).toLocaleString()}</time></small>}</div>
    <div><StatusChip label={item.state} />{item.priority && <StatusChip label={item.priority} priority />}
      {item.issueKeys?.length > 0 && <p>Catalogue checks: {item.issueState}</p>}
      {item.reason && <p>{item.reason}</p>}{item.ownerState && <p>Owner state: {item.ownerState}</p>}{item.key && <small>Priority and time in Attention are unavailable from this source.</small>}</div>
    <div className="admin-operational-card-actions">{onOpen ? <Button variant="secondary" disabled={Boolean(opening)} onClick={() => onOpen(item)}>{opening === `${item.domain}:${item.id}` ? "Checking current context…" : "Open current context"}</Button>
      : <Button to={item.href} variant="secondary">Open owner workspace</Button>}{onPreview && <Button variant="ghost" aria-haspopup="dialog" aria-controls="attention-context" onClick={event => onPreview(item, event.currentTarget)}>View safe context</Button>}</div>
  </li>)}</ul>;
}
export function MetricCards({ metrics }) {
  if (!metrics.length) return null;
  return <section aria-labelledby="operational-metrics"><h2 id="operational-metrics">Operational signals</h2><div className="admin-metric-grid">{metrics.map(metric => <section className="admin-panel admin-metric" key={metric.key} data-metric={metric.key}>
    <h3>{metric.label}</h3><p role="status">{metric.count === null ? metric.state === "loading" ? "Loading" : "Source unavailable" : <><strong>{metric.count}</strong> {metric.state === "partial" ? "in checked pages · Partial" : "in checked source"}</>}</p>
    {metric.checkedAt && <small>Checked <time dateTime={new Date(metric.checkedAt).toISOString()}>{new Date(metric.checkedAt).toLocaleTimeString()}</time></small>}
    <Button to={metric.href} variant="ghost">Open filtered work</Button>
  </section>)}</div></section>;
}
export function MoreSources({ sources, domains, onLoad }) {
  return <div className="admin-actions">{domains.filter(domain => sources[domain]?.hasMore).map(domain => <Button key={domain} variant="secondary"
    isLoading={sources[domain].loadingMore} onClick={() => onLoad(domain, true, sources[domain].cursor)}>Load more {DOMAIN_CONTRACTS[domain].label}</Button>)}</div>;
}
