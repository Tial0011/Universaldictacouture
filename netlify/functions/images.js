import { getStore } from "@netlify/blobs";
import { createImageHandler } from "../lib/image-storage.js";
// A site-wide store preserves uploads across deployments.
export default createImageHandler({
  getStore: () => getStore({ name: "catalogue-images", consistency: "strong" }),
});
