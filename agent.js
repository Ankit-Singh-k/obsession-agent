// ============================================================
//  PROJECT OBSESSION — Personal Agentic AI v3.3 (OPTIMISED)
//  ✅ 4 Tools: Web Search | Email | Scheduler | Progress
//  ✅ Wikipedia knowledge lookup (lightweight)
//  ✅ Self-improvement (single call only, no lesson extraction)
//  ✅ ~1000 tokens/message → ~100 messages/day on free tier
// ============================================================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Groq = require("groq-sdk");
const scheduler = require("./tools/scheduler");
const progressTracker = require("./tools/progressTracker");
const webSearch = require("./tools/webSearch");
const emailDrafter = require("./tools/emailDrafter");
const knowledgeBase = require("./tools/knowledgeBase");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

// ── Per-user state ────────────────────────────────────────────
const userState = new Map();

function getState(chatId) {
  if (!userState.has(chatId)) {
    userState.set(chatId, {
      phase: 1,
      section: "research",
      history: [],
      startDate: new Date(),
      lastActive: Date.now(),
      failCount: 0,
    });
  }
  const s = userState.get(chatId);
  s.lastActive = Date.now();
  return s;
}

// Auto cleanup stale sessions after 7 days
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, s] of userState.entries())
    if (s.lastActive < cutoff) userState.delete(id);
}, 3600000);

// ── Intent detection ─────────────────────────────────────────
function detectIntent(text) {
  const intents = [];
  if (/search|find|look|internship|job|opening|vacancy|cds|upsc|notification|news|latest|current|live|company|companies/i.test(text))
    intents.push("search");
  if (/email|draft|write.*mail|application.*mail|mail.*to|send.*to/i.test(text))
    intents.push("email");
  if (/remind|reminder|schedule|daily|every day|at \d|alarm|don't forget|set.*\d/i.test(text))
    intents.push("reminder");
  if (/completed|finished|done|studied|practiced|read|wrote|sent|applied|today i|i did|i have|hours of|chapters of/i.test(text))
    intents.push("progress");
  if (/what is|what are|explain|tell me about|how does|define|meaning of|about|who is/i.test(text))
    intents.push("knowledge");
  return intents;
}

// ── Execute tools ─────────────────────────────────────────────
async function executeTools(text, intents, chatId) {
  const results = [];
  const badges = [];

  for (const intent of intents) {
    try {
      if (intent === "search") {
        const query = text.replace(/find|search|look for|tell me about/gi, "").trim().slice(0, 100);
        const r = await webSearch.search(query, "general");
        const hits = r.results?.slice(0, 3).map((x, i) => `${i + 1}. ${x.title}: ${x.snippet?.slice(0, 120)}`).join("\n") || r.summary;
        results.push(`🔍 WEB SEARCH — "${query}":\n${hits}`);
        badges.push("🔍 Web Search");
      }

      if (intent === "knowledge") {
        const r = await knowledgeBase.search(text);
        if (r.found) {
          results.push(`📖 KNOWLEDGE [${r.source}] — ${r.title}:\n${r.summary?.slice(0, 400)}`);
          badges.push(`📖 ${r.source}`);
        }
      }

      if (intent === "email") {
        const r = emailDrafter.draft("internship_application", "Hiring Manager", text);
        results.push(`📧 EMAIL DRAFT:\nSubject: ${r.subject}\n\n${r.body}`);
        badges.push("📧 Email Drafted");
      }

      if (intent === "reminder") {
        const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|daily|every day|tomorrow|in \d+ (?:hour|min|day))/i);
        const timeStr = timeMatch ? timeMatch[0] : "tomorrow 9am";
        const r = scheduler.addReminder(chatId, text.slice(0, 80), timeStr, "high");
        results.push(`📅 REMINDER SET: "${text.slice(0, 60)}"\nFires: ${r.fires_at} (${r.time_until})`);
        badges.push("📅 Reminder Set");
      }

      if (intent === "progress") {
        const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/i);
        const r = progressTracker.log(
          chatId, "study", text.slice(0, 100),
          hoursMatch ? parseFloat(hoursMatch[1]) : null,
          hoursMatch ? "hours" : null
        );
        results.push(`📊 PROGRESS LOGGED: ${r.message}`);
        badges.push("📊 Progress Logged");
      }
    } catch (e) {
      console.error(`Tool ${intent} error:`, e.message);
    }
  }

  return { toolContext: results.join("\n\n"), badges };
}

