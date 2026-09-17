import "./PageIntro.css";

/**
 * Minimal, on-brand section heading used by pages whose full content
 * belongs to a later phase. Keeps every page visually consistent
 * with the brand system while the specification is still locked.
 */
export default function PageIntro({ eyebrow, title, description }) {
  return (
    <section className="page-intro container">
      {eyebrow ? <p className="page-intro__eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {description ? <p className="page-intro__description">{description}</p> : null}
    </section>
  );
}
