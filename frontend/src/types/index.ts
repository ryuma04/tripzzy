// ═══════════════════════════════════════════
// TRIPZYY — TypeScript Type Definitions
// Matches the FastAPI API contract exactly
// ═══════════════════════════════════════════

// ─── API Response Types ────────────────────

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  details: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ─── User ──────────────────────────────────

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  bio?: string;
  additional_info?: string;
  avatar_url?: string;
  role: "user" | "admin";
  /** Mirrors the `user_status` enum; drives suspend/reactivate in the admin console. */
  status?: "active" | "suspended" | "deleted";
  is_email_verified?: boolean;
  created_at: string;
  updated_at: string;
}

export type TravelStyle =
  | "solo"
  | "couple"
  | "family"
  | "friends"
  | "business"
  | "backpacking"
  | "luxury";

export type TravelPace = "relaxed" | "balanced" | "packed";

/** Shared ladder for accommodation and transport class. */
export type ComfortTier = "budget" | "standard" | "premium" | "luxury";

export type ServiceType =
  | "accommodation"
  | "transport"
  | "activity"
  | "guide"
  | "meal"
  | "other";

/**
 * Mirrors `PreferencesResponse`. This replaces an earlier shape whose fields
 * (`preferred_activities`, `budget_preference`, `dietary_restrictions`, …)
 * matched nothing the API ever returned.
 *
 * A null means "not stated", which is distinct from "no preference" — so
 * these drive the personalisation intake and the ranking of alternatives.
 */
export interface UserPreferences {
  currency: string;
  default_traveller_count: number;
  preferred_categories: string[];
  home_city?: string | null;
  home_country?: string | null;
  email_notifications: boolean;

  travel_style?: TravelStyle | null;
  pace?: TravelPace | null;
  accommodation_class?: ComfortTier | null;
  transport_class?: ComfortTier | null;
  preferred_transport_modes: string[];
  interests: string[];
  dietary_requirements: string[];
  mobility_needs?: string | null;
  /** Money is a string end to end. */
  daily_budget_cap?: string | null;
}

export type UpdatePreferencesPayload = Partial<UserPreferences>;

/**
 * One ranked option for a trip slot, from `/components/alternatives`.
 *
 * `match_reasons` carries the per-factor scores behind `match_score`, so the
 * UI can explain a ranking rather than asking the user to trust a number.
 */
export interface ComponentAlternative {
  service_id: string;
  vendor_id: string;
  vendor_name?: string | null;
  vendor_rating?: string | null;
  reliability_score?: number | null;
  name: string;
  description?: string | null;
  service_type: ServiceType;
  comfort_tier: ComfortTier;
  unit_price: string;
  unit_label: string;
  total_price: string;
  currency: string;
  duration_minutes?: number | null;
  city?: string | null;
  rating?: string | null;
  tags: string[];
  free_cancellation_days: number;
  cancellation_penalty_pct: number;
  /** null when the date has no published capacity limit. */
  seats_left?: number | null;
  match_score: number;
  match_reasons: Record<string, number>;
  notes: string[];
}

// ─── Operator console ──────────────────────

export type OperatorRole = "owner" | "manager" | "coordinator";

export type TourGroupStatus =
  | "forming"
  | "confirmed"
  | "full"
  | "in_progress"
  | "completed"
  | "cancelled";

/**
 * The caller's operator, and their standing in it.
 *
 * Operator access is granted by membership, not by the platform-level
 * `User.role` — so the same account can be a traveller on its own trips and
 * a coordinator at work.
 */
export interface OperatorProfile {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  city?: string | null;
  country?: string | null;
  rating?: string | null;
  your_role: OperatorRole;
  your_job_title?: string | null;
}

export interface OperatorDashboard {
  operator_id: string;
  bookings: {
    total: number;
    active: number;
    awaiting_payment: number;
    customers: number;
  };
  money: {
    booked_value: string;
    collected: string;
    outstanding: string;
    refunded: string;
  };
  operations: {
    departing_within_14_days: number;
    /** The most actionable number: a departure with nobody running it. */
    unstaffed_departures: number;
    vendors: number;
    services: number;
    coordinators: number;
  };
}

