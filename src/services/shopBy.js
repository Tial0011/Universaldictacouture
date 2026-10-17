import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firestore";
import { isFirebaseConfigured } from "../firebase/config";

export const DEFAULT_SHOP_BY_GROUPS = [
  { id: "occasion", label: "Occasion", key: "occasion", param: "occasion", order: 0, locked: true, values: [] },
  { id: "style", label: "Style", key: "style", param: "style", order: 1, locked: true, values: [] },
  { id: "fabric", label: "Fabric & Pattern", key: "fabric", param: "fabric", order: 2, locked: true, values: [] },
];

const CONFIG_ID = "shop-by-config";
const LEGACY_TAXONOMY_KEYS = new Set(["occasion", "style", "fabric"]);

export function shopByKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function cleanShopByValues(values) {
  const list = Array.isArray(values) ? values : String(values || "").split(",");
  const seen = new Set();
  return list
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normaliseStoredGroup(raw = {}) {
  const key = shopByKey(raw.key || raw.id || raw.label);
  if (!key) return null;
  const fallback = DEFAULT_SHOP_BY_GROUPS.find((group) => group.id === key);
  return {
    id: key,
    key,
    label: String(fallback?.label || raw.label || key).trim(),
    param: fallback?.param || "shopby",
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : (fallback?.order ?? 99),
    locked: Boolean(fallback),
    active: raw.active !== false,
    values: cleanShopByValues(raw.values),
  };
}

async function readConfigGroups() {
  if (!db) return [];
  const snapshot = await getDocs(
    query(collection(db, "discoveryModules"), where("active", "==", true), limit(50))
  );
  const entry = snapshot.docs.find((document) => document.id === CONFIG_ID);
  const groups = entry?.data()?.groups;
  return (Array.isArray(groups) ? groups : []).map(normaliseStoredGroup).filter(Boolean);
}

/**
 * Public Shop By configuration. The three core groups always exist.
 * Existing legacy taxonomy labels are merged into those core groups so
 * previous admin data is immediately available as reusable choices.
 */
export async function fetchShopByGroups() {
  const defaults = DEFAULT_SHOP_BY_GROUPS.map((group) => ({ ...group, active: true, values: [] }));
  if (!isFirebaseConfigured || !db) return defaults;

  try {
    const [storedGroups, taxonomySnapshot] = await Promise.all([
      readConfigGroups(),
      getDocs(collection(db, "taxonomy")),
    ]);

    const stored = new Map(storedGroups.map((group) => [group.id, group]));
    const legacyValues = { occasion: [], style: [], fabric: [] };
    taxonomySnapshot.docs.forEach((entry) => {
      const data = entry.data() ?? {};
      const dimension = String(data.dimension || "").trim();
      const name = String(data.name || "").trim();
      if (!LEGACY_TAXONOMY_KEYS.has(dimension) || !name) return;
      legacyValues[dimension].push(name);
    });

    const core = defaults.map((fallback) => {
      const saved = stored.get(fallback.id);
      stored.delete(fallback.id);
      return {
        ...fallback,
        ...(saved || {}),
        id: fallback.id,
        key: fallback.key,
        param: fallback.param,
        label: fallback.label,
        locked: true,
        active: saved?.active !== false,
        values: cleanShopByValues([...(saved?.values ?? []), ...legacyValues[fallback.id]]),
      };
    });

    const custom = [...stored.values()].filter((group) => group.active !== false);
    return [...core, ...custom].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return defaults;
  }
}

async function writeGroups(groups) {
  await setDoc(
    doc(db, "discoveryModules", CONFIG_ID),
    {
      title: "Shop By configuration",
      placement: "home",
      active: true,
      order: -100,
      items: [],
      groups: groups.map((group, index) => ({
        id: group.id,
        key: group.key,
        label: group.label,
        order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
        active: group.active !== false,
        values: cleanShopByValues(group.values),
      })),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveShopByGroup(raw) {
  if (!db) throw new Error("Connect Firebase before managing Shop By groups.");
  const key = shopByKey(raw?.key || raw?.id || raw?.label);
  const label = String(raw?.label || "").trim();
  if (!key || !label) throw new Error("Enter a Shop By group name.");

  const fallback = DEFAULT_SHOP_BY_GROUPS.find((group) => group.id === key);
  const groups = await fetchShopByGroups();
  const nextGroup = {
    id: key,
    key,
    label: fallback?.label || label,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : groups.length,
    active: raw.active !== false,
    values: cleanShopByValues(raw.values),
  };
  const next = groups.some((group) => group.id === key)
    ? groups.map((group) => group.id === key ? { ...group, ...nextGroup } : group)
    : [...groups, nextGroup];
  await writeGroups(next);
  return key;
}

export async function deleteShopByGroup(groupId) {
  if (!db) throw new Error("Connect Firebase before managing Shop By groups.");
  const key = shopByKey(groupId);
  if (DEFAULT_SHOP_BY_GROUPS.some((group) => group.id === key)) {
    throw new Error("Occasion, Style and Fabric & Pattern are core Shop By groups and cannot be removed.");
  }
  const groups = await fetchShopByGroups();
  await writeGroups(groups.filter((group) => group.id !== key));
}
