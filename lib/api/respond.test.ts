import { describe, it, expect, vi } from "vitest";
import { apiError, apiOk, safeError } from "./respond";

describe("apiError", () => {
  it("returns a NextResponse with the given message and default 500 status", async () => {
    const res = apiError("Erreur serveur");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erreur serveur" });
  });

  it("respects a custom status", async () => {
    const res = apiError("Non authentifié", 401);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non authentifié" });
  });

  it("works with status 400 / 403 / 404", async () => {
    expect(apiError("bad", 400).status).toBe(400);
    expect(apiError("denied", 403).status).toBe(403);
    expect(apiError("missing", 404).status).toBe(404);
  });
});

describe("apiOk", () => {
  it("returns a 200 NextResponse with the given payload", async () => {
    const res = apiOk({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("preserves arrays at the top level", async () => {
    const res = apiOk([1, 2, 3]);
    expect(await res.json()).toEqual([1, 2, 3]);
  });

  it("respects a custom status (e.g. 201 Created)", async () => {
    const res = apiOk({ id: "x" }, 201);
    expect(res.status).toBe(201);
  });
});

describe("safeError", () => {
  it("logs to console.error with the provided tag and returns a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("PG constraint violation: details xyz");

    const res = safeError(err, "route-tag");

    expect(spy).toHaveBeenCalledWith("[route-tag]", err);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erreur serveur" });
    spy.mockRestore();
  });

  it("does NOT leak the underlying error message to the client", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("relation user_profiles violates fk constraint");

    const res = safeError(err, "tag");
    const body = (await res.json()) as { error: string };

    expect(body.error).not.toContain("user_profiles");
    expect(body.error).not.toContain("fk constraint");
    spy.mockRestore();
  });

  it("accepts a custom fallback message and status", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = safeError(new Error("x"), "tag", "Impossible de traiter la demande", 503);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Impossible de traiter la demande" });
    spy.mockRestore();
  });

  it("handles non-Error throwables (string, undefined)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(safeError("plain string", "tag").status).toBe(500);
    expect(safeError(undefined, "tag").status).toBe(500);
    spy.mockRestore();
  });
});
