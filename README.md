# PROJECT OBSESSION AGENT  v3.0 — Agentic AI

> This is an agent that **plans, decides, and acts**.

---


## Setup (5 minutes)

### Step 1 — Clone/copy files

```bash
# Copy all files to a folder
mkdir obsession-agent && cd obsession-agent
# Place agent.js, tools/, package.json, .env.example, Procfile here
```

### Step 2 — Create your .env

```bash
cp .env.example .env
# Edit .env with your keys
```

```env
TELEGRAM_BOT_TOKEN=your_telegram_token
GROQ_API_KEY=your_groq_key
SERP_API_KEY=               # optional
```

### Step 3 — Install and run

```bash
npm install
npm start
```

---

## Free Hosting (24/7)

### Railway.app (Recommended)

1. Push code to GitHub (make sure `.env` is in `.gitignore`)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Railway detects `Procfile` and runs `node agent.js` automatically
5. Done — agent runs forever, free
   
---

## How the Agent Works

```
User message
    ↓
Agent reads message + context
    ↓
Decides which tools to call (0 to 4 tools)
    ↓
Executes tools in parallel
    ↓
Synthesizes results
    ↓
Single clear response to user
```

### Tool trigger examples

| You say | Agent does |
|---|---|
| "Find DA internships at top startups" | 🔍 web_search → gives real results |
| "Draft an application email to Flipkart HR" | 📧 draft_email → ready-to-send email |
| "Remind me to do SQL at 8pm daily" | 📅 set_reminder → fires every day at 8pm |
| "I finished 3 hours of Python today" | 📊 log_progress → updates your tracker |
| "What's the latest CDS notification?" | 🔍 web_search → live UPSC update |
| "I passed my mock test with 85%" | 📊 log_progress (milestone) |

The agent can use **multiple tools in one response** — e.g., search for internships AND log that you applied.

---

## Commands

| Command | Action |
|---|---|
| `/start` | Initialize agent |
| `/phase1` | Data Analyst mode |
| `/phase2` | CDS Officer mode |
| `/sector` | Switch sector |
| `/progress` | Full progress report |
| `/reminders` | All active reminders |
| `/status` | Current mode + snapshot |
| `/reset` | Clear chat history |
| `/help` | All commands |

---

## File Structure

```
obsession-agent/
├── agent.js              # Main agent (agentic loop + all commands)
├── tools/
│   ├── webSearch.js      # DuckDuckGo + SerpAPI search
│   ├── emailDrafter.js   # Professional email templates
│   ├── scheduler.js      # Reminder system with Telegram firing
│   └── progressTracker.js # Daily progress logging & reports
├── package.json
├── Procfile              # For Railway/Render
├── .env.example
└── .gitignore
```
