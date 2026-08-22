// ════════════════════════════════════════════════════════════════
// TRIPZYY — Centralized Development Demo & Seed Data Layer
// Provides realistic sample data for trips, users, expenses, 
// AI travel plans (2 options), bill splits, and notifications.
// ════════════════════════════════════════════════════════════════

import type {
  User,
  Trip,
  Expense,
  Destination,
  AITravelPlan,
  AITwoOptionsResponse,
  BillSplit,
  TripzyyNotification,
} from "@/types";

// ─── Demo Users ───────────────────────────────────────────────

export const DEMO_USERS: User[] = [
  {
    id: "usr_yash",
    first_name: "Yash",
    last_name: "Patil",
    email: "yash.patil@tripzyy.io",
    phone: "+91 98765 43210",
    city: "Mumbai",
    country: "India",
    bio: "Solo explorer & route architect. Exploring coastlines, mountain passes & heritage trails.",
    avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
    role: "user",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-08-20T12:00:00Z",
  },
  {
    id: "usr_rahul",
    first_name: "Rahul",
    last_name: "Sharma",
    email: "rahul.sharma@tripzyy.io",
    phone: "+91 98111 22334",
    city: "Delhi",
    country: "India",
    bio: "Roadtrip enthusiast, photographer, and street food hunter.",
    avatar_url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80",
    role: "user",
    created_at: "2026-02-15T08:30:00Z",
    updated_at: "2026-08-18T10:00:00Z",
  },
  {
    id: "usr_priya",
    first_name: "Priya",
    last_name: "Nair",
    email: "priya.nair@tripzyy.io",
    phone: "+91 98450 33445",
    city: "Bengaluru",
    country: "India",
    bio: "Scuba diver, trekker, and heritage architecture aficionado.",
    avatar_url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80",
    role: "user",
    created_at: "2026-03-01T12:00:00Z",
    updated_at: "2026-08-19T14:20:00Z",
  },
  {
    id: "usr_aman",
    first_name: "Aman",
    last_name: "Gupta",
    email: "aman.gupta@tripzyy.io",
    phone: "+91 97660 55667",
    city: "Pune",
    country: "India",
    bio: "Budget backpacker, hostel enthusiast, and sunset seeker.",
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
    role: "user",
    created_at: "2026-03-12T09:15:00Z",
    updated_at: "2026-08-20T16:00:00Z",
  },
  {
    id: "usr_sneha",
    first_name: "Sneha",
    last_name: "Patel",
    email: "sneha.patel@tripzyy.io",
    phone: "+91 99220 77889",
    city: "Ahmedabad",
    country: "India",
    bio: "Cultural nomad, tea connoisseur & mountain trail lover.",
    avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80",
    role: "user",
    created_at: "2026-04-05T11:45:00Z",
    updated_at: "2026-08-21T09:00:00Z",
  },
  {
    id: "usr_vikram",
    first_name: "Vikram",
    last_name: "Malhotra",
    email: "vikram.m@tripzyy.io",
    phone: "+91 98880 11223",
    city: "Chandigarh",
    country: "India",
    bio: "Himalayan rider, high-altitude camper & camp chef.",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80",
    role: "user",
    created_at: "2026-05-10T14:00:00Z",
    updated_at: "2026-08-22T08:30:00Z",
  },
];

// ─── Demo Trips ───────────────────────────────────────────────

