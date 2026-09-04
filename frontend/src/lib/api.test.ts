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
