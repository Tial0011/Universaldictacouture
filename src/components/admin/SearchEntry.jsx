import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../common/Button";
import { useStaff } from "../../context/StaffContext";
import { createSearchHandoff, searchActor } from "../../services/operationalSearch";
export default function SearchEntry() {
  const { uid, staff } = useStaff();
  const navigate = useNavigate();
  const input = useRef(null);
  useEffect(() => {
    const shortcut = event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k" || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      if (input.current?.getClientRects().length) input.current.focus();
      else navigate("/admin/search");
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [navigate]);
  return <div className="admin-search-entry">
    <form className="admin-shell-search" role="search" aria-label="Operational Search" onSubmit={event => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get("query") || "").trim().slice(0, 200);
      // Only an opaque handle enters navigation state. The query stays in
      // actor/access-bound memory, not URLs, history payloads or referrers.
      navigate("/admin/search", { state: { searchRequest: createSearchHandoff(searchActor(uid, staff), query) } });
      event.currentTarget.reset();
    }}><label className="visually-hidden" htmlFor="admin-shell-query">Find authorized work</label><input ref={input} id="admin-shell-query" name="query" type="search" maxLength={200} placeholder="Find work · Ctrl/⌘ K" /><Button type="submit" variant="ghost">Search</Button></form>
    <Button to="/admin/search" variant="secondary" className="admin-mobile-search" aria-label="Open full-screen operational Search">Search</Button>
  </div>;
}
