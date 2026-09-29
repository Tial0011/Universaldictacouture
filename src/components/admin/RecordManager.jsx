import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteAdminRecord, loadAdminPage, saveAdminRecord, adminError } from "../../services/admin";
import { SCHEMAS } from "./recordSchemas";
import { invalidateCatalogue } from "../../hooks/useCatalogue";
import ImageField from "./ImageField";
import Button from "../common/Button";
import { DEFAULT_SHOP_BY_GROUPS, fetchShopByGroups } from "../../services/shopBy";
import { fetchPublishedProducts } from "../../services/products";
import { productAdminHref, productReadiness } from "../../services/adminModel";
import { getImageUrl } from "../../cloudinary/cloudinary";

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
  const [filter, setFilter] = useState(() => {
    if (kind !== "products") return "all";
    const requested = params.get("view");
    return ["draft", "published", "archived", "needs-attention", "new-in"].includes(requested) ? requested : "all";
  });
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
    const requested = params.get("view");
    if (["draft", "published", "archived", "needs-attention", "new-in"].includes(requested)) setFilter(requested);
  }, [kind, params]);

  useEffect(() => {
    if (kind !== "products" || editor || loading) return;
    const editId = params.get("edit");
    if (!editId) return;
    const record = records.find((item) => item.id === editId);
    if (record) open(record);
  }, [kind, editor, loading, params, records]);

  useEffect(() => {
    if (kind !== "products") return;
    let current = true;
    fetchShopByGroups({ includeInactive: true }).then((groups) => {
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
    if (kind === "products" && record) {
      const allPrices = [
        Number(record.price),
        ...(Array.isArray(record.variants) ? record.variants.map((v) => Number(v.price)) : [])
      ].filter((p) => Number.isFinite(p) && p >= 0);
      if (allPrices.length > 0) {
        next.price = Math.max(...allPrices);
      }
      next.unitLabel = record.unitLabel ?? record.priceToken ?? "";
    }
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

  function nextListParams() {
    const next = new URLSearchParams();
    const view = params.get("view");
    if (kind === "products" && view) next.set("view", view);
    return next;
  }

  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditor(null); setDirty(false); setReviewProductSearch("");
    setParams(nextListParams(), { replace: true });
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

  async function persist(rawRecord, successMessage = "Saved successfully.") {
    setSaving(true); setError(""); setNotice("");
    try {
      const raw = { ...rawRecord };
      if (kind === "products" && Object.hasOwn(raw, "images")) raw.primaryImage = raw.images?.[0] || null;
      await saveAdminRecord(kind, raw);
      if (kind === "products") invalidateCatalogue();
      setNotice(successMessage); setEditor(null); setDirty(false); setReviewProductSearch("");
      setParams(nextListParams(), { replace: true }); setLoading(true); setPendingPage(undefined); setRevision(v => v + 1);
      addButtonArea.current?.querySelector("button")?.focus();
    } catch (error) { setError(adminError(error)); }
    finally { setSaving(false); }
  }

  async function save(event) {
    event.preventDefault();
    await persist(editor);
  }

  async function saveProductLifecycle(nextStatus) {
    if (kind !== "products" || !editor || saving || uploading) return;
    const next = { ...editor, status: nextStatus };
    if (nextStatus === "published") {
      const readiness = productReadiness(next, { allowGeneratedIdentity: !next.id });
      if (!readiness.ready) {
        setError(`Cannot publish yet. Complete: ${readiness.blockers.map((item) => item.label).join(", ")}.`);
        return;
      }
    }
    if (nextStatus === "archived" && !window.confirm("Archive this product? It will leave the public Shop but its record and history will be retained.")) return;
    const message = nextStatus === "published"
      ? "Product published. You can now inspect it in the customer Shop."
      : nextStatus === "archived"
        ? "Product archived. Its record is retained but it is no longer public."
        : editor.status === "archived"
          ? "Product restored to draft."
          : "Product unpublished. It is no longer eligible for the public Shop.";
    await persist(next, message);
  }

  async function remove(record) {
    if (!["reviews", "heroSlides"].includes(kind) || !record?.id || saving || uploading) return;
    const name = record.author || record.headline || `this ${schema.singular}`;
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await deleteAdminRecord(kind, record.id);
      if (editor?.id === record.id) setEditor(null);
      setNotice(kind === "reviews" ? "Review deleted." : "Hero slide deleted.");
      setLoading(true); setPendingPage(undefined); setRevision(v => v + 1);
    } catch (error) { setError(adminError(error)); }
    finally { setSaving(false); }
  }

  function status(record) {
    if (kind === "products") return record.status || "draft";
    if (kind === "taxonomy") return record.dimension;
    return (record.published || record.active) ? "published" : "draft";
  }

  function matchesFilter(record) {
    if (filter === "all") return true;
    if (kind === "products" && filter === "needs-attention") return productReadiness(record).state === "needs-attention";
    if (kind === "products" && filter === "new-in") return record.isNewIn === true || record.newIn === true;
    return status(record) === filter;
  }

  const visible = records.filter(record => matchesFilter(record) && [record.name, record.title, record.headline, record.author, record.body, record.id, record.slug].some(value => String(value || "").toLowerCase().includes(search.toLowerCase())));
  const editorReadiness = kind === "products" && editor ? productReadiness(editor, { allowGeneratedIdentity: !editor.id }) : null;

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
              <legend><span>Shop by</span> {group.label}{group.active === false ? " (inactive)" : ""}</legend>
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

  const productSections = [
    { key: "basic", label: "Basic information", description: "Name and describe the piece customers will see." },
    { key: "pricing", label: "Pricing", description: "Set the authoritative NGN price and its truthful commercial unit." },
    { key: "images", label: "Images", description: "Manage the cover image and supporting product photos." },
    { key: "classification", label: "Catalogue classification", description: "Connect the product to Shop filters and Shop By discovery." },
    { key: "merchandising", label: "Merchandising & search", description: "Curate New In and help customers find the piece with genuine search terms." },
    { key: "publication", label: "Publication", description: "Choose whether this record is a draft, published or archived." },
  ];

  function renderEditorFields() {
    if (kind !== "products") {
      return <fieldset className="admin-form-fields" disabled={saving || uploading}>{schema.fields.map(field)}</fieldset>;
    }
    return <div className="admin-product-form-sections">{productSections.map((section) => {
      const definitions = schema.fields.filter((definition) => definition.section === section.key);
      if (!definitions.length) return null;
      return <fieldset className="admin-form-fields admin-form-section" disabled={saving || uploading} key={section.key}>
        <legend><span>{section.label}</span><small>{section.description}</small></legend>
        {definitions.map(field)}
      </fieldset>;
    })}</div>;
  }

  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Studio management</p><h1>{schema.title}</h1><p>{schema.description}</p></div><div ref={addButtonArea}><Button disabled={saving || uploading} onClick={() => open(null)}>Add {schema.singular}</Button></div></header>
    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {error && <div role="alert" className="admin-notice"><p>{error}</p>{!editor && <Button variant="secondary" onClick={() => { setLoading(true); setError(""); setRevision(v => v + 1); }}>Try again</Button>}</div>}
    {editor && <section className="admin-panel admin-stack" aria-labelledby="editor-title">
      <div><h2 id="editor-title" tabIndex={-1} ref={editorHeading}>{editor.id ? "Edit" : "Add"} {schema.singular}</h2><p>Changes appear on the website only after you save a published record.</p></div>
      {kind === "products" && editorReadiness && <aside className="admin-readiness" aria-labelledby="product-readiness-title">
        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">Publication readiness</p><h3 id="product-readiness-title">{editorReadiness.label}</h3></div>
          {editor.id && !dirty && editor.status === "published" && editorReadiness.ready && productAdminHref(editor) ? <Button to={productAdminHref(editor)} target="_blank" rel="noopener noreferrer" variant="secondary">View in Shop</Button> : null}
        </div>
        <ul className="admin-readiness__checks">{editorReadiness.checks.map((check) => <li key={check.key} className={check.complete ? "is-complete" : "is-missing"}><span aria-hidden="true">{check.complete ? "✓" : "!"}</span><span>{check.label}</span></li>)}</ul>
        {editorReadiness.blockers.length ? <p id="product-readiness-blockers" className="field__error" role="status">Before publishing: {editorReadiness.blockers.map((item) => item.label).join(", ")}.</p> : <p className="admin-positive">All required publication information is ready.</p>}
        {editorReadiness.warnings.length ? <p className="field__hint">Suggested check: {editorReadiness.warnings.map((item) => item.label).join(", ")}.</p> : null}
        <div className="admin-actions admin-publication-actions" aria-label="Product publication actions">
          {editor.status === "published"
            ? <Button variant="secondary" disabled={saving || uploading} isLoading={saving} onClick={() => saveProductLifecycle("draft")}>Unpublish</Button>
            : <Button disabled={saving || uploading || !editorReadiness.ready} aria-describedby={!editorReadiness.ready ? "product-readiness-blockers" : undefined} isLoading={saving} onClick={() => saveProductLifecycle("published")}>Publish</Button>}
          {editor.status === "archived"
            ? <Button variant="secondary" disabled={saving || uploading} onClick={() => saveProductLifecycle("draft")}>Restore to draft</Button>
            : <Button variant="ghost" disabled={saving || uploading} onClick={() => saveProductLifecycle("archived")}>Archive</Button>}
        </div>
      </aside>}
      <form onSubmit={save} className="admin-stack">{renderEditorFields()}
        <div className="admin-form-actions"><Button type="submit" disabled={uploading} isLoading={saving}>{saving ? "Saving…" : "Save " + schema.singular}</Button><Button variant="secondary" disabled={saving || uploading} onClick={cancel}>Cancel</Button><span className="field__hint">{uploading ? "Uploading photos…" : dirty ? "Unsaved changes" : "No unsaved changes"}</span></div>
      </form>
    </section>}
    <section className="admin-panel admin-stack" aria-label={schema.title + " list"}>
      <div className="admin-list-tools"><div className="field"><label htmlFor="admin-search">Search loaded records</label><input id="admin-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={"Find a " + schema.singular} /></div>
      {kind !== "taxonomy" && <div className="field"><label htmlFor="admin-filter">{kind === "products" ? "Product view" : "Visibility"}</label><select id="admin-filter" value={filter} onChange={event => { const next = event.target.value; setFilter(next); if (kind === "products") { const nextParams = new URLSearchParams(params); if (next === "all") nextParams.delete("view"); else nextParams.set("view", next); nextParams.delete("edit"); setParams(nextParams, { replace: true }); } }}>{(kind === "products" ? ["all", "published", "draft", "archived", "needs-attention", "new-in"] : ["all", "draft", "published"]).map(option => <option key={option} value={option}>{option === "all" ? (kind === "products" ? "All products" : "All statuses") : option === "needs-attention" ? "Needs attention" : option === "new-in" ? "New In" : option.replaceAll("-", " ")}</option>)}</select></div>}
      <Button variant="secondary" disabled={loading || saving || uploading} onClick={() => { setLoading(true); setError(""); setPendingPage(undefined); setRevision(v => v + 1); }}>Refresh</Button></div>
      <p className="field__hint">{records.length} loaded · {visible.length} shown. Load more to search additional records.</p>
      {loading && <p role="status">Loading records…</p>}
      {!loading && !error && !visible.length && <div className="admin-empty"><h2>{records.length ? "No matching records" : "A fresh start"}</h2><p>{records.length ? "Try a different search or visibility filter." : "Add your first " + schema.singular + " using the button above."}</p></div>}
      {!!visible.length && <div className="admin-table-wrap"><table className="admin-table"><caption className="visually-hidden">{schema.title}</caption><thead><tr><th scope="col">Name</th><th scope="col">{kind === "taxonomy" ? "Type" : "Visibility"}</th>{kind === "products" && <><th scope="col">Readiness</th><th scope="col">Merchandising</th></>}<th scope="col">Action</th></tr></thead><tbody>{visible.map(record => {
        const readiness = kind === "products" ? productReadiness(record) : null;
        const image = kind === "products" ? (record.primaryImage || (Array.isArray(record.images) ? record.images[0] : record.images)) : null;
        const imageUrl = typeof image === "string" ? image : image?.publicId ? getImageUrl(image.publicId, "c_fill,g_auto,w_160,h_200,q_auto,f_auto") : image?.url || image?.secureUrl || image?.secure_url || "";
        const publicHref = kind === "products" ? productAdminHref(record) : "";
        return <tr key={record.id}><td><div className={kind === "products" ? "admin-product-summary" : undefined}>{kind === "products" && <div className="admin-product-thumb" aria-hidden="true">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span>UDC</span>}</div>}<div><strong>{record.name || record.title || record.headline || record.author || "Untitled"}</strong>{kind === "products" && <><small>{record.price == null ? "Main price not set" : `Main price: ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(record.price))}${record.unitLabel || record.priceToken ? ` (${record.unitLabel || record.priceToken})` : ""}`}</small><small>{Array.isArray(record.category) ? record.category.join(" · ") : record.category || "Category not set"}</small></>}{kind === "reviews" && record.productId && <small>Product: {reviewProducts.find(product => product.id === record.productId)?.name || record.productId}</small>}</div></div></td><td><span className={"admin-status admin-status--" + status(record)}>{status(record)}</span></td>{kind === "products" && <><td><span className={"admin-status admin-status--" + readiness.state}>{readiness.label}</span>{readiness.blockers.length ? <small>{readiness.blockers.map((item) => item.label).join(" · ")}</small> : readiness.warnings.length ? <small>{readiness.warnings[0].label}</small> : null}</td><td>{record.isNewIn === true || record.newIn === true ? <span className="admin-status admin-status--new-in">New In</span> : <span className="field__hint">Standard catalogue</span>}</td></>}<td><div className="admin-actions"><Button variant="ghost" disabled={saving || uploading} onClick={() => { open(record); if (kind === "products") { const nextParams = new URLSearchParams(params); nextParams.set("edit", record.id); setParams(nextParams, { replace: true }); } }} aria-label={"Edit " + (record.name || record.title || record.headline || record.author || schema.singular)}>Edit</Button>{kind === "products" && readiness.ready && status(record) === "published" && publicHref ? <Button to={publicHref} target="_blank" rel="noopener noreferrer" variant="ghost">View in Shop</Button> : null}{["reviews", "heroSlides"].includes(kind) && <Button variant="ghost" disabled={saving || uploading} onClick={() => remove(record)} aria-label={`Delete ${record.author || record.headline || schema.singular}`}>Delete</Button>}</div></td></tr>;
      })}</tbody></table></div>}
      {more && <Button variant="secondary" disabled={loading} onClick={() => { setLoading(true); setError(""); setPendingPage(cursor); }}>Load more</Button>}
    </section>
  </div>;
}
