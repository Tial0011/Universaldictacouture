import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../common/Button";
import ImageField from "./ImageField";
import { adminError, deleteAdminRecord, loadAdminPage, saveAdminRecord } from "../../services/admin";
import { fetchPublishedProducts } from "../../services/products";
import { formatNaira } from "../../utils/formatters";
import { reviewStatus, timestampDate, timestampMs } from "../../services/reviewModel";
import ProductImage from "../product/ProductImage";

const INITIAL = {
  author: "",
  body: "",
  image: null,
  customerServiceRating: 0,
  productQualityRating: 0,
  productId: "",
  status: "pending",
  published: false,
};

function dateLabel(value) {
  const date = timestampDate(value);
  return date ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}

function RatingField({ id, label, value, onChange }) {
  return <div className="field">
    <span className="field__label" id={`${id}-label`}>{label}</span>
    <div className="admin-rating" role="radiogroup" aria-labelledby={`${id}-label`}>
      {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={`admin-rating__star${Number(value) >= star ? " is-selected" : ""}`} role="radio" aria-checked={Number(value) === star} aria-label={`${star} star${star === 1 ? "" : "s"}`} onClick={() => onChange(star)}>★</button>)}
      <span className="admin-rating__value">{Number(value) > 0 ? `${value}/5` : "Choose 1–5 stars"}</span>
    </div>
  </div>;
}

