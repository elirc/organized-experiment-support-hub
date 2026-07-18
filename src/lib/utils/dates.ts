import { addMinutes, differenceInMinutes, formatDistanceToNowStrict, isAfter } from "date-fns";

import type { SlaState } from "@/types/support";

export const serializeDate = (value: Date | null | undefined) => value?.toISOString() ?? null;

export const computeDueDate = (base: Date, minutes: number) => addMinutes(base, minutes);

export const getSlaState = (
  dueAt: Date,
  actualAt: Date | null,
  now: Date,
  thresholdMinutes: number,
  isPaused: boolean,
): SlaState => {
  if (actualAt) {
    return "MET";
  }

  if (isPaused) {
    return "PAUSED";
  }

  if (isAfter(now, dueAt)) {
    return "BREACHED";
  }

  const remainingMinutes = differenceInMinutes(dueAt, now);
  return remainingMinutes <= thresholdMinutes ? "AT_RISK" : "HEALTHY";
};

export const formatRelativeDueDate = (value: Date) =>
  formatDistanceToNowStrict(value, { addSuffix: true });
