import { collection, deleteDoc, doc, getCountFromServer, getDocFromServer, getDocsFromServer, query, orderBy, documentId, limit, startAfter, setDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { prepareRecord } from "./adminModel";
import { deleteStoredImage, ownedNetlifyStorageKey } from "./imageStorage";
const COLLECTIONS = new Set(["products", "heroSlides", "reviews", "discoveryModules", "taxonomy"]);
export const PAGE_SIZE = 20;
function target(kind) {
  if (!db) throw new Error("Connect Firebase before managing content.");
  if (!COLLECTIONS.has(kind)) throw new Error("Unknown content section.");
  return collection(db, kind);
}
export async function checkAdmin(uid) {
  if (!db) return false;
  const snapshot = await getDocFromServer(doc(db, "admins", uid));
  return snapshot.exists() && snapshot.data().active === true;
}
export async function loadAdminPage(kind, cursor = null) {
  const constraints = [orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)];
  const snapshot = await getDocsFromServer(query(target(kind), ...constraints));
  return { records: snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === PAGE_SIZE };
}

export async function loadProductStatusCounts() {
  if (!db) throw new Error("Connect Firebase before managing content.");
  const statuses = ["draft", "published", "archived"];
  const counts = await Promise.all(statuses.map(async (status) => {
    const snapshot = await getCountFromServer(query(target("products"), where("status", "==", status)));
    return [status, snapshot.data().count];
  }));
  return Object.fromEntries(counts);
}

export async function saveAdminRecord(kind, raw) {
  const data = prepareRecord(kind, raw);
  const reference = raw.id ? doc(target(kind), raw.id) : doc(target(kind));
  if (!raw.id) data.createdAt = serverTimestamp();
  if (kind === "products") {
    const existingPublishedAt = raw.publishedAt || raw.firstPublishedAt;
    if (existingPublishedAt) {
      data.publishedAt = existingPublishedAt;
    } else if (data.status === "published") {
      if (raw.id) {
        try {
          const snapshot = await getDocFromServer(reference);
          const currentData = snapshot.data() || {};
          const prior = currentData?.publishedAt || currentData?.firstPublishedAt;
          if (prior) {
            data.publishedAt = prior;
          } else {
            data.publishedAt = serverTimestamp();
          }
        } catch (error) {
          // Omit mutation: do not silently assign a new timestamp if the read fails.
          // This safely preserves any existing publication history in Firestore.
        }
      } else {
        data.publishedAt = serverTimestamp();
      }
    }
  }
  if (kind === "reviews") {
    // First-publication time is immutable. Hiding or editing a review never
    // resets it, so an old review cannot become the newest homepage story.
    if (data.published && !raw.publishedAt) data.publishedAt = serverTimestamp();
    else if (!raw.publishedAt) delete data.publishedAt;
  }
  await setDoc(reference, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return reference.id;
}

function productImages(record = {}) {
  const images = [];
  if (record.primaryImage) images.push(record.primaryImage);
  if (Array.isArray(record.images)) images.push(...record.images);
  else if (record.images) images.push(record.images);
  return images;
}

function imageCleanupPlan(record = {}) {
  const images = productImages(record);
  const managedKeys = [...new Set(images.map(ownedNetlifyStorageKey).filter(Boolean))];
  const external = new Set();
  images.forEach((image) => {
    if (!image || ownedNetlifyStorageKey(image)) return;
    if (typeof image === "string") external.add(`url:${image}`);
    else if (typeof image === "object") external.add(`external:${image.url || image.secureUrl || image.secure_url || image.publicId || image.public_id || JSON.stringify(image)}`);
  });
  return { managedKeys, externalReferences: external.size };
}

async function deleteProductRecord(id) {
  const reference = doc(target("products"), id);
  const snapshot = await getDocFromServer(reference);
  if (!snapshot.exists()) throw new Error("This product no longer exists.");
  const record = { ...snapshot.data(), id: snapshot.id };
  const { managedKeys, externalReferences } = imageCleanupPlan(record);
  let sharedKeys = new Set();
  let referenceCheckFailed = false;

  if (managedKeys.length) {
    try {
      const catalogue = await getDocsFromServer(target("products"));
      const shared = new Set();
      catalogue.docs.forEach((entry) => {
        if (entry.id === id) return;
        const other = imageCleanupPlan(entry.data()).managedKeys;
        other.forEach((key) => { if (managedKeys.includes(key)) shared.add(key); });
      });
      sharedKeys = shared;
    } catch {
      // Deletion of the product record can still proceed, but owned media is
      // kept when reference safety cannot be proven. The caller reports this
      // as partial cleanup rather than risking another product's image.
      referenceCheckFailed = true;
    }
  }

  await deleteDoc(reference);

  const deletedMedia = [];
  const failedMedia = [];
  const skippedSharedMedia = [];
  if (!referenceCheckFailed) {
    for (const key of managedKeys) {
      if (sharedKeys.has(key)) {
        skippedSharedMedia.push(key);
        continue;
      }
      try {
        await deleteStoredImage(key);
        deletedMedia.push(key);
      } catch (error) {
        failedMedia.push({ key, message: error?.message || "Stored image cleanup failed." });
      }
    }
  }

  return {
    kind: "products",
    id,
    recordDeleted: true,
    deletedMedia,
    failedMedia,
    skippedSharedMedia,
    externalReferences,
    mediaCleanupSkipped: referenceCheckFailed,
  };
}

export async function deleteAdminRecord(kind, id) {
  if (!["products", "reviews", "heroSlides"].includes(kind)) throw new Error("Deletion is not available for this content section.");
  if (!id) throw new Error("Choose a record to delete.");
  if (kind === "products") return deleteProductRecord(id);
  await deleteDoc(doc(target(kind), id));
  return { kind, id, recordDeleted: true };
}
export function adminError(error) {
  if (error?.code === "permission-denied") return "Access was denied. Check your admin access and the published Firestore rules.";
  if (error?.code === "resource-exhausted") return "The database usage limit has been reached. Please try again later.";
  if (error?.code === "unavailable") return "Unable to reach the database. Check your connection and try again.";
  if (error?.code) return "The request could not be completed. Please try again.";
  return error?.message || "Something went wrong. Please try again.";
}
