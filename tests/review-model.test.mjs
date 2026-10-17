import test from "node:test";
import assert from "node:assert/strict";
import { normaliseReviewRecord, reviewStatus, selectLatestPublishedReviews, sortPublishedReviews } from "../src/services/reviewModel.js";

test("homepage latest review selection is newest-first by publishedAt and capped after sorting", () => {
  const reviews = Array.from({ length: 25 }, (_, index) => ({
    id: String(index),
    published: true,
    body: `Review ${index}`,
    publishedAt: new Date(2026, 0, index + 1),
    updatedAt: new Date(2030, 0, 1),
  }));
  const latest = selectLatestPublishedReviews(reviews, 20);
  assert.equal(latest.length, 20);
  assert.equal(latest[0].id, "24");
  assert.equal(latest.at(-1).id, "5");
});

test("editing an older published review does not make it newest", () => {
  const reviews = [
    { id: "old", published: true, publishedAt: new Date("2026-01-01"), updatedAt: new Date("2030-01-01") },
    { id: "new", published: true, publishedAt: new Date("2026-02-01"), updatedAt: new Date("2026-02-01") },
  ];
  assert.equal(selectLatestPublishedReviews(reviews, 20)[0].id, "new");
});

test("latest review selection handles fewer, exactly twenty, and unpublished records", () => {
  const fewer = Array.from({ length: 4 }, (_, index) => ({ id: String(index), published: true, publishedAt: new Date(2026, 1, index + 1) }));
  assert.equal(selectLatestPublishedReviews(fewer, 20).length, 4);
  const exactly = Array.from({ length: 20 }, (_, index) => ({ id: String(index), published: true, publishedAt: new Date(2026, 1, index + 1) }));
  assert.equal(selectLatestPublishedReviews(exactly, 20).length, 20);
  assert.equal(selectLatestPublishedReviews([...exactly, { id: "hidden", published: false, publishedAt: new Date(2027, 0, 1) }], 20)[0].id, "19");
});

test("full published feed is not capped", () => {
  const reviews = Array.from({ length: 28 }, (_, index) => ({ id: String(index), published: true, publishedAt: new Date(2026, 0, index + 1) }));
  assert.equal(sortPublishedReviews(reviews).length, 28);
});

test("legacy multi-image reviews keep only one primary public image without crashing", () => {
  const review = normaliseReviewRecord("legacy", {
    author: "Amara",
    body: "Beautiful piece",
    images: ["https://example.test/review.jpg", "https://example.test/second.jpg"],
    published: true,
  });
  assert.equal(review.image.url, "https://example.test/review.jpg");
  assert.equal(review.legacyImages.length, 2);
  assert.equal(review.customerServiceRating, null);
  assert.equal(review.productQualityRating, null);
});

test("explicit moderation status wins while legacy published remains compatible", () => {
  assert.equal(reviewStatus({ published: true }), "published");
  assert.equal(reviewStatus({ published: false }), "pending");
  assert.equal(reviewStatus({ status: "hidden", published: true }), "hidden");
  const hidden = normaliseReviewRecord("hidden", { body: "Hidden", status: "hidden", published: true });
  assert.equal(hidden.published, false);
});
