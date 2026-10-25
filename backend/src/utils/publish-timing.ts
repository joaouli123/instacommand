// A queue restored after an outage must not publish old campaigns as new content.
export const LATE_PUBLISH_WINDOW_MS = 6 * 60 * 60_000;
export const MISSED_SCHEDULE_MESSAGE = 'O horário agendado passou sem que a publicação fosse enviada. Revise e agende novamente.';
