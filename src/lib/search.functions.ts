import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/integrations/supabase/env";
import type { Database } from "@/integrations/supabase/types";
import { buildFallbackResults, isBraveSearchConfigured, isDuckDuckGoAvailable, isFirecrawlConfigured } from "./search.demo";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firecrawl";

const runInputSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  country: z.string().trim().length(2).toLowerCase().default("us"),
  language: z.string().trim().min(2).max(5).toLowerCase().default("en"),
  pages: z.number().int().min(1).max(5).default(1),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
});

type RunInput = z.infer<typeof runInputSchema>;

function serverSupabase() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  return createClient<Database>(
    supabaseUrl,
    supabaseKey,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function extractDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeText(s?: string | null) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isListicleTitle(title?: string | null) {
  if (!title) return false;
  return /(^|\b)(top\s*\d+|best|10 best|top 10|top\s+\d+|list of|best of)\b/i.test(title);
}

function prioritizeResults(results: Array<FirecrawlWebResult>, keyword: string) {
  const k = normalizeText(keyword);
  return results
    .map((r) => {
      const domain = extractDomain(r.url) ?? "";
      const title = normalizeText(r.title);
      let score = 0;
      if (title.includes(k)) score += 30;
      if (domain.includes(k.replace(/\s+/g, ""))) score += 40; // domain match (joined)
      if (isListicleTitle(r.title)) score -= 20; // demote listicles
      // shorter url/domain tends to be brand sites; small bonus
      if (domain && domain.length < 20) score += 5;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.r);
}

interface FirecrawlWebResult {
  url?: string;
  title?: string;
  description?: string;
  position?: number;
}

async function braveSearch(keyword: string, input: RunInput, page: number): Promise<FirecrawlWebResult[]> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY || process.env.VITE_BRAVE_SEARCH_API_KEY;
  if (!braveKey) return [];

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(keyword)}&count=10&offset=${(page - 1) * 10}&country=${encodeURIComponent(input.country.toUpperCase())}&search_lang=${encodeURIComponent(input.language)}&ui_lang=${encodeURIComponent(input.language)}`, {
    headers: {
      "X-Subscription-Token": braveKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[Brave] ${res.status}: ${errBody}`);
    throw new Error(`Brave search failed [${res.status}]: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const mapped = (json.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }));
  const prioritized = prioritizeResults(mapped, keyword);
  const start = (page - 1) * 10;
  return prioritized.slice(start, start + 10).map((r, idx) => ({ ...r, position: start + idx + 1 }));
}

async function duckduckgoSearch(keyword: string, input: RunInput, page: number): Promise<FirecrawlWebResult[]> {
  if (!isDuckDuckGoAvailable()) return [];

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}&kl=${encodeURIComponent(input.country.toLowerCase())}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html",
      },
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[DuckDuckGo] ${res.status}: ${errBody}`);
      return buildFallbackResults(keyword, input, page) as FirecrawlWebResult[];
    }

    const html = await res.text();
    const results = Array.from(html.matchAll(/<a rel="nofollow" class="result__a" href="(.*?)".*?>(.*?)<\/a>/gs)).map((match) => ({
      url: match[1]?.replace(/&amp;/g, "&"),
      title: match[2]?.replace(/<.*?>/g, "").trim(),
    }));

    const prioritized = prioritizeResults(results, keyword);
    const pageSlice = prioritized.slice((page - 1) * 10, page * 10);
    return pageSlice.map((r, index) => ({
      title: r.title,
      url: r.url,
      description: "Free DuckDuckGo result",
      position: (page - 1) * 10 + index + 1,
    }));
  } catch (error) {
    console.error(`[DuckDuckGo] request failed`, error);
    return buildFallbackResults(keyword, input, page) as FirecrawlWebResult[];
  }
}

