import { useCallback, useEffect, useRef, useState } from "react";
export function useConfirmation() {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const confirm = useCallback(message => {
    if (pending.current) return Promise.resolve(false);
    return new Promise(resolve => { pending.current = resolve; setRequest(message); });
  }, []);
  const settle = useCallback(accepted => { pending.current?.(accepted); pending.current = null; setRequest(null); }, []);
  return { confirm, request, settle };
}
