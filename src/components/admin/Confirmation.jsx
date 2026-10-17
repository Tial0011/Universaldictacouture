import { useEffect, useId, useRef } from "react";
import Button from "../common/Button";
export default function ConfirmationDialog({ message, onResult, disabled = false }) {
  const dialog = useRef(null);
  const opener = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!opener.current) opener.current = document.activeElement;
    dialog.current.showModal();
    const current = dialog.current;
    return () => { current.close(); if (opener.current?.isConnected) opener.current.focus(); else document.getElementById("admin-main")?.focus(); };
  }, []);
  return <dialog ref={dialog} className="admin-confirm-dialog" aria-labelledby={id + "-title"} aria-describedby={id + "-message"} onCancel={event => { event.preventDefault(); onResult(false); }}>
    <div className="admin-stack"><h2 id={id + "-title"}>Confirm owner action</h2><p id={id + "-message"}>{message}</p><p>Confirmation does not grant authority. Current access, owner state and version are checked again at commit.</p><div className="admin-actions admin-confirm-dialog__actions"><Button autoFocus variant="secondary" onClick={() => onResult(false)}>Cancel action</Button><Button disabled={disabled} onClick={() => onResult(true)}>Confirm action</Button></div></div>
  </dialog>;
}
