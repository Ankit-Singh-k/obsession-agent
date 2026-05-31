// ============================================================
//  TOOL: Preference Memory & Adaptive Profile
//  Learns user's style, strengths, weaknesses, preferences
//  Gets smarter every conversation
// ============================================================

// Per-user profile store
const profiles = new Map();

const DEFAULT_PROFILE = {
  // Learning style
  tone: "balanced",           // strict | encouraging | balanced
  responseLength: "medium",   // short | medium | detailed
  prefersBullets: true,

  // Academic profile
  strongSubjects: [],
  weakSubjects: [],
  studyHoursPerDay: null,
  preferredStudyTime: null,   // morning | evening | night

  // Career profile
  targetCompanies: [],
  skills: [],
  appliedTo: [],

  // Behavior patterns
  consistencyScore: 0,        // 0-100 based on logging
  totalInteractions: 0,
  lastMotivationNeeded: null,

  // Explicit preferences
  notes: [],                  // things user explicitly told the agent
};

function getProfile(chatId) {
  if (!profiles.has(chatId)) {
    profiles.set(chatId, { ...DEFAULT_PROFILE });
  }
  return profiles.get(chatId);
}

// Extract insights from a message and update profile
function learnFromMessage(chatId, userMessage, agentResponse) {
  const profile = getProfile(chatId);
  const msg = userMessage.toLowerCase();

  profile.totalInteractions++;

  // Detect study hours mentioned
  const hoursMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*hour/i);
  if (hoursMatch) {
    const hours = parseFloat(hoursMatch[1]);
    profile.studyHoursPerDay = profile.studyHoursPerDay
      ? Math.round((profile.studyHoursPerDay + hours) / 2 * 10) / 10
      : hours;
  }

  // Detect time preference
  if (/morning|5am|6am|7am|8am/i.test(msg)) profile.preferredStudyTime = "morning";
  else if (/evening|6pm|7pm|8pm/i.test(msg)) profile.preferredStudyTime = "evening";
  else if (/night|10pm|11pm|midnight/i.test(msg)) profile.preferredStudyTime = "night";

  // Detect weak subjects
  const weakPatterns = [/struggle.*with (.+)/i, /bad at (.+)/i, /weak in (.+)/i, /can't understand (.+)/i];
  for (const p of weakPatterns) {
    const m = userMessage.match(p);
    if (m && !profile.weakSubjects.includes(m[1].slice(0, 30))) {
      profile.weakSubjects.push(m[1].slice(0, 30));
    }
  }

  // Detect strong subjects
  const strongPatterns = [/good at (.+)/i, /strong in (.+)/i, /love (.+)/i, /enjoy (.+)/i];
  for (const p of strongPatterns) {
    const m = userMessage.match(p);
    if (m && !profile.strongSubjects.includes(m[1].slice(0, 30))) {
      profile.strongSubjects.push(m[1].slice(0, 30));
    }
  }

  // Detect target companies
  const companies = ["google", "microsoft", "amazon", "flipkart", "deloitte", "infosys", "tcs", "wipro", "accenture", "swiggy", "zomato", "paytm", "razorpay", "freshworks"];
  for (const c of companies) {
    if (msg.includes(c) && !profile.targetCompanies.includes(c)) {
      profile.targetCompanies.push(c);
    }
  }

  // Detect skills
  const skillKeywords = ["sql", "python", "excel", "tableau", "power bi", "r ", "pandas", "numpy", "matplotlib", "statistics", "machine learning", "data visualization"];
  for (const sk of skillKeywords) {
    if (msg.includes(sk) && !profile.skills.includes(sk)) {
      profile.skills.push(sk);
    }
  }

  // Update consistency score when user logs progress
  if (/completed|finished|done|studied|practiced/i.test(msg)) {
    profile.consistencyScore = Math.min(100, profile.consistencyScore + 5);
  }

  // Detect if user needs motivation (frustrated tone)
  if (/frustrated|stuck|can't|giving up|hard|difficult|failing/i.test(msg)) {
    profile.lastMotivationNeeded = new Date().toISOString();
    profile.tone = "encouraging";
  }

  // Detect explicit preference notes
  if (/remember that|note that|i prefer|i like|i want you to/i.test(userMessage)) {
    profile.notes.push(userMessage.slice(0, 100));
    if (profile.notes.length > 10) profile.notes = profile.notes.slice(-10);
  }

  profiles.set(chatId, profile);
}

// Build a context string to inject into system prompt
function getProfileContext(chatId) {
  const p = getProfile(chatId);
  const lines = [];

  if (p.totalInteractions > 0) {
    lines.push(`USER PROFILE (adapt your responses to this):`);

    if (p.studyHoursPerDay) lines.push(`- Studies ~${p.studyHoursPerDay}h/day`);
    if (p.preferredStudyTime) lines.push(`- Prefers studying in the ${p.preferredStudyTime}`);
    if (p.strongSubjects.length) lines.push(`- Strong in: ${p.strongSubjects.slice(-5).join(", ")}`);
    if (p.weakSubjects.length) lines.push(`- Needs help with: ${p.weakSubjects.slice(-5).join(", ")}`);
    if (p.targetCompanies.length) lines.push(`- Target companies: ${p.targetCompanies.slice(-5).join(", ")}`);
    if (p.skills.length) lines.push(`- Known skills: ${p.skills.slice(-8).join(", ")}`);
    if (p.consistencyScore > 0) lines.push(`- Consistency score: ${p.consistencyScore}/100`);
    if (p.tone === "encouraging") lines.push(`- User needs encouragement — be supportive and motivating`);
    if (p.tone === "strict") lines.push(`- User prefers strict, no-nonsense responses`);
    if (p.notes.length) lines.push(`- User notes: ${p.notes.slice(-3).join(" | ")}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

// Get human-readable profile summary
function getProfileSummary(chatId) {
  const p = getProfile(chatId);

  if (p.totalInteractions === 0) {
    return "No profile built yet. Keep talking to me — I learn from every message! 🧠";
  }

  let summary = `🧠 *YOUR ADAPTIVE PROFILE*\n\n`;
  summary += `📊 Interactions: ${p.totalInteractions}\n`;
  summary += `💪 Consistency Score: ${p.consistencyScore}/100\n`;
  if (p.studyHoursPerDay) summary += `⏰ Avg Study: ${p.studyHoursPerDay}h/day\n`;
  if (p.preferredStudyTime) summary += `🌅 Study Time: ${p.preferredStudyTime}\n`;
  if (p.skills.length) summary += `\n🛠️ *Skills Detected:*\n${p.skills.map(s => `• ${s}`).join("\n")}\n`;
  if (p.strongSubjects.length) summary += `\n✅ *Strong Areas:*\n${p.strongSubjects.map(s => `• ${s}`).join("\n")}\n`;
  if (p.weakSubjects.length) summary += `\n⚠️ *Needs Work:*\n${p.weakSubjects.map(s => `• ${s}`).join("\n")}\n`;
  if (p.targetCompanies.length) summary += `\n🎯 *Target Companies:*\n${p.targetCompanies.map(c => `• ${c}`).join("\n")}\n`;
  if (p.notes.length) summary += `\n📝 *Your Notes:*\n${p.notes.map(n => `• ${n}`).join("\n")}\n`;

  summary += `\n_I learn more about you with every message. The more you use me, the better I get._ 🚀`;
  return summary;
}

// Update tone explicitly
function setTone(chatId, tone) {
  const p = getProfile(chatId);
  p.tone = tone;
  profiles.set(chatId, p);
}

module.exports = { getProfile, learnFromMessage, getProfileContext, getProfileSummary, setTone };