export const DEMO_TRIPS: Trip[] = [
  {
    id: "trip_demo_goa_completed",
    user_id: "usr_yash",
    title: "Goa Coastal Shack & Beach Expedition",
    description: "AI Preference: Best Value | 5-day group adventure with beach shacks, scuba at Grande Island, and sunset forts.",
    start_date: "2026-07-10",
    end_date: "2026-07-15",
    budget: 45000,
    traveller_count: 4,
    status: "completed",
    is_shared: true,
    share_slug: "goa-shack-expedition-2026",
    cover_image_url: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&auto=format&fit=crop&q=80",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-16T18:00:00Z",
    stops: [
      {
        id: "stop_goa_north",
        trip_id: "trip_demo_goa_completed",
        city_name: "North Goa",
        country: "India",
        arrival_date: "2026-07-10",
        departure_date: "2026-07-12",
        order: 1,
        destination: {
          id: "dest_goa_north",
          name: "North Goa",
          city: "Goa",
          country: "India",
          latitude: 15.606,
          longitude: 73.738,
        },
        activities: [
          {
            id: "act_1",
            stop_id: "stop_goa_north",
            title: "Chapora Fort Sunset & Vagator Shack Dinner",
            date: "2026-07-10",
            start_time: "16:30",
            end_time: "20:00",
            estimated_cost: 1200,
            order: 1,
          },
          {
            id: "act_2",
            stop_id: "stop_goa_north",
            title: "Anjuna Flea Market & Beach Stroll",
            date: "2026-07-11",
            start_time: "10:00",
            end_time: "14:00",
            estimated_cost: 800,
            order: 2,
          },
        ],
        accommodations: [
          {
            id: "acc_1",
            stop_id: "stop_goa_north",
            name: "Vagator Cliffside Boutique Resort",
            check_in: "2026-07-10",
            check_out: "2026-07-12",
            estimated_cost: 14000,
          },
        ],
      },
      {
        id: "stop_goa_south",
        trip_id: "trip_demo_goa_completed",
        city_name: "South Goa",
        country: "India",
        arrival_date: "2026-07-13",
        departure_date: "2026-07-15",
        order: 2,
        destination: {
          id: "dest_goa_south",
          name: "South Goa",
          city: "Goa",
          country: "India",
          latitude: 15.299,
          longitude: 74.124,
        },
        activities: [
          {
            id: "act_3",
            stop_id: "stop_goa_south",
            title: "Scuba Diving & Island Trip at Grande Island",
            date: "2026-07-13",
            start_time: "07:30",
            end_time: "13:30",
            estimated_cost: 2800,
            order: 1,
          },
          {
            id: "act_4",
            stop_id: "stop_goa_south",
            title: "Palolem Kayaking & Silent Noise Club",
            date: "2026-07-14",
            start_time: "15:00",
            end_time: "21:00",
            estimated_cost: 1500,
            order: 2,
          },
        ],
        accommodations: [
          {
            id: "acc_2",
            stop_id: "stop_goa_south",
            name: "Palolem Beach Eco Cottages",
            check_in: "2026-07-13",
            check_out: "2026-07-15",
            estimated_cost: 12000,
          },
        ],
      },
    ],
  },
  {
    id: "trip_demo_rajasthan_completed",
    user_id: "usr_yash",
    title: "Royal Rajasthan Circuit: Jaipur → Agra → Delhi",
    description: "AI Preference: Best Value | 6-day cultural circuit covering Hawa Mahal, Amer Fort, Taj Mahal, and Old Delhi heritage.",
    start_date: "2026-06-01",
    end_date: "2026-06-07",
    budget: 35000,
    traveller_count: 3,
    status: "completed",
    is_shared: true,
    share_slug: "rajasthan-heritage-2026",
    cover_image_url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&auto=format&fit=crop&q=80",
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-06-08T12:00:00Z",
    stops: [
      {
        id: "stop_raj_jaipur",
        trip_id: "trip_demo_rajasthan_completed",
        city_name: "Jaipur",
        country: "India",
        arrival_date: "2026-06-01",
        departure_date: "2026-06-03",
        order: 1,
        destination: { id: "dest_jaipur", name: "Jaipur", city: "Jaipur", country: "India", latitude: 26.912, longitude: 75.787 },
        activities: [
          { id: "act_raj_1", stop_id: "stop_raj_jaipur", title: "Amer Fort & Sheesh Mahal Tour", date: "2026-06-02", start_time: "09:00", end_time: "13:00", estimated_cost: 650, order: 1 },
          { id: "act_raj_2", stop_id: "stop_raj_jaipur", title: "Hawa Mahal & Chokhi Dhani Dinner", date: "2026-06-02", start_time: "17:00", end_time: "21:30", estimated_cost: 1100, order: 2 },
        ],
      },
      {
        id: "stop_raj_agra",
        trip_id: "trip_demo_rajasthan_completed",
        city_name: "Agra",
        country: "India",
        arrival_date: "2026-06-04",
        departure_date: "2026-06-05",
        order: 2,
        destination: { id: "dest_agra", name: "Agra", city: "Agra", country: "India", latitude: 27.175, longitude: 78.042 },
        activities: [
          { id: "act_raj_3", stop_id: "stop_raj_agra", title: "Sunrise Taj Mahal & Agra Fort Guided Walk", date: "2026-06-04", start_time: "05:30", end_time: "11:00", estimated_cost: 850, order: 1 },
        ],
      },
    ],
  },
  {
    id: "trip_demo_konkan_ongoing",
    user_id: "usr_yash",
    title: "Konkan to Karnataka Coastal Odyssey: Mumbai → Goa → Gokarna",
    description: "AI Preference: Premium Experience | 8-day coastal roadtrip exploring seafront promenades, underwater diving, and cliff treks.",
    start_date: "2026-09-10",
    end_date: "2026-09-18",
    budget: 42000,
    traveller_count: 2,
    status: "ongoing",
    is_shared: true,
    share_slug: "konkan-odyssey-2026",
    cover_image_url: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?w=800&auto=format&fit=crop&q=80",
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-20T15:30:00Z",
    stops: [
      {
        id: "stop_konkan_mumbai",
        trip_id: "trip_demo_konkan_ongoing",
        city_name: "Mumbai",
        country: "India",
        arrival_date: "2026-09-10",
        departure_date: "2026-09-12",
        order: 1,
        destination: { id: "dest_mumbai", name: "Mumbai", city: "Mumbai", country: "India", latitude: 18.922, longitude: 72.834 },
        activities: [
          { id: "act_k_1", stop_id: "stop_konkan_mumbai", title: "Gateway of India & Colaba Walk", date: "2026-09-10", start_time: "10:00", end_time: "13:00", estimated_cost: 400, order: 1 },
          { id: "act_k_2", stop_id: "stop_konkan_mumbai", title: "Marine Drive Sunset & Street Food", date: "2026-09-10", start_time: "17:00", end_time: "19:30", estimated_cost: 350, order: 2 },
        ],
      },
      {
        id: "stop_konkan_goa",
        trip_id: "trip_demo_konkan_ongoing",
        city_name: "Goa",
        country: "India",
        arrival_date: "2026-09-13",
        departure_date: "2026-09-15",
        order: 2,
        destination: { id: "dest_goa", name: "Goa", city: "Goa", country: "India", latitude: 15.299, longitude: 74.124 },
        activities: [
          { id: "act_k_3", stop_id: "stop_konkan_goa", title: "Scuba Diving at Grande Island", date: "2026-09-13", start_time: "07:30", end_time: "13:30", estimated_cost: 2800, order: 1 },
        ],
      },
      {
        id: "stop_konkan_gokarna",
        trip_id: "trip_demo_konkan_ongoing",
        city_name: "Gokarna",
        country: "India",
        arrival_date: "2026-09-16",
        departure_date: "2026-09-18",
        order: 3,
        destination: { id: "dest_gokarna", name: "Gokarna", city: "Gokarna", country: "India", latitude: 14.547, longitude: 74.318 },
        activities: [
          { id: "act_k_4", stop_id: "stop_konkan_gokarna", title: "5-Beach Cliffside Trek (Kudle to Paradise)", date: "2026-09-16", start_time: "06:30", end_time: "11:30", estimated_cost: 500, order: 1 },
        ],
      },
    ],
  },
];

