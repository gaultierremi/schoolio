import { describe, it, expect, beforeEach, vi } from "vitest";

const fetchMock = vi.fn();
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  fetchMock.mockReset();
  consoleLogSpy.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  vi.resetModules();
});

describe("sendEmail — stub fallback when RESEND_API_KEY missing", () => {
  it("returns ok:true + provider 'stub' when no API key is set", async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      to: "parent@example.com",
      subject: "Consentement Maïa",
      text: "Bonjour, votre enfant…",
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("stub");
    expect(consoleLogSpy).toHaveBeenCalled();
    // fetch must NOT have been called
    expect(fetchMock).not.toHaveBeenCalled();

    if (original) process.env.RESEND_API_KEY = original;
  });
});

describe("sendEmail — Resend provider when RESEND_API_KEY set", () => {
  it("calls Resend API and returns ok:true on 200", async () => {
    process.env.RESEND_API_KEY = "re_test_abc";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "email-id-123" }),
    });

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      to: "parent@example.com",
      subject: "Consentement Maïa",
      text: "Bonjour…",
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("resend");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );

    delete process.env.RESEND_API_KEY;
  });

  it("returns ok:false when Resend rejects (4xx)", async () => {
    process.env.RESEND_API_KEY = "re_test_abc";
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "invalid email" }),
    });

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      to: "bad@",
      subject: "x",
      text: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("resend");
    expect(result.error).toBeTruthy();

    delete process.env.RESEND_API_KEY;
  });

  it("returns ok:false when fetch throws (network)", async () => {
    process.env.RESEND_API_KEY = "re_test_abc";
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      to: "parent@example.com",
      subject: "x",
      text: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("resend");

    delete process.env.RESEND_API_KEY;
  });
});