export interface OperatorCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  city?: string | null;
  avatar_url?: string | null;
  booking_count: number;
  lifetime_value: string;
  last_booked_at?: string | null;
}

export interface OperatorBookingRow {
  id: string;
  reference: string;
  status: BookingStatus;
  trip_id: string;
  trip_title?: string | null;
  traveller_id: string;
  traveller_name?: string | null;
  traveller_email?: string | null;
  currency: string;
  total: string;
  amount_paid: string;
  amount_outstanding: string;
  item_count: number;
  first_service_date?: string | null;
  created_at: string;
}

export interface ScheduleEvent {
  item_id: string;
  booking_id: string;
  booking_reference: string;
  component_type: ServiceType;
  title: string;
  vendor_name?: string | null;
  city?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  quantity: number;
  traveller_name: string;
  status: BookingItemStatus;
}

export interface OperatorSchedule {
  start: string;
  end: string;
  days: { date: string; events: ScheduleEvent[] }[];
  total_events: number;
}

export interface OperatorVendor {
  id: string;
  name: string;
  category: ServiceType;
  city?: string | null;
  country?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  rating?: string | null;
  reliability_score: number;
  is_active: boolean;
  service_count: number;
}

export interface OperatorVendorService {
  id: string;
  name: string;
  service_type: ServiceType;
  comfort_tier: ComfortTier;
  unit_price: string;
  unit_label: string;
  currency: string;
  city?: string | null;
  rating?: string | null;
  free_cancellation_days: number;
  cancellation_penalty_pct: number;
  is_active: boolean;
}

export interface OperatorCoordinator {
  id: string;
  user_id: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  role: OperatorRole;
  job_title?: string | null;
  is_active: boolean;
  active_departures: number;
}

export interface TourGroupMember {
  id: string;
  booking_id: string;
  traveller_id: string;
  traveller_name?: string | null;
  seats: number;
}

export interface TourGroup {
  id: string;
  name: string;
  destination?: string | null;
  start_date: string;
  end_date: string;
  capacity: number;
  seats_taken: number;
  seats_left: number;
  status: TourGroupStatus;
  coordinator_id?: string | null;
  coordinator_name?: string | null;
  notes?: string | null;
  members: TourGroupMember[];
  created_at: string;
}

export interface CreateTourGroupPayload {
  name: string;
  destination?: string;
  start_date: string;
  end_date: string;
  capacity?: number;
  coordinator_id?: string;
  notes?: string;
}

export interface OperatorPaymentRow {
  id: string;
  booking_id: string;
  booking_reference: string;
  traveller_name: string;
  amount: string;
  currency: string;
  kind: PaymentKind;
  status: PaymentStatus;
  method?: string | null;
  gateway_reference?: string | null;
  failure_reason?: string | null;
  created_at: string;
}

export interface OperatorPaymentsPage {
  items: OperatorPaymentRow[];
  pagination: Pagination;
  totals: { captured: string; refunded: string; net: string };
}

// ─── Bookings ──────────────────────────────

export type BookingStatus =
  | "draft"
  | "pending_payment"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

/** A component can be cancelled while the rest of the tour stands. */
export type BookingItemStatus = "pending" | "confirmed" | "cancelled" | "replaced";

export type PaymentKind = "deposit" | "instalment" | "full" | "refund";
export type PaymentStatus =
  | "initiated"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded";

export type PaymentMethod = "card" | "upi" | "netbanking" | "wallet";

/**
 * One booked component — the row the adaptation engine operates on.
 *
 * Prices and cancellation terms are snapshots taken at booking time, not
 * live reads: the refund a traveller is owed is the one that applied when
 * they paid, whatever the vendor's policy says today.
 */
export interface BookingItem {
  id: string;
  service_id?: string | null;
  stop_id?: string | null;
  component_type: ServiceType;
  title: string;
  vendor_name?: string | null;
  city?: string | null;
  service_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  /** How many people or rooms. */
  quantity: number;
  /** How many nights or days. Multiplies with quantity. */
  units: number;
  unit_price: string;
  total_price: string;
  free_cancellation_days: number;
  cancellation_penalty_pct: number;
  status: BookingItemStatus;
  replaced_by_item_id?: string | null;
  notes?: string | null;
}

