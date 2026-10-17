export default function StatusChip({ label, priority = false }) {
  return <span className="admin-status">{label || "State unavailable"}{priority ? " priority" : ""}</span>;
}
