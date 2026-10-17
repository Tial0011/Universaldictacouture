import { useEffectEvent, useLayoutEffect, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/auth";
import { createPrincipalFence } from "../services/ownerOperation";

export function usePrincipalFence(scope, onWithdraw) {
  const fence = useMemo(() => createPrincipalFence(() => auth?.currentUser?.uid, () => scope), [scope]);
  const withdrawCurrent = useEffectEvent(() => { fence.invalidate(); onWithdraw?.(); });
  useLayoutEffect(() => {
    fence.activate(); let uid = auth?.currentUser?.uid;
    const withdraw = () => withdrawCurrent();
    const restore = event => { if (event.persisted) withdraw(); };
    const stop = auth ? onAuthStateChanged(auth, user => { if (user?.uid !== uid) { uid = user?.uid; withdraw(); } }) : () => {};
    window.addEventListener("udc:account:authority-uncertain", withdraw);
    window.addEventListener("offline", withdraw); window.addEventListener("pageshow", restore);
    return () => { fence.dispose(); stop(); window.removeEventListener("udc:account:authority-uncertain", withdraw); window.removeEventListener("offline", withdraw); window.removeEventListener("pageshow", restore); };
  }, [fence]);
  return fence;
}
