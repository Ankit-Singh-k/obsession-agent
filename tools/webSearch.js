// ============================================================
//  TOOL: Web Search
//  Uses: SerpAPI (free tier) OR DuckDuckGo instant answers
//  Fallback: Groq-powered simulated search summary
// ============================================================

const https = require("https");

// Cache to avoid duplicate searches within a session
const searchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "ObsessionAgent/3.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// DuckDuckGo Instant Answer API (completely free, no key needed)
async function duckDuckGoSearch(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
  const data = await httpsGet(url);

  const results = [];

  if (data.AbstractText) {
    results.push({
      title: data.Heading || query,
      snippet: data.AbstractText,
      url: data.AbstractURL,
    });
  }

  if (data.RelatedTopics?.length) {
    data.RelatedTopics.slice(0, 4).forEach((topic) => {
      if (topic.Text) {
        results.push({
          title: topic.Text.slice(0, 60),
          snippet: topic.Text,
          url: topic.FirstURL,
        });
      }
    });
  }

  return results;
}

// SerpAPI (100 free searches/month — optional, add key to .env)
async function serpApiSearch(query) {
  const key = process.env.SERP_API_KEY;
  if (!key) return null;

  const encoded = encodeURIComponent(query);
  const url = `https://serpapi.com/search.json?q=${encoded}&api_key=${key}&num=5&hl=en&gl=in`;
  const data = await httpsGet(url);

  if (!data.organic_results) return null;
  return data.organic_results.slice(0, 5).map((r) => ({
    title: r.title,
    snippet: r.snippet,
    url: r.link,
  }));
}

// Format results for AI consumption
function formatResults(results, query, intent) {
  if (!results.length) {
    return {
      query,
      intent,
      summary: "No results found for this query.",
      results: [],
      searched_at: new Date().toISOString(),
    };
  }

  return {
    query,
    intent,
    searched_at: new Date().toISOString(),
    results: results.map((r, i) => ({
      rank: i + 1,
      title: r.title,
      snippet: r.snippet,
      url: r.url,
    })),
    summary: `Found ${results.length} results for "${query}". Top result: ${results[0]?.title} — ${results[0]?.snippet?.slice(0, 150)}...`,
  };
}

async function search(query, intent = "general") {
  // Check cache
  const cacheKey = `${intent}:${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { ...cached.data, cached: true };
  }

  let results = [];

  try {
    // Try SerpAPI first (better results)
    const serpResults = await serpApiSearch(query);
    if (serpResults) {
      results = serpResults;
    } else {
      // Fall back to DuckDuckGo
      results = await duckDuckGoSearch(query);
    }
  } catch (err) {
    console.error("Search error:", err.message);
    // Return a structured "search failed" response
    return {
      query,
      intent,
      error: "Search temporarily unavailable",
      fallback_note: "Provide best-effort answer based on training knowledge, but note it may not be current.",
      searched_at: new Date().toISOString(),
    };
  }

  const formatted = formatResults(results, query, intent);

  // Cache it
  searchCache.set(cacheKey, { data: formatted, ts: Date.now() });

  return formatted;
}

module.exports = { search };
