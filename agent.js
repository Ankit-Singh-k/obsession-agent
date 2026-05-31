// ============================================================
//  PROJECT OBSESSION — Personal Agentic AI v3.1
//  🤖 Intent-based Agent — No tool_use API needed
//  Tools: Web Search | Email Drafter | Scheduler | Progress Tracker
//  AI: Groq + Llama 3.3 70B (FREE)
// ============================================================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Groq = require("groq-sdk");
const scheduler = require("./tools/scheduler");
const progressTracker = require("./tools/progressTracker");
const webSearch = require("./tools/webSearch");
const emailDrafter = require("./tools/emailDrafter");

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
    });
  }
  const s = userState.get(chatId);
  s.lastActive = Date.now();
  return s;
}

setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, s] of userState.entries())
    if (s.lastActive < cutoff) userState.delete(id);
}, 3600000);

// ── Intent detection ─────────────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();
  const intents = [];
  if (/search|find|look|internship|job|opening|vacancy|cds|upsc|notification|news|latest|current|live|company|companies/i.test(t))
    intents.push("search");
  if (/email|draft|write.*mail|application.*mail|mail.*to|send.*to/i.test(t))
    intents.push("email");
  if (/remind|reminder|schedule|daily|every day|at \d|alarm|don't forget|set.*\d/i.test(t))
    intents.push("reminder");
  if (/completed|finished|done|studied|practiced|read|wrote|sent|applied|logged|today i|i did|i have|hours of|chapters of/i.test(t))
    intents.push("progress");
  return intents;
}

// ── Execute tools based on intent ────────────────────────────
async function executeTools(text, intents, chatId) {
  const results = [];
  const badges = [];

  for (const intent of intents) {
    try {
      if (intent === "search") {
        const query = text.replace(/find|search|look for|tell me about/gi, "").trim().slice(0, 100);
        const r = await webSearch.search(query, "general");
        results.push(`🔍 LIVE SEARCH RESULTS for "${query}":\n${r.results?.slice(0,3).map((x,i) => `${i+1}. ${x.title}: ${x.snippet}`).join("\n") || r.summary}`);
        badges.push("🔍 Web Search");
      }
      if (intent === "email") {
        const r = emailDrafter.draft("internship_application", "Hiring Manager", text);
        results.push(`📧 EMAIL DRAFTED:\nSubject: ${r.subject}\n\n${r.body}`);
        badges.push("📧 Email Drafted");
      }
      if (intent === "reminder") {
        const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|daily|every day|tomorrow|in \d+ (?:hour|min|day))/i);
        const timeStr = timeMatch ? timeMatch[0] : "tomorrow 9am";
        const r = scheduler.addReminder(chatId, text.slice(0, 80), timeStr, "high");
        results.push(`📅 REMINDER SET: "${text.slice(0,60)}"\nFires: ${r.fires_at} (${r.time_until})`);
        badges.push("📅 Reminder Set");
      }
      if (intent === "progress") {
        const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/i);
        const r = progressTracker.log(chatId, "study", text.slice(0, 100),
          hoursMatch ? parseFloat(hoursMatch[1]) : null,
          hoursMatch ? "hours" : null);
        results.push(`📊 PROGRESS LOGGED: ${r.message}\nTotal entries: ${r.total_entries}`);
        badges.push("📊 Progress Logged");
      }
    } catch (e) {
      results.push(`⚠️ Tool error: ${e.message}`);
    }
  }

  return { toolContext: results.join("\n\n"), badges };
}

// ── System prompts ────────────────────────────────────────────
const SYSTEMS = {
  1: `You are OBSESSION — an elite AI strategist. Mission: help user land a Data Analyst internship in 30 days.
Be specific: real company names, skills, steps. Be direct, tactical, like a senior mentor.
When tool results are provided, USE them as your primary source. Synthesize into one clear, actionable response.
Keep responses under 600 words. Use bullet points for lists.`,
  2: `You are OBSESSION — a retired Indian Army Colonel. Mission: help user clear UPSC CDS in one attempt.
Be military-precise: exact books, chapters, hours, schedules. No vague advice.
When tool results are provided, USE them as your primary source. Synthesize into one clear tactical briefing.
Keep responses under 600 words. Use bullet points for lists.`,
};