// ── System prompts ────────────────────────────────────────────
const SYSTEMS = {
  1: `You are OBSESSION — an elite AI agent. Mission: help user land a Data Analyst internship in 30 days.
Be specific: real company names, skills, steps. Be direct and tactical like a senior mentor.
When tool results are provided, USE them as your primary source.
Keep responses under 500 words. Use bullet points for action items.`,

  2: `You are OBSESSION — a retired Indian Army Colonel. Mission: help user clear UPSC CDS in one attempt.
Be military-precise: exact books, chapters, hours, schedules. No vague advice.
When tool results are provided, USE them as your primary source.
Keep responses under 500 words. Use bullet points for action items.`,
};

// ── Negative response detection ───────────────────────────────
const NEGATIVE_SIGNALS = [
  /i don't know/i, /i cannot/i, /i'm not sure/i,
  /i don't have access/i, /no results found/i,
  /unable to/i, /sorry, i/i, /unfortunately/i,
  /i can't help/i,
];

function isNegativeResponse(text) {
  return NEGATIVE_SIGNALS.some((p) => p.test(text));
}

// ── Single Groq call ──────────────────────────────────────────
async function callGroq(messages, maxTokens = 800) {
  const res = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.7,
    messages,
  });
  return res.choices[0].message.content;
}

// ── Main agent ────────────────────────────────────────────────
async function runAgent(chatId, userQuery) {
  const state = getState(chatId);
  const intents = detectIntent(userQuery);
  const { toolContext, badges } = await executeTools(userQuery, intents, chatId);

  const userMessage = toolContext
    ? `User query: ${userQuery}\n\nTool results:\n${toolContext}`
    : userQuery;

  const messages = [
    { role: "system", content: SYSTEMS[state.phase] },
    ...state.history.slice(-10), // keep last 10 turns only — saves tokens
    { role: "user", content: userMessage },
  ];

  let reply = await callGroq(messages);

  // ── Self-improvement: ONE retry if response is weak ───────
  if (isNegativeResponse(reply)) {
    state.failCount++;
    const retryMessages = [
      { role: "system", content: SYSTEMS[state.phase] + "\n\nIMPORTANT: Give a confident, specific, actionable answer. No 'I don't know' or 'I can't'. Use your training knowledge if needed." },
      { role: "user", content: userQuery },
    ];
    const retried = await callGroq(retryMessages, 600);
    if (retried && retried.length > 80) {
      reply = retried;
      badges.push("✨ Auto-improved");
    }
  }

  // Save to history (trimmed)
  state.history.push({ role: "user", content: userQuery });
  state.history.push({ role: "assistant", content: reply.slice(0, 500) });
  if (state.history.length > 20) state.history = state.history.slice(-16);

  return { reply, badges };
}

// ── Safe send ─────────────────────────────────────────────────
async function safeSend(chatId, text, opts = {}) {
  const chunks = text.match(/[\s\S]{1,3800}/g) || [text];
  for (const chunk of chunks)
    await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown", ...opts })
      .catch(() => bot.sendMessage(chatId, chunk, opts));
}

function daysInfo(s) {
  const d = Math.floor((Date.now() - s.startDate) / 86400000);
  return s.phase === 1
    ? `Day ${d + 1}/30 — ${Math.max(0, 30 - d)} days left`
    : `Day ${d + 1} of CDS prep`;
}

const SEC = {
  research:       { e: "🔬", l: "RESEARCH",      h: "Market intel & live search" },
  practical:      { e: "⚙️", l: "PRACTICAL",     h: "Skills & training" },
  positions:      { e: "🎯", l: "POSITIONS",      h: "Live opportunities" },
  implementation: { e: "⚡", l: "IMPLEMENTATION", h: "Execute & track" },
};

