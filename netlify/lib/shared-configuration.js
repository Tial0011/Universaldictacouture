import { exactFields, fail, identifier } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";

export const TEMPLATE_CONTEXT = Object.freeze(["brandName", "actionLabel", "safePath"]);
const controls = (text, singleLine = false) => Array.from(text).some(character => {
  const code = character.charCodeAt(0);
  return code === 127 || code < 32 && (singleLine || ![9, 10, 13].includes(code));
});
function template(value) {
  exactFields(value, ["subject", "body"]);
  for (const text of [value.subject, value.body]) {
    if (typeof text !== "string" || !text.trim() || text.length > 4000 || controls(text, text === value.subject)) fail("invalid-template", 400);
    const leftovers = text.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => { if (!TEMPLATE_CONTEXT.includes(key)) fail("template-variable-denied", 400); return ""; });
    if (/[{}]/.test(leftovers)) fail("template-expression-denied", 400);
  }
  return structuredClone(value);
}
export function renderTemplate(value, context) {
  template(value); exactFields(context, TEMPLATE_CONTEXT);
  for (const [key, text] of Object.entries(context)) {
    if (typeof text !== "string" || text.length > 200 || controls(text, true) || /[{}]/.test(text)) fail("invalid-template-context", 400);
    if (key === "safePath" && (!/^\/(?!\/)/.test(text) || /[\\%]/.test(text))) fail("unsafe-return-target", 400);
  }
  const render = text => text.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(context, key)) fail("template-context-required", 400);
    return context[key];
  });
  return { subject: render(value.subject), body: render(value.body) }; // inert plain text, not HTML
}
export function createConfigurationService(account) {
  const { db, ref, now, keyed } = account;
  function kind(id) {
    if (id === "bank-transfer") return "bank";
    if (/^template:(security|transactional|couturierAlerts|styleCircle)$/.test(id)) return "template";
    fail("configuration-not-supported", 400); // no generic settings/system-law store
  }
  function validate(id, value) {
    if (kind(id) === "template") return template(value);
    exactFields(value, ["bankName", "accountName", "accountNumber"]);
    for (const text of [value.bankName, value.accountName, value.accountNumber]) if (typeof text !== "string" || !text.trim() || text.length > 160 || controls(text, true)) fail("invalid-bank-instruction", 400);
    return structuredClone(value);
  }
  async function authorize(tx, claims, id, action) {
    const bank = kind(id) === "bank";
    return resolveStaff(tx, db, claims, {
      capability: bank ? `settings.bank.${action}` : `settings.templates.${action}`,
      purpose: bank ? "financial-settings" : "communication-settings", objectId: id, action,
      ...(bank ? { governanceArea: "financial-settings", freshSeconds: 300 } : {}),
    }, now());
  }
  async function effective(tx, id) {
    kind(id);
    const current = (await tx.get(ref(`sharedConfiguration/${id}`))).data();
    if (!current?.effectiveVersion) return null;
    const version = (await tx.get(ref(`sharedConfiguration/${id}/versions/${current.effectiveVersion}`))).data();
    if (!version || version.configurationId !== id) fail("configuration-source-unavailable", 503);
    return { configurationId: id, effectiveVersion: current.effectiveVersion, value: validate(id, version.value) };
  }
  async function read(claims, id) {
    identifier(id);
    return db.runTransaction(async tx => {
      await authorize(tx, claims, id, "read");
      const current = (await tx.get(ref(`sharedConfiguration/${id}`))).data();
      return { configurationId: id, version: current?.version || 0, proposedVersion: current?.proposedVersion || null, effective: await effective(tx, id) };
    });
  }
  async function mutate(claims, input) {
    exactFields(input, ["configurationId", "operationId", "expectedVersion", "action", "value", "proposedVersion"]);
    const id = identifier(input.configurationId), operationId = identifier(input.operationId);
    if (!["draft", "activate"].includes(input.action)) fail("invalid-argument", 400);
    const value = input.action === "draft" ? validate(id, input.value) : null;
    if (input.action === "activate" && Object.hasOwn(input, "value")) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const staff = await authorize(tx, claims, id, "edit"), path = ref(`sharedConfiguration/${id}`);
      const current = (await tx.get(path)).data(), receiptRef = ref(`configurationOperations/${operationId}`);
      const receipt = (await tx.get(receiptRef)).data(), fingerprint = keyed(JSON.stringify({ uid: claims.uid, input }));
      if (receipt) { if (receipt.actorUid !== claims.uid || receipt.fingerprint !== fingerprint) fail("operation-conflict", 409); return { state: "committed", ...receipt.result }; }
      if ((current?.version || 0) !== input.expectedVersion) fail("stale-conflict", 409);
      const actor = { kind: "staff", staffId: staff.staffId }, version = (current?.version || 0) + 1;
      let effectiveVersion = current?.effectiveVersion || null, proposedVersion = current?.proposedVersion || null;
      if (input.action === "activate") {
        const candidate = Number.isSafeInteger(input.proposedVersion) && input.proposedVersion === proposedVersion ? (await tx.get(ref(`sharedConfiguration/${id}/versions/${proposedVersion}`))).data() : null;
        if (!candidate) fail("configuration-draft-required", 409);
        validate(id, candidate.value); effectiveVersion = proposedVersion; proposedVersion = null;
      } else {
        proposedVersion = version;
        tx.create(ref(`sharedConfiguration/${id}/versions/${version}`), { configurationId: id, version, value, actor, createdAt: now() });
      }
      const result = { configurationId: id, version, proposedVersion, effectiveVersion };
      tx.set(path, result);
      tx.create(receiptRef, { actorUid: claims.uid, fingerprint, result, state: "committed", createdAt: now() });
      account.capture(tx, { domain: "configuration", operationId, action: input.action, target: id, actor, executor: "system:configuration-api" });
      return { state: "committed", ...result };
    });
  }
  async function reconcile(claims, operationId) {
    const receipt = (await ref(`configurationOperations/${identifier(operationId)}`).get()).data();
    return receipt?.actorUid === claims.uid ? { state: "committed", ...receipt.result } : { state: "unknown" };
  }
  async function preview(claims, input) {
    exactFields(input, ["configurationId", "value", "context"]);
    return db.runTransaction(async tx => { await authorize(tx, claims, input.configurationId, "read"); if (kind(input.configurationId) !== "template") fail(); return { state: "preview", ...renderTemplate(validate(input.configurationId, input.value), input.context) }; });
  }
  return { read, mutate, reconcile, effective, preview };
}
