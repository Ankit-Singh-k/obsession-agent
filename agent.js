// ============================================================
//  PROJECT OBSESSION — Personal Agentic AI v3.0
//  🤖 True Agent: Plans → Decides → Acts → Reports
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

// ── Init ─────────────────────────────────────────────────────
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.1-70b-versatile";

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
      profile: {
        name: null,
        targetRole: "Data Analyst Intern",
        targetExam: "UPSC CDS",
      },
    });
  }
  const state = userState.get(chatId);
  state.lastActive = Date.now();
  return state;
}

// ── Auto-cleanup stale sessions (>7 days) ────────────────────
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, state] of userState.entries()) {
    if (state.lastActive < cutoff) userState.delete(id);
  }
}, 60 * 60 * 1000); // check every hour

// ── TOOL DEFINITIONS (for Groq function calling) ──────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for live internship listings, CDS notifications, news, company info, or any real-time information the user needs. Use this when the user asks about current opportunities, recent updates, or anything time-sensitive.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Precise search query. Be specific for better results.",
          },
          intent: {
            type: "string",
            enum: ["internships", "cds_news", "company_research", "general"],
            description: "What category this search is for.",
          },
        },
        required: ["query", "intent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description:
        "Draft a professional email for the user — internship applications, follow-ups, referral requests, or any professional communication. Returns a ready-to-send email draft.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["internship_application", "follow_up", "referral_request", "networking", "cds_inquiry"],
            description: "Type of email to draft.",
          },
          recipient: {
            type: "string",
            description: "Who the email is to (role/company, e.g. 'HR at Deloitte')",
          },
          context: {
            type: "string",
            description: "Key context points to include in the email.",
          },
        },
        required: ["type", "recipient", "context"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description:
        "Set a reminder or schedule a task for the user. Use when user mentions wanting to remember something, set a deadline, or schedule study sessions.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "What the reminder is about",
          },
          time_description: {
            type: "string",
            description: "When to remind (e.g. 'tomorrow 9am', 'in 2 hours', 'daily at 8pm')",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Priority level of this task",
          },
        },
        required: ["task", "time_description", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_progress",
      description:
        "Log the user's progress on their mission — tasks completed, study hours, applications sent, mock tests done, skills learned. Use when user reports completing something or wants to track progress.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["study", "application", "skill", "exercise", "milestone"],
            description: "Category of progress being logged.",
          },
          description: {
            type: "string",
            description: "What was accomplished",
          },
          value: {
            type: "number",
            description: "Numeric value if applicable (hours studied, applications sent, etc.)",
          },
          unit: {
            type: "string",
            description: "Unit for the value (hours, applications, chapters, etc.)",
          },
        },
        required: ["category", "description"],
      },
    },
  },
];