function sectionKeyboard(chatId) {
  const s = getState(chatId);
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔬 Research${s.section === "research" ? " ✓" : ""}`,        callback_data: "sec_research" },
          { text: `⚙️ Practical${s.section === "practical" ? " ✓" : ""}`,      callback_data: "sec_practical" },
        ],
        [
          { text: `🎯 Positions${s.section === "positions" ? " ✓" : ""}`,      callback_data: "sec_positions" },
          { text: `⚡ Implement${s.section === "implementation" ? " ✓" : ""}`, callback_data: "sec_implementation" },
        ],
        [
          { text: "📊 My Progress",  callback_data: "show_progress" },
          { text: "📅 My Reminders", callback_data: "show_reminders" },
        ],
      ],
    },
  };
}

// ═══════════════════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════════════════

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from?.first_name || "Agent";
  getState(chatId);
  bot.sendMessage(chatId,
    `◆ *PROJECT OBSESSION v3.3 — AGENT ONLINE*\n\nWelcome, *${name}*.\n\n` +
    `*This is your AI Agent — not a chatbot.*\n\n` +
    `🤖 *Agent Tools:*\n` +
    `🔍 Web Search — live internships & CDS news\n` +
    `📖 Knowledge Base — Wikipedia + curated info\n` +
    `📧 Email Drafter — applications & networking\n` +
    `📅 Scheduler — reminders & study sessions\n` +
    `📊 Progress Tracker — your daily wins\n` +
    `✨ Self-Improvement — auto-fixes weak responses\n\n` +
    `*PHASE-01 — DATA ANALYST* 🎯\n` +
    `*PHASE-02 — CDS OFFICER* 🎖️\n\n` +
    `Just talk naturally. Use /help for all commands.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          ["📊 My Progress", "📅 My Reminders"],
          ["/phase1", "/phase2", "/sector"],
          ["/status", "/reset", "/help"],
        ],
        resize_keyboard: true,
      },
    }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `◆ *OBSESSION AGENT — COMMANDS*\n\n` +
    `*Phase Control:*\n/phase1 — Data Analyst mode\n/phase2 — CDS Officer mode\n\n` +
    `*Sectors:*\n/sector — Switch sector menu\n\n` +
    `*Tools (just talk naturally):*\n` +
    `_"Find DA internships at Google"_ → 🔍\n` +
    `_"What is SQL?"_ → 📖\n` +
    `_"Draft email to Flipkart HR"_ → 📧\n` +
    `_"Remind me SQL at 9pm daily"_ → 📅\n` +
    `_"I studied 3 hours today"_ → 📊\n\n` +
    `*Utilities:*\n/progress — Progress report\n/reminders — Active reminders\n/status — Current mode\n/reset — Clear history`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/status/, (msg) => {
  const s = getState(msg.chat.id);
  const summary = progressTracker.getSummary(msg.chat.id);
  const reminders = scheduler.getReminders(msg.chat.id);
  bot.sendMessage(msg.chat.id,
    `◆ *STATUS*\n\n` +
    `Phase: ${s.phase === 1 ? "🎯 DATA ANALYST" : "🎖️ CDS OFFICER"}\n` +
    `Sector: ${SEC[s.section].e} ${SEC[s.section].l}\n` +
    `📅 ${daysInfo(s)}\n\n` +
    `*Progress Snapshot:*\n${summary}\n\n` +
    `*Active Reminders:* ${reminders.length}\n` +
    `*Auto-improvements:* ${s.failCount}\n\n` +
    `*Model:* ${MODEL} _(FREE)_`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/progress|📊 My Progress/, (msg) => {
  safeSend(msg.chat.id, `◆ *PROGRESS REPORT*\n\n${progressTracker.getFullReport(msg.chat.id)}`);
});

bot.onText(/\/reminders|📅 My Reminders/, (msg) => {
  safeSend(msg.chat.id, `◆ *ACTIVE REMINDERS*\n\n${scheduler.listReminders(msg.chat.id)}`);
});

bot.onText(/\/phase1/, (msg) => {
  const s = getState(msg.chat.id);
  s.phase = 1; s.section = "research"; s.history = []; s.startDate = new Date();
  bot.sendMessage(msg.chat.id,
    `🎯 *PHASE-01 ACTIVATED — DATA ANALYST*\n` +
    `Mission: SECURE INTERNSHIP IN 30 DAYS\n\n` +
    `Try:\n_"Find DA internships at top startups"_\n` +
    `_"What is Power BI?"_\n` +
    `_"Draft application email to Google"_`,
    { parse_mode: "Markdown", ...sectionKeyboard(msg.chat.id) }
  );
});

bot.onText(/\/phase2/, (msg) => {
  const s = getState(msg.chat.id);
  s.phase = 2; s.section = "research"; s.history = []; s.startDate = new Date();
  bot.sendMessage(msg.chat.id,
    `🎖️ *PHASE-02 ACTIVATED — CDS OFFICER*\n` +
    `Mission: CLEAR UPSC CDS — ONE ATTEMPT\n\n` +
    `Try:\n_"Find latest CDS notification"_\n` +
    `_"What is SSB interview?"_\n` +
    `_"Set PT reminder at 5:30am daily"_`,
    { parse_mode: "Markdown", ...sectionKeyboard(msg.chat.id) }
  );
});

bot.onText(/\/sector/, (msg) => {
  bot.sendMessage(msg.chat.id, "◆ *SELECT SECTOR:*", {
    parse_mode: "Markdown",
    ...sectionKeyboard(msg.chat.id),
  });
});

["research", "practical", "positions", "implementation"].forEach((sec) => {
  bot.onText(new RegExp(`^\\/${sec}$`), (msg) => {
    getState(msg.chat.id).section = sec;
    const s = SEC[sec];
    bot.sendMessage(msg.chat.id,
      `${s.e} *Sector: ${s.l}*\n_${s.h}_\n\nGive the agent your query.`,
      { parse_mode: "Markdown" }
    );
  });
});

bot.onText(/\/reset/, (msg) => {
  const s = getState(msg.chat.id);
  s.history = [];
  bot.sendMessage(msg.chat.id,
    "◆ *Conversation reset.*\nHistory cleared. Progress & reminders intact.",
    { parse_mode: "Markdown" }
  );
});

// ── Callbacks ─────────────────────────────────────────────────
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const s = getState(chatId);
  if (q.data.startsWith("sec_")) {
    s.section = q.data.replace("sec_", "");
    const sec = SEC[s.section];
    await bot.answerCallbackQuery(q.id, { text: `✓ ${sec.l}` });
    bot.sendMessage(chatId,
      `${sec.e} *Sector: ${sec.l}*\n_${sec.h}_\n\nGive the agent your query.`,
      { parse_mode: "Markdown" }
    );
  }
  if (q.data === "show_progress") {
    await bot.answerCallbackQuery(q.id);
    safeSend(chatId, `◆ *PROGRESS REPORT*\n\n${progressTracker.getFullReport(chatId)}`);
  }
  if (q.data === "show_reminders") {
    await bot.answerCallbackQuery(q.id);
    safeSend(chatId, `◆ *ACTIVE REMINDERS*\n\n${scheduler.listReminders(chatId)}`);
  }
});

