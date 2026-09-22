import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadAdminPage, saveAdminRecord, adminError } from "../../services/admin";
import { SCHEMAS } from "./recordSchemas";
import ImageField from "./ImageField";
import Button from "../common/Button";
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
    if (!dirty && !uploading) return;
    const prevent = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    // BrowserRouter does not support useBlocker. Capture internal navigation
    // while editing; normal browser unloads are handled above.
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
    setEditor(record ? { ...record } : { ...schema.initial });
    setDirty(false); setNotice(""); setError("");
  }
  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditor(null); setDirty(false);
    setParams({}, { replace: true });
    addButtonArea.current?.querySelector("button")?.focus();
  }
  function update(key, value) { setEditor(previous => ({ ...previous, [key]: value })); setDirty(true); }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const raw = { ...editor };
      if (kind === "products" && Object.hasOwn(raw, "images")) raw.primaryImage = raw.images?.[0] || null;
      await saveAdminRecord(kind, raw);
      setNotice("Saved successfully."); setEditor(null); setDirty(false);
      setParams({}, { replace: true }); setLoading(true); setPendingPage(undefined); setRevision(v => v + 1);
      addButtonArea.current?.querySelector("button")?.focus();
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
    const { key, label, type, options, hint, required } = definition;
    const id = "admin-field-" + key;
    const value = editor[key];
    const props = { id, required, "aria-describedby": hint ? id + "-hint" : undefined };
    return <div className="field" key={key}>
      {type !== "checkbox" && <label className="field__label" htmlFor={type === "tiles" ? undefined : id}>{label}</label>}
      {type === "checkbox" ? <label className="choice" htmlFor={id}><input id={id} type="checkbox" checked={!!value} onChange={event => update(key, event.target.checked)} />{label}</label>
        : type === "select" ? <select {...props} value={value || options[0]} onChange={event => update(key, event.target.value)}>{options.map(option => <option key={option} value={option}>{option.replaceAll("-", " ")}</option>)}</select>
        : type === "textarea" ? <textarea {...props} value={value || ""} maxLength={4000} onChange={event => update(key, event.target.value)} />
        : type === "image" || type === "images" ? <ImageField id={id} value={value} multiple={type === "images"} onChange={value => update(key, value)} setUploading={setUploading} />
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
      {!!visible.length && <div className="admin-table-wrap"><table className="admin-table"><caption className="visually-hidden">{schema.title}</caption><thead><tr><th scope="col">Name</th><th scope="col">{kind === "taxonomy" ? "Type" : "Visibility"}</th><th scope="col">Action</th></tr></thead><tbody>{visible.map(record => <tr key={record.id}><td><strong>{record.name || record.title || record.headline || record.author || "Untitled"}</strong>{kind === "products" && <small>{record.price == null ? "Price not set" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(record.price))}</small>}</td><td><span className={"admin-status admin-status--" + status(record)}>{status(record)}</span></td><td><Button variant="ghost" disabled={saving || uploading} onClick={() => open(record)} aria-label={"Edit " + (record.name || record.title || record.headline || record.author || schema.singular)}>Edit</Button></td></tr>)}</tbody></table></div>}
      {more && <Button variant="secondary" disabled={loading} onClick={() => { setLoading(true); setError(""); setPendingPage(cursor); }}>Load more</Button>}
    </section>
  </div>;
}
