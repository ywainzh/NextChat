import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchWeb } from "@/app/utils/web-search";

const SearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  maxResults: z.number().int().min(1).max(10).optional(),
  tavilyApiKey: z.string().trim().optional(),
});

async function handle(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { ok: false, error: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    const json = await req.json();
    const { query, maxResults, tavilyApiKey } = SearchRequestSchema.parse(json);
    const result = await searchWeb(query, { maxResults, tavilyApiKey });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 502,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid search request";
    return NextResponse.json(
      {
        ok: false,
        provider: "tavily",
        query: "",
        results: [],
        error: message,
      },
      { status: 400 },
    );
  }
}

export const POST = handle;

export const runtime = "nodejs";