// ── Core AI call ──────────────────────────────────────────────
async function callGroq(messages) {
  const res = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.7,
    messages,
  });
  return res.choices[0].message.content;
}

// ── Main agent run ────────────────────────────────────────────
async function runAgent(chatId, userQuery) {
  const state = getState(chatId);
  const intents = detectIntent(userQuery);
  const { toolContext, badges } = await executeTools(userQuery, intents, chatId);

  const userMessage = toolContext
    ? `User query: ${userQuery}\n\nTool results to use in your response:\n${toolContext}`
    : userQuery;

  const messages = [
    { role: "system", content: SYSTEMS[state.phase] },
    ...state.history.slice(-20),
    { role: "user", content: userMessage },
  ];

  const reply = await callGroq(messages);

  state.history.push({ role: "user", content: userQuery });
  state.history.push({ role: "assistant", content: reply });
  if (state.history.length > 30) state.history = state.history.slice(-20);

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
  return s.phase === 1 ? `Day ${d+1}/30 — ${Math.max(0,30-d)} days left` : `Day ${d+1} of CDS prep`;
}

const SEC = {
  research:       { e: "🔬", l: "RESEARCH",       h: "Market intel & live search" },
  practical:      { e: "⚙️", l: "PRACTICAL",      h: "Skills & training" },
  positions:      { e: "🎯", l: "POSITIONS",       h: "Live opportunities" },
  implementation: { e: "⚡", l: "IMPLEMENTATION",  h: "Execute & track" },
};

