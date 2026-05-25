import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-redirect";

describe("safeNextPath", () => {
  it("accepts simple internal paths", () => {
    expect(safeNextPath("/accueil")).toBe("/accueil");
    expect(safeNextPath("/accueil/devoirs")).toBe("/accueil/devoirs");
    expect(safeNextPath("/onboarding/pin-setup")).toBe("/onboarding/pin-setup");
    expect(safeNextPath("/")).toBe("/");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(safeNextPath("//evil.com")).toBe("/accueil");
    expect(safeNextPath("//evil.com/path")).toBe("/accueil");
    expect(safeNextPath("///triple-slash")).toBe("/accueil");
  });

  it("rejects Windows-style backslash bypass (/\\evil.com)", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/accueil");
  });

  it("rejects absolute URLs with schema", () => {
    expect(safeNextPath("http://evil.com")).toBe("/accueil");
    expect(safeNextPath("https://evil.com/page")).toBe("/accueil");
    expect(safeNextPath("javascript:alert(1)")).toBe("/accueil");
    expect(safeNextPath("data:text/html,<script>")).toBe("/accueil");
    expect(safeNextPath("file:///etc/passwd")).toBe("/accueil");
  });

  it("rejects relative paths without leading slash", () => {
    expect(safeNextPath("accueil")).toBe("/accueil");
    expect(safeNextPath("evil.com")).toBe("/accueil");
    expect(safeNextPath("../etc/passwd")).toBe("/accueil");
  });

  it("rejects CRLF injection attempts", () => {
    expect(safeNextPath("/accueil\r\nSet-Cookie: evil")).toBe("/accueil");
    expect(safeNextPath("/accueil\nLocation: //evil")).toBe("/accueil");
    expect(safeNextPath("/accueil\x00")).toBe("/accueil");
  });

  it("rejects non-string input", () => {
    expect(safeNextPath(undefined)).toBe("/accueil");
    expect(safeNextPath(null)).toBe("/accueil");
    expect(safeNextPath(42)).toBe("/accueil");
    expect(safeNextPath({})).toBe("/accueil");
    expect(safeNextPath([])).toBe("/accueil");
  });

  it("rejects empty string and overlong inputs", () => {
    expect(safeNextPath("")).toBe("/accueil");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/accueil");
  });

  it("uses custom defaultPath when provided", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
    expect(safeNextPath(undefined, "/onboarding/pin-setup")).toBe(
      "/onboarding/pin-setup",
    );
  });

  it("accepts query strings and hashes (still part of internal path)", () => {
    expect(safeNextPath("/accueil?tab=foo")).toBe("/accueil?tab=foo");
    expect(safeNextPath("/accueil#section")).toBe("/accueil#section");
    expect(safeNextPath("/accueil?next=/devoirs")).toBe("/accueil?next=/devoirs");
  });

  it("accepts colons in path portion (after leading slash)", () => {
    // "/foo:bar" -> path-absolu valide, le ":" est dans le path
    expect(safeNextPath("/foo:bar")).toBe("/foo:bar");
  });
});