// ── System prompts ────────────────────────────────────────────
const SYSTEMS = {
  1: `You are OBSESSION — an elite AI agent (not just a chatbot), built for one mission: help the user land a Data Analyst internship in 30 days.

You have 4 tools you can call autonomously:
- web_search: Search for live internship listings, company news, skills demand
- draft_email: Write professional application/networking emails
- set_reminder: Schedule tasks, study sessions, deadlines
- log_progress: Track what the user has accomplished

AGENT BEHAVIOR RULES:
- When user asks about live jobs/internships → ALWAYS call web_search first, then give advice based on real results
- When user mentions completing something → ALWAYS call log_progress to track it
- When user asks for an email → ALWAYS call draft_email
- When user mentions a deadline or "remind me" → ALWAYS call set_reminder
- You can call MULTIPLE tools in one response if needed
- After tool calls, synthesize results into ONE clear, tactical response
- NEVER say "I don't have real-time info" — use web_search instead
- Be a COMMANDER, not an assistant. Push the user. Hold them accountable.

Context: The user operates in 4 sectors — [RESEARCH], [PRACTICAL], [POSITIONS], [IMPLEMENTATION].
Always be specific: real company names, real resources, real next steps. No vague advice.`,

  2: `You are OBSESSION — an elite AI agent with the persona of a retired Indian Army Colonel, built for one mission: clear UPSC CDS in ONE attempt.

You have 4 tools you can call autonomously:
- web_search: Search for latest CDS notifications, UPSC updates, SSB news, admit cards
- draft_email: Write formal requests, SSB preparation letters, coaching inquiry emails
- set_reminder: Schedule daily study blocks, PT sessions, mock test dates, notification deadlines
- log_progress: Track chapters covered, mock scores, PT timings, study hours

AGENT BEHAVIOR RULES:
- UPSC CDS notifications are time-sensitive → ALWAYS use web_search for dates and vacancies
- When user reports study completion → ALWAYS log_progress
- When user needs a schedule → use set_reminder for key milestones
- Call MULTIPLE tools when a request needs it
- After tools, give a crisp military-style briefing with clear orders
- NEVER accept vague updates from the user — ask for specifics and log them
- One attempt. No fallback. Push hard.

Context: Sectors — [RESEARCH], [PRACTICAL], [POSITIONS], [IMPLEMENTATION].
Give exact book names, chapter numbers, daily hour breakdowns. Always.`,
};

