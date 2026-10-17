import { accountRequest } from "./accountApi";
// Pending capsules describe intent, not authority. Unknown writes reconcile;
// they are never flipped into opposite intents or blindly replayed.
export function createContinuityAdapter(principalUid, kind) {
  let pending = null;
  const request = (action, input) => accountRequest(action, input, { principalUid });
  return {
    async load() { return (await request("saves", { kind })).records.map(row => row.targetId); },
    async set(targetId, saved) {
      if (pending) {
        const outcome = await request("cluster-operation", { operationId: pending.operationId });
        if (outcome.state !== "committed") throw Object.assign(new Error("Check the previous outcome before another save."), { code: "outcome-unknown" });
        const previous = pending; pending = null;
        if (previous.targetId === targetId && previous.saved === saved) {
          const current = await request("save-state", { kind, targetId });
          if (current.saved !== saved) throw Object.assign(new Error("Your saved items changed elsewhere. Review the current state."), { code: "stale-conflict" });
          return { state: "committed", ...current };
        }
      }
      const current = await request("save-state", { kind, targetId });
      if (current.saved === saved) return { state: "committed", ...current };
      const input = { kind, targetId, saved, operationId: crypto.randomUUID(), expectedVersion: current.version, expectedEpoch: current.epoch };
      pending = input;
      try {
        const result = await request("save-mutate", input); pending = null;
        const current = await request("save-state", { kind, targetId });
        if (current.saved !== saved || current.version < result.version) throw Object.assign(new Error("Your saved items changed elsewhere. Review the current state."), { code: "stale-conflict" });
        return { state: "committed", ...current };
      }
      catch (error) { if (!["auth/outcome-unknown", "outcome-unknown"].includes(error.code)) pending = null; throw error; }
    },
  };
}
export const readCustomStyle = requestId => accountRequest("custom-style", { requestId });
export const saveCustomStyle = input => accountRequest("custom-style-save", input);
export const reconcilePretransaction = operationId => accountRequest("cluster-operation", { operationId });
