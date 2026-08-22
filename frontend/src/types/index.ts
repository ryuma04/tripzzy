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
  destination_id: string;
  destination: Destination;
  arrival_date: string;
  departure_date: string;
  order: number;
  activities: ItineraryActivity[];
  accommodations: Accommodation[];
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
  region: string;
  description: string;
  image_url?: string;
  latitude?: number;
  longitude?: number;
}

// ─── Activity (from catalog) ───────────────

export interface Activity {
  id: string;
  destination_id: string;
  name: string;
  category: string;
  description: string;
  duration_hours: number;
  estimated_cost: number;
  image_url?: string;
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
