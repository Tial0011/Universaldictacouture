import { useId, useState } from "react";
import {
  DuplicateSubscriptionError,
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
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | duplicate | error
  const [message, setMessage] = useState("");

  const isInvalid = status === "error";

  const handleSubmit = async (event) => {
    event.preventDefault();

    const check = validateEmail(email);
    if (!check.isValid) {
      setStatus("error");
      setMessage(check.message);
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      await subscribeToStyleCircle(email);
      setStatus("success");
      setMessage("You are in. Welcome to the Style Circle.");
      setEmail("");
    } catch (error) {
      if (error instanceof DuplicateSubscriptionError) {
        setStatus("duplicate");
        setMessage(error.message);
        return;
      }
      setStatus("error");
      setMessage(error?.message || "Style Circle could not be reached. Please try again.");
    }
  };

  return (
    <section className="style-circle" aria-labelledby="home-style-circle">
      <div className="container style-circle__inner">
        <h2 id="home-style-circle">Style Circle</h2>
        <p className="style-circle__intro">
          Join the Style Circle for new pieces and styling notes from Universal Dicta Couture.
        </p>

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
      </div>
    </section>
  );
}