// ─── Demo Expenses for Completed Trips ────────────────────────

export const DEMO_TRIP_EXPENSES: Record<string, Expense[]> = {
  trip_demo_goa_completed: [
    { id: "exp_1", trip_id: "trip_demo_goa_completed", category: "accommodation", title: "Vagator Boutique Resort & Cottages (2 Nights)", amount: 14000, date: "2026-07-10", created_at: "2026-07-10T12:00:00Z" },
    { id: "exp_2", trip_id: "trip_demo_goa_completed", category: "accommodation", title: "Palolem Beach Eco Cottages (2 Nights)", amount: 12000, date: "2026-07-13", created_at: "2026-07-13T12:00:00Z" },
    { id: "exp_3", trip_id: "trip_demo_goa_completed", category: "transport", title: "Self-drive Thar & Fuel for 5 Days", amount: 6500, date: "2026-07-10", created_at: "2026-07-10T10:00:00Z" },
    { id: "exp_4", trip_id: "trip_demo_goa_completed", category: "activities", title: "PADI Scuba Diving & Island Speedboat", amount: 5600, date: "2026-07-13", created_at: "2026-07-13T14:00:00Z" },
    { id: "exp_5", trip_id: "trip_demo_goa_completed", category: "food", title: "Curlies & Thalassa Group Seafood Dinners", amount: 4800, date: "2026-07-12", created_at: "2026-07-12T22:00:00Z" },
    { id: "exp_6", trip_id: "trip_demo_goa_completed", category: "miscellaneous", title: "Beach Water Sports & Entry Fees", amount: 1100, date: "2026-07-14", created_at: "2026-07-14T17:00:00Z" },
  ],
  trip_demo_rajasthan_completed: [
    { id: "exp_r1", trip_id: "trip_demo_rajasthan_completed", category: "transport", title: "Shatabdi Express Tickets & Cabs", amount: 8500, date: "2026-06-01", created_at: "2026-06-01T08:00:00Z" },
    { id: "exp_r2", trip_id: "trip_demo_rajasthan_completed", category: "accommodation", title: "Jaipur Haveli Heritage Stay (3 Nights)", amount: 13500, date: "2026-06-01", created_at: "2026-06-01T14:00:00Z" },
    { id: "exp_r3", trip_id: "trip_demo_rajasthan_completed", category: "activities", title: "Taj Mahal, Amer Fort & Guide Charges", amount: 4500, date: "2026-06-03", created_at: "2026-06-03T16:00:00Z" },
    { id: "exp_r4", trip_id: "trip_demo_rajasthan_completed", category: "food", title: "Rajasthani Thali & Street Food Dinners", amount: 6000, date: "2026-06-04", created_at: "2026-06-04T20:00:00Z" },
  ],
  trip_demo_konkan_ongoing: [
    { id: "exp_k1", trip_id: "trip_demo_konkan_ongoing", category: "transport", title: "Tejas Express Train Mumbai → Goa", amount: 3200, date: "2026-09-10", created_at: "2026-09-10T06:00:00Z" },
    { id: "exp_k2", trip_id: "trip_demo_konkan_ongoing", category: "accommodation", title: "Colaba Heritage Hotel", amount: 7200, date: "2026-09-10", created_at: "2026-09-10T11:00:00Z" },
    { id: "exp_k3", trip_id: "trip_demo_konkan_ongoing", category: "food", title: "Leopold Cafe & Colaba Dinners", amount: 2400, date: "2026-09-11", created_at: "2026-09-11T21:00:00Z" },
  ],
};

