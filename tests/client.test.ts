import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpClient } from "../src/api/client.js";
import { ApiError, ExitCode, NetworkError } from "../src/core/errors.js";

function client(overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}): HttpClient {
  return new HttpClient({
    baseUrl: "https://api.test",
    apiKey: "key-123",
    retries: 0,
    timeoutMs: 1000,
    ...overrides,
  });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpClient", () => {
  it("sends the API key header and encodes query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await client().json("GET", "/v1alpha1/meetings", {
      query: { limit: 10, onlyParticipated: true, query: "a b", skipped: undefined },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1alpha1/meetings?limit=10&onlyParticipated=true&query=a+b");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key-123");
  });

  it("retries a 429 and honours Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const retries: string[] = [];
    const result = await client({
      retries: 2,
      onRetry: (info) => retries.push(info.reason),
    }).json<{ ok: boolean }>("GET", "/v1alpha1/meetings");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retries).toEqual(["HTTP 429"]);
  });

  it("gives up on a 429 once retries run out", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "0" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client({ retries: 1 }).json("GET", "/x")).rejects.toThrow(/Rate limited/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "gone" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client({ retries: 3 }).json("GET", "/x")).rejects.toMatchObject({
      status: 404,
      exitCode: ExitCode.notFound,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 401 and 403 to distinct exit codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "nope" }, 401)));
    await expect(client().json("GET", "/x")).rejects.toMatchObject({ exitCode: ExitCode.auth });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "nope" }, 403)));
    await expect(client().json("GET", "/x")).rejects.toMatchObject({
      exitCode: ExitCode.forbidden,
    });
  });

  it("surfaces validation constraints as the hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            message: "Validation failed",
            errors: [{ property: "url", constraints: { isUrl: "url must be a URL address" } }],
          },
          400,
        ),
      ),
    );

    const error = (await client()
      .json("POST", "/x")
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.exitCode).toBe(ExitCode.validation);
    expect(error.hint).toBe("url: url must be a URL address");
  });

  it("returns a redirect instead of following it when asked", async () => {
    const redirect = new Response("", { status: 302, headers: { location: "https://signed" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirect));

    const response = await client().send("GET", "/download", { redirect: "manual" });
    expect(response.headers.get("location")).toBe("https://signed");
  });

  it("wraps transport failures as NetworkError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(client().json("GET", "/x")).rejects.toBeInstanceOf(NetworkError);
  });
});
