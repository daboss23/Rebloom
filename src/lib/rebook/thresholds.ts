// The rebook engine's thresholds (brief 3.4). Constants in one place, so they can be tuned without a hunt.
// The raw-score deltas are provisional until the lighting calibration measures the noise floor (DECISIONS D-011).

/** Days after a report with no booking before the follow-up goes out. */
export const REPORT_FOLLOW_UP_DAYS = 3;
/** Days before a session is due that the reminder goes out. */
export const SESSION_REMINDER_DAYS = 3;
/** A rescan whose raw score rises this much on a priority concern is a progress moment. */
export const PROGRESS_MOMENT_RAW_DELTA = 5;
/** Two rescans in a row that move every priority concern less than this are stalled. */
export const STALLED_RAW_DELTA = 2;
/** A session or scan this many days overdue is missed. */
export const MISSED_AFTER_DAYS = 14;
