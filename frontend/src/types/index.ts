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

export type UserRole = "user" | "coordinator" | "operator";

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
  role: UserRole;
  operator_role?: "owner" | "manager" | "coordinator";
  operator_id?: string;
  operator_name?: string;
  /** Mirrors the `user_status` enum; drives user account status. */
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
  /** Penalties kept from cancelled components. Included in `total`. */
  cancellation_fees?: string;
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
  role?: UserRole;
  company_name?: string;
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
  role?: UserRole;
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
  /**
   * Typed as a number but the API sends a **string**: money is
   * `Numeric(12,2)` server-side and the response encoder renders every
   * Decimal as a string so the exact value survives. Coerce with
   * `Number(...)` before doing arithmetic on it or formatting it —
   * `budget.toLocaleString()` on the raw value silently returns the
   * unformatted string.
   */
  budget: number;
  traveller_count: number;
  currency?: string;
  status: TripStatus;
  is_shared: boolean;
  share_slug?: string;
  clone_count?: number;
  view_count?: number;
  owner?: User;
  cities?: string[];
  /**
   * **Only present on the detail endpoint.** `GET /trips` returns
   * `stop_count` instead and omits this entirely, so every list view must
   * guard it. It was previously typed as required, which is exactly why a
   * `trip.stops.length` on the profile page compiled and then crashed.
   */
  stops?: TripStop[];
  transports?: Transport[];
  /** Counts the list endpoint sends in place of the full relations. */
  stop_count?: number;
  activity_count?: number;
  estimated_cost?: string;
  duration_days?: number;
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
  address?: string;
  notes?: string;
  nights?: number;
}

export interface CreateAccommodationPayload {
  name: string;
  check_in: string;
  check_out: string;
  estimated_cost: number;
  booking_url?: string;
  address?: string;
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
  trip_id?: string;
  trip_title?: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  title: string;
  city: string;
  type: "activity" | "transport" | "accommodation" | "stop";
  cost?: number | string;
}

