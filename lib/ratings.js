export const MAX_COMMENT_LENGTH = 500;

// A driver's stored totals become an average, like 4.7.
// Returns null when there are no ratings yet.
export function averageRating(sum, count) {
  const n = Number(count);
  if (!n || n <= 0) return null;
  return Math.round((Number(sum) / n) * 10) / 10; // one decimal place
}

// What the pages show: { average: 4.7, count: 23 }
export function ratingSummary(sum, count) {
  return { average: averageRating(sum, count), count: Number(count) || 0 };
}

// Checks review data that came from a browser.
// Returns { value: { rating, comment } } or { error: "..." }.
export function validateReview(body) {
  const rating = body?.rating;

  // Must be a whole number from 1 to 5. The text "5" is not accepted.
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose a rating from 1 to 5 stars" };
  }

  let comment = null;
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== "string") {
      return { error: "Comment must be text" };
    }
    const trimmed = body.comment.trim();
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      return { error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer` };
    }
    comment = trimmed || null; // an empty comment is stored as nothing
  }

  return { value: { rating, comment } };
}