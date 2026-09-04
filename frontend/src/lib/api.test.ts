import { afterEach, expect, test, vi } from "vitest";

import { ApiError, request } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("request parses successful JSON responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  await expect(request<{ status: string }>("/healthcheck")).resolves.toEqual({ status: "ok" });
});

test("request exposes API failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Campaign not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  await expect(request("/v1/campaigns/missing")).rejects.toEqual(
    new ApiError("Campaign not found", 404, { detail: "Campaign not found" }),
  );
});

test("request exposes the structured API error message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "contact_limit", message: "Only 10 contacts are allowed." } }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  await expect(request("/v1/campaigns/one/contacts")).rejects.toMatchObject({
    status: 409,
    message: "Only 10 contacts are allowed.",
  });
});

test("request supports empty successful responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  await expect(request<void>("/v1/campaigns/one", { method: "DELETE" })).resolves.toBeNull();
});