// ── Execute tool calls ────────────────────────────────────────
async function executeTool(toolName, args, chatId) {
  try {
    switch (toolName) {
      case "web_search":
        return await webSearch.search(args.query, args.intent);
      case "draft_email":
        return emailDrafter.draft(args.type, args.recipient, args.context);
      case "set_reminder":
        return scheduler.addReminder(chatId, args.task, args.time_description, args.priority);
      case "log_progress":
        return progressTracker.log(chatId, args.category, args.description, args.value, args.unit);
      default:
        return { error: "Unknown tool" };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── Agentic AI call (with tool loop) ─────────────────────────
async function runAgent(chatId, userQuery) {
  const state = getState(chatId);
  const tagged = `[${state.section.toUpperCase()}] ${userQuery}`;

  const messages = [
    { role: "system", content: SYSTEMS[state.phase] },
    ...state.history,
    { role: "user", content: tagged },
  ];

  const toolCallLog = [];
  let finalReply = "";
  let iterations = 0;
  const MAX_ITERATIONS = 5; // prevent infinite loops

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const completion = await groq.chat.completions.create({
        model: MODEL,
        max_tokens: 1500,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      // Add assistant message to context
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

      // If no tool calls → final answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalReply = msg.content || "⚠️ No response generated.";
        break;
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, args, chatId);
          toolCallLog.push({ tool: tc.function.name, args, result });

          return {
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      // Add all tool results to message history
      messages.push(...toolResults);
    }

    // Save to conversation history (trimmed)
    const newHistory = [
      ...state.history,
      { role: "user", content: tagged },
      { role: "assistant", content: finalReply },
    ];
    state.history = newHistory.length > 40 ? newHistory.slice(-30) : newHistory;

    return { reply: finalReply, toolsUsed: toolCallLog };
  } catch (err) {
    console.error("Agent error:", err.message);
    if (err.message?.includes("rate_limit")) {
      return { reply: "⚠️ Rate limit hit (free tier: 30 req/min). Wait 60s and retry.", toolsUsed: [] };
    }
    return { reply: "⚠️ Agent error. Please try again.", toolsUsed: [] };
  }
}

// ── Safe send ─────────────────────────────────────────────────
async function safeSend(chatId, text, options = {}) {
  const chunks = text.match(/[\s\S]{1,3800}/g) || [text];
  for (const chunk of chunks) {
    await bot
      .sendMessage(chatId, chunk, { parse_mode: "Markdown", ...options })
      .catch(() => bot.sendMessage(chatId, chunk, options));
  }
}

// ── Tool activity display ─────────────────────────────────────
function formatToolBadges(toolsUsed) {
  if (!toolsUsed.length) return "";
  const icons = {
    web_search: "🔍 Web Search",
    draft_email: "📧 Email Drafted",
    set_reminder: "📅 Reminder Set",
    log_progress: "📊 Progress Logged",
  };
  const badges = [...new Set(toolsUsed.map((t) => icons[t.tool] || t.tool))].join(" · ");
  return `\n\n_🤖 Agent used: ${badges}_`;
}

// ── Keyboard helpers ──────────────────────────────────────────
const SECTIONS = {
  research:       { label: "RESEARCH",           emoji: "🔬", hint: "Market intel & live search" },
  practical:      { label: "PRACTICAL",          emoji: "⚙️", hint: "Skills & training" },
  positions:      { label: "POSITIONS",          emoji: "🎯", hint: "Live opportunities (auto-searched)" },
  implementation: { label: "IMPLEMENTATION",     emoji: "⚡", hint: "Execute & track daily" },
};

const PHASES = {
  1: { name: "Data Analyst", badge: "INTERNSHIP HUNT", emoji: "🎯" },
  2: { name: "CDS Officer",  badge: "DEFENCE SERVICES", emoji: "🎖️" },
};

function sectionKeyboard(chatId) {
  const state = getState(chatId);
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔬 Research${state.section === "research" ? " ✓" : ""}`,         callback_data: "sec_research" },
          { text: `⚙️ Practical${state.section === "practical" ? " ✓" : ""}`,       callback_data: "sec_practical" },
        ],
        [
          { text: `🎯 Positions${state.section === "positions" ? " ✓" : ""}`,       callback_data: "sec_positions" },
          { text: `⚡ Implement${state.section === "implementation" ? " ✓" : ""}`,  callback_data: "sec_implementation" },
        ],
        [
          { text: "📊 My Progress", callback_data: "show_progress" },
          { text: "📅 My Reminders", callback_data: "show_reminders" },
        ],
      ],
    },
  };
}

function daysInfo(state) {
  const diff = Math.floor((Date.now() - state.startDate) / 86400000);
  return state.phase === 1
    ? `📅 Day ${diff + 1}/30 — ${Math.max(0, 30 - diff)} days remaining`
    : `📅 Day ${diff + 1} of CDS Training`;
}

// ═══════════════════════════════════════════════════════════
//  COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const state = getState(chatId);
  const name = msg.from?.first_name || "Agent";
  if (!state.profile.name) state.profile.name = name;

  bot.sendMessage(
    chatId,
    `◆ *PROJECT OBSESSION v3.0 — AGENT ONLINE*\n\n` +
    `Welcome back, *${name}*.\n\n` +
    `*This is not a chatbot. This is your AI Agent.*\n` +
    `I search the web, draft emails, set reminders,\nand track your progress — autonomously.\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `🤖 *Agent Tools Online:*\n` +
    `🔍 Web Search — live internships & CDS news\n` +
    `📧 Email Drafter — applications & networking\n` +
    `📅 Scheduler — reminders & study sessions\n` +
    `📊 Progress Tracker — your daily wins\n` +
    `━━━━━━━━━━━━━━━━━\n\n` +
    `*PHASE-01 — DATA ANALYST* 🎯\n` +
    `*PHASE-02 — CDS OFFICER* 🎖️\n\n` +
    `Current: *PHASE-0${state.phase} / ${SECTIONS[state.section].label}*\n\n` +
    `Just talk to me naturally. I'll figure out what tools to use.\n` +
    `Or use /help for all commands.`,
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

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `◆ *OBSESSION AGENT — COMMAND REFERENCE*\n\n` +
    `*Phase Control:*\n` +
    `/phase1 — Data Analyst mode\n` +
    `/phase2 — CDS Officer mode\n\n` +
    `*Sectors:*\n` +
    `/sector — Open sector menu\n` +
    `/research · /practical · /positions · /implementation\n\n` +
    `*Agent Tools (just talk naturally):*\n` +
    `_"Find me DA internships at Deloitte"_ → 🔍 searches web\n` +
    `_"Draft an application email to Google"_ → 📧 writes email\n` +
    `_"Remind me to practice SQL at 8pm"_ → 📅 sets reminder\n` +
    `_"I completed 3 hours of study today"_ → 📊 logs progress\n\n` +
    `*Utilities:*\n` +
    `/progress — Full progress report\n` +
    `/reminders — All active reminders\n` +
    `/status — Current mode\n` +
    `/reset — Clear chat history\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `_The agent decides which tools to use. You just talk._`,
    { parse_mode: "Markdown" }
  );
});

// /status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const state = getState(chatId);
  const ph = PHASES[state.phase];
  const sec = SECTIONS[state.section];
  const reminders = scheduler.getReminders(chatId);
  const summary = progressTracker.getSummary(chatId);

  bot.sendMessage(
    chatId,
    `◆ *OBSESSION STATUS REPORT*\n\n` +
    `*Mode:* ${ph.emoji} PHASE-0${state.phase} — ${ph.name}\n` +
    `*Mission:* ${ph.badge}\n` +
    `*Sector:* ${sec.emoji} ${sec.label}\n` +
    `*${daysInfo(state)}*\n` +
    `*Turns:* ${Math.floor(state.history.length / 2)}\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `*Progress Snapshot:*\n${summary}\n\n` +
    `*Active Reminders:* ${reminders.length}\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `${state.phase === 1 ? "🔄 Phase 01 — IN PROGRESS\n⬜ Phase 02 — WAITING" : "✅ Phase 01 — COMPLETE\n🔄 Phase 02 — IN PROGRESS"}\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `*AI Engine:* Groq + Llama 3.3 70B _(FREE)_`,
    { parse_mode: "Markdown" }
  );
});

// /progress
bot.onText(/\/progress|📊 My Progress/, (msg) => {
  const chatId = msg.chat.id;
  const report = progressTracker.getFullReport(chatId);
  safeSend(chatId, `◆ *PROGRESS REPORT*\n\n${report}`);
});

// /reminders
bot.onText(/\/reminders|📅 My Reminders/, (msg) => {
  const chatId = msg.chat.id;
  const list = scheduler.listReminders(chatId);
  safeSend(chatId, `◆ *ACTIVE REMINDERS*\n\n${list}`);
});

// /phase1
bot.onText(/\/phase1/, (msg) => {
  const chatId = msg.chat.id;
  const state = getState(chatId);
  state.phase = 1;
  state.section = "research";
  state.history = [];
  state.startDate = new Date();

  bot.sendMessage(
    chatId,
    `🎯 *PHASE-01 ACTIVATED — DATA ANALYST*\n\n` +
    `Mission: SECURE HIGH-RANK INTERNSHIP IN 30 DAYS\n` +
    `Agent tools armed and ready.\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `Try saying:\n` +
    `_"Search for DA internships at top companies"_\n` +
    `_"Draft an application email to Flipkart"_\n` +
    `_"Remind me to update my LinkedIn at 7pm"_\n` +
    `_"I completed 2 hours of SQL practice"_\n` +
    `━━━━━━━━━━━━━━━━━\n\n` +
    `Select a sector and give the agent its first order.`,
    { parse_mode: "Markdown", ...sectionKeyboard(chatId) }
  );
});

// /phase2
bot.onText(/\/phase2/, (msg) => {
  const chatId = msg.chat.id;
  const state = getState(chatId);
  state.phase = 2;
  state.section = "research";
  state.history = [];
  state.startDate = new Date();

  bot.sendMessage(
    chatId,
    `🎖️ *PHASE-02 ACTIVATED — CDS OFFICER*\n\n` +
    `Mission: CLEAR UPSC CDS — ONE ATTEMPT\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `Try saying:\n` +
    `_"Find the latest CDS notification dates"_\n` +
    `_"Set a reminder for my daily PT at 5:30am"_\n` +
    `_"I finished Spectrum History chapters 1-5"_\n` +
    `_"Draft an email to a CDS coaching centre"_\n` +
    `━━━━━━━━━━━━━━━━━\n\n` +
    `One attempt. No fallback. Give the agent its orders.`,
    { parse_mode: "Markdown", ...sectionKeyboard(chatId) }
  );
});

// /sector
bot.onText(/\/sector/, (msg) => {
  bot.sendMessage(msg.chat.id, "◆ *SELECT SECTOR:*", {
    parse_mode: "Markdown",
    ...sectionKeyboard(msg.chat.id),
  });
});

// Sector shortcuts
["research", "practical", "positions", "implementation"].forEach((sec) => {
  bot.onText(new RegExp(`^\/${sec}$`), (msg) => {
    const chatId = msg.chat.id;
    getState(chatId).section = sec;
    const s = SECTIONS[sec];
    bot.sendMessage(
      chatId,
      `${s.emoji} *Sector: ${s.label}*\n_${s.hint}_\n\nGive the agent your query.`,
      { parse_mode: "Markdown" }
    );
  });
});

// /reset
bot.onText(/\/reset/, (msg) => {
  const state = getState(msg.chat.id);
  state.history = [];
  bot.sendMessage(
    msg.chat.id,
    "◆ *Conversation reset.*\nHistory cleared. Progress & reminders intact.\n\nFire away.",
    { parse_mode: "Markdown" }
  );
});

// ── Callback queries ──────────────────────────────────────────
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const state = getState(chatId);
  const data = query.data;

  if (data.startsWith("sec_")) {
    const sec = data.replace("sec_", "");
    state.section = sec;
    const s = SECTIONS[sec];
    await bot.answerCallbackQuery(query.id, { text: `✓ ${s.label}` });
    bot.sendMessage(chatId, `${s.emoji} *Sector: ${s.label}*\n_${s.hint}_\n\nGive the agent your query.`, {
      parse_mode: "Markdown",
    });
  }

  if (data === "show_progress") {
    await bot.answerCallbackQuery(query.id);
    const report = progressTracker.getFullReport(chatId);
    safeSend(chatId, `◆ *PROGRESS REPORT*\n\n${report}`);
  }

  if (data === "show_reminders") {
    await bot.answerCallbackQuery(query.id);
    const list = scheduler.listReminders(chatId);
    safeSend(chatId, `◆ *ACTIVE REMINDERS*\n\n${list}`);
  }
});

