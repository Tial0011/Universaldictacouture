import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/common/Button";
import {
  DEFAULT_SHOP_BY_GROUPS,
  cleanShopByValues,
  deleteShopByGroup,
  fetchShopByGroups,
  saveShopByGroup,
  shopByKey,
<<<<<<< HEAD
} from "../../../services/shopBy";

export default function Discovery() {
  const [groups, setGroups] = useState([]);
=======
  shopByDestination,
} from "../../../services/shopBy";
import { fetchPublishedProducts } from "../../../services/products";
import { adminError } from "../../../services/admin";

const MAX_CHOICES_PER_GROUP = 10;

export default function Discovery() {
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
      setGroups(await fetchShopByGroups());
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Shop By groups.");
=======
      const [loadedGroups, loadedProducts] = await Promise.all([
        fetchShopByGroups({ includeInactive: true }),
        fetchPublishedProducts().catch(() => []),
      ]);
      setGroups(loadedGroups);
      setProducts(loadedProducts);
    } catch (loadError) {
      setError(adminError(loadError));
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
      setError(saveError?.message || "Unable to save this Shop By group.");
=======
      setError(adminError(saveError));
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
    } finally {
      setSaving("");
    }
  }

  function addValue(group) {
    const value = String(newValues[group.id] || "").trim();
    if (!value) return;
<<<<<<< HEAD
=======
    if ((group.values || []).length >= MAX_CHOICES_PER_GROUP) {
      setError(`Maximum of ${MAX_CHOICES_PER_GROUP} choices allowed for ${group.label}.`);
      return;
    }
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
    updateGroup(group.id, { values: cleanShopByValues([...(group.values || []), value]) });
    setNewValues((current) => ({ ...current, [group.id]: "" }));
  }

<<<<<<< HEAD
=======
  function removeValue(group, value) {
    const nextValues = (group.values || []).filter((entry) => entry !== value);
    const faces = { ...(group.faces || {}) };
    delete faces[value.toLowerCase()];
    updateGroup(group.id, { values: nextValues, faces });
  }

  function updateFace(groupId, choiceValue, productId) {
    const key = choiceValue.toLowerCase();
    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const faces = { ...(group.faces || {}) };
        if (productId) {
          faces[key] = productId;
        } else {
          delete faces[key];
        }
        return { ...group, faces };
      })
    );
    setNotice("");
  }

>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
      setError(createError?.message || "Unable to create the Shop By group.");
=======
      setError(adminError(createError));
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
      setError(deleteError?.message || "Unable to delete this Shop By group.");
=======
      setError(adminError(deleteError));
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
          <p>Manage the groups customers browse on the website. Occasion, Style and Fabric &amp; Pattern are the core groups; you can add more groups such as Event, Trending or Native.</p>
=======
          <p>Manage the groups customers browse on the website. Occasion, Style and Fabric &amp; Pattern are the launch defaults; groups can be renamed, reordered or temporarily hidden without changing their stable identity.</p>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
        </div>
      </header>

      {notice && <p role="status" className="admin-notice">{notice}</p>}
      {error && <p role="alert" className="admin-notice">{error}</p>}

      <section className="admin-panel admin-stack">
        <div>
          <h2>Add another Shop By group</h2>
<<<<<<< HEAD
          <p>Examples: Event, Trending, Native. After creating it, add its reusable choices below and assign those choices when editing a product.</p>
=======
          <p>Examples: Collection, Season or Heritage. After creating it, add real catalogue-backed choices below and assign those choices when editing a product.</p>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
        </div>
        <form className="admin-list-tools" onSubmit={createGroup}>
          <div className="field">
            <label className="field__label" htmlFor="shop-by-new-group">Group name</label>
<<<<<<< HEAD
            <input id="shop-by-new-group" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="e.g. Event" />
=======
            <input id="shop-by-new-group" value={newGroupName} maxLength={80} onChange={(event) => setNewGroupName(event.target.value)} placeholder="e.g. Collection" />
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
              <p className="field__hint">These are the reusable choices available on the product upload form.</p>
=======
              <p className="field__hint">
                Manage choices, visibility, order and designated face cover pieces. Maximum {MAX_CHOICES_PER_GROUP} choices per group.
                {" "}<span className="shop-by-admin-count">({(group.values || []).length}/{MAX_CHOICES_PER_GROUP} used)</span>
              </p>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
            </div>
            {!coreIds.has(group.id) ? <Button variant="ghost" disabled={saving === group.id} onClick={() => removeGroup(group)}>Delete group</Button> : null}
          </div>

