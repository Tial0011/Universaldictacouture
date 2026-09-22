import { isFirebaseConfigured } from "../../../firebase/config";
import { useAuth } from "../../../context/AuthContext";
export default function Settings() {
  const { user } = useAuth();
  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Studio administration</p><h1>Setup & access</h1><p>Your account and the connections used to manage the website.</p></div></header>
    <section className="admin-panel"><h2>Your account</h2><p>{user?.email}</p><p>Admin access is managed by the site owner. Contact them when another team member needs access.</p></section>
    <section className="admin-panel"><h2>Website connections</h2><dl><dt>Catalogue & content</dt><dd>{isFirebaseConfigured ? "Firebase configuration present" : "Firebase setup required"}</dd><dt>Image uploads</dt><dd>Netlify image storage</dd></dl><p>Configuration presence does not confirm a working connection. Saving a draft and uploading a photo will verify your setup.</p></section>
    <section className="admin-panel"><h2>Before your first launch</h2><ol><li>Ask the site owner to complete the admin setup guide.</li><li>Add a product as a draft and upload its photos.</li><li>Check the price and categories, then publish the product.</li><li>Open the website and check the piece in the shop.</li></ol></section>
    <section className="admin-panel"><h2>Keep your collection organised</h2><p>Save unfinished pieces as drafts. Archive products you no longer want to show. Uncheck “Published on website” to hide a banner, discovery section or review.</p><p>Uploaded photos stay in image storage when removed from a record. The site owner can clean up unused photos in Netlify.</p></section>
  </div>;
}
