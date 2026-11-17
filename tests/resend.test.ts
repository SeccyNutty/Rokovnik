import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySvixSignature } from "@/lib/resend";
import { createSessionValue, requestToken, verifyRequestToken, verifySessionValue } from "@/lib/tokens";

describe("potpisi", () => {
  const key = Buffer.from("tajni-kljuc-za-test-1234567890");
  const secret = `whsec_${key.toString("base64")}`;
  const body = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const sig = createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64");

  it("prihvaća ispravan potpis webhooka", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body, now })).toBe(true);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,krivo v1,${sig}`, body, now })).toBe(true);
  });
  it("odbija izmijenjeno tijelo, krivi ključ i staru poruku", () => {
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body: body + " ", now })).toBe(false);
    expect(verifySvixSignature({ secret: "whsec_" + Buffer.from("drugi").toString("base64"), id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body, now })).toBe(false);
    expect(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body, now: now + 10 * 60_000 })).toBe(false);
    expect(verifySvixSignature({ secret, id: null, timestamp: ts, signature: null, body, now })).toBe(false);
  });
  it("token za potvrdu zahtjeva", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(verifyRequestToken(requestToken(id))).toBe(id);
    expect(verifyRequestToken(requestToken(id).replace(/.$/, "x"))).toBeNull();
    expect(verifyRequestToken("22222222-2222-4222-8222-222222222222." + requestToken(id).split(".").slice(1).join("."))).toBeNull();
  });
  it("sesija administratora istječe", () => {
    const v = createSessionValue(now);
    expect(verifySessionValue(v, now + 1000)).toBe(true);
    expect(verifySessionValue(v, now + 15 * 24 * 3600_000)).toBe(false);
    expect(verifySessionValue("123.abc", now)).toBe(false);
    expect(verifySessionValue(undefined, now)).toBe(false);
  });
});