export interface Payment {
  id: string;
  amount: string;
  currency: string;
  kind: PaymentKind;
  status: PaymentStatus;
  method?: string | null;
  gateway_reference?: string | null;
  failure_reason?: string | null;
  created_at: string;
}

export interface CancellationSummary {
  refunded: string;
  penalty: string;
  explanation: string;
}

export interface Booking {
  id: string;
  /** Short, quotable over the phone. */
  reference: string;
  trip_id: string;
  trip_title?: string | null;
  traveller_id: string;
  operator_id?: string | null;
  status: BookingStatus;
  currency: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  amount_paid: string;
  amount_outstanding: string;
  notes?: string | null;
  placed_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  items: BookingItem[];
  payments: Payment[];
  /** Present on a cancellation response: what came back, what was kept, why. */
  cancellation?: CancellationSummary | null;
  created_at: string;
  updated_at: string;
}

/** One component to book. Either a catalogue service, or a priced custom line. */
export interface BookingItemInput {
  service_id?: string;
  stop_id?: string;
  itinerary_activity_id?: string;
  component_type: ServiceType;
  title?: string;
  city?: string;
  service_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  quantity?: number;
  units?: number;
  unit_price?: string;
  notes?: string;
}

export interface QuoteLine {
  service_id?: string | null;
  component_type: ServiceType;
  title: string;
  vendor_name?: string | null;
  city?: string | null;
  service_date: string;
  quantity: number;
  units: number;
  unit_price: string;
  total_price: string;
  free_cancellation_days: number;
  cancellation_penalty_pct: number;
}

export interface Quote {
  trip_id: string;
  currency: string;
  items: QuoteLine[];
  subtotal: string;
  total: string;
}

export interface AlternativesQuery {
  service_type: ServiceType;
  city?: string;
  on_date?: string;
  quantity?: number;
  nights?: number;
  max_unit_price?: number;
  exclude_service_id?: string;
  limit?: number;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role?: "user" | "admin";
  phone?: string;
  city?: string;
  country?: string;
  bio?: string;
  additional_info?: string;
  confirm_password?: string;
  travel_preferences?: string[];
  avatar_url?: string;
}

