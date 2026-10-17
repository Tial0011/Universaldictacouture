import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStaff } from "../context/StaffContext";
import { availableSources, resultState } from "../services/operationsModel";
import { canDiscover } from "../services/staffAuthorization";
import { loadOperationalPage } from "../services/operations";
import { searchDomains } from "../services/operationalSearch";

export function useOperations(onlyDomain = "", includeUnavailable = false) {
  const { staff } = useStaff();
  const domains = useMemo(() => onlyDomain ? (canDiscover(staff, onlyDomain) ? [onlyDomain] : []) : includeUnavailable ? searchDomains(staff) : availableSources(staff), [staff, onlyDomain, includeUnavailable]);
  const [sources, setSources] = useState({});
  const mounted = useRef(false);
  const versions = useRef({});
  const busy = useRef(new Set());
  const load = useCallback(async (domain, more = false, cursor = null) => {
    if (busy.current.has(domain)) return;
    busy.current.add(domain);
    const version = (versions.current[domain] || 0) + 1;
    versions.current[domain] = version;
    setSources(previous => ({ ...previous, [domain]: more ? { ...previous[domain], loadingMore: true }
      : { items: [], state: "initial-loading", cursor: null, hasMore: false } }));
    try {
      const page = await loadOperationalPage(domain, more ? cursor : null);
      if (!mounted.current || versions.current[domain] !== version) return;
      setSources(previous => {
        const items = [...new Map([...(more ? previous[domain]?.items || [] : []), ...page.items].map(item => [item.id, item])).values()];
        return { ...previous, [domain]: { ...page, items, state: items.length ? "success" : "empty", loadingMore: false } };
      });
    } catch (error) {
      if (mounted.current && versions.current[domain] === version) setSources(previous => ({ ...previous, [domain]: { items: [], state: resultState(error), hasMore: false, loadingMore: false } }));
    } finally { busy.current.delete(domain); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) for (const domain of domains) void load(domain); });
    return () => { mounted.current = false; };
  }, [domains, load]);
  return { domains, sources, load, items: domains.flatMap(domain => sources[domain]?.items || []) };
}
