import { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import StitchArrowIcon from "../common/icons/StitchArrowIcon";
import "./StyleCircle.css";
import {
  subscribeToStyleCircle,
  validateEmail,
} from "../../services/styleCircle";

/**
 * Style Circle.
 *
 * Handles the empty field, an invalid address, the in-flight state,
 * success, a duplicate signup and a backend failure. No subscriber
 * count is shown, and addresses are never read back to the client.
 */
export default function StyleCircle() {
  const fieldId = useId();
  const location = useLocation();
  const { user } = useAuth();
  const { requestAuth } = useAuthGate();
  const [email, setEmail] = useState(() => String(location.state?.styleCircleEmail || ""));
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  const isInvalid = status === "error";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === "loading") return;

    const check = validateEmail(email);
    if (!check.isValid) {
      setStatus("error");
      setMessage(check.message);
      return;
    }

    if (!user) {
      requestAuth({ returnTo: location.pathname, returnState: { styleCircleEmail: check.email } });
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      await subscribeToStyleCircle(email, user);
      setStatus("success");
      setMessage("You are in. Welcome to the Style Circle.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Style Circle could not be reached. Please try again.");
    }
  };

  return (
    <section className="style-circle surface--brand" aria-labelledby="home-style-circle">
      <div className="container style-circle__inner">
        <div className="style-circle__copy">
        <p className="style-circle__eyebrow">Universal Dicta Couture</p>
        <h2 id="home-style-circle">Join Our <em>Style Circle</em></h2>
        <p className="style-circle__intro">
          Be the first to see our new arrivals, exclusive offers and style inspiration.
        </p>
        <div className="style-circle__threads" aria-hidden="true"><span /><span /><span /></div>
        </div>

        <div className="style-circle__invitation">
        <p className="style-circle__invitation-title">A little inspiration, in your inbox.</p>
        <form className="style-circle__form" onSubmit={handleSubmit} noValidate>
          <div className="field style-circle__field">
            <label className="field__label" htmlFor={fieldId}>
              Email address
            </label>
            <input
              id={fieldId}
              className="form-control"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={status === "loading"}
              placeholder="Enter your email address"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (status !== "idle" && status !== "loading") {
                  setStatus("idle");
                  setMessage("");
                }
              }}
              aria-invalid={isInvalid || undefined}
              aria-describedby={`${fieldId}-status`}
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary style-circle__submit"
            disabled={status === "loading"}
            aria-busy={status === "loading" || undefined}
          >
            {status === "loading" ? "Subscribing…" : "Subscribe"}
            <StitchArrowIcon size={20} />
          </button>
        </form>

        <p
          id={`${fieldId}-status`}
          className={`style-circle__status${isInvalid ? " style-circle__status--error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
        <Link className="style-circle__policy" to="/policies">Read our policies <StitchArrowIcon size={14} /></Link>
        </div>
      </div>
    </section>
  );
}
