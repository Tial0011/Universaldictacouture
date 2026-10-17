import { timingSafeEqual } from "node:crypto";
import { accountRuntime } from "../lib/firebase-admin-runtime.js";
import { createAccountService } from "../lib/account-service.js";
import { createSystemMaintenance } from "../lib/system-maintenance.js";

// Explicit operator/worker invocation only. Not a Customer/Staff command or
// scheduler. Provision an isolated Functions-scope key and reviewed policy.
export default async function maintenance(request) {
  const key = process.env.UDC_WORKER_KEY || "", provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const reply = (value, status) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
  if (request.method !== "POST" || request.headers.has("origin") || key.length < 32 || Buffer.byteLength(key) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(key), Buffer.from(provided))) return reply({ error: "permission-denied" }, 403);
  try {
    if (Number(request.headers.get("content-length")) > 8192) return reply({ error: "invalid-argument" }, 400);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: "invalid-argument" }, 400);
    const parts = []; let size = 0;
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 8192) { await reader.cancel(); return reply({ error: "invalid-argument" }, 400); } parts.push(Buffer.from(item.value)); }
    const input = JSON.parse(Buffer.concat(parts).toString()), policy = JSON.parse(process.env.UDC_WORKER_POLICY_JSON || "null");
    const eventIds=input.eventIds||[],jobIds=input.jobIds||[];
    if (Object.keys(input).some(key => !['eventIds','jobIds'].includes(key)) || !Array.isArray(eventIds) || !Array.isArray(jobIds) || eventIds.length+jobIds.length > 20 || [...eventIds,...jobIds].some(id => !/^[a-f0-9]{64}$/.test(id))) return reply({ error: "invalid-argument" }, 400);
    const runtime=accountRuntime(),system = createSystemMaintenance(createAccountService(runtime),{origin:runtime.origin}), results = [];
    for (const eventId of [...new Set(eventIds)]) results.push(await system.processEvent(eventId, policy));
    for (const jobId of [...new Set(jobIds)]) results.push({jobId,...await system.processJob(jobId,policy)});
    return reply({ results }, 200);
  } catch { return reply({ error: "maintenance-unavailable" }, 503); }
}
