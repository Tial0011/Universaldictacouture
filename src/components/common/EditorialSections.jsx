import "./EditorialSections.css";

export default function EditorialSections({ sections }) {
  return <div className="editorial-sections">
    {sections.map(({ title, body }) => <section className="editorial-section" key={title}>
      <h2>{title}</h2><p>{body}</p>
    </section>)}
  </div>;
}
