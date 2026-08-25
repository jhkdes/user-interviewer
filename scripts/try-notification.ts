/**
 * Manual smoke test for the Resend-backed "here's what you told us" summary
 * email (#6): renders a sample summary with `renderSummaryEmail` and
 * actually sends it via the real `ResendEmailClient`, so formatting and
 * deliverability can be eyeballed in a real inbox before trusting the live
 * webhook trigger (`handleEndOfCallReport`) to get it right end-to-end.
 *
 * Requires RESEND_API_KEY and RESEND_FROM_EMAIL (already in .env.local).
 *
 * Run with:   npm run try:notification -- you@example.com
 * Or, to send to the configured from-address itself:
 *             npm run try:notification
 */
import { ResendEmailClient } from "../src/lib/email/resend-client";
import { renderSummaryEmail } from "../src/notification-service/render-summary-email";

const to = process.argv[2] ?? process.env.RESEND_FROM_EMAIL;

async function main() {
  if (!to) {
    console.error(
      "No recipient given and RESEND_FROM_EMAIL isn't set.\n" +
        "Run with: npm run try:notification -- you@example.com",
    );
    process.exit(1);
  }

  const { subject, html } = renderSummaryEmail({
    firstName: "Jordan",
    painPoints: [
      "Manually copies sales numbers between two spreadsheets every morning — about an hour a day.",
      "No visibility into which deals are stuck until a customer complains.",
    ],
    notableQuotes: [
      "I basically have a second job just making slides.",
      "By the time I notice something's wrong, it's already a fire.",
    ],
    takeaways: ["Reporting tooling is a strong candidate for automation."],
  });

  console.log(`Sending test summary email to ${to}...`);
  await new ResendEmailClient().send({ to, subject, html });
  console.log(`Sent. Subject: "${subject}"`);
  console.log("\nCheck the inbox to eyeball formatting and deliverability.");
}

main().catch((error) => {
  console.error("Failed to send:", error);
  process.exit(1);
});
