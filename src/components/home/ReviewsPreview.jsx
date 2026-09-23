import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";

/**
 * Review & Feeds preview.
 *
 * Only genuine published entries are shown. Nothing is rated,
 * counted, verified or attributed beyond what the shop itself
 * published — when there is nothing published, the section says so.
 */
export default function ReviewsPreview({ entries }) {
  return (
    <section className="home-section container" aria-labelledby="home-reviews">
      <div className="home-section__head">
        <h2 id="home-reviews">Review &amp; Feeds</h2>
        <Link className="home-section__more" to="/reviews-feeds">
          Visit Review &amp; Feeds
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="home-section__note">
          Nothing has been published to Review &amp; Feeds yet.
        </p>
      ) : (
        <ul className="reviews-preview">
          {entries.map((entry) => (
            <li key={entry.id} className="reviews-preview__item surface surface--padded">
              {entry.image ? (
                <span className="reviews-preview__media">
                  <ProductImage
                    image={entry.image}
                    alt=""
                    transformation="w_600,h_600,c_fill,g_auto,q_auto,f_auto"
                  />
                </span>
              ) : null}
              <p className="reviews-preview__body">{entry.body}</p>
              {entry.author ? (
                <p className="reviews-preview__author">{entry.author}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
