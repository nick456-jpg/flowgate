import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateAddress } from "../src/integrations/url-policy";

describe("url policy", () => {
  it("detects private IPv4 ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "203.0.113.10"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("detects private IPv6 ranges", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects non-http protocols and local hostnames before any DNS lookup", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com/file")).rejects.toThrow("http/https");
    await expect(assertPublicHttpUrl("http://localhost:3000")).rejects.toThrow("内网");
    await expect(assertPublicHttpUrl("http://127.0.0.1/")).rejects.toThrow("私网");
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toThrow("私网");
  });
});
