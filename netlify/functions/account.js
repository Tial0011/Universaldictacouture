import { accountRuntime } from "../lib/firebase-admin-runtime.js";
import { createAccountHandler } from "../lib/account-handler.js";

let handler;
export default async function account(request, context) {
  try {
    if (!handler) {
      const runtime = accountRuntime();
      const deliveryUrl = process.env.UDC_PROOF_DELIVERY_URL, deliveryKey = process.env.UDC_PROOF_DELIVERY_KEY;
      const deliverProof = deliveryUrl?.startsWith("https://") && deliveryKey ? async payload => {
        const response = await fetch(deliveryUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${deliveryKey}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw Error("Delivery unavailable");
      } : undefined;
      const passwordMatches = async (provider, password) => {
        const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
        if (!key) return false;
        const endpoint = runtime.emulator ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
        const response = await fetch(`${endpoint}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: provider.email, password, returnSecureToken: true }), signal: AbortSignal.timeout(10000) });
        return response.ok && (await response.json()).localId === provider.uid;
      };
      handler = createAccountHandler(runtime, { deliverProof, passwordMatches });
    }
    return await handler(request, context);
  } catch { return Response.json({ error: "account-source-unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
}