// ─── Demo AI Plans (Two Real Options) ─────────────────────────

export function getDemoAIPlans(
  destinations: string[] = ["Goa"],
  startDate: string = "2026-10-12",
  endDate: string = "2026-10-17",
  travellers: number = 4,
  userBudget: number = 40000
): AITwoOptionsResponse {
  const destName = destinations[0] || "Goa";
  const startYear = startDate ? new Date(startDate) : new Date("2026-10-12");
  const endYear = endDate ? new Date(endDate) : new Date("2026-10-17");
  const diffDays = Math.max(
    3,
    Math.ceil((endYear.getTime() - startYear.getTime()) / (1000 * 60 * 60 * 24)) || 5
  );

  const budgetTotal = Math.round((userBudget * 0.65) / 100) * 100 || 24500;
  const premiumTotal = Math.round((userBudget * 1.15) / 100) * 100 || 42500;

  const budgetPlan: AITravelPlan = {
    plan_type: "BUDGET",
    badge: "💰 BUDGET SMART",
    title: `${destName} Explorer — Smart Value Backpacking`,
    description: `A high-experience, low-cost itinerary designed for ${travellers} travellers optimizing verified boutique stays, local transit, and iconic highlights.`,
    total_cost: budgetTotal,
    currency: "INR",
    duration_days: diffDays,
    cost_breakdown: {
      accommodation: Math.round(budgetTotal * 0.35),
      transport: Math.round(budgetTotal * 0.22),
      activities: Math.round(budgetTotal * 0.25),
      food: Math.round(budgetTotal * 0.18),
    },
    daily_budget: Math.round(budgetTotal / diffDays),
    advantages: "Maximum sights with minimal spending, authentic local cafes, scenic regional train connections, and verified boutique homestays.",
    tradeoffs: "Standard local AC cabs and verified boutique homestays instead of 5-star beachfront resorts.",
    why_cheaper: "Saves ₹" + (premiumTotal - budgetTotal).toLocaleString("en-IN") + " by utilizing community-recommended local shacks, scooter/public rentals, and group-rate activity passes.",
    stops: destinations.map((d, idx) => ({
      destination_name: d,
      arrival_date: startDate,
      departure_date: endDate,
      activities: [
        {
          title: `${d} Heritage Walk & Sunset Viewpoint`,
          date: startDate,
          start_time: "16:00",
          end_time: "18:30",
          estimated_cost: 350,
          notes: "Self-guided walk with scenic photo stops and local cutting chai.",
        },
        {
          title: `Famous ${d} Street Food & Market Tour`,
          date: startDate,
          start_time: "19:00",
          end_time: "21:30",
          estimated_cost: 450,
          notes: "Curated trail exploring authentic regional street delicacies.",
        },
      ],
    })),
  };

  const premiumPlan: AITravelPlan = {
    plan_type: "PREMIUM",
    badge: "✨ PREMIUM EXPERIENCE",
    title: `${destName} Luxury Retreat & Curated Adventures`,
    description: `A curated deluxe experience for ${travellers} travellers featuring 4-star luxury beachside resorts, private dedicated AC transfers, VIP guided tours, and fine-dining experiences.`,
    total_cost: premiumTotal,
    currency: "INR",
    duration_days: diffDays,
    cost_breakdown: {
      accommodation: Math.round(premiumTotal * 0.42),
      transport: Math.round(premiumTotal * 0.20),
      activities: Math.round(premiumTotal * 0.22),
      food: Math.round(premiumTotal * 0.16),
    },
    daily_budget: Math.round(premiumTotal / diffDays),
    advantages: "Dedicated private AC chauffeur throughout, premium 4-star sea-facing pool resorts, private scuba diving boat, and curated sunset dining.",
    tradeoffs: "Higher overall budget allocation.",
    why_more: "Elevates comfort with private beachfront villa stays, fast direct private transport, all-inclusive guided adventure tickets, and rooftop chef tastings.",
    stops: destinations.map((d, idx) => ({
      destination_name: d,
      arrival_date: startDate,
      departure_date: endDate,
      activities: [
        {
          title: `VIP Guided ${d} Private Boat & Snorkeling Tour`,
          date: startDate,
          start_time: "08:00",
          end_time: "13:00",
          estimated_cost: 2800,
          notes: "Private boat charter with certified instructors, refreshments, and underwater photography.",
        },
        {
          title: `Exclusive Cliffside Sunset Fine-Dining & Wine Tasting`,
          date: startDate,
          start_time: "18:30",
          end_time: "21:30",
          estimated_cost: 2200,
          notes: "Reserved oceanfront table with 4-course curated dinner.",
        },
      ],
    })),
  };

  return {
    budget_plan: budgetPlan,
    premium_plan: premiumPlan,
  };
}

