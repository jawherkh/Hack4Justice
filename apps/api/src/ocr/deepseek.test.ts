import { describe, expect, test } from "vitest";

import { createDeepSeekOcrClient } from "./deepseek";

describe("DeepSeek OCR client", () => {
  test("sends a rendered page as an OpenAI-compatible image request", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const client = createDeepSeekOcrClient({
      endpoint: "https://ocr.example.test/chat/completions",
      apiKey: "secret",
      model: "deepseek-flash",
      request: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify({ text: "Extrait RNE", unreadable: [] }) },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const result = await client.extractPage({
      image: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      page: 2,
      language: "fra+ara",
    });

    expect(requestUrl).toBe("https://ocr.example.test/chat/completions");
    expect(requestInit?.headers).toEqual({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(requestInit?.body)) as {
      model: string;
      response_format: { type: string };
      messages: { content: unknown }[];
    };
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,AQID");
    expect(JSON.stringify(body.messages)).toContain("fra+ara");
    expect(result).toEqual({ text: "Extrait RNE", confidence: null });
  });

  test("reports a missing OCR key before making a request", async () => {
    const client = createDeepSeekOcrClient({
      endpoint: "https://ocr.example.test/chat/completions",
      model: "deepseek-flash",
    });

    await expect(
      client.extractPage({ image: new Uint8Array([1]), mimeType: "image/png", page: 1 }),
    ).rejects.toMatchObject({ code: "ocr_not_configured", status: 503 });
  });
});