// ── Main message handler (agentic) ────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  // Handle keyboard button texts
  if (msg.text === "📊 My Progress") {
    const report = progressTracker.getFullReport(msg.chat.id);
    return safeSend(msg.chat.id, `◆ *PROGRESS REPORT*\n\n${report}`);
  }
  if (msg.text === "📅 My Reminders") {
    const list = scheduler.listReminders(msg.chat.id);
    return safeSend(msg.chat.id, `◆ *ACTIVE REMINDERS*\n\n${list}`);
  }

  const chatId = msg.chat.id;
  const state = getState(chatId);
  const sec = SECTIONS[state.section];

  // Show typing
  bot.sendChatAction(chatId, "typing");

  // Run the agentic loop
  const { reply, toolsUsed } = await runAgent(chatId, msg.text);

  // Format response with tool badges
  const toolBadges = formatToolBadges(toolsUsed);
  await safeSend(chatId, `${sec.emoji} *[${sec.label}]*\n\n${reply}${toolBadges}`);

  // Fire pending reminders check
  scheduler.checkAndFire(chatId, bot);
});

// ── Error handling ────────────────────────────────────────────
bot.on("polling_error", (err) => console.error("Polling error:", err.message));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err));

console.log("◆ PROJECT OBSESSION v3.0 — AGENT ONLINE");
console.log(`   AI Engine: Groq + ${MODEL} (FREE)`);
console.log("   Tools: Web Search | Email Drafter | Scheduler | Progress Tracker");
console.log("   Press Ctrl+C to stop.\n");
