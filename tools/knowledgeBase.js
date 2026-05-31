// ============================================================
//  TOOL: Knowledge Expansion
//  Wikipedia API + curated knowledge base
//  Free, no API key needed
// ============================================================

const https = require("https");

// Cache to avoid duplicate lookups
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "ObsessionAgent/3.0 (Educational Bot)",
        "Accept": "application/json",
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Wikipedia search + extract summary
async function searchWikipedia(query) {
  const cacheKey = `wiki:${query}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const encoded = encodeURIComponent(query);

  try {
    // Step 1: Search for best matching article
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=search&list=search&srsearch=${encoded}&format=json&srlimit=3`;
    const searchData = await httpsGet(searchUrl);

    if (!searchData?.query?.search?.length) {
      return { found: false, query, summary: "No Wikipedia article found for this topic." };
    }

    const topResult = searchData.query.search[0];
    const title = topResult.title;

    // Step 2: Get article summary
    const summaryUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(title)}&format=json&exsentences=5`;
    const summaryData = await httpsGet(summaryUrl);

    const pages = summaryData?.query?.pages;
    const page = pages ? Object.values(pages)[0] : null;
    const extract = page?.extract?.trim();

    if (!extract) {
      return { found: false, query, summary: "Could not extract article content." };
    }

    // Clean and trim
    const summary = extract.replace(/\n{2,}/g, "\n").slice(0, 800);

    const result = {
      found: true,
      query,
      title,
      summary,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      source: "Wikipedia",
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;

  } catch (err) {
    return { found: false, query, error: err.message, summary: "Wikipedia lookup failed." };
  }
}

// Curated knowledge base for DA + CDS topics
const KNOWLEDGE_BASE = {
  // Data Analyst topics
  sql: "SQL (Structured Query Language) is essential for DA roles. Key concepts: SELECT, JOIN, GROUP BY, subqueries, window functions. Practice on LeetCode, HackerRank, or Mode Analytics.",
  python: "Python for DA: focus on pandas (data manipulation), numpy (numerical), matplotlib/seaborn (visualization), and scikit-learn (ML basics). Start with Kaggle courses.",
  tableau: "Tableau is a leading BI tool. Free Public version available. Key skills: connecting data sources, calculated fields, dashboards, and storytelling with data.",
  "power bi": "Power BI by Microsoft. Free desktop version. Key: DAX formulas, Power Query, data modeling. Highly valued in Indian corporate sector.",
  excel: "Excel remains critical for DA internships. Master: VLOOKUP/INDEX-MATCH, pivot tables, Power Query, and basic VBA macros.",

  // CDS topics
  cds: "UPSC CDS (Combined Defence Services) exam has 3 papers: English, General Knowledge, and Elementary Mathematics. Conducted twice yearly. Selected candidates join IMA, INA, AFA, or OTA.",
  upsc: "UPSC conducts CDS exam twice a year — usually February and September. Apply at upsc.gov.in. Eligibility: graduation degree, age 19-25 (varies by academy).",
  ssb: "SSB (Services Selection Board) is a 5-day interview testing Officer Like Qualities (OLQs). Includes psychological tests, GTO tasks, and personal interview. Preparation: read 'SSB Interview' by Major General VK Singh.",
  ima: "IMA (Indian Military Academy) at Dehradun. Training: 18 months. Commissioned as Lieutenant in Indian Army. CDS written exam + SSB required.",
  afa: "AFA (Air Force Academy) at Dundigal, Hyderabad. For flying and ground duty branches. Requires PCME in 12th for flying branch.",

  // General
  internship: "For DA internships in India: target Flipkart, Swiggy, Zomato, Paytm, Razorpay, Freshworks, and big4 consulting. Use LinkedIn, Internshala, and AngelList. Apply 3-4 months before desired start.",
  resume: "DA resume tips: quantify achievements (increased efficiency by X%), list SQL/Python/Tableau skills, include personal projects with GitHub links, keep to 1 page.",
  linkedin: "LinkedIn optimization for DA roles: complete all sections, get 500+ connections, post weekly about data topics, engage with recruiters, use 'Open to Work' feature.",
};

// Look up from curated knowledge base
function lookupKnowledgeBase(query) {
  const q = query.toLowerCase();
  for (const [key, value] of Object.entries(KNOWLEDGE_BASE)) {
    if (q.includes(key)) {
      return { found: true, title: key.toUpperCase(), summary: value, source: "Knowledge Base" };
    }
  }
  return null;
}

// Main knowledge search — tries knowledge base first, then Wikipedia
async function search(query) {
  // Try curated knowledge base first (instant)
  const kb = lookupKnowledgeBase(query);
  if (kb) return kb;

  // Fall back to Wikipedia
  return await searchWikipedia(query);
}

// Detect if a query needs knowledge lookup
function needsKnowledgeLookup(text) {
  const patterns = [
    /what is|what are|explain|tell me about|how does|define|meaning of|about/i,
    /wikipedia|history of|overview of|introduction to/i,
  ];
  return patterns.some((p) => p.test(text));
}

module.exports = { search, needsKnowledgeLookup, searchWikipedia, lookupKnowledgeBase };
