import "./Button.css";

/**
 * Shared button component. Use `variant="primary"` for the main
 * action on a screen, `secondary` for supporting actions, and
 * `ghost` for low-emphasis/text-style actions.
 */
export default function Button({
  children,
  variant = "primary",
  type = "button",
  isLoading = false,
  disabled = false,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading ? "Please wait…" : children}
    </button>
  );
}