// ─── Demo Bill Splits ─────────────────────────────────────────

export const DEMO_BILL_SPLITS: BillSplit[] = [
  {
    id: "split_goa_01",
    trip_id: "trip_demo_goa_completed",
    trip_title: "Goa Coastal Shack & Beach Expedition",
    total_expense: 40000,
    member_count: 4,
    split_type: "equal",
    created_at: "2026-07-16T10:00:00Z",
    created_by_name: "Yash Patil",
    status: "SETTLED",
    members: [
      { id: "m_1", user_id: "usr_yash", name: "You (Yash)", handle: "@yash", is_current_user: true, share_amount: 10000, status: "SETTLED", avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80" },
      { id: "m_2", user_id: "usr_rahul", name: "Rahul Sharma", handle: "@rahul", is_current_user: false, share_amount: 10000, status: "SETTLED", avatar_url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80" },
      { id: "m_3", user_id: "usr_priya", name: "Priya Nair", handle: "@priya", is_current_user: false, share_amount: 10000, status: "SETTLED", avatar_url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80" },
      { id: "m_4", user_id: "usr_aman", name: "Aman Gupta", handle: "@aman", is_current_user: false, share_amount: 10000, status: "SETTLED", avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80" },
    ],
  },
];

// ─── Demo Notifications ───────────────────────────────────────

export const DEMO_NOTIFICATIONS: TripzyyNotification[] = [
  {
    id: "notif_1",
    title: "Bill Split Settled: Goa Coastal Shack",
    message: "Rahul, Priya, and Aman completed their ₹10,000 shares for Goa Coastal Shack Expedition.",
    type: "bill_split",
    created_at: "2026-07-16T12:00:00Z",
    read: false,
    meta: { trip_id: "trip_demo_goa_completed", split_id: "split_goa_01" },
  },
  {
    id: "notif_2",
    title: "AI Itinerary Ready: Mumbai → Goa → Gokarna",
    message: "Your AI Co-Pilot generated 2 tailored travel plans (Best Value & Premium).",
    type: "trip_update",
    created_at: "2026-08-01T10:05:00Z",
    read: true,
  },
];

// ─── Helper Functions & Local Storage Persistence ─────────────

const BILL_SPLIT_STORAGE_KEY = "tripzyy_demo_bill_splits";
const NOTIFICATIONS_STORAGE_KEY = "tripzyy_demo_notifications";

export function getSavedBillSplits(): BillSplit[] {
  if (typeof window === "undefined") return DEMO_BILL_SPLITS;
  try {
    const raw = localStorage.getItem(BILL_SPLIT_STORAGE_KEY);
    if (!raw) return DEMO_BILL_SPLITS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEMO_BILL_SPLITS;
  } catch {
    return DEMO_BILL_SPLITS;
  }
}

export function saveBillSplit(split: BillSplit): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getSavedBillSplits();
    const updated = [split, ...existing.filter((s) => s.id !== split.id)];
    localStorage.setItem(BILL_SPLIT_STORAGE_KEY, JSON.stringify(updated));

    // Also trigger in-app notification for the group
    const newNotif: TripzyyNotification = {
      id: `notif_${Date.now()}`,
      title: `Bill Split Created: ${split.trip_title}`,
      message: `Total: ₹${split.total_expense.toLocaleString("en-IN")} divided among ${split.member_count} members (₹${Math.round(split.total_expense / split.member_count).toLocaleString("en-IN")} each).`,
      type: "bill_split",
      created_at: new Date().toISOString(),
      read: false,
      meta: { trip_id: split.trip_id, split_id: split.id },
    };
    addNotification(newNotif);
  } catch (err) {
    console.error("[Tripzyy Dev] Failed to save bill split:", err);
  }
}

export function getNotifications(): TripzyyNotification[] {
  if (typeof window === "undefined") return DEMO_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return DEMO_NOTIFICATIONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEMO_NOTIFICATIONS;
  } catch {
    return DEMO_NOTIFICATIONS;
  }
}

export function addNotification(notif: TripzyyNotification): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getNotifications();
    const updated = [notif, ...existing.filter((n) => n.id !== notif.id)];
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("[Tripzyy Dev] Failed to add notification:", err);
  }
}

