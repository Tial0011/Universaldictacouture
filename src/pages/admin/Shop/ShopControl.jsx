import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../../components/common/Button";
import { SHOP_SEO } from "../../../config/shopSeo";
import { adminError, loadAdminPage, loadProductStatusCounts } from "../../../services/admin";
import { productReadiness } from "../../../services/adminModel";
import { fetchShopByGroups } from "../../../services/shopBy";

function StatusMetric({ label, value, hint }) {
  return (
    <article className="admin-panel admin-health-metric">
      <p className="admin-eyebrow">{label}</p>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

export default function ShopControl() {
  const [state, setState] = useState({ loading: true, error: "", counts: null, products: [], shopByGroups: [] });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [counts, productPage, shopByGroups] = await Promise.all([
        loadProductStatusCounts(),
        loadAdminPage("products"),
        fetchShopByGroups({ includeInactive: true }),
      ]);
      setState({ loading: false, error: "", counts, products: productPage.records, shopByGroups });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: adminError(error) }));
    }
  }

  useEffect(() => { load(); }, []);

  const attention = useMemo(
    () => state.products
      .map((product) => ({ product, readiness: productReadiness(product) }))
      .filter(({ readiness }) => readiness.state === "needs-attention")
      .slice(0, 5),
    [state.products]
  );
  const activeShopBy = state.shopByGroups.filter((group) => group.active !== false);
  const inactiveShopBy = state.shopByGroups.length - activeShopBy.length;

  return (
    <div className="admin-stack">
      <header className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Shop operations</p>
          <h1>Shop Control Center</h1>
          <p>Manage catalogue readiness, merchandising and the customer-facing Shop from one clear starting point.</p>
        </div>
        <div className="admin-actions">
          <Button to="/admin/products?new=1">Add product</Button>
          <Button to="/shop" target="_blank" rel="noopener noreferrer" variant="secondary">View customer Shop</Button>
        </div>
      </header>

      {state.error && <div className="admin-notice" role="alert"><p>{state.error}</p><Button variant="secondary" onClick={load}>Retry</Button></div>}
      {state.loading && <p role="status">Loading Shop operations…</p>}

      <section aria-labelledby="shop-actions-title">
        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">Daily operations</p><h2 id="shop-actions-title">Manage the customer Shop</h2></div>
        </div>
        <div className="admin-card-grid admin-card-grid--shop">
          <Link className="admin-panel admin-section-card" to="/admin/products">
            <h3>Products</h3><p>Add, edit, publish, archive and check product readiness.</p><span className="admin-card-action">Manage products <span aria-hidden="true">→</span></span>
          </Link>
          <Link className="admin-panel admin-section-card" to="/admin/products?view=new-in">
            <h3>New In</h3><p>Curate New In manually. It remains separate from Newest First.</p><span className="admin-card-action">Manage New In <span aria-hidden="true">→</span></span>
          </Link>
          <Link className="admin-panel admin-section-card" to="/admin/discovery">
            <h3>Shop By</h3><p>Manage Occasion, Style, Fabric &amp; Pattern and customer discovery choices.</p><span className="admin-card-action">Manage Shop By <span aria-hidden="true">→</span></span>
          </Link>
          <Link className="admin-panel admin-section-card" to="/admin/taxonomy">
            <h3>Catalogue structure</h3><p>Manage Category, Occasion, Style, Fabric / Weave and Colour labels.</p><span className="admin-card-action">Manage labels <span aria-hidden="true">→</span></span>
          </Link>
          <Link className="admin-panel admin-section-card" to="/admin/products?focus=search">
            <h3>Search terms</h3><p>Manage genuine aliases and keywords inside each product without changing its public name.</p><span className="admin-card-action">Edit search metadata <span aria-hidden="true">→</span></span>
          </Link>
        </div>
      </section>

      {state.counts && (
        <section aria-labelledby="catalogue-status-title">
          <div className="admin-section-heading"><div><p className="admin-eyebrow">Catalogue status</p><h2 id="catalogue-status-title">Publication overview</h2></div></div>
          <div className="admin-health-grid">
            <StatusMetric label="Published" value={state.counts.published ?? 0} hint="Currently eligible for the public catalogue, subject to public validation." />
            <StatusMetric label="Draft / unpublished" value={state.counts.draft ?? 0} hint="Working records that are not public." />
            <StatusMetric label="Archived" value={state.counts.archived ?? 0} hint="Retained records intentionally removed from the public Shop." />
          </div>
        </section>
      )}

      <section id="shop-health" className="admin-panel admin-stack" aria-labelledby="readiness-title">
        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">Quality</p><h2 id="readiness-title">Product readiness</h2></div>
          <Button to="/admin/products?view=needs-attention" variant="secondary">Review all loaded issues</Button>
        </div>
        <p>This lightweight check reviews the first admin product page so the dashboard stays fast. Product Manager shows readiness on every loaded record.</p>
        {!state.loading && !attention.length ? <p className="admin-positive">No publication blockers were found in the current review set.</p> : null}
        {attention.length ? <ul className="admin-health-list">{attention.map(({ product, readiness }) => (
          <li key={product.id}>
            <div><strong>{product.name || "Untitled product"}</strong><span>{readiness.blockers.map((item) => item.label).join(" · ")}</span></div>
            <Button to={`/admin/products?edit=${encodeURIComponent(product.id)}`} variant="ghost">Review</Button>
          </li>
        ))}</ul> : null}
      </section>

      <div className="admin-health-grid admin-health-grid--two">
        <section className="admin-panel admin-stack" aria-labelledby="merch-title">
          <div><p className="admin-eyebrow">Merchandising</p><h2 id="merch-title">Shop By &amp; New In</h2></div>
          <p>{activeShopBy.length} active Shop By group{activeShopBy.length === 1 ? "" : "s"} are currently available to the customer experience.{inactiveShopBy ? ` ${inactiveShopBy} configured group${inactiveShopBy === 1 ? " is" : "s are"} currently inactive.` : ""}</p>
          <p className="field__hint"><strong>New In</strong> is curated manually on products and does not change Newest First chronology.</p>
          <div className="admin-actions"><Button to="/admin/discovery" variant="secondary">Open Shop By</Button><Button to="/admin/products?view=new-in" variant="ghost">Open New In</Button></div>
        </section>

        <section className="admin-panel admin-stack" aria-labelledby="seo-health-title">
          <div><p className="admin-eyebrow">Routing &amp; SEO health</p><h2 id="seo-health-title">Customer Shop diagnostics</h2></div>
          <dl className="admin-health-dl">
            <div><dt>Main route</dt><dd>{SHOP_SEO.canonicalPath}</dd></div>
            <div><dt>Page title</dt><dd>{SHOP_SEO.title}</dd></div>
            <div><dt>Canonical</dt><dd>{SHOP_SEO.canonicalPath}</dd></div>
            <div><dt>Filtered URLs</dt><dd>Shareable, canonicalized to the main Shop and not independently indexed.</dd></div>
          </dl>
          <p className="field__hint">These diagnostics are read-only so the canonical Shop destination cannot be accidentally changed here.</p>
        </section>
      </div>
    </div>
  );
}
