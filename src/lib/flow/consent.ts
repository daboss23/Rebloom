// The consent text is versioned. Any wording change must bump CONSENT_VERSION,
// because each consent record stores the version the person actually agreed to.
export const CONSENT_VERSION = "2026-10-05.1";

/**
 * Email updates (DECISIONS D-083): no box to tick. Sending their details at the report gate means the clinic emails
 * their report, reminders and progress updates, which every email lets them stop. Shown under the button and kept,
 * with this version, as the "reminders" record the rebook queue reads.
 */
export const EMAIL_UPDATES_VERSION = "2026-10-09.1";
export const EMAIL_UPDATES_NOTICE = (clinicName: string) =>
  `${clinicName} will email your report, with reminders and progress updates. To stop them, reply to any email.`;

/**
 * Consent to texts, asked at the report gate beside the phone number (DECISIONS D-080). Separate from email
 * reminders and unticked by default, as US texting rules expect. The record stores this version.
 */
export const TEXTS_CONSENT_VERSION = "2026-10-08.1";
export const TEXTS_CONSENT = {
  ask: (clinicName: string) => `Text me reminders and progress updates from ${clinicName}.`,
  terms: "Message and data rates may apply. Reply STOP to opt out at any time.",
};
