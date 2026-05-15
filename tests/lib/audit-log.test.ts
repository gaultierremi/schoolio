import { describe, it, expect, beforeEach, vi } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role";

import { logAuditEvent, AUDIT_EVENTS } from "@/lib/audit/log";

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  fromMock.mockClear();
});

describe("AUDIT_EVENTS constants", () => {
  it("exposes the canonical event types", () => {
    expect(AUDIT_EVENTS.SSO_LOGIN).toBe("sso_login");
    expect(AUDIT_EVENTS.PIN_SETUP).toBe("pin_setup");
    expect(AUDIT_EVENTS.PIN_SUCCESS).toBe("pin_success");
    expect(AUDIT_EVENTS.PIN_FAILURE).toBe("pin_failure");
    expect(AUDIT_EVENTS.PIN_LOCKOUT).toBe("pin_lockout");
    expect(AUDIT_EVENTS.PIN_RESET).toBe("pin_reset");
    expect(AUDIT_EVENTS.CONSENT_GIVEN).toBe("consent_given");
  });
});

describe("logAuditEvent", () => {
  it("inserts into audit_log with the canonical shape", async () => {
    await logAuditEvent({
      actorId: "user-1",
      actorRole: "student",
      eventType: AUDIT_EVENTS.PIN_SUCCESS,
    });
    expect(fromMock).toHaveBeenCalledWith("audit_log");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload.actor_id).toBe("user-1");
    expect(payload.actor_role).toBe("student");
    expect(payload.event_type).toBe("pin_success");
    expect(payload.details).toEqual({});
  });

  it("passes optional target + details", async () => {
    await logAuditEvent({
      actorId: "u1",
      actorRole: "teacher",
      eventType: AUDIT_EVENTS.CONSENT_GIVEN,
      targetType: "consent_record",
      targetId: "consent-xyz",
      details: { ageGroup: "adult" },
    });
    const payload = insertMock.mock.calls[0][0];
    expect(payload.target_type).toBe("consent_record");
    expect(payload.target_id).toBe("consent-xyz");
    expect(payload.details).toEqual({ ageGroup: "adult" });
  });

  it("swallows insert errors (fire-and-forget) without throwing", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "DB down" } });
    await expect(
      logAuditEvent({
        actorId: "u1",
        actorRole: "student",
        eventType: AUDIT_EVENTS.PIN_FAILURE,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows thrown errors from supabase client (network)", async () => {
    insertMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      logAuditEvent({
        actorId: "u1",
        actorRole: "student",
        eventType: AUDIT_EVENTS.SSO_LOGIN,
      }),
    ).resolves.toBeUndefined();
  });
});
