export function isFirecrawlConfigured(env = process.env) {
  const lovableKey = env.LOVABLE_API_KEY || env.VITE_LOVABLE_API_KEY;
  const firecrawlKey = env.FIRECRAWL_API_KEY || env.VITE_FIRECRAWL_API_KEY;
  return Boolean(lovableKey && firecrawlKey);
}

export function isBraveSearchConfigured(env = process.env) {
  const braveKey = env.BRAVE_SEARCH_API_KEY || env.VITE_BRAVE_SEARCH_API_KEY;
  return Boolean(braveKey);
}

export function isDuckDuckGoAvailable() {
  return true;
}

function escapeKeyword(keyword) {
  return String(keyword ?? "").trim() || "search";
}

export function buildFallbackResults(keyword, input, page) {
  const label = escapeKeyword(keyword);
  const location = String(input?.country ?? "US").toUpperCase();
  const language = String(input?.language ?? "en").toLowerCase();
  const pageSize = 10;
  const start = (page - 1) * pageSize;

  const baseResults = [
    {
      title: `${label} — overview and best practices`,
      url: `https://example.com/${encodeURIComponent(label.toLowerCase().replace(/\s+/g, "-"))}`,
      description: `Demo SERP result for "${label}" in ${location} with ${language} targeting.`,
    },
    {
      title: `${label} — comparison guide`,
      url: `https://example.com/${encodeURIComponent(label.toLowerCase().replace(/\s+/g, "-") + "-guide")}`,
      description: `A sample result showing how ${label} appears in a local fallback search view.`,
    },
    {
      title: `${label} — recent trends and FAQs`,
      url: `https://example.com/${encodeURIComponent(label.toLowerCase().replace(/\s+/g, "-") + "-trends")}`,
      description: `Fallback content for ${label} when the connector is unavailable.`,
    },
  ];

  return baseResults.map((result, index) => ({
    ...result,
    position: start + index + 1,
  })).slice(start, start + pageSize);
}