export default function ReviewManager() {
  const [params, setParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("submitted-desc");
  const [editor, setEditor] = useState(() => params.get("new") === "1" ? { ...INITIAL } : null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pendingPage, setPendingPage] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const editorHeading = useRef(null);

  useEffect(() => {
    let current = true;
    loadAdminPage("reviews", pendingPage).then((page) => {
      if (!current) return;
      setRecords((previous) => pendingPage ? [...previous, ...page.records.filter((record) => !previous.some((known) => known.id === record.id))] : page.records);
      setCursor(page.cursor);
      setMore(page.hasMore);
    }).catch((nextError) => { if (current) setError(adminError(nextError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [pendingPage, revision]);

  useEffect(() => {
    let current = true;
    setProductsError("");
    fetchPublishedProducts()
      .then((items) => { if (current) setProducts(items); })
      .catch(() => { if (current) setProductsError("Published products could not be loaded. Refresh before linking a review."); });
    return () => { current = false; };
  }, [revision]);

  useEffect(() => {
    if (!editor) return;
    editorHeading.current?.focus();
  }, [editor?.id]);

  useEffect(() => {
    if (!dirty && !uploading) return undefined;
    const prevent = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, uploading]);

  function update(key, value) {
    setEditor((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function open(record = null) {
    if (uploading || saving || (dirty && !window.confirm("Discard your unsaved changes?"))) return;
    if (!record) {
      setEditor({ ...INITIAL });
    } else {
      setEditor({
        ...record,
        image: record.image || (Array.isArray(record.images) ? record.images[0] : null) || null,
        status: reviewStatus(record),
        customerServiceRating: record.customerServiceRating ?? record.serviceRating ?? 0,
        productQualityRating: record.productQualityRating ?? record.qualityRating ?? 0,
        productId: record.productId ?? record.taggedProductId ?? "",
      });
    }
    setProductSearch("");
    setDirty(false);
    setNotice("");
    setError("");
  }

  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditor(null);
    setDirty(false);
    setProductSearch("");
    setParams({}, { replace: true });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const selected = products.find((product) => product.id === editor.productId);
      const raw = {
        ...editor,
        published: editor.status === "published",
        productSnapshot: selected ? {
          name: selected.name,
          image: selected.image || null,
          price: selected.minPrice,
          slug: selected.slug,
        } : editor.productSnapshot || null,
      };
      await saveAdminRecord("reviews", raw);
      setNotice("Customer review saved.");
      setEditor(null);
      setDirty(false);
      setProductSearch("");
      setParams({}, { replace: true });
      setLoading(true);
      setPendingPage(undefined);
      setRevision((value) => value + 1);
    } catch (nextError) {
      setError(adminError(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(record) {
    if (!record?.id || saving || uploading) return;
    if (!window.confirm(`Permanently delete ${record.author || "this review"}? This cannot be undone.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await deleteAdminRecord("reviews", record.id);
      if (editor?.id === record.id) setEditor(null);
      setNotice("Customer review deleted.");
      setLoading(true);
      setPendingPage(undefined);
      setRevision((value) => value + 1);
    } catch (nextError) {
      setError(adminError(nextError));
    } finally {
      setSaving(false);
    }
  }

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productOptions = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    return products.filter((product) => !needle || product.name.toLowerCase().includes(needle) || product.searchText?.includes(needle));
  }, [productSearch, products]);
  const selectedProduct = editor?.productId ? productMap.get(editor.productId) : null;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = records.filter((record) => {
      const status = reviewStatus(record);
      if (filter !== "all" && status !== filter) return false;
      const product = productMap.get(record.productId);
      return !needle || [record.author, record.body, product?.name, record.productSnapshot?.name].some((value) => String(value || "").toLowerCase().includes(needle));
    });
    return [...filtered].sort((a, b) => {
      if (sort === "submitted-asc") return timestampMs(a.submittedAt || a.createdAt) - timestampMs(b.submittedAt || b.createdAt);
      if (sort === "published-desc") return timestampMs(b.publishedAt) - timestampMs(a.publishedAt);
      return timestampMs(b.submittedAt || b.createdAt) - timestampMs(a.submittedAt || a.createdAt);
    });
  }, [filter, productMap, records, search, sort]);

  return <div className="admin-stack admin-review-manager">
    <header className="admin-page-heading">
      <div><p className="admin-eyebrow">Community moderation</p><h1>Customer Reviews</h1><p>Review customer stories, connect them to the correct piece and control what appears publicly in Review &amp; Feeds.</p></div>
      <Button disabled={saving || uploading} onClick={() => open(null)}>Add review</Button>
    </header>

    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {error && <div role="alert" className="admin-notice"><p>{error}</p>{!editor && <Button variant="secondary" onClick={() => { setLoading(true); setError(""); setRevision((value) => value + 1); }}>Try again</Button>}</div>}

    {editor && <section className="admin-panel admin-stack admin-review-editor" aria-labelledby="review-editor-title">
      <div><p className="admin-eyebrow">Review editor</p><h2 id="review-editor-title" tabIndex={-1} ref={editorHeading}>{editor.id ? "Edit customer review" : "Add customer review"}</h2><p>Published reviews appear publicly. Pending and hidden reviews remain private to Admin.</p></div>
      <form onSubmit={save} className="admin-stack">
        <fieldset className="admin-form-fields" disabled={saving || uploading}>
          <section className="admin-review-editor__group">
            <header><span>01</span><div><h3>Customer &amp; Product</h3><p>Identify the reviewer and the piece this story belongs to.</p></div></header>
            <div className="field"><label className="field__label" htmlFor="review-author">Customer / display name</label><input id="review-author" required value={editor.author || ""} onChange={(event) => update("author", event.target.value)} /></div>
            <div className="field"><label className="field__label" htmlFor="review-product-search">Reviewed product</label>
              <div className="admin-product-picker admin-stack">
                <input id="review-product-search" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search published products by name" />
                <select required value={editor.productId || ""} onChange={(event) => update("productId", event.target.value)}>
                  <option value="">Choose the reviewed product</option>
                  {editor.productId && !products.some((product) => product.id === editor.productId) && <option value={editor.productId}>{editor.productSnapshot?.name || "Current linked product"} — unavailable/unpublished</option>}
                  {productOptions.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                {selectedProduct && <div className="admin-review-product-preview"><div>{selectedProduct.image ? <ProductImage image={selectedProduct.image} alt={selectedProduct.name} transformation="w_160,h_160,c_fill,g_auto,q_auto,f_auto" /> : <span>UDC</span>}</div><p><strong>{selectedProduct.name}</strong><small>{formatNaira(selectedProduct.minPrice)}{selectedProduct.hasVariablePricing ? " +" : ""}</small></p></div>}
                {!selectedProduct && editor.productSnapshot?.name && <p className="field__hint">Historical link: {editor.productSnapshot.name}. The live product is currently unavailable or unpublished.</p>}
                {productsError && <p className="field__error" role="alert">{productsError}</p>}
              </div>
            </div>
            {(editor.customerId || editor.orderId || editor.orderItemId) && <dl className="admin-review-metadata">
              {editor.customerId && <div><dt>Customer account</dt><dd>{editor.customerId}</dd></div>}
              {editor.orderId && <div><dt>Order reference</dt><dd>{editor.orderId}</dd></div>}
              {editor.orderItemId && <div><dt>Purchase item</dt><dd>{editor.orderItemId}</dd></div>}
            </dl>}
          </section>

          <section className="admin-review-editor__group">
            <header><span>02</span><div><h3>Review</h3><p>The written customer story is required.</p></div></header>
            <div className="field"><label className="field__label" htmlFor="review-body">Written review</label><textarea id="review-body" required maxLength={4000} value={editor.body || ""} onChange={(event) => update("body", event.target.value)} /></div>
          </section>

          <section className="admin-review-editor__group">
            <header><span>03</span><div><h3>Ratings</h3><p>Keep service and product quality separate.</p></div></header>
            <div className="admin-review-rating-grid">
              <RatingField id="review-service" label="Customer Service" value={editor.customerServiceRating} onChange={(value) => update("customerServiceRating", value)} />
              <RatingField id="review-quality" label="Product Quality" value={editor.productQualityRating} onChange={(value) => update("productQualityRating", value)} />
            </div>
          </section>

          <section className="admin-review-editor__group">
            <header><span>04</span><div><h3>Photo</h3><p>Optional. The finalized review system accepts zero or one customer photo.</p></div></header>
            <ImageField id="review-image" value={editor.image || null} onChange={(value) => update("image", value)} setUploading={setUploading} />
          </section>

          <section className="admin-review-editor__group">
            <header><span>05</span><div><h3>Publication</h3><p>Pending stays private. Published appears publicly. Hidden removes a story from public areas without deleting it.</p></div></header>
            <div className="field"><label className="field__label" htmlFor="review-status">Status</label><select id="review-status" value={editor.status || "pending"} onChange={(event) => update("status", event.target.value)}><option value="pending">Pending</option><option value="published">Published</option><option value="hidden">Hidden / Rejected</option></select></div>
            {editor.id && <dl className="admin-review-metadata">
              <div><dt>Submitted</dt><dd>{dateLabel(editor.submittedAt || editor.createdAt)}</dd></div>
              <div><dt>First published</dt><dd>{dateLabel(editor.publishedAt)}</dd></div>
            </dl>}
          </section>
        </fieldset>
        <div className="admin-form-actions"><Button type="submit" disabled={uploading} isLoading={saving}>{saving ? "Saving…" : "Save review"}</Button><Button variant="secondary" disabled={saving || uploading} onClick={cancel}>Cancel</Button><span className="field__hint">{uploading ? "Uploading photo…" : dirty ? "Unsaved changes" : "No unsaved changes"}</span></div>
      </form>
    </section>}

    <section className="admin-panel admin-stack" aria-label="Customer Reviews list">
      <div className="admin-review-tools">
        <div className="field"><label htmlFor="review-admin-search">Search reviews</label><input id="review-admin-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, product or review text" /></div>
        <div className="field"><label htmlFor="review-admin-filter">Status</label><select id="review-admin-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="published">Published</option><option value="hidden">Hidden / Rejected</option></select></div>
        <div className="field"><label htmlFor="review-admin-sort">Sort</label><select id="review-admin-sort" value={sort} onChange={(event) => setSort(event.target.value)}><option value="submitted-desc">Newest submitted</option><option value="submitted-asc">Oldest submitted</option><option value="published-desc">Newest published</option></select></div>
        <Button variant="secondary" disabled={loading || saving || uploading} onClick={() => { setLoading(true); setError(""); setPendingPage(undefined); setRevision((value) => value + 1); }}>Refresh</Button>
      </div>
      <p className="field__hint">{records.length} loaded · {visible.length} shown. Load more to search additional records.</p>
      {loading && <p role="status">Loading customer reviews…</p>}
      {!loading && !error && !visible.length && <div className="admin-empty"><h2>{records.length ? "No matching reviews" : "No customer reviews yet"}</h2><p>{records.length ? "Try another search or status filter." : "Customer submissions and Admin-created reviews will appear here."}</p></div>}
      {!!visible.length && <div className="admin-table-wrap"><table className="admin-table admin-review-table"><caption className="visually-hidden">Customer Reviews</caption><thead><tr><th>Customer</th><th>Product</th><th>Review</th><th>Ratings</th><th>Dates</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((record) => {
        const linkedProduct = productMap.get(record.productId);
        const status = reviewStatus(record);
        return <tr key={record.id}>
          <td><strong>{record.author || "Customer"}</strong>{record.customerId && <small>Account-linked</small>}</td>
          <td><strong>{linkedProduct?.name || record.productSnapshot?.name || "Unavailable piece"}</strong>{linkedProduct && <small>{formatNaira(linkedProduct.minPrice)}</small>}</td>
          <td><span className="admin-review-table__excerpt">{record.body || "—"}</span>{record.image && <small>Customer photo attached</small>}</td>
          <td><small>Service: {record.customerServiceRating || "—"}/5</small><small>Quality: {record.productQualityRating || "—"}/5</small></td>
          <td><small>Submitted: {dateLabel(record.submittedAt || record.createdAt)}</small><small>Published: {dateLabel(record.publishedAt)}</small></td>
          <td><span className={`admin-status admin-status--${status}`}>{status === "hidden" ? "hidden / rejected" : status}</span></td>
          <td><div className="admin-actions"><Button variant="ghost" disabled={saving || uploading} onClick={() => open(record)}>Edit</Button><Button variant="ghost" disabled={saving || uploading} onClick={() => remove(record)}>Delete</Button></div></td>
        </tr>;
      })}</tbody></table></div>}
      {more && <Button variant="secondary" disabled={loading} onClick={() => { setLoading(true); setError(""); setPendingPage(cursor); }}>Load more</Button>}
    </section>
  </div>;
}