export interface LoginPayload {
  email: string;
  password?: string;
  role?: "user" | "admin";
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ─── Trip ──────────────────────────────────

export type TripStatus = "draft" | "upcoming" | "ongoing" | "completed";

export interface Trip {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  cover_image?: string;
  cover_image_url?: string;
  start_date: string;
  end_date: string;
  budget: number;
  traveller_count: number;
  status: TripStatus;
  is_shared: boolean;
  share_slug?: string;
  clone_count?: number;
  view_count?: number;
  owner?: User;
  cities?: string[];
  stops: TripStop[];
  created_at: string;
  updated_at: string;
}

export interface CreateTripPayload {
  title: string;
  start_date: string;
  end_date: string;
  budget: number;
  traveller_count: number;
}

export interface UpdateTripPayload {
  title?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  traveller_count?: number;
}

// ─── Trip Stop (Destination in a Trip) ─────

export interface TripStop {
  id: string;
  trip_id: string;
  destination_id?: string;
  destination?: Destination;
  city_name?: string;
  country?: string;
  arrival_date: string;
  departure_date: string;
  order: number;
  notes?: string;
  activities: ItineraryActivity[];
  accommodations?: Accommodation[];
}

export interface CreateStopPayload {
  destination_id: string;
  arrival_date: string;
  departure_date: string;
  order: number;
}

// ─── Itinerary Activity ────────────────────

export interface ItineraryActivity {
  id: string;
  stop_id: string;
  activity_id?: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  estimated_cost: number;
  order: number;
  notes?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
}

export interface CreateActivityPayload {
  activity_id?: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  estimated_cost: number;
  order: number;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

// ─── Destination ───────────────────────────

export interface Destination {
  id: string;
  name: string;
  city: string;
  country: string;
  region?: string;
  description?: string;
  image_url?: string;
  latitude?: number;
  longitude?: number;
}

// ─── Activity (from catalog) ───────────────

export interface Activity {
  id: string;
  destination_id: string;
  name?: string;
  title?: string;
  category: string;
  description?: string;
  duration_hours?: number;
  duration_minutes?: number;
  estimated_cost: number | string;
  currency?: string;
  image_url?: string;
  rating?: number | string;
  destination_name?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

// ─── Transport ─────────────────────────────

export type TransportType = "train" | "bus" | "flight" | "car" | "ferry" | "auto" | "other";

export interface Transport {
  id: string;
  trip_id: string;
  origin_stop_id: string;
  destination_stop_id: string;
  transport_type: TransportType;
  departure_time: string;
  arrival_time: string;
  cost: number;
  notes?: string;
}

export interface CreateTransportPayload {
  origin_stop_id: string;
  destination_stop_id: string;
  transport_type: TransportType;
  departure_time: string;
  arrival_time: string;
  cost: number;
  notes?: string;
}

// ─── Accommodation ─────────────────────────

export interface Accommodation {
  id: string;
  stop_id: string;
  name: string;
  check_in: string;
  check_out: string;
  estimated_cost: number;
  booking_url?: string;
  notes?: string;
}

export interface CreateAccommodationPayload {
  name: string;
  check_in: string;
  check_out: string;
  estimated_cost: number;
  booking_url?: string;
  notes?: string;
}

// ─── Expense ───────────────────────────────

export type ExpenseCategory = "food" | "transport" | "accommodation" | "activities" | "shopping" | "miscellaneous";

export interface Expense {
  id: string;
  trip_id: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string;
  notes?: string;
  created_at: string;
}

export interface CreateExpensePayload {
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string;
  notes?: string;
}

// ─── Budget ────────────────────────────────

export interface BudgetSummary {
  total_budget: number;
  estimated_cost: number;
  remaining: number;
  breakdown: BudgetBreakdown;
}

export interface BudgetBreakdown {
  transport: number;
  accommodation: number;
  activities: number;
  meals: number;
  miscellaneous: number;
}

// ─── Calendar ──────────────────────────────

export interface CalendarEvent {
  id: string;
  tripId?: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  city: string;
  type: "activity" | "transport" | "accommodation";
}

export interface CalendarResponse {
  events: CalendarEvent[];
}

// ─── Community ─────────────────────────────

export interface CommunityTrip {
  id: string;
  share_slug: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  budget?: number;
  estimated_cost: number;
  traveller_count: number;
  currency: string;
  cover_image_url?: string;
  stop_count: number;
  activity_count: number;
  cities: string[];
  owner?: {
    id: string;
    first_name: string;
    last_name: string;
    city?: string;
    country?: string;
    avatar_url?: string;
  };
  created_at: string;
}

// ─── Admin ─────────────────────────────────

/**
 * Mirrors `AdminService.dashboard`. The previous flat shape
 * (`total_users`, `recent_users`, `trip_trends`, …) matched nothing the API
 * returns — the admin page was rendering `mockAdminDashboard` instead of
 * ever calling `/admin/dashboard`.
 */
export interface AdminDashboard {
  users: {
    total: number;
    active: number;
    new_last_30_days: number;
  };
  trips: {
    total: number;
    new_last_30_days: number;
    public: number;
    cloned: number;
    by_status: Record<TripStatus, number>;
  };
  content: {
    destinations: number;
    catalog_activities: number;
    trip_stops: number;
    scheduled_activities: number;
  };
  money: {
    /** Money is a string end to end. */
    average_trip_budget: string;
    total_recorded_expenses: string;
  };
}

export interface TripAnalytics {
  trips_per_month: {
    month: string | null;
    count: number;
    average_budget: string;
  }[];
  budget_distribution: { bucket: string; count: number }[];
  average_duration_days: number;
}

export interface DestinationAnalytics {
  most_visited: {
    city_name: string;
    stop_count: number;
    trip_count: number;
  }[];
  never_used: { name: string; country: string }[];
}

export interface ActivityAnalytics {
  by_category: {
    category: string;
    count: number;
    average_cost: string;
  }[];
  most_scheduled: { title: string; count: number }[];
}

// ─── AI Travel Plans (Two Real Options) ─────

export interface AICostBreakdown {
  accommodation: number;
  transport: number;
  activities: number;
  food: number;
  miscellaneous?: number;
}

export interface AIPlanActivity {
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  estimated_cost: number;
  notes?: string;
}

export interface AIPlanStop {
  destination_name: string;
  arrival_date: string;
  departure_date: string;
  activities: AIPlanActivity[];
}

export interface AITravelPlan {
  plan_type: "BUDGET" | "PREMIUM";
  badge: string;
  title: string;
  description: string;
  total_cost: number;
  currency: string;
  duration_days: number;
  cost_breakdown: AICostBreakdown;
  daily_budget: number;
  advantages: string;
  tradeoffs: string;
  why_cheaper?: string;
  why_more?: string;
  stops: AIPlanStop[];
}

export interface AITwoOptionsResponse {
  budget_plan: AITravelPlan;
  premium_plan: AITravelPlan;
}

export interface SelectAIPlanPayload {
  selected_plan: AITravelPlan;
  destination_ids?: string[];
  start_date?: string;
  end_date?: string;
  traveller_count?: number;
}

// ─── Bill Splitting ────────────────────────

/**
 * Mirrors the `split_member_status` PostgreSQL enum. Lowercase because these
 * values cross the wire verbatim; the previous uppercase union was a frontend
 * invention that never matched anything the API sends.
 */
export type SplitMemberStatus = "pending" | "owes" | "paid";
export type BillSplitStatus = "pending" | "settled";
export type SplitMethod = "equal" | "custom";

export interface BillSplitMember {
  id: string;
  user_id?: string | null;
  display_name: string;
  email?: string | null;
  avatar_url?: string | null;
  /** Money is a string end to end -- Numeric(12,2), never a JSON float. */
  share_amount: string;
  status: SplitMemberStatus;
  is_payer: boolean;
  order_index: number;
}

export interface BillSplit {
  id: string;
  trip_id: string;
  trip_title?: string | null;
  created_by_id: string;
  created_by_name?: string | null;
  total_amount: string;
  currency: string;
  member_count: number;
  split_method: SplitMethod;
  is_group: boolean;
  status: BillSplitStatus;
  note?: string | null;
  members: BillSplitMember[];
  settled_amount?: string | null;
  outstanding_amount?: string | null;
  created_at: string;
  updated_at: string;
}

/** One participant as sent when creating a split. */
export interface BillSplitMemberInput {
  user_id?: string;
  display_name?: string;
  email?: string;
  share_amount?: string;
  is_payer?: boolean;
}

export interface CreateBillSplitPayload {
  /** Omit to use the trip's recorded expenses. */
  total_amount?: string;
  split_method?: SplitMethod;
  is_group?: boolean;
  currency?: string;
  note?: string;
  members: BillSplitMemberInput[];
}

/** The trimmed shape `/users/search` returns -- no email, no phone. */
export interface DirectoryUser {
  id: string;
  first_name: string;
  last_name: string;
  city?: string | null;
  country?: string | null;
  avatar_url?: string | null;
}

// ─── Notifications ─────────────────────────

/** Mirrors the `notification_type` PostgreSQL enum. */
export type NotificationType =
  | "bill_split"
  | "bill_split_settled"
  | "trip_reminder"
  | "system";

export interface TripzyyNotification {
  id: string;
  title: string;
  /** Named `body` server-side; this used to be `message`, which never matched. */
  body: string;
  type: NotificationType;
  payload?: Record<string, any> | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Search Params ─────────────────────────

export interface DestinationSearchParams {
  q?: string;
  query?: string;
  city?: string;
  country?: string;
  region?: string;
  page?: number;
  limit?: number;
}

export interface ActivitySearchParams {
  q?: string;
  query?: string;
  city?: string;
  category?: string;
  min_cost?: number;
  max_cost?: number;
  page?: number;
  limit?: number;
}

export interface TripSearchParams {
  status?: TripStatus;
  /** Free-text search across trip title and description. */
  q?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