// ── Main message handler ──────────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  if (msg.text === "📊 My Progress")
    return safeSend(msg.chat.id, `◆ *PROGRESS REPORT*\n\n${progressTracker.getFullReport(msg.chat.id)}`);
  if (msg.text === "📅 My Reminders")
    return safeSend(msg.chat.id, `◆ *ACTIVE REMINDERS*\n\n${scheduler.listReminders(msg.chat.id)}`);

  const chatId = msg.chat.id;
  const sec = SEC[getState(chatId).section];
  bot.sendChatAction(chatId, "typing");

  try {
    const { reply, badges } = await runAgent(chatId, msg.text);
    const badgeLine = badges.length ? `\n\n_🤖 Used: ${badges.join(" · ")}_` : "";
    await safeSend(chatId, `${sec.e} *[${sec.l}]*\n\n${reply}${badgeLine}`);
  } catch (err) {
    console.error("Handler error:", err.message);
    if (err.message?.includes("429") || err.message?.includes("rate_limit")) {
      bot.sendMessage(chatId,
        "⏳ *Daily token limit reached.*\n\nThe free Groq API resets at *5:30 AM IST* daily.\nCome back then — your progress & reminders are saved! 💪",
        { parse_mode: "Markdown" }
      );
    } else {
      bot.sendMessage(chatId, "⚠️ Something went wrong. Please try again.");
    }
  }

  scheduler.checkAndFire(chatId, bot);
});

bot.on("polling_error", (e) => console.error("Polling:", e.message));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));

console.log("◆ PROJECT OBSESSION v3.3 — AGENT ONLINE");
console.log(`   AI Engine: Groq + ${MODEL} (FREE)`);
console.log("   Tools: Web Search | Knowledge Base | Email | Scheduler | Progress");
console.log("   Token usage: ~1000/msg → ~100 msgs/day free\n");
