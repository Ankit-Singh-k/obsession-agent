// ============================================================
//  TOOL: Self-Improvement Engine
//  When agent fails or gives a bad response:
//  1. Logs the failure with context
//  2. Reflects on WHY it failed
//  3. Generates an improved response
//  4. Stores the lesson so it never repeats the same mistake
// ============================================================

// Per-user failure memory and lessons learned
const failureLog = new Map();   // chatId -> Array of failures
const lessonsLearned = new Map(); // chatId -> Array of lessons

// Response quality signals — detect bad/negative responses
const NEGATIVE_SIGNALS = [
  /agent error/i,
  /please try again/i,
  /i don't know/i,
  /i cannot/i,
  /i'm not sure/i,
  /i don't have access/i,
  /no results found/i,
  /unable to/i,
  /sorry, i/i,
  /unfortunately/i,
  /i can't help/i,
  /tool error/i,
  /failed to/i,
];

// Detect if a response is negative/unhelpful
function isNegativeResponse(response) {
  return NEGATIVE_SIGNALS.some((pattern) => pattern.test(response));
}

// Log a failure with full context
function logFailure(chatId, userQuery, badResponse, errorMsg = null) {
  if (!failureLog.has(chatId)) failureLog.set(chatId, []);
  const log = failureLog.get(chatId);

  const entry = {
    id: Date.now(),
    userQuery,
    badResponse: badResponse.slice(0, 200),
    errorMsg,
    timestamp: new Date().toISOString(),
    improved: false,
  };

  log.push(entry);

  // Keep only last 20 failures
  if (log.length > 20) failureLog.set(chatId, log.slice(-20));

  return entry;
}

// Add a lesson learned
function addLesson(chatId, lesson) {
  if (!lessonsLearned.has(chatId)) lessonsLearned.set(chatId, []);
  const lessons = lessonsLearned.get(chatId);
  lessons.push({ lesson, learnedAt: new Date().toISOString() });
  if (lessons.length > 15) lessonsLearned.set(chatId, lessons.slice(-15));
}

// Get lessons context for system prompt injection
function getLessonsContext(chatId) {
  const lessons = lessonsLearned.get(chatId) || [];
  if (!lessons.length) return "";
  return `\n\nLESSONS FROM PAST MISTAKES (apply these):\n${lessons.map((l, i) => `${i + 1}. ${l.lesson}`).join("\n")}`;
}

// Get failure stats
function getStats(chatId) {
  const log = failureLog.get(chatId) || [];
  const lessons = lessonsLearned.get(chatId) || [];
  const improved = log.filter((f) => f.improved).length;

  if (!log.length) return "No failures logged yet. Agent is performing well! ✅";

  return (
    `🧠 *Self-Improvement Stats:*\n` +
    `❌ Total failures: ${log.length}\n` +
    `✅ Auto-improved: ${improved}\n` +
    `📚 Lessons learned: ${lessons.length}\n\n` +
    `*Recent lessons:*\n${lessons.slice(-3).map((l, i) => `${i + 1}. ${l.lesson}`).join("\n") || "None yet"}`
  );
}

// Generate an improved response using Groq
async function generateImprovedResponse(groq, model, userQuery, badResponse, phase, section, lessonsCtx) {
  const systemPrompt = phase === 1
    ? `You are OBSESSION — an elite Data Analyst career strategist. Be specific, tactical, and actionable.`
    : `You are OBSESSION — a retired Indian Army Colonel helping with UPSC CDS preparation. Be precise and military-direct.`;

  const reflectionPrompt = `The AI just gave a bad/unhelpful response to a user query.

USER QUERY: "${userQuery}"

BAD RESPONSE THAT FAILED: "${badResponse.slice(0, 150)}"

Your job: Give a MUCH BETTER response to the same query. Be:
- Specific with real names, numbers, resources
- Actionable with clear next steps  
- Confident — no "I don't know" or "I can't"
- Focused on the [${section.toUpperCase()}] sector

If you don't have live data, give your best knowledge-based answer with a note to verify online.
Do NOT mention that the previous response failed. Just give the great response directly.
${lessonsCtx}`;

  try {
    const res = await groq.chat.completions.create({
      model,
      max_tokens: 900,
      temperature: 0.8,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: reflectionPrompt },
      ],
    });
    return res.choices[0].message.content;
  } catch (err) {
    return null;
  }
}

// Extract a lesson from a failure pair
async function extractLesson(groq, model, userQuery, badResponse, goodResponse) {
  try {
    const res = await groq.chat.completions.create({
      model,
      max_tokens: 150,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: "You extract concise lessons from AI failures. Respond with ONE sentence starting with 'When asked about...' or 'For questions about...'",
        },
        {
          role: "user",
          content: `Failed query: "${userQuery}"\nBad response: "${badResponse.slice(0, 100)}"\nGood response: "${goodResponse.slice(0, 100)}"\n\nWhat lesson should the AI remember? One sentence only.`,
        },
      ],
    });
    return res.choices[0].message.content.trim();
  } catch {
    return null;
  }
}

// Main improvement loop — called when a bad response is detected
async function improveResponse(groq, model, chatId, userQuery, badResponse, phase, section) {
  // Log the failure
  const entry = logFailure(chatId, userQuery, badResponse);
  const lessonsCtx = getLessonsContext(chatId);

  // Generate improved response
  const improved = await generateImprovedResponse(
    groq, model, userQuery, badResponse, phase, section, lessonsCtx
  );

  if (improved && improved.length > 50) {
    // Mark as improved
    entry.improved = true;

    // Extract and store lesson asynchronously (don't block response)
    extractLesson(groq, model, userQuery, badResponse, improved).then((lesson) => {
      if (lesson) addLesson(chatId, lesson);
    });

    return { improved: true, response: improved };
  }

  return { improved: false, response: badResponse };
}

module.exports = {
  isNegativeResponse,
  improveResponse,
  logFailure,
  getLessonsContext,
  getStats,
};
