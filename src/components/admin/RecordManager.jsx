import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteAdminRecord, loadAdminPage, saveAdminRecord, adminError } from "../../services/admin";
import { SCHEMAS } from "./recordSchemas";
import { invalidateCatalogue } from "../../hooks/useCatalogue";
import ImageField from "./ImageField";
import Button from "../common/Button";
import { DEFAULT_SHOP_BY_GROUPS, fetchShopByGroups } from "../../services/shopBy";
import { fetchPublishedProducts } from "../../services/products";

export default function RecordManager({ kind }) {
  const schema = SCHEMAS[kind];
  const [params, setParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState(() => params.get("new") === "1" ? { ...schema.initial } : null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [shopByGroups, setShopByGroups] = useState(DEFAULT_SHOP_BY_GROUPS);
  const [reviewProducts, setReviewProducts] = useState([]);
  const [reviewProductsError, setReviewProductsError] = useState("");
  const [reviewProductSearch, setReviewProductSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(undefined);
  const editorHeading = useRef(null);
  const addButtonArea = useRef(null);

  useEffect(() => {
    let current = true;
    loadAdminPage(kind, pendingPage).then(page => {
      if (!current) return;
      setRecords(previous => pendingPage ? [...previous, ...page.records.filter(record => !previous.some(old => old.id === record.id))] : page.records);
      setCursor(page.cursor); setMore(page.hasMore);
    }).catch(error => { if (current) setError(adminError(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, pendingPage, revision]);

  useEffect(() => {
    if (kind !== "products") return;
    let current = true;
    fetchShopByGroups().then((groups) => {
      if (current && groups.length) setShopByGroups(groups);
    });
    return () => { current = false; };
  }, [kind, revision]);

  useEffect(() => {
    if (kind !== "reviews") return;
    let current = true;
    setReviewProductsError("");
    fetchPublishedProducts()
      .then((products) => { if (current) setReviewProducts(products); })
      .catch(() => { if (current) setReviewProductsError("Published products could not be loaded. Refresh before tagging a product."); });
    return () => { current = false; };
  }, [kind, revision]);

  useEffect(() => {
    if (!dirty && !uploading) return;
    const prevent = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    const navigate = event => {
      const link = event.target.closest("a[href]");
      if (link && !link.hash && !window.confirm("Discard your unsaved changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", prevent); document.removeEventListener("click", navigate, true); };
  }, [dirty, uploading]);

  const editingId = editor ? editor.id || "new" : null;
  useEffect(() => { if (editingId) editorHeading.current?.focus(); }, [editingId]);

  function open(record) {
    if (uploading || saving || (dirty && !window.confirm("Discard your unsaved changes?"))) return;
    let next = record ? { ...record } : { ...schema.initial };
    if (kind === "reviews") {
      next = {
        ...next,
        images: Array.isArray(next.images) ? next.images : next.image ? [next.image] : [],
        customerServiceRating: next.customerServiceRating ?? next.serviceRating ?? 0,
        productQualityRating: next.productQualityRating ?? next.qualityRating ?? 0,
        productId: next.productId ?? next.taggedProductId ?? "",
      };
      setReviewProductSearch("");
    }
    setEditor(next);
    setDirty(false); setNotice(""); setError("");
  }

  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditor(null); setDirty(false); setReviewProductSearch("");
    setParams({}, { replace: true });
    addButtonArea.current?.querySelector("button")?.focus();
  }

  function update(key, value) { setEditor(previous => ({ ...previous, [key]: value })); setDirty(true); }

  function updateShopBy(group, nextValues) {
    setEditor((previous) => {
      const shopBy = { ...(previous.shopBy || {}), [group.key]: nextValues };
      if (!nextValues.length) delete shopBy[group.key];
      const next = { ...previous, shopBy };
      if (["occasion", "style", "fabric"].includes(group.key)) next[group.key] = nextValues;
      return next;
    });
    setDirty(true);
  }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const raw = { ...editor };
      if (kind === "products" && Object.hasOwn(raw, "images")) raw.primaryImage = raw.images?.[0] || null;
      await saveAdminRecord(kind, raw);
      if (kind === "products") invalidateCatalogue();
      setNotice("Saved successfully."); setEditor(null); setDirty(false); setReviewProductSearch("");
      setParams({}, { replace: true }); setLoading(true); setPendingPage(undefined); setRevision(v => v + 1);
      addButtonArea.current?.querySelector("button")?.focus();
    } catch (error) { setError(adminError(error)); }
    finally { setSaving(false); }
  }

  async function remove(record) {
    if (kind !== "reviews" || !record?.id || saving || uploading) return;
    const name = record.author || "this review";
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await deleteAdminRecord(kind, record.id);
      if (editor?.id === record.id) setEditor(null);
      setNotice("Review deleted.");
      setLoading(true); setPendingPage(undefined); setRevision(v => v + 1);
    } catch (error) { setError(adminError(error)); }
    finally { setSaving(false); }
  }

  function status(record) {
    if (kind === "products") return record.status || "draft";
    if (kind === "taxonomy") return record.dimension;
    return (record.published || record.active) ? "published" : "draft";
  }

  const visible = records.filter(record => (filter === "all" || status(record) === filter) && [record.name, record.title, record.headline, record.author, record.body].some(value => String(value || "").toLowerCase().includes(search.toLowerCase())));

  function field(definition) {
    const { key, label, type, options, hint, required, maxImages } = definition;
    const id = "admin-field-" + key;
    const value = editor[key];
    const props = { id, required, "aria-describedby": hint ? id + "-hint" : undefined };
    const complexLabel = ["tiles", "shopBy", "rating", "product"].includes(type);

    const filteredProducts = type === "product"
      ? reviewProducts.filter((product) => {
          const query = reviewProductSearch.trim().toLowerCase();
          return !query || product.name.toLowerCase().includes(query) || product.id.toLowerCase().includes(query) || product.searchText?.includes(query);
        })
      : [];
    const selectedProduct = type === "product" && value ? reviewProducts.find(product => product.id === value) : null;
    const productOptions = type === "product" && selectedProduct && !filteredProducts.some(product => product.id === selectedProduct.id)
      ? [selectedProduct, ...filteredProducts]
      : filteredProducts;

    return <div className="field" key={key}>
      {type !== "checkbox" && <label className="field__label" id={complexLabel ? id + "-label" : undefined} htmlFor={complexLabel ? undefined : id}>{label}</label>}
      {type === "checkbox" ? <label className="choice" htmlFor={id}><input id={id} type="checkbox" checked={!!value} onChange={event => update(key, event.target.checked)} />{label}</label>
        : type === "select" ? <select {...props} value={value || options[0]} onChange={event => update(key, event.target.value)}>{options.map(option => <option key={option} value={option}>{option.replaceAll("-", " ")}</option>)}</select>
        : type === "shopBy" ? <div className="admin-shop-by-field admin-stack">
          <div className="admin-shop-by-field__intro"><p>Choose where this product should appear in the homepage Shop By flow.</p><Button to="/admin/discovery" variant="secondary">Manage Shop By groups & choices</Button></div>
          {shopByGroups.map((group) => {
            const rawSelected = editor.shopBy?.[group.key] ?? editor[group.key] ?? [];
            const selected = Array.isArray(rawSelected) ? rawSelected.map(String) : String(rawSelected || "").split(",").map(entry => entry.trim()).filter(Boolean);
            const choices = [...new Set([...(group.values || []), ...selected])];
            return <fieldset className="admin-shop-by-group" key={group.id}>
              <legend><span>Shop by</span> {group.label}</legend>
              {choices.length ? <div className="admin-shop-by-choices">{choices.map((choice) => {
                const checked = selected.some((entry) => entry.toLowerCase() === choice.toLowerCase());
                return <label className="choice admin-shop-by-choice" key={choice}><input type="checkbox" checked={checked} onChange={() => {
                  const next = checked ? selected.filter((entry) => entry.toLowerCase() !== choice.toLowerCase()) : [...selected, choice];
                  updateShopBy(group, next);
                }} /><span>{choice}</span></label>;
              })}</div> : <p className="field__hint">No saved choices yet. Use “Manage Shop By groups & choices” to add one.</p>}
            </fieldset>;
          })}
        </div>
        : type === "rating" ? <div className="admin-rating" role="radiogroup" aria-labelledby={id + "-label"} aria-describedby={hint ? id + "-hint" : undefined}>
          {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={`admin-rating__star${Number(value) >= star ? " is-selected" : ""}`} role="radio" aria-checked={Number(value) === star} aria-label={`${star} star${star === 1 ? "" : "s"}`} onClick={() => update(key, star)}>★</button>)}
          <span className="admin-rating__value">{Number(value) > 0 ? `${value}/5` : "Choose 1–5 stars"}</span>
        </div>
        : type === "product" ? <div className="admin-product-picker admin-stack" aria-labelledby={id + "-label"}>
          <input id={id + "-search"} type="search" value={reviewProductSearch} onChange={event => setReviewProductSearch(event.target.value)} placeholder="Search published products by name" aria-label="Search published products" />
          <select {...props} value={value || ""} onChange={event => update(key, event.target.value)}>
            <option value="">Choose a published product</option>
            {value && !reviewProducts.some(product => product.id === value) && <option value={value}>Current product ({value}) — unavailable or unpublished</option>}
            {productOptions.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          {reviewProductsError && <p className="field__error" role="alert">{reviewProductsError}</p>}
          {!reviewProductsError && reviewProductSearch && !productOptions.length && <p className="field__hint">No published product matches that search.</p>}
        </div>
        : type === "textarea" ? <textarea {...props} value={value || ""} maxLength={4000} onChange={event => update(key, event.target.value)} />
        : type === "image" || type === "images" ? <ImageField id={id} value={value} multiple={type === "images"} maxImages={maxImages} onChange={value => update(key, value)} setUploading={setUploading} />
        : type === "tiles" ? <div className="admin-stack">{(value || []).map((tile, index) => <fieldset className="admin-panel admin-stack" key={index}>
          <legend>Tile {index + 1}</legend>
          <label htmlFor={id + "-name-" + index}>Tile name</label><input id={id + "-name-" + index} required value={tile.name || ""} onChange={event => update(key, value.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
          <label htmlFor={id + "-link-" + index}>Shop link</label><input id={id + "-link-" + index} required placeholder="/shop?occasion=Bridal" value={tile.destination || ""} onChange={event => update(key, value.map((item, i) => i === index ? { ...item, destination: event.target.value } : item))} />
          <label htmlFor={id + "-image-" + index}>Tile photo</label><ImageField id={id + "-image-" + index} value={tile.image} setUploading={setUploading} onChange={image => update(key, value.map((item, i) => i === index ? { ...item, image } : item))} />
          <Button variant="secondary" onClick={() => update(key, value.filter((_, i) => i !== index))}>Remove tile {index + 1}</Button>
        </fieldset>)}<Button variant="secondary" disabled={(value || []).length >= 12} onClick={() => update(key, [...(value || []), { name: "", destination: "/shop", published: true }])}>Add tile</Button></div>
        : <input {...props} type={type === "number" ? "number" : "text"} min={type === "number" ? 0 : undefined} step={key === "price" ? "0.01" : "1"} maxLength={500} value={Array.isArray(value) ? value.join(", ") : value ?? ""} onChange={event => update(key, event.target.value)} />}
      {hint && <p className="field__hint" id={id + "-hint"}>{hint}</p>}
    </div>;
  }

  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Studio management</p><h1>{schema.title}</h1><p>{schema.description}</p></div><div ref={addButtonArea}><Button disabled={saving || uploading} onClick={() => open(null)}>Add {schema.singular}</Button></div></header>
    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {error && <div role="alert" className="admin-notice"><p>{error}</p>{!editor && <Button variant="secondary" onClick={() => { setLoading(true); setError(""); setRevision(v => v + 1); }}>Try again</Button>}</div>}
    {editor && <section className="admin-panel admin-stack" aria-labelledby="editor-title">
      <div><h2 id="editor-title" tabIndex={-1} ref={editorHeading}>{editor.id ? "Edit" : "Add"} {schema.singular}</h2><p>Changes appear on the website only after you save a published record.</p></div>
      <form onSubmit={save} className="admin-stack"><fieldset className="admin-form-fields" disabled={saving || uploading}>{schema.fields.map(field)}</fieldset>
        <div className="admin-form-actions"><Button type="submit" disabled={uploading} isLoading={saving}>{saving ? "Saving…" : "Save " + schema.singular}</Button><Button variant="secondary" disabled={saving || uploading} onClick={cancel}>Cancel</Button><span className="field__hint">{uploading ? "Uploading photos…" : dirty ? "Unsaved changes" : "No unsaved changes"}</span></div>
      </form>
    </section>}
    <section className="admin-panel admin-stack" aria-label={schema.title + " list"}>
      <div className="admin-list-tools"><div className="field"><label htmlFor="admin-search">Search loaded records</label><input id="admin-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={"Find a " + schema.singular} /></div>
      {kind !== "taxonomy" && <div className="field"><label htmlFor="admin-filter">Visibility</label><select id="admin-filter" value={filter} onChange={event => setFilter(event.target.value)}>{["all", "draft", "published", ...(kind === "products" ? ["archived"] : [])].map(status => <option key={status} value={status}>{status === "all" ? "All statuses" : status}</option>)}</select></div>}
      <Button variant="secondary" disabled={loading || saving || uploading} onClick={() => { setLoading(true); setError(""); setPendingPage(undefined); setRevision(v => v + 1); }}>Refresh</Button></div>
      <p className="field__hint">{records.length} loaded · {visible.length} shown. Load more to search additional records.</p>
      {loading && <p role="status">Loading records…</p>}
      {!loading && !error && !visible.length && <div className="admin-empty"><h2>{records.length ? "No matching records" : "A fresh start"}</h2><p>{records.length ? "Try a different search or visibility filter." : "Add your first " + schema.singular + " using the button above."}</p></div>}
      {!!visible.length && <div className="admin-table-wrap"><table className="admin-table"><caption className="visually-hidden">{schema.title}</caption><thead><tr><th scope="col">Name</th><th scope="col">{kind === "taxonomy" ? "Type" : "Visibility"}</th><th scope="col">Action</th></tr></thead><tbody>{visible.map(record => <tr key={record.id}><td><strong>{record.name || record.title || record.headline || record.author || "Untitled"}</strong>{kind === "products" && <small>{record.price == null ? "Price not set" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(record.price))}</small>}{kind === "reviews" && record.productId && <small>Product: {reviewProducts.find(product => product.id === record.productId)?.name || record.productId}</small>}</td><td><span className={"admin-status admin-status--" + status(record)}>{status(record)}</span></td><td><div className="admin-actions"><Button variant="ghost" disabled={saving || uploading} onClick={() => open(record)} aria-label={"Edit " + (record.name || record.title || record.headline || record.author || schema.singular)}>Edit</Button>{kind === "reviews" && <Button variant="ghost" disabled={saving || uploading} onClick={() => remove(record)} aria-label={"Delete review by " + (record.author || "customer")}>Delete</Button>}</div></td></tr>)}</tbody></table></div>}
      {more && <Button variant="secondary" disabled={loading} onClick={() => { setLoading(true); setError(""); setPendingPage(cursor); }}>Load more</Button>}
    </section>
  </div>;
}
