import { describe, it, expect } from "vitest";
import { averageRating, ratingSummary, validateReview, MAX_COMMENT_LENGTH } from "@/lib/ratings";

describe("averageRating", () => {
  it("divides the total by the number of ratings", () => {
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(5, 1)).toBe(5);
  });

  it("rounds to one decimal place", () => {
    expect(averageRating(14, 3)).toBe(4.7); // 4.666...
    expect(averageRating(13, 3)).toBe(4.3); // 4.333...
  });

  it("is null when there are no ratings", () => {
    expect(averageRating(0, 0)).toBeNull();
    expect(averageRating(5, 0)).toBeNull();
    expect(averageRating(null, null)).toBeNull();
    expect(averageRating(undefined, undefined)).toBeNull();
  });

  it("accepts numbers that arrive as text", () => {
    expect(averageRating("10", "2")).toBe(5);
  });
});

describe("ratingSummary", () => {
  it("gives the average and the count", () => {
    expect(ratingSummary(14, 3)).toEqual({ average: 4.7, count: 3 });
  });

  it("copes with a driver who has no ratings", () => {
    expect(ratingSummary(0, 0)).toEqual({ average: null, count: 0 });
    expect(ratingSummary(undefined, undefined)).toEqual({ average: null, count: 0 });
  });
});

describe("validateReview", () => {
  it("accepts a rating with no comment", () => {
    expect(validateReview({ rating: 5 })).toEqual({ value: { rating: 5, comment: null } });
  });

  it("accepts every star from 1 to 5", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(validateReview({ rating }).value.rating).toBe(rating);
    }
  });

  it("trims the comment", () => {
    expect(validateReview({ rating: 4, comment: "  Great ride  " }).value.comment).toBe("Great ride");
  });

  it("stores a blank comment as nothing", () => {
    expect(validateReview({ rating: 4, comment: "   " }).value.comment).toBeNull();
    expect(validateReview({ rating: 4, comment: null }).value.comment).toBeNull();
  });

  it("rejects ratings outside 1 to 5, decimals, text and missing values", () => {
    for (const rating of [0, 6, -1, 3.5, "5", null, undefined, NaN, true]) {
      expect(validateReview({ rating }).error).toBeTruthy();
    }
  });

  it("rejects a missing body", () => {
    expect(validateReview(null).error).toBeTruthy();
    expect(validateReview(undefined).error).toBeTruthy();
  });

  it("allows a comment of exactly the maximum length, but not one more", () => {
    expect(validateReview({ rating: 5, comment: "a".repeat(MAX_COMMENT_LENGTH) }).value).toBeTruthy();
    expect(validateReview({ rating: 5, comment: "a".repeat(MAX_COMMENT_LENGTH + 1) }).error).toBeTruthy();
  });

  it("rejects a comment that isn't text", () => {
    expect(validateReview({ rating: 5, comment: 123 }).error).toBeTruthy();
    expect(validateReview({ rating: 5, comment: { text: "hi" } }).error).toBeTruthy();
  });
});