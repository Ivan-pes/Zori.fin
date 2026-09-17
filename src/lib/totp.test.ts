import { describe, it, expect } from "vitest";
import { generateTotp, verifyTotp, generateTotpSecret, totpKeyUri } from "./totp";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("generateTotp (RFC 6238 SHA1 test vectors)", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  for (const [t, expected] of vectors) {
    it(`T=${t} → ${expected}`, () => {
      expect(generateTotp(RFC_SECRET, t * 1000)).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  it("принимает только что сгенерированный код", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, generateTotp(secret))).toBe(true);
  });
  it("отклоняет мусор и неверный формат", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "000000")).toBe(false);
    expect(verifyTotp(secret, "abc")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });
});

describe("generateTotpSecret / totpKeyUri", () => {
  it("секрет — непустой base32", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]+$/);
  });
  it("otpauth-ссылка содержит issuer и секрет", () => {
    const uri = totpKeyUri("a@b.com", "ABC234");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=ABC234");
    expect(uri).toContain("issuer=Zori");
  });
});
