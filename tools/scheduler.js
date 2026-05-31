// ============================================================
//  TOOL: Scheduler & Reminder System
//  In-memory reminder store with Telegram notification firing
// ============================================================

// Map: chatId -> Array of reminder objects
const reminders = new Map();

const PRIORITY_EMOJI = {
  low: "🟢",
  medium: "🟡",
  high: "🔴",
  critical: "🚨",
};

// Parse natural language time descriptions into a Date
function parseTime(description) {
  const now = new Date();
  const lower = description.toLowerCase().trim();

  // "in X minutes/hours"
  const inMatch = lower.match(/in (\d+)\s*(minute|hour|day)s?/);
  if (inMatch) {
    const value = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const ms = { minute: 60000, hour: 3600000, day: 86400000 }[unit];
    return new Date(now.getTime() + value * ms);
  }

  // "tomorrow at HH:MM" or "tomorrow HH:MM"
  if (lower.includes("tomorrow")) {
    const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const mins = parseInt(timeMatch[2] || "0");
      const meridiem = timeMatch[3];
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      tomorrow.setHours(hours, mins, 0, 0);
    } else {
      tomorrow.setHours(9, 0, 0, 0); // default 9am
    }
    return tomorrow;
  }

  // "daily at HH:MM" — next occurrence of that time
  if (lower.includes("daily") || lower.includes("every day")) {
    const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
    const target = new Date(now);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const mins = parseInt(timeMatch[2] || "0");
      const meridiem = timeMatch[3];
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      target.setHours(hours, mins, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else {
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
    }
    return target;
  }

  // "today at HH:MM" or "at HH:MM"
  const todayMatch = lower.match(/(?:today\s+at\s+|at\s+|@\s*)(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (todayMatch) {
    let hours = parseInt(todayMatch[1]);
    const mins = parseInt(todayMatch[2] || "0");
    const meridiem = todayMatch[3];
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    const target = new Date(now);
    target.setHours(hours, mins, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1); // push to tomorrow if past
    return target;
  }

  // "8pm", "5:30am" bare time
  const bareTime = lower.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/);
  if (bareTime) {
    let hours = parseInt(bareTime[1]);
    const mins = parseInt(bareTime[2] || "0");
    const meridiem = bareTime[3];
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    const target = new Date(now);
    target.setHours(hours, mins, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target;
  }

  // Default: 1 hour from now
  return new Date(now.getTime() + 60 * 60 * 1000);
}

function formatTimeUntil(date) {
  const diff = date - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

function addReminder(chatId, task, timeDescription, priority = "medium") {
  if (!reminders.has(chatId)) reminders.set(chatId, []);

  const fireAt = parseTime(timeDescription);
  const isRecurring = timeDescription.toLowerCase().includes("daily") ||
                      timeDescription.toLowerCase().includes("every day");

  const reminder = {
    id: Date.now(),
    task,
    timeDescription,
    fireAt,
    priority,
    isRecurring,
    fired: false,
    createdAt: new Date(),
  };

  reminders.get(chatId).push(reminder);

  return {
    success: true,
    message: `Reminder set for "${task}"`,
    fires_at: fireAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    time_until: formatTimeUntil(fireAt),
    priority,
    recurring: isRecurring,
    reminder_id: reminder.id,
  };
}

function getReminders(chatId) {
  return (reminders.get(chatId) || []).filter((r) => !r.fired || r.isRecurring);
}

function listReminders(chatId) {
  const list = getReminders(chatId);
  if (!list.length) return "No active reminders. Ask me to set one anytime!";

  return list
    .sort((a, b) => a.fireAt - b.fireAt)
    .map((r, i) => {
      const emoji = PRIORITY_EMOJI[r.priority] || "🔵";
      const time = formatTimeUntil(r.fireAt);
      const recurring = r.isRecurring ? " 🔄" : "";
      return `${i + 1}. ${emoji} *${r.task}*${recurring}\n   ⏰ ${r.fireAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} (${time})`;
    })
    .join("\n\n");
}

// Called on every message to check & fire due reminders
async function checkAndFire(chatId, bot) {
  const list = reminders.get(chatId) || [];
  const now = Date.now();

  for (const r of list) {
    if (!r.fired && r.fireAt <= now) {
      const emoji = PRIORITY_EMOJI[r.priority] || "🔵";
      try {
        await bot.sendMessage(
          chatId,
          `⏰ *REMINDER FIRED*\n\n${emoji} *${r.task}*\n\n_Set as ${r.priority} priority_`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.error("Failed to send reminder:", err.message);
      }

      if (r.isRecurring) {
        // Reschedule for next day same time
        r.fireAt = new Date(r.fireAt.getTime() + 24 * 60 * 60 * 1000);
        r.fired = false;
      } else {
        r.fired = true;
      }
    }
  }

  // Clean up fired non-recurring reminders older than 24h
  const cutoff = now - 24 * 60 * 60 * 1000;
  const cleaned = list.filter((r) => !r.fired || r.fireAt > cutoff);
  reminders.set(chatId, cleaned);
}

module.exports = { addReminder, getReminders, listReminders, checkAndFire };
