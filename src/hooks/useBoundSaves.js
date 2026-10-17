import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createContinuityAdapter } from "../services/pretransaction";
import { auth } from "../firebase/auth";
export function useBoundSaves(principalUid, kind) {
  const adapter = useMemo(() => createContinuityAdapter(principalUid, kind), [principalUid, kind]);
  const [ids, setIds] = useState([]), [error, setError] = useState(""), [ready, setReady] = useState(false);
  const live = useRef(false), revision = useRef(0), writing = useRef(false);
  const valid = useCallback(() => live.current && auth.currentUser?.uid === principalUid, [principalUid]);
  const refresh = useCallback(async () => {
    const ticket = ++revision.current;
    try { const current = await adapter.load(); if (valid() && ticket === revision.current) { setIds(current); setError(""); setReady(true); } }
    catch { if (valid() && ticket === revision.current) { setIds([]); setError("Your saved items could not be checked. Try again."); setReady(false); } }
  }, [adapter, valid]);
  useEffect(() => {
    live.current = true; queueMicrotask(() => { if (live.current) void refresh(); });
    const invalidate = () => { revision.current++; };
    const retry = () => { void refresh(); };
    const withdraw = () => { revision.current++; setIds([]); setReady(false); };
    window.addEventListener("online", retry); window.addEventListener("udc:account:authority-uncertain", withdraw);
    return () => { live.current = false; invalidate(); window.removeEventListener("online", retry); window.removeEventListener("udc:account:authority-uncertain", withdraw); };
  }, [refresh]);
  async function toggleConfirmed(id) {
    if (!valid() || !ready || writing.current) return { ok: false };
    writing.current = true; revision.current++;
    const added = !ids.includes(id);
    // Keep the confirmed state visible while the write is pending.
    try {
      await adapter.set(id, added);
      if (!valid()) return { ok: false };
      revision.current++; // A read begun before this commit cannot regress it.
      setIds(current => added ? [...new Set([...current, id])] : current.filter(value => value !== id));
      setError(""); return { ok: true, added, storage: "account" };
    } catch { if (valid()) { setError("Current saved state is not confirmed. Check your saved items before trying again."); setReady(false); } return { ok: false }; }
    finally { writing.current = false; }
  }
  return { ids, error, ready, toggleConfirmed, retry: refresh };
}