function sectionKeyboard(chatId) {
  const s = getState(chatId);
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔬 Research${s.section==="research"?" ✓":""}`,        callback_data: "sec_research" },
          { text: `⚙️ Practical${s.section==="practical"?" ✓":""}`,      callback_data: "sec_practical" },
        ],
        [
          { text: `🎯 Positions${s.section==="positions"?" ✓":""}`,      callback_data: "sec_positions" },
          { text: `⚡ Implement${s.section==="implementation"?" ✓":""}`, callback_data: "sec_implementation" },
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
    `◆ *PROJECT OBSESSION v3.1 — AGENT ONLINE*\n\nWelcome, *${name}*.\n\n*This is your AI Agent — not a chatbot.*\n\n🤖 *Tools Online:*\n🔍 Web Search — live internships & CDS news\n📧 Email Drafter — applications & networking\n📅 Scheduler — reminders & study sessions\n📊 Progress Tracker — your daily wins\n\n*PHASE-01 — DATA ANALYST* 🎯\n*PHASE-02 — CDS OFFICER* 🎖️\n\nJust talk naturally. I detect what tools to use automatically.\nUse /help for all commands.`,
    { parse_mode: "Markdown",
      reply_markup: { keyboard: [["📊 My Progress","📅 My Reminders"],["/phase1","/phase2","/sector"],["/status","/reset","/help"]], resize_keyboard: true }
    });
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `◆ *OBSESSION AGENT — COMMANDS*\n\n/phase1 — Data Analyst mode\n/phase2 — CDS Officer mode\n/sector — Switch sector\n/progress — Progress report\n/reminders — Active reminders\n/status — Current mode\n/reset — Clear history\n\n*Just talk naturally:*\n_"Find DA internships at Google"_ → 🔍 searches\n_"Draft email to Flipkart HR"_ → 📧 writes email\n_"Remind me SQL at 9pm daily"_ → 📅 sets reminder\n_"I studied 3 hours today"_ → 📊 logs progress`,
    { parse_mode: "Markdown" });
});

bot.onText(/\/status/, (msg) => {
  const s = getState(msg.chat.id);
  const summary = progressTracker.getSummary(msg.chat.id);
  const reminders = scheduler.getReminders(msg.chat.id);
  bot.sendMessage(msg.chat.id,
    `◆ *STATUS*\n\nPhase: ${s.phase === 1 ? "🎯 DATA ANALYST" : "🎖️ CDS OFFICER"}\nSector: ${SEC[s.section].e} ${SEC[s.section].l}\n📅 ${daysInfo(s)}\n\n*Progress:*\n${summary}\n\n*Reminders:* ${reminders.length} active\n\n*Model:* ${MODEL} _(FREE)_`,
    { parse_mode: "Markdown" });
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
    `🎯 *PHASE-01 ACTIVATED — DATA ANALYST*\nMission: SECURE INTERNSHIP IN 30 DAYS\n\nTry:\n_"Find DA internships at top startups"_\n_"Draft application email to Google"_\n_"Remind me to update LinkedIn at 7pm"_`,
    { parse_mode: "Markdown", ...sectionKeyboard(msg.chat.id) });
});

bot.onText(/\/phase2/, (msg) => {
  const s = getState(msg.chat.id);
  s.phase = 2; s.section = "research"; s.history = []; s.startDate = new Date();
  bot.sendMessage(msg.chat.id,
    `🎖️ *PHASE-02 ACTIVATED — CDS OFFICER*\nMission: CLEAR UPSC CDS — ONE ATTEMPT\n\nTry:\n_"Find latest CDS notification"_\n_"Set PT reminder at 5:30am daily"_\n_"I finished Spectrum History chapters 1-5"_`,
    { parse_mode: "Markdown", ...sectionKeyboard(msg.chat.id) });
});

bot.onText(/\/sector/, (msg) => {
  bot.sendMessage(msg.chat.id, "◆ *SELECT SECTOR:*", { parse_mode: "Markdown", ...sectionKeyboard(msg.chat.id) });
});

["research","practical","positions","implementation"].forEach(sec => {
  bot.onText(new RegExp(`^\/${sec}$`), (msg) => {
    getState(msg.chat.id).section = sec;
    const s = SEC[sec];
    bot.sendMessage(msg.chat.id, `${s.e} *Sector: ${s.l}*\n_${s.h}_\n\nGive the agent your query.`, { parse_mode: "Markdown" });
  });
});

bot.onText(/\/reset/, (msg) => {
  const s = getState(msg.chat.id);
  s.history = [];
  bot.sendMessage(msg.chat.id, "◆ *Conversation reset.* History cleared. Progress & reminders intact.", { parse_mode: "Markdown" });
});

// ── Callbacks ─────────────────────────────────────────────────
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const s = getState(chatId);
  if (q.data.startsWith("sec_")) {
    s.section = q.data.replace("sec_", "");
    const sec = SEC[s.section];
    await bot.answerCallbackQuery(q.id, { text: `✓ ${sec.l}` });
    bot.sendMessage(chatId, `${sec.e} *Sector: ${sec.l}*\n_${sec.h}_\n\nGive the agent your query.`, { parse_mode: "Markdown" });
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
  if (msg.text === "📊 My Progress") return safeSend(msg.chat.id, `◆ *PROGRESS REPORT*\n\n${progressTracker.getFullReport(msg.chat.id)}`);
  if (msg.text === "📅 My Reminders") return safeSend(msg.chat.id, `◆ *ACTIVE REMINDERS*\n\n${scheduler.listReminders(msg.chat.id)}`);

  const chatId = msg.chat.id;
  const sec = SEC[getState(chatId).section];
  bot.sendChatAction(chatId, "typing");

  try {
    const { reply, badges } = await runAgent(chatId, msg.text);
    const badgeLine = badges.length ? `\n\n_🤖 Used: ${badges.join(" · ")}_` : "";
    await safeSend(chatId, `${sec.e} *[${sec.l}]*\n\n${reply}${badgeLine}`);
  } catch (err) {
    console.error("Handler error:", err.message);
    bot.sendMessage(chatId, `⚠️ Error: ${err.message}. Please try again.`);
  }

  scheduler.checkAndFire(chatId, bot);
});

bot.on("polling_error", (e) => console.error("Polling:", e.message));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));

console.log("◆ PROJECT OBSESSION v3.1 — AGENT ONLINE");
console.log(`   AI Engine: Groq + ${MODEL} (FREE)`);
console.log("   Tools: Web Search | Email Drafter | Scheduler | Progress Tracker");
console.log("   Press Ctrl+C to stop.\n");
