import { Link } from "react-router-dom";
import "./Button.css";

/**
 * Shared button. Renders the right semantic element:
 *  - <button>   default (actions)
 *  - <Link>     when `to` is given (internal navigation)
 *  - <a>        when `href` is given (external links)
 * Never nest a <button> inside a link.
 *
 * `variant`: "primary" (main action), "secondary" (supporting), "ghost" (low emphasis).
 */
export default function Button({
  children,
  variant = "primary",
  type = "button",
  isLoading = false,
  disabled = false,
  to,
  href,
  className = "",
  ...rest
}) {
  const classes = `btn btn--${variant}${className ? ` ${className}` : ""}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