export function searchDemoUsers(query: string): User[] {
  if (!query.trim()) return DEMO_USERS;
  const q = query.toLowerCase().replace("@", "").trim();
  return DEMO_USERS.filter(
    (u) =>
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
  );
}

export const DEMO_DESTINATIONS: Destination[] = [
  {
    id: "dest_goa",
    name: "Goa",
    city: "Goa",
    country: "India",
    region: "West Coast",
    description: "Sun-kissed beaches, coastal cuisine, Portuguese architecture, and vibrant sunset shack culture.",
    image_url: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&auto=format&fit=crop&q=80",
    latitude: 15.2993,
    longitude: 74.124,
  },
  {
    id: "dest_jaipur",
    name: "Jaipur",
    city: "Jaipur",
    country: "India",
    region: "Rajasthan",
    description: "The historic Pink City with royal hilltop forts, intricate palaces, and bustling bazaars.",
    image_url: "https://images.unsplash.com/photo-1477587458883-47145ed94245?w=800&auto=format&fit=crop&q=80",
    latitude: 26.9124,
    longitude: 75.7873,
  },
  {
    id: "dest_agra",
    name: "Agra",
    city: "Agra",
    country: "India",
    region: "Uttar Pradesh",
    description: "Home to the majestic Taj Mahal and the red sandstone fortress of Agra Fort.",
    image_url: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&auto=format&fit=crop&q=80",
    latitude: 27.1767,
    longitude: 78.0081,
  },
  {
    id: "dest_gokarna",
    name: "Gokarna",
    city: "Gokarna",
    country: "India",
    region: "Karnataka",
    description: "Pristine secluded beaches, cliff treks, and tranquil Arabian Sea horizons.",
    image_url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80",
    latitude: 14.5479,
    longitude: 74.3188,
  },
  {
    id: "dest_kochi",
    name: "Kochi",
    city: "Kochi",
    country: "India",
    region: "Kerala",
    description: "Chinese fishing nets, spice markets, colonial architecture, and backwater harbors.",
    image_url: "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&auto=format&fit=crop&q=80",
    latitude: 9.9312,
    longitude: 76.2673,
  },
  {
    id: "dest_munnar",
    name: "Munnar",
    city: "Munnar",
    country: "India",
    region: "Kerala",
    description: "Rolling emerald tea plantations, mist-covered Western Ghats hills, and waterfalls.",
    image_url: "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?w=800&auto=format&fit=crop&q=80",
    latitude: 10.0889,
    longitude: 77.0595,
  },
];