<<<<<<< HEAD
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
=======
          <div className="admin-list-tools">
            <div className="field">
              <label className="field__label" htmlFor={`shop-by-label-${group.id}`}>Group name</label>
              <input id={`shop-by-label-${group.id}`} maxLength={80} value={group.label} onChange={(event) => updateGroup(group.id, { label: event.target.value })} />
              {coreIds.has(group.id) ? <p className="field__hint">Renaming changes the customer-facing label only; the stable Shop state key remains protected.</p> : null}
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`shop-by-order-${group.id}`}>Display order</label>
              <input id={`shop-by-order-${group.id}`} type="number" min="0" step="1" value={group.order ?? 0} onChange={(event) => updateGroup(group.id, { order: Number(event.target.value) })} />
            </div>
            <label className="choice admin-shop-by-choice" htmlFor={`shop-by-active-${group.id}`}>
              <input id={`shop-by-active-${group.id}`} type="checkbox" checked={group.active !== false} onChange={(event) => updateGroup(group.id, { active: event.target.checked })} />
              <span>Active in customer Shop</span>
            </label>
          </div>

          <div className="shop-by-admin-values">
            {(group.values || []).length ? (
              group.values.map((value) => {
                const choiceLower = value.toLowerCase();
                const matchingProducts = products.filter((p) => {
                  const assigned = [
                    ...(p.shopBy?.[group.key] || []),
                    ...(p[group.key] || []),
                  ].map((v) => String(v).trim().toLowerCase());
                  return assigned.includes(choiceLower);
                });
                const otherProducts = products.filter(
                  (p) => !matchingProducts.some((m) => m.id === p.id)
                );
                const currentFaceId = group.faces?.[choiceLower] || "";
                const currentFaceProduct = products.find(
                  (p) => p.id === currentFaceId || p.slug === currentFaceId
                );

                return (
                  <div className="shop-by-admin-choice-card" key={value}>
                    <div className="shop-by-admin-choice-head">
                      <strong className="shop-by-admin-choice-title">{value}</strong>
                      <button
                        type="button"
                        className="shop-by-admin-remove"
                        aria-label={`Delete ${value} from ${group.label}`}
                        onClick={() => removeValue(group, value)}
                      >
                        ×
                      </button>
                    </div>

                    <div className="shop-by-admin-face-field">
                      <label
                        className="shop-by-admin-face-label"
                        htmlFor={`face-${group.id}-${value}`}
                      >
                        Face of {group.label} {value}
                      </label>
                      <div className="shop-by-admin-face-row">
                        <select
                          id={`face-${group.id}-${value}`}
                          className="shop-by-admin-face-select"
                          value={currentFaceId}
                          onChange={(event) => updateFace(group.id, value, event.target.value)}
                        >
                          <option value="">Default (First product with photo)</option>
                          {matchingProducts.length > 0 ? (
                            <optgroup label={`Products in ${value} (${matchingProducts.length})`}>
                              {matchingProducts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  ★ {p.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {otherProducts.length > 0 ? (
                            <optgroup label="All other products">
                              {otherProducts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </select>
                        {currentFaceProduct?.image?.url ? (
                          <img
                            src={currentFaceProduct.image.url}
                            alt=""
                            className="shop-by-admin-face-thumb"
                          />
                        ) : null}
                      </div>
                      <span className="field__hint">
                        {currentFaceProduct
                          ? `Cover: ${currentFaceProduct.name}`
                          : `Default: automatically picks photo from ${value} products.`}
                      </span>
                    </div>
                    <div className="admin-actions">
                      <Button to={shopByDestination(group, value)} target="_blank" rel="noopener noreferrer" variant="ghost">Preview in Shop</Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="field__hint">No choices yet. Add the first one below (up to {MAX_CHOICES_PER_GROUP}).</p>
            )}
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
          </div>

          <div className="admin-list-tools">
            <div className="field">
<<<<<<< HEAD
              <label className="field__label" htmlFor={`shop-by-value-${group.id}`}>Add a {group.label} choice</label>
              <input id={`shop-by-value-${group.id}`} value={newValues[group.id] || ""} onChange={(event) => setNewValues((current) => ({ ...current, [group.id]: event.target.value }))} placeholder={group.id === "occasion" ? "e.g. Birthday" : "Enter a reusable choice"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addValue(group); } }} />
            </div>
            <Button variant="secondary" onClick={() => addValue(group)} disabled={!String(newValues[group.id] || "").trim()}>Add choice</Button>
            <Button onClick={() => save(group)} disabled={saving === group.id} isLoading={saving === group.id}>Save {group.label}</Button>
=======
              <label className="field__label" htmlFor={`shop-by-value-${group.id}`}>
                Add a {group.label} choice {(group.values || []).length >= MAX_CHOICES_PER_GROUP ? "(Maximum 10 reached)" : ""}
              </label>
              <input
                id={`shop-by-value-${group.id}`}
                value={newValues[group.id] || ""}
                disabled={(group.values || []).length >= MAX_CHOICES_PER_GROUP}
                onChange={(event) => setNewValues((current) => ({ ...current, [group.id]: event.target.value }))}
                placeholder={(group.values || []).length >= MAX_CHOICES_PER_GROUP ? "Maximum 10 choices reached" : (group.id === "occasion" ? "e.g. Birthday" : "Enter a reusable choice")}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addValue(group); } }}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => addValue(group)}
              disabled={(group.values || []).length >= MAX_CHOICES_PER_GROUP || !String(newValues[group.id] || "").trim()}
            >
              Add choice
            </Button>
            <Button onClick={() => save(group)} disabled={saving === group.id} isLoading={saving === group.id}>
              Save {group.label}
            </Button>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
          </div>
        </section>
      ))}
    </div>
  );
}
