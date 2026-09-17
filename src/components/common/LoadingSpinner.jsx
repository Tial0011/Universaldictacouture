import "./LoadingSpinner.css";

export default function LoadingSpinner({ label = "Loading" }) {
  return (
    <div className="loading-spinner" role="status">
      <span className="loading-spinner__mark" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
