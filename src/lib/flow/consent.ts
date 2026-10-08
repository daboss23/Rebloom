// The consent text is versioned. Any wording change must bump CONSENT_VERSION,
// because each consent record stores the version the person actually agreed to.
export const CONSENT_VERSION = "2026-10-05.1";

/**
 * Consent to texts, asked at the report gate beside the phone number (DECISIONS D-080). Separate from email
 * reminders and unticked by default, as US texting rules expect. The record stores this version.
 */
export const TEXTS_CONSENT_VERSION = "2026-10-08.1";
export const TEXTS_CONSENT = {
  ask: (clinicName: string) => `Text me reminders and progress updates from ${clinicName}.`,
  terms: "Message and data rates may apply. Reply STOP to opt out at any time.",
};
