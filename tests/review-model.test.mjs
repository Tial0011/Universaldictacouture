import test from "node:test";
import assert from "node:assert/strict";
import { normaliseReviewRecord, selectLatestPublishedReviews } from "../src/services/reviewModel.js";

test("latest review selection is newest-first and capped after sorting", () => {
  const reviews = Array.from({ length: 25 }, (_, index) => ({
    id: String(index),
    published: true,
    body: `Review ${index}`,
    publishedAt: new Date(2026, 0, index + 1),
  }));
  const latest = selectLatestPublishedReviews(reviews, 20);
  assert.equal(latest.length, 20);
  assert.equal(latest[0].id, "24");
  assert.equal(latest.at(-1).id, "5");
});

test("latest review selection handles fewer, exactly twenty, and unpublished records", () => {
  const fewer = Array.from({ length: 4 }, (_, index) => ({ id: String(index), published: true, createdAt: new Date(2026, 1, index + 1) }));
  assert.equal(selectLatestPublishedReviews(fewer, 20).length, 4);
  const exactly = Array.from({ length: 20 }, (_, index) => ({ id: String(index), published: true, createdAt: new Date(2026, 1, index + 1) }));
  assert.equal(selectLatestPublishedReviews(exactly, 20).length, 20);
  assert.equal(selectLatestPublishedReviews([...exactly, { id: "draft", published: false, createdAt: new Date(2027, 0, 1) }], 20)[0].id, "19");
});

test("legacy single-image reviews normalize without requiring new fields", () => {
  const review = normaliseReviewRecord("legacy", { author: "Amara", body: "Beautiful piece", image: "https://example.test/review.jpg", published: true });
  assert.equal(review.images.length, 1);
  assert.equal(review.image.url, "https://example.test/review.jpg");
  assert.equal(review.customerServiceRating, null);
  assert.equal(review.productQualityRating, null);
  assert.equal(review.productId, "");
});
