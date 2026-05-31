// ============================================================
//  TOOL: Email Drafter
//  Generates professional email templates for the agent
//  No external API needed — pure template engine
// ============================================================

const TEMPLATES = {
  internship_application: (recipient, context) => ({
    subject: `Application for Data Analyst Internship`,
    body: `Dear ${recipient},

I am writing to express my strong interest in the Data Analyst Internship opportunity at your organization.

${context}

I have been actively developing my skills in SQL, Python (pandas, numpy, matplotlib), and data visualization tools including Tableau and Power BI. I am eager to apply these skills in a real-world setting and contribute meaningfully to your team.

I have attached my resume for your review. I would welcome the opportunity to discuss how my background aligns with your team's needs.

Thank you for your time and consideration. I look forward to hearing from you.

Best regards,
[Your Name]
[Your Phone] | [Your Email] | [LinkedIn URL]`,
  }),

  follow_up: (recipient, context) => ({
    subject: `Follow-up: Data Analyst Internship Application`,
    body: `Dear ${recipient},

I hope this message finds you well. I am following up on my internship application submitted [X days] ago for the Data Analyst role.

${context}

I remain very enthusiastic about this opportunity and would love to discuss how I can contribute to your team. Please let me know if you need any additional information.

Thank you for your time.

Best regards,
[Your Name]
[Your Phone] | [Your Email]`,
  }),

  referral_request: (recipient, context) => ({
    subject: `Referral Request — Data Analyst Internship`,
    body: `Hi ${recipient},

I hope you're doing well! I came across your profile and noticed you work at [Company Name]. I'm currently looking for a Data Analyst internship opportunity and would greatly appreciate your guidance.

${context}

I've been working on building skills in SQL, Python, and data visualization, and I believe [Company Name] would be an ideal environment to grow. If there are any open positions or if you could refer me to the right team, I would be extremely grateful.

I completely understand if this isn't possible — any advice on the application process would also be very helpful.

Thank you so much for your time!

Best regards,
[Your Name]
[LinkedIn URL]`,
  }),

  networking: (recipient, context) => ({
    subject: `Quick Question — Data Analytics Career`,
    body: `Hi ${recipient},

I'm a [degree] student passionate about data analytics and I came across your work at [Company]. Your career path really resonates with where I want to go.

${context}

I would love to have a 15-minute informational chat to learn from your experience — how you got started, what skills matter most, and any advice for someone breaking into the field.

I'm flexible on timing and happy to work around your schedule.

Thanks so much — looking forward to connecting!

[Your Name]
[LinkedIn URL]`,
  }),

  cds_inquiry: (recipient, context) => ({
    subject: `Inquiry Regarding CDS Examination Preparation`,
    body: `Dear ${recipient},

I am writing to inquire about CDS (Combined Defence Services) examination preparation at your institution.

${context}

I am targeting the upcoming UPSC CDS examination and am looking for structured guidance in English, General Knowledge, and Elementary Mathematics. Could you please provide details on:

1. Available batches and schedule
2. Course structure and materials provided
3. Fee structure and any scholarships
4. Success rate in recent CDS examinations

I look forward to your response.

Regards,
[Your Name]
[Contact Number]`,
  }),
};

function draft(type, recipient, context) {
  const templateFn = TEMPLATES[type];
  if (!templateFn) {
    return {
      error: `Unknown email type: ${type}`,
      available_types: Object.keys(TEMPLATES),
    };
  }

  const { subject, body } = templateFn(recipient, context);

  return {
    type,
    recipient,
    subject,
    body,
    character_count: body.length,
    drafted_at: new Date().toISOString(),
    note: "Replace all [placeholder] fields before sending.",
    formatted: `📧 *EMAIL DRAFT*\n\n*To:* ${recipient}\n*Subject:* ${subject}\n\n\`\`\`\n${body}\n\`\`\`\n\n_Replace [placeholders] before sending._`,
  };
}

module.exports = { draft };
