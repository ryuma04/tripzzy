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
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  travel_style?: string;
  preferred_activities?: string[];
  budget_preference?: "budget" | "moderate" | "luxury";
  default_budget_tier?: string;
  dietary_restrictions?: string[];
  dietary_preferences?: string;
  default_currency?: string;
  notification_preferences?: Record<string, boolean>;
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

export interface AdminDashboard {
  total_users: number;
  total_trips: number;
  total_destinations: number;
  total_activities: number;
  recent_users: User[];
  recent_trips: Trip[];
  trip_trends: { month: string; count: number }[];
  popular_destinations: { name: string; trips: number }[];
  activity_categories: { category: string; count: number }[];
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

export type BillSplitStatus = "PENDING" | "PAID" | "SETTLED" | "OWES";

export interface BillSplitMember {
  id: string;
  user_id?: string;
  name: string;
  email?: string;
  handle?: string;
  avatar_url?: string;
  is_current_user: boolean;
  share_amount: number;
  status: BillSplitStatus;
}

export interface BillSplit {
  id: string;
  trip_id: string;
  trip_title: string;
  total_expense: number;
  member_count: number;
  split_type: "equal" | "custom";
  created_at: string;
  created_by_name: string;
  members: BillSplitMember[];
  status: "PENDING" | "SETTLED";
}

// ─── Notifications ─────────────────────────

export interface TripzyyNotification {
  id: string;
  title: string;
  message: string;
  type: "bill_split" | "trip_update" | "system" | "trip_alert" | "upvote";
  created_at: string;
  read: boolean;
  action_label?: string;
  meta?: Record<string, any>;
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
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