async function duckduckgoSmartSearch(keyword: string, input: RunInput, page: number): Promise<FirecrawlWebResult[]> {
  // First try the normal query
  const first = await duckduckgoSearch(keyword, input, page);
  // If many of the top results look like listicles, retry with a focused 'official site' query
  const listicleCount = first.slice(0, 6).filter((r) => isListicleTitle(r.title)).length;
  if (listicleCount >= 3) {
    const boosted = await duckduckgoSearch(`${keyword} official site`, input, page);
    // Merge: prefer boosted results first, then fall back to original, dedupe by URL
    const seen = new Set<string>();
    const merged: FirecrawlWebResult[] = [];
    for (const r of [...boosted, ...first]) {
      const u = r.url ?? "";
      if (!u) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      merged.push(r);
    }
    return merged.slice(0, page * 10).slice((page - 1) * 10, page * 10);
  }
  return first;
}

async function firecrawlSearch(
  keyword: string,
  input: RunInput,
  page: number,
): Promise<FirecrawlWebResult[]> {
  if (isBraveSearchConfigured(process.env)) {
    return braveSearch(keyword, input, page);
  }

  if (isDuckDuckGoAvailable()) {
    return duckduckgoSmartSearch(keyword, input, page);
  }

  if (!isFirecrawlConfigured(process.env)) {
    return buildFallbackResults(keyword, input, page) as FirecrawlWebResult[];
  }

  const lovableKey = process.env.LOVABLE_API_KEY || process.env.VITE_LOVABLE_API_KEY;
  const fcKey = process.env.FIRECRAWL_API_KEY || process.env.VITE_FIRECRAWL_API_KEY;

  const body = {
    query: keyword,
    limit: 10,
    location: input.country.toUpperCase(),
    lang: input.language,
    // Firecrawl v2 uses `tbs` for time filters and offset via `page` param support is limited;
    // we approximate multi-page by requesting more results and slicing.
    ...(page > 1 ? { limit: 10 * page } : {}),
  };

  const res = await fetch(`${GATEWAY_URL}/v2/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": fcKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[Firecrawl] ${res.status}: ${errBody}`);
    throw new Error(`Firecrawl search failed [${res.status}]: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    success?: boolean;
    data?: { web?: FirecrawlWebResult[] } | FirecrawlWebResult[];
    web?: FirecrawlWebResult[];
    error?: string;
  };

  if (json.success === false) throw new Error(json.error ?? "Firecrawl returned failure");

  const web =
    (Array.isArray(json.data) ? json.data : json.data?.web) ?? json.web ?? [];
  const prioritized = prioritizeResults(web as FirecrawlWebResult[], keyword);
  const start = (page - 1) * 10;
  return prioritized.slice(start, start + 10);
}

export const runSearch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => runInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = serverSupabase();
    const runIds: string[] = [];

    for (const keyword of data.keywords) {
      const started = Date.now();
      const { data: runRow, error: runErr } = await supabase
        .from("search_runs")
        .insert({
          keyword,
          country: data.country,
          language: data.language,
          pages: data.pages,
          device: data.device,
          status: "running",
        })
        .select("id")
        .single();

      if (runErr || !runRow) {
        console.error("Failed to create run", runErr);
        continue;
      }
      const runId = runRow.id;
      runIds.push(runId);

      try {
        const rows: Array<{
          run_id: string;
          keyword: string;
          position: number;
          page: number;
          kind: string;
          title: string | null;
          url: string | null;
          display_url: string | null;
          description: string | null;
          domain: string | null;
        }> = [];

        for (let p = 1; p <= data.pages; p++) {
          const results = await firecrawlSearch(keyword, data, p);
          results.forEach((r, i) => {
            rows.push({
              run_id: runId,
              keyword,
              position: (p - 1) * 10 + i + 1,
              page: p,
              kind: "organic",
              title: r.title ?? null,
              url: r.url ?? null,
              display_url: r.url ?? null,
              description: r.description ?? null,
              domain: extractDomain(r.url),
            });
          });
        }

        if (rows.length > 0) {
          const { error: insErr } = await supabase.from("search_results").insert(rows);
          if (insErr) throw insErr;
        }

        await supabase
          .from("search_runs")
          .update({
            status: "completed",
            total_results: rows.length,
            duration_ms: Date.now() - started,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      } catch (err) {
        console.error(`Run ${runId} failed`, err);
        await supabase
          .from("search_runs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            duration_ms: Date.now() - started,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }
    }

    return { runIds };
  });

export const deleteRun = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = serverSupabase();
    await supabase.from("search_runs").delete().eq("id", data.id);
    return { ok: true };
  });