export interface CalendarResponse {
  start: string;
  end: string;
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
  | "system"
  | "change_request"
  | "change_decision"
  | "disruption"
  | "assist_reply"
  | "review_request";

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

// ─── Dynamic tour management ───────────────

export type ChangeRequestType =
  | "date_shift"
  | "replace_component"
  | "cancel_component"
  | "add_component"
  | "party_size";

/**
 * `approved` and `applied` are deliberately distinct: approval is the
 * operator's decision, application is the transaction that moves the money and
 * rewrites the itinerary. `countered` means the operator has offered something
 * else instead of refusing outright.
 */
export type ChangeRequestStatus =
  | "pending"
  | "approved"
  | "countered"
  | "rejected"
  | "applied"
  | "withdrawn";

export type DisruptionType =
  | "weather"
  | "vendor_cancellation"
  | "transport_delay"
  | "closure"
  | "safety"
  | "medical"
  | "other";

export type DisruptionSeverity = "low" | "medium" | "high" | "critical";

export type DisruptionStatus = "open" | "mitigating" | "resolved" | "dismissed";

export type ConflictSeverity = "info" | "warning" | "blocker";

/** One detected problem. `code` is stable; `message` is written for a human. */
export interface ItineraryConflict {
  code: string;
  severity: ConflictSeverity;
  message: string;
  entity?: string | null;
  entity_id?: string | null;
  on_date?: string | null;
  details: Record<string, any>;
}

/**
 * Money is a string throughout, exactly as the API sends it — a Numeric(12,2)
 * through a JS number is how rounding error gets into a refund.
 */
export interface ImpactCost {
  original_total: string;
  refund_total: string;
  penalty_total: string;
  replacement_total: string;
  net_delta: string;
  direction: "increase" | "decrease" | "none";
}

export interface ImpactAffectedItem {
  item_id: string;
  title: string;
  component_type: string;
  service_date: string;
  /** What the engine decided to do: reprice, replace or cancel. */
  action: string;
  original_cost: string;
  refund: string;
  penalty: string;
  replacement_cost: string;
  new_date?: string | null;
  new_service_id?: string | null;
  new_title?: string | null;
  note?: string | null;
}

export interface ImpactAvailability {
  service_id: string;
  name: string;
  on_date: string;
  available: boolean;
  seats_left?: number | null;
  unit_price: string;
  reason?: string | null;
}

/**
 * The deterministic engine's answer. Every figure here traces to a row — a
 * cancellation policy snapshotted at booking, a published price override, a
 * capacity count. The AI narration explains this; it never produces it.
 */
export interface ImpactReport {
  change_type: string;
  currency: string;
  feasible: boolean;
  summary: string;
  cost: ImpactCost;
  affected_items: ImpactAffectedItem[];
  conflicts: ItineraryConflict[];
  availability: ImpactAvailability[];
  alternatives: ComponentAlternative[];
  preference_fit?: {
    score: number;
    reasons: Record<string, number>;
    notes: string[];
  } | null;
  blockers: string[];
  generated_at?: string | null;
}

/** The payload shape varies by change type; the server validates per type. */
export interface ChangeProposal {
  shift_days?: number;
  booking_item_id?: string;
  new_service_id?: string;
  new_date?: string;
  service_id?: string;
  service_date?: string;
  stop_id?: string;
  quantity?: number;
  units?: number;
  traveller_count?: number;
}

export interface AssessChangeResponse {
  trip_id: string;
  impact: ImpactReport;
  ai_summary?: string | null;
}

export interface ChangeRequest {
  id: string;
  trip_id: string;
  trip_title?: string | null;
  booking_id?: string | null;
  booking_item_id?: string | null;
  booking_item_title?: string | null;
  operator_id?: string | null;
  disruption_id?: string | null;
  disruption_title?: string | null;
  requested_by_id: string;
  requested_by_name?: string | null;
  type: ChangeRequestType;
  status: ChangeRequestStatus;
  reason?: string | null;
  proposal: ChangeProposal;
  /** Frozen at submission — what the operator is agreeing to, not a live quote. */
  impact?: ImpactReport | null;
  ai_summary?: string | null;
  net_cost_delta: string;
  currency: string;
  review_note?: string | null;
  decided_at?: string | null;
  applied_at?: string | null;
  applied_result?: {
    summary: string;
    booking_ids: string[];
    cancelled_item_ids: string[];
    created_item_ids: string[];
    refunded: string;
    charged: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface DisruptionAffectedItem {
  item_id: string;
  booking_id: string;
  booking_reference?: string | null;
  traveller_id?: string | null;
  title: string;
  component_type: string;
  service_date: string;
  city?: string | null;
  total_price: string;
  refund_if_cancelled: string;
  penalty_if_cancelled: string;
  recommended_action: "replace" | "review";
  alternatives: ComponentAlternative[];
}

/** The operator's exposure, costed when the incident was raised. */
export interface DisruptionAssessment {
  severity: DisruptionSeverity;
  /** True at high/critical: affected components are unusable, not merely at risk. */
  forcing: boolean;
  items_at_risk: number;
  travellers_affected: number;
  exposure_total: string;
  refundable_total: string;
  replacement_total: string;
  net_if_replaced: string;
  items: DisruptionAffectedItem[];
  assessed_at: string;
}

export interface Disruption {
  id: string;
  operator_id?: string | null;
  trip_id?: string | null;
  booking_id?: string | null;
  service_id?: string | null;
  city?: string | null;
  from_date?: string | null;
  to_date?: string | null;
  type: DisruptionType;
  severity: DisruptionSeverity;
  status: DisruptionStatus;
  title: string;
  description?: string | null;
  assessment?: DisruptionAssessment | null;
  change_request_count: number;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDisruptionPayload {
  type: DisruptionType;
  severity: DisruptionSeverity;
  title: string;
  description?: string;
  city?: string;
  trip_id?: string;
  booking_id?: string;
  service_id?: string;
  from_date?: string;
  to_date?: string;
  notify?: boolean;
}

export interface ConflictCheck {
  trip_id: string;
  conflicts: ItineraryConflict[];
  blockers: number;
  warnings: number;
  notes: number;
}

// ─── Assist & reviews ──────────────────────

export type AssistThreadStatus = "open" | "waiting" | "resolved" | "closed";

/**
 * Who wrote a message. `ai` is a first-class sender, not a flag on a
 * coordinator message — a traveller is entitled to know whether a person
 * answered them, so the UI must always show the difference.
 */
export type AssistSender = "traveller" | "coordinator" | "ai";

export interface AssistMessage {
  id: string;
  sender: AssistSender;
  /** Null for the concierge: there is no account behind an AI message. */
  sender_id?: string | null;
  sender_name?: string | null;
  body: string;
  created_at: string;
}

export interface AssistThread {
  id: string;
  trip_id: string;
  trip_title?: string | null;
  traveller_id: string;
  traveller_name?: string | null;
  booking_id?: string | null;
  operator_id?: string | null;
  assigned_member_id?: string | null;
  assigned_member_name?: string | null;
  subject: string;
  status: AssistThreadStatus;
  message_count: number;
  last_message_at?: string | null;
  resolved_at?: string | null;
  /** Omitted on list endpoints, present on detail. */
  messages?: AssistMessage[];
  created_at: string;
  updated_at: string;
}

export type ReviewSubject = "trip" | "vendor" | "service" | "operator";

export interface Review {
  id: string;
  author_id: string;
  author_name?: string | null;
  author_avatar_url?: string | null;
  subject: ReviewSubject;
  target_id: string;
  trip_id?: string | null;
  vendor_id?: string | null;
  service_id?: string | null;
  operator_id?: string | null;
  booking_id?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
  /** Backed by a booking the author actually travelled on. */
  is_verified: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * `distribution` is carried alongside the average because 4.2 built from
 * fives and ones means something different from 4.2 built entirely from
 * fours, and one number cannot say which.
 */
export interface RatingSummary {
  average?: string | null;
  count: number;
  distribution: Record<string, number>;
}

export interface ReviewPage {
  items: Review[];
  pagination: Pagination;
  summary: RatingSummary;
}

/** Something the traveller went to and has not yet rated. */
export interface ReviewableItem {
  subject: ReviewSubject;
  target_id: string;
  title: string;
  vendor_name?: string | null;
  city?: string | null;
  service_date: string;
  booking_reference?: string | null;
}

// ─── Search Params ─────────────────────────

export interface DestinationSearchParams {
  q?: string;
  query?: string;
  city?: string;
  country?: string;
  region?: string;
  category?: string;
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

