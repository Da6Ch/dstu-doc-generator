import { describe, it, expect } from "vitest";
import { parseGithubUrl } from "@/lib/git/cloneRepo";

describe("parseGithubUrl", () => {
  it("розбирає коректне посилання", () => {
    expect(parseGithubUrl("https://github.com/octocat/Hello-World")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
  });

  it("прибирає .git та кінцевий слеш", () => {
    expect(parseGithubUrl("https://github.com/o/r.git").repo).toBe("r");
    expect(parseGithubUrl("https://github.com/o/r/").repo).toBe("r");
  });

  it("допускає крапки й дефіси в іменах", () => {
    const r = parseGithubUrl("https://github.com/my-org/some.repo-name");
    expect(r).toEqual({ owner: "my-org", repo: "some.repo-name" });
  });

  it.each([
    "",
    "github.com/o/r",
    "https://gitlab.com/o/r",
    "https://github.com/onlyowner",
    "https://github.com/o/r/tree/main",
    "ftp://github.com/o/r",
  ])("відхиляє некоректне посилання: %s", (url) => {
    expect(() => parseGithubUrl(url)).toThrow(/Некоректне посилання/);
  });
});
