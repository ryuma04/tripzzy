// ═══════════════════════════════════════════
// TRIPZYY — Calendar Service
// Connects to GET /api/v1/calendar
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type { CalendarResponse } from "@/types";

export const calendarService = {
  getCalendar: (start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    const query = params.toString();
    return apiClient.get<CalendarResponse>(`/calendar${query ? `?${query}` : ""}`);
  },
};
