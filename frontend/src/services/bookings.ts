// ═══════════════════════════════════════════
// TRIPZYY — Booking & Payment Service
// ═══════════════════════════════════════════

import { apiClient } from "@/lib/api";
import type {
  Booking,
  BookingItemInput,
  PaginatedResponse,
  PaymentMethod,
  Quote,
} from "@/types";

export const bookingService = {
  /**
   * Price a set of components without committing to anything.
   *
   * Availability is checked while quoting, so a price is never returned for
   * something that cannot actually be supplied.
   */
  quote: (tripId: string, items: BookingItemInput[]) =>
    apiClient.post<Quote>(`/trips/${tripId}/quote`, { items }),

  create: (
    tripId: string,
    items: BookingItemInput[],
    options?: { operator_id?: string; notes?: string }
  ) =>
    apiClient.post<Booking>(`/trips/${tripId}/bookings`, {
      items,
      ...options,
    }),

  list: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<Booking>>(
      `/bookings?page=${params?.page ?? 1}&limit=${params?.limit ?? 20}`
    ),

  get: (bookingId: string) => apiClient.get<Booking>(`/bookings/${bookingId}`),

  /**
   * Take a payment. Omit `amount` to settle the balance in full; a smaller
   * amount is recorded as a deposit and leaves the booking pending, which is
   * how an operator holds a tour on part-payment.
   */
  pay: (
    bookingId: string,
    options?: { amount?: string; method?: PaymentMethod }
  ) =>
    apiClient.post<Booking>(`/bookings/${bookingId}/payments`, {
      amount: options?.amount,
      method: options?.method ?? "card",
    }),

  /**
   * Cancel one component. The rest of the tour stands, and the response
   * carries what was refunded, what was retained, and why.
   */
  cancelItem: (bookingId: string, itemId: string) =>
    apiClient.delete<Booking>(`/bookings/${bookingId}/items/${itemId}`),

  cancel: (bookingId: string) =>
    apiClient.delete<Booking>(`/bookings/${bookingId}`),
};
