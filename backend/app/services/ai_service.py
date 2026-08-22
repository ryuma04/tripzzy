"""AI Service for dynamically generating itineraries using Groq API and structured fallbacks."""

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    pass


class AIService:
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.base_url = settings.GROQ_BASE_URL
        self.model = settings.GROQ_MODEL

        if not self.api_key:
            logger.warning("GROQ_API_KEY is not set. AI Service will use development fallback.")

    def generate_fallback_two_plans(
        self,
        destinations: list[str],
        start_date: str,
        end_date: str,
        budget_tier: str,
        travel_style: str,
        traveller_count: int,
    ) -> dict[str, Any]:
        """Realistic structured fallback plans if external AI API is unreachable."""
        dest_name = destinations[0] if destinations else "Goa"

        # Calculate duration
        try:
            from datetime import date
            d1 = date.fromisoformat(start_date)
            d2 = date.fromisoformat(end_date)
            diff = max(3, (d2 - d1).days)
        except Exception:
            diff = 5

        budget_cost = 24500.0 if diff <= 5 else 32000.0
        premium_cost = 42500.0 if diff <= 5 else 58000.0

        budget_plan = {
            "plan_type": "BUDGET",
            "badge": "💰 BUDGET SMART",
            "title": f"{dest_name} Explorer — Smart Value Backpacking",
            "description": f"Optimized value itinerary for {traveller_count} travellers focusing on verified boutique stays, local transit, and iconic highlights.",
            "total_cost": budget_cost,
            "currency": "INR",
            "duration_days": diff,
            "cost_breakdown": {
                "accommodation": round(budget_cost * 0.35),
                "transport": round(budget_cost * 0.22),
                "activities": round(budget_cost * 0.25),
                "food": round(budget_cost * 0.18),
            },
            "daily_budget": round(budget_cost / diff),
            "advantages": "Maximum sights with minimal spending, authentic regional cafes, scenic trains, and verified homestays.",
            "tradeoffs": "Standard AC local transport and boutique homestays instead of 5-star beachfront resorts.",
            "why_cheaper": f"Saves ₹{int(premium_cost - budget_cost):,} by utilizing verified community homestays, public/shared rentals, and group-pass rates.",
            "stops": [
                {
                    "destination_name": d,
                    "arrival_date": start_date,
                    "departure_date": end_date,
                    "activities": [
                        {
                            "title": f"{d} Heritage Walk & Sunset Viewpoint",
                            "date": start_date,
                            "start_time": "16:00",
                            "end_time": "18:30",
                            "estimated_cost": 350.0,
                            "notes": "Scenic coastal walk with local cutting chai stops.",
                        },
                        {
                            "title": f"Famous {d} Street Food & Bazaars Tour",
                            "date": start_date,
                            "start_time": "19:00",
                            "end_time": "21:30",
                            "estimated_cost": 450.0,
                            "notes": "Curated trail exploring authentic regional street food.",
                        },
                    ],
                }
                for d in (destinations or ["Goa"])
            ],
        }

        premium_plan = {
            "plan_type": "PREMIUM",
            "badge": "✨ PREMIUM EXPERIENCE",
            "title": f"{dest_name} Luxury Retreat & Curated Adventures",
            "description": f"Curated deluxe experience for {traveller_count} travellers featuring 4-star beachside resorts, private dedicated AC transfers, VIP guided tours, and fine dining.",
            "total_cost": premium_cost,
            "currency": "INR",
            "duration_days": diff,
            "cost_breakdown": {
                "accommodation": round(premium_cost * 0.42),
                "transport": round(premium_cost * 0.20),
                "activities": round(premium_cost * 0.22),
                "food": round(premium_cost * 0.16),
            },
            "daily_budget": round(premium_cost / diff),
            "advantages": "Dedicated private AC chauffeur throughout, premium 4-star pool resorts, private boat charter, and curated sunset fine dining.",
            "tradeoffs": "Higher overall budget allocation.",
            "why_more": "Private beachfront villa stays, fast direct transfers, all-inclusive guided adventure passes, and chef-curated tastings.",
            "stops": [
                {
                    "destination_name": d,
                    "arrival_date": start_date,
                    "departure_date": end_date,
                    "activities": [
                        {
                            "title": f"VIP Guided {d} Private Boat & Snorkeling Tour",
                            "date": start_date,
                            "start_time": "08:00",
                            "end_time": "13:00",
                            "estimated_cost": 2800.0,
                            "notes": "Private charter with certified instructors and underwater photography.",
                        },
                        {
                            "title": f"Exclusive Cliffside Sunset Fine-Dining & Wine Tasting",
                            "date": start_date,
                            "start_time": "18:30",
                            "end_time": "21:30",
                            "estimated_cost": 2200.0,
                            "notes": "Reserved oceanfront table with 4-course curated dinner.",
                        },
                    ],
                }
                for d in (destinations or ["Goa"])
            ],
        }

        return {
            "budget_plan": budget_plan,
            "premium_plan": premium_plan,
        }

    async def generate_itinerary(
        self,
        destinations: list[str],
        start_date: str,
        end_date: str,
        budget_tier: str,
        travel_style: str,
        traveller_count: int,
    ) -> dict[str, Any]:
        """Prompt Groq API for single itinerary (backwards compatible)."""
        options = await self.generate_two_itinerary_options(
            destinations, start_date, end_date, budget_tier, travel_style, traveller_count
        )
        # Return budget plan or premium plan according to budget tier
        if budget_tier.lower() in {"luxury", "premium"}:
            return options.get("premium_plan", options.get("budget_plan"))
        return options.get("budget_plan", options.get("premium_plan"))

    async def generate_two_itinerary_options(
        self,
        destinations: list[str],
        start_date: str,
        end_date: str,
        budget_tier: str,
        travel_style: str,
        traveller_count: int,
    ) -> dict[str, Any]:
        """
        Prompt the Groq API to generate EXACTLY TWO DISTINCT travel plans:
        1. budget_plan (Option 1: 💰 BUDGET SMART / BEST VALUE)
        2. premium_plan (Option 2: ✨ PREMIUM EXPERIENCE / BEST EXPERIENCE)
        """
        if not self.api_key:
            logger.info("GROQ_API_KEY not set; using development fallback two-plan generator.")
            return self.generate_fallback_two_plans(
                destinations, start_date, end_date, budget_tier, travel_style, traveller_count
            )

        prompt = f"""
You are an expert travel planner for Tripzyy. Generate EXACTLY TWO DISTINCT travel itineraries in JSON format for the following trip request:
- Destinations: {", ".join(destinations)}
- Travel Dates: {start_date} to {end_date}
- Budget Tier: {budget_tier}
- Travel Style: {travel_style}
- Number of Travellers: {traveller_count}

Plan 1 MUST BE a 'budget_plan' (Option 1: 💰 BUDGET SMART / BEST VALUE) prioritizing affordability with great local stays and sights.
Plan 2 MUST BE a 'premium_plan' (Option 2: ✨ PREMIUM EXPERIENCE / BEST EXPERIENCE) prioritizing higher comfort, 4-star resorts, private transport, and premium adventures.
The premium plan MUST have a higher total_cost than the budget plan.

You MUST respond ONLY with a valid JSON object matching this schema:
{{
  "budget_plan": {{
    "plan_type": "BUDGET",
    "badge": "💰 BUDGET SMART",
    "title": "Catchy budget trip title",
    "description": "Short summary of the budget plan",
    "total_cost": 24500.0,
    "currency": "INR",
    "duration_days": 5,
    "cost_breakdown": {{
      "accommodation": 7000.0,
      "transport": 5000.0,
      "activities": 6500.0,
      "food": 6000.0
    }},
    "daily_budget": 4900.0,
    "advantages": "Main advantages of this budget plan",
    "tradeoffs": "Key trade-offs of this budget plan",
    "why_cheaper": "Why this plan is more affordable",
    "stops": [
      {{
        "destination_name": "{destinations[0] if destinations else 'Goa'}",
        "arrival_date": "{start_date}",
        "departure_date": "{end_date}",
        "activities": [
          {{
            "title": "Activity name",
            "date": "{start_date}",
            "start_time": "10:00",
            "end_time": "13:00",
            "estimated_cost": 400.0,
            "notes": "Short description"
          }}
        ]
      }}
    ]
  }},
  "premium_plan": {{
    "plan_type": "PREMIUM",
    "badge": "✨ PREMIUM EXPERIENCE",
    "title": "Catchy premium trip title",
    "description": "Short summary of the premium plan",
    "total_cost": 42500.0,
    "currency": "INR",
    "duration_days": 5,
    "cost_breakdown": {{
      "accommodation": 16000.0,
      "transport": 8500.0,
      "activities": 10000.0,
      "food": 8000.0
    }},
    "daily_budget": 8500.0,
    "advantages": "Main perks of this luxury plan",
    "tradeoffs": "Higher cost",
    "why_more": "Why this plan offers higher luxury",
    "stops": [
      {{
        "destination_name": "{destinations[0] if destinations else 'Goa'}",
        "arrival_date": "{start_date}",
        "departure_date": "{end_date}",
        "activities": [
          {{
            "title": "Premium activity name",
            "date": "{start_date}",
            "start_time": "09:00",
            "end_time": "13:00",
            "estimated_cost": 2500.0,
            "notes": "VIP description"
          }}
        ]
      }}
    ]
  }}
}}

Requirements:
1. Ensure all arrival_date and departure_date strings are in YYYY-MM-DD format strictly between {start_date} and {end_date}.
2. Ensure activity dates fall strictly within their parent stop dates.
3. Total costs and breakdown values must be realistic numbers in INR.
4. Output strictly valid JSON with no markdown, no think tags, and no conversational text.
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a professional travel planning API that outputs strictly valid JSON objects only containing two distinct plans: budget_plan and premium_plan."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.5,
            "response_format": {"type": "json_object"},
            "max_tokens": 4096
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()
                data = response.json()

                content = data["choices"][0]["message"]["content"].strip()
                content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL)
                if match:
                    content = match.group(1).strip()
                else:
                    start = content.find("{")
                    end = content.rfind("}")
                    if start != -1 and end != -1:
                        content = content[start:end + 1]

                result = json.loads(content)
                if "budget_plan" in result and "premium_plan" in result:
                    return result
                elif "budget_plan" in result:
                    result["premium_plan"] = self.generate_fallback_two_plans(
                        destinations, start_date, end_date, budget_tier, travel_style, traveller_count
                    )["premium_plan"]
                    return result
                else:
                    return self.generate_fallback_two_plans(
                        destinations, start_date, end_date, budget_tier, travel_style, traveller_count
                    )
        except Exception as e:
            logger.warning(f"Groq API call failed: {e}. Falling back to demo AI provider.")
            return self.generate_fallback_two_plans(
                destinations, start_date, end_date, budget_tier, travel_style, traveller_count
            )
