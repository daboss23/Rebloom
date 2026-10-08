import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.TWILIO_ACCOUNT_SID = "AC_test";
process.env.TWILIO_AUTH_TOKEN = "token";
process.env.TWILIO_FROM = "+13105550100";
process.env.TWILIO_API_BASE = "https://api.twilio.test";

let sendText: typeof import("@/lib/sms/twilio").sendText;

beforeAll(async () => {
  ({ sendText } = await import("@/lib/sms/twilio"));
});

afterEach(() => vi.unstubAllGlobals());

function answer(status: number, json: object) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("sending a text through Twilio", () => {
  it("posts the number, the words and the sender, signed with the account's key", async () => {
    const fetch = answer(201, { sid: "SM123" });
    expect(await sendText({ to: "+13105550142", body: "Hi Sofia. Reply STOP to opt out." })).toEqual({ ok: true, sid: "SM123" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.test/2010-04-01/Accounts/AC_test/Messages.json");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("AC_test:token").toString("base64")}`);
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(form)).toEqual({ To: "+13105550142", Body: "Hi Sofia. Reply STOP to opt out.", From: "+13105550100" });
  });

  it("says plainly when the client replied STOP", async () => {
    answer(400, { code: 21610, message: "Attempt to send to unsubscribed recipient" });
    expect(await sendText({ to: "+13105550142", body: "Hi" })).toEqual({
      ok: false,
      error: "Attempt to send to unsubscribed recipient",
      optedOut: true,
    });
  });

  it("never throws when Twilio can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await sendText({ to: "+13105550142", body: "Hi" })).toEqual({ ok: false, error: "offline", optedOut: false });
  });
});
