import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/common/Button";
import {
  DEFAULT_SHOP_BY_GROUPS,
  cleanShopByValues,
  deleteShopByGroup,
  fetchShopByGroups,
  saveShopByGroup,
  shopByKey,
} from "../../../services/shopBy";

export default function Discovery() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newValues, setNewValues] = useState({});

  const coreIds = useMemo(() => new Set(DEFAULT_SHOP_BY_GROUPS.map((group) => group.id)), []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setGroups(await fetchShopByGroups());
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Shop By groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateGroup(id, patch) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
    setNotice("");
  }

  async function save(group) {
    setSaving(group.id);
    setError("");
    setNotice("");
    try {
      await saveShopByGroup(group);
      setNotice(`${group.label} saved.`);
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save this Shop By group.");
    } finally {
      setSaving("");
    }
  }

  function addValue(group) {
    const value = String(newValues[group.id] || "").trim();
    if (!value) return;
    updateGroup(group.id, { values: cleanShopByValues([...(group.values || []), value]) });
    setNewValues((current) => ({ ...current, [group.id]: "" }));
  }

  async function createGroup(event) {
    event.preventDefault();
    const label = newGroupName.trim();
    const key = shopByKey(label);
    if (!label || !key) return;
    if (groups.some((group) => group.id === key)) {
      setError("A Shop By group with that name already exists.");
      return;
    }
    const group = { id: key, key, label, order: groups.length, active: true, values: [] };
    setSaving("new");
    setError("");
    try {
      await saveShopByGroup(group);
      setNewGroupName("");
      setNotice(`${label} created.`);
      await load();
    } catch (createError) {
      setError(createError?.message || "Unable to create the Shop By group.");
    } finally {
      setSaving("");
    }
  }

  async function removeGroup(group) {
    if (coreIds.has(group.id)) return;
    if (!window.confirm(`Delete the Shop by ${group.label} group? Existing product assignments will stay stored but will no longer appear as a Shop By group.`)) return;
    setSaving(group.id);
    setError("");
    try {
      await deleteShopByGroup(group.id);
      setNotice(`${group.label} deleted.`);
      await load();
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete this Shop By group.");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="admin-stack">
      <header className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Catalogue structure</p>
          <h1>Shop By</h1>
          <p>Manage the groups customers browse on the website. Occasion, Style and Fabric &amp; Pattern are the core groups; you can add more groups such as Event, Trending or Native.</p>
        </div>
      </header>

      {notice && <p role="status" className="admin-notice">{notice}</p>}
      {error && <p role="alert" className="admin-notice">{error}</p>}

      <section className="admin-panel admin-stack">
        <div>
          <h2>Add another Shop By group</h2>
          <p>Examples: Event, Trending, Native. After creating it, add its reusable choices below and assign those choices when editing a product.</p>
        </div>
        <form className="admin-list-tools" onSubmit={createGroup}>
          <div className="field">
            <label className="field__label" htmlFor="shop-by-new-group">Group name</label>
            <input id="shop-by-new-group" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="e.g. Event" />
          </div>
          <Button type="submit" disabled={!newGroupName.trim() || saving === "new"} isLoading={saving === "new"}>Add Shop By group</Button>
        </form>
      </section>

      {loading ? <p role="status">Loading Shop By groups…</p> : groups.map((group) => (
        <section className="admin-panel admin-stack shop-by-admin-group" key={group.id}>
          <div className="shop-by-admin-group__head">
            <div>
              <p className="admin-eyebrow">Shop by</p>
              <h2>{group.label}</h2>
              <p className="field__hint">These are the reusable choices available on the product upload form.</p>
            </div>
            {!coreIds.has(group.id) ? <Button variant="ghost" disabled={saving === group.id} onClick={() => removeGroup(group)}>Delete group</Button> : null}
          </div>

          {!coreIds.has(group.id) ? (
            <div className="field">
              <label className="field__label" htmlFor={`shop-by-label-${group.id}`}>Group name</label>
              <input id={`shop-by-label-${group.id}`} value={group.label} onChange={(event) => updateGroup(group.id, { label: event.target.value })} />
            </div>
          ) : null}

          <div className="shop-by-admin-values">
            {(group.values || []).length ? group.values.map((value) => (
              <div className="shop-by-admin-value" key={value}>
                <span>{value}</span>
                <button type="button" className="shop-by-admin-remove" aria-label={`Delete ${value} from ${group.label}`} onClick={() => updateGroup(group.id, { values: group.values.filter((entry) => entry !== value) })}>×</button>
              </div>
            )) : <p className="field__hint">No choices yet. Add the first one below.</p>}
          </div>

          <div className="admin-list-tools">
            <div className="field">
              <label className="field__label" htmlFor={`shop-by-value-${group.id}`}>Add a {group.label} choice</label>
              <input id={`shop-by-value-${group.id}`} value={newValues[group.id] || ""} onChange={(event) => setNewValues((current) => ({ ...current, [group.id]: event.target.value }))} placeholder={group.id === "occasion" ? "e.g. Birthday" : "Enter a reusable choice"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addValue(group); } }} />
            </div>
            <Button variant="secondary" onClick={() => addValue(group)} disabled={!String(newValues[group.id] || "").trim()}>Add choice</Button>
            <Button onClick={() => save(group)} disabled={saving === group.id} isLoading={saving === group.id}>Save {group.label}</Button>
          </div>
        </section>
      ))}
    </div>
  );
}
