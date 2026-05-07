import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Acme Inc")).toBe("acme-inc");
  });

  it("strips diacritics", () => {
    expect(slugify("Maxpharma Saúde")).toBe("maxpharma-saude");
  });

  it("collapses multiple separators", () => {
    expect(slugify("  Foo   --  Bar  ")).toBe("foo-bar");
  });

  it("drops disallowed characters", () => {
    expect(slugify("Joe's Plumbing & Co.")).toBe("joes-plumbing-co");
  });

  it("truncates to 32 chars", () => {
    expect(slugify("a".repeat(40))).toHaveLength(32);
  });

  it("returns empty string for input with no allowed chars", () => {
    expect(slugify("!!!")).toBe("");
  });
});
