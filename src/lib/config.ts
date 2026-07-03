/**
 * Static v1 has no live clock dependency: "today" is mocked so every number
 * on screen is reproducible from the committed JSON (spec §6.1) and the
 * schedule-health invariant (§6.2) is testable by advancing this date.
 */
export const MOCK_TODAY = new Date('2026-07-03T10:30:00Z');
