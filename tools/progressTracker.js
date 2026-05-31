// ============================================================
//  TOOL: Progress Tracker
//  Logs daily accomplishments and generates progress reports
// ============================================================

// Map: chatId -> Array of log entries
const logs = new Map();

const CATEGORY_EMOJI = {
  study:       "📚",
  application: "📨",
  skill:       "🛠️",
  exercise:    "💪",
  milestone:   "🏆",
};

function log(chatId, category, description, value = null, unit = null) {
  if (!logs.has(chatId)) logs.set(chatId, []);

  const entry = {
    id: Date.now(),
    category,
    description,
    value,
    unit,
    loggedAt: new Date(),
  };

  logs.get(chatId).push(entry);

  const valueStr = value !== null ? ` (${value}${unit ? " " + unit : ""})` : "";

  return {
    success: true,
    message: `Progress logged: ${description}${valueStr}`,
    category,
    total_entries: logs.get(chatId).length,
    logged_at: entry.loggedAt.toISOString(),
  };
}

function getSummary(chatId) {
  const entries = logs.get(chatId) || [];
  if (!entries.length) return "No progress logged yet. Complete tasks and tell me — I'll track them.";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayEntries = entries.filter((e) => new Date(e.loggedAt) >= today);
  const totalStudyHours = entries
    .filter((e) => e.category === "study" && e.unit === "hours")
    .reduce((sum, e) => sum + (e.value || 0), 0);
  const totalApplications = entries
    .filter((e) => e.category === "application")
    .length;
  const totalMilestones = entries.filter((e) => e.category === "milestone").length;

  return (
    `📅 Today: ${todayEntries.length} task(s) logged\n` +
    `📚 Total study: ${totalStudyHours.toFixed(1)}h\n` +
    `📨 Applications sent: ${totalApplications}\n` +
    `🏆 Milestones hit: ${totalMilestones}`
  );
}

function getFullReport(chatId) {
  const entries = logs.get(chatId) || [];
  if (!entries.length) {
    return (
      "No progress logged yet.\n\n" +
      "Just tell me things like:\n" +
      "_'I completed 3 hours of SQL practice'_\n" +
      "_'I sent an application to Deloitte'_\n" +
      "_'I finished Spectrum History Chapter 5'_\n\n" +
      "I'll track everything automatically."
    );
  }

  // Group by day
  const byDay = {};
  for (const entry of entries) {
    const day = new Date(entry.loggedAt).toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short",
    });
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(entry);
  }

  // Stats
  const totalStudyHours = entries
    .filter((e) => e.category === "study" && e.unit === "hours")
    .reduce((sum, e) => sum + (e.value || 0), 0);
  const totalApplications = entries.filter((e) => e.category === "application").length;
  const totalSkills = entries.filter((e) => e.category === "skill").length;
  const totalMilestones = entries.filter((e) => e.category === "milestone").length;
  const totalExercise = entries
    .filter((e) => e.category === "exercise" && e.unit === "minutes")
    .reduce((sum, e) => sum + (e.value || 0), 0);

  let report = `*📊 FULL PROGRESS REPORT*\n`;
  report += `_Total entries: ${entries.length}_\n\n`;
  report += `━━━━━━━━━━━━━━━━━\n`;
  report += `*Overall Stats:*\n`;
  report += `📚 Study time: ${totalStudyHours.toFixed(1)} hours\n`;
  report += `📨 Applications: ${totalApplications}\n`;
  report += `🛠️ Skills logged: ${totalSkills}\n`;
  report += `🏆 Milestones: ${totalMilestones}\n`;
  report += `💪 Exercise: ${totalExercise} min\n`;
  report += `━━━━━━━━━━━━━━━━━\n\n`;

  // Last 3 days detail
  const days = Object.keys(byDay).slice(-3);
  report += `*Recent Activity:*\n`;
  for (const day of days) {
    report += `\n*${day}*\n`;
    for (const e of byDay[day]) {
      const emoji = CATEGORY_EMOJI[e.category] || "✅";
      const valueStr = e.value !== null ? ` — ${e.value}${e.unit ? " " + e.unit : ""}` : "";
      report += `${emoji} ${e.description}${valueStr}\n`;
    }
  }

  return report;
}

module.exports = { log, getSummary, getFullReport };
