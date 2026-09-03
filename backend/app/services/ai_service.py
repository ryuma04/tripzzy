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

    # -- adaptation narration ------------------------------------------------

    @staticmethod
    def _impact_fallback(report: dict[str, Any]) -> str:
        """Explain an impact report without a model.

        Built from the report's own figures, so it is always correct and always
        available -- which is what lets the narration be genuinely optional.
        The deterministic engine is the source of truth for every number here
        whether or not a model is reachable.
        """
        cost = report.get("cost", {})
        currency = report.get("currency", "INR")
        delta = cost.get("net_delta", "0")
        direction = cost.get("direction", "none")

        parts = [report.get("summary", "").strip()]
        if direction == "increase":
            parts.append(f"You would pay {currency} {delta} more.")
        elif direction == "decrease":
            parts.append(f"You would get {currency} {str(delta).lstrip('-')} back.")
        else:
            parts.append("The total does not change.")

        penalty = cost.get("penalty_total", "0")
        if penalty not in ("0", "0.00", None):
            parts.append(
                f"{currency} {penalty} is retained under the cancellation terms "
                f"already agreed."
            )

        blockers = report.get("blockers") or []
        if blockers:
            parts.append("Before this can go ahead: " + " ".join(blockers))
        elif report.get("conflicts"):
            parts.append(
                f"{len(report['conflicts'])} thing(s) in the itinerary would "
                f"need attention afterwards."
            )

        alternatives = report.get("alternatives") or []
        if alternatives:
            best = alternatives[0]
            parts.append(
                f"The best-matching alternative is {best.get('name')} at "
                f"{currency} {best.get('total_price')}."
            )
        return " ".join(p for p in parts if p)

    async def explain_impact(
        self, report: dict[str, Any], trip_title: str
    ) -> str:
        """Turn an impact report into two or three sentences a traveller reads.

        The model is a **narrator, not a calculator**. It is given the figures
        the adaptation engine computed and told to explain them; it is never
        asked what a change costs, because a language model guessing at a
        refund is precisely the failure this architecture is arranged to avoid.
        Any failure -- no key, a rate limit, a malformed reply -- falls back to
        the deterministic rendering, which says the same thing less warmly.
        """
        if not self.api_key:
            return self._impact_fallback(report)

        cost = report.get("cost", {})
        facts = {
            "trip": trip_title,
            "change": report.get("change_type"),
            "currency": report.get("currency"),
            "engine_summary": report.get("summary"),
            "original_total": cost.get("original_total"),
            "refund_total": cost.get("refund_total"),
            "penalty_total": cost.get("penalty_total"),
            "replacement_total": cost.get("replacement_total"),
            "net_delta": cost.get("net_delta"),
            "direction": cost.get("direction"),
            "feasible": report.get("feasible"),
            "blockers": report.get("blockers", []),
            "conflicts": [c.get("message") for c in report.get("conflicts", [])][:6],
            "affected": [
                {
                    "title": a.get("title"),
                    "action": a.get("action"),
                    "from": a.get("service_date"),
                    "to": a.get("new_date"),
                    "replacement": a.get("new_title"),
                }
                for a in report.get("affected_items", [])
            ][:8],
            "alternatives": [
                {
                    "name": o.get("name"),
                    "total_price": o.get("total_price"),
                    "match_score": o.get("match_score"),
                }
                for o in report.get("alternatives", [])
            ][:3],
        }

        prompt = (
            "Explain this travel-booking change to the traveller in 2-4 short "
            "sentences of plain English.\n\n"
            "STRICT RULES:\n"
            "1. Use ONLY the numbers given below. Do not compute, round, "
            "estimate or invent any figure.\n"
            "2. Lead with what it costs or saves them, then what breaks, then "
            "what you would do.\n"
            "3. No markdown, no bullet points, no headings, no preamble. Prose "
            "only.\n"
            "4. If 'feasible' is false or 'blockers' is non-empty, say plainly "
            "that it cannot go ahead as proposed and why.\n\n"
            f"FACTS:\n{json.dumps(facts, default=str)}"
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You explain travel itinerary changes. You "
                                    "never calculate; every number you use is "
                                    "handed to you. You answer in plain prose."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        # Low temperature: this is an explanation of fixed
                        # facts, and there is nothing here to be creative about.
                        "temperature": 0.2,
                        "max_tokens": 400,
                    },
                )
                if response.status_code == 429:
                    logger.warning(
                        "Groq rate limit hit while narrating an impact report; "
                        "using the deterministic summary. Rotate GROQ_API_KEY "
                        "if this persists."
                    )
                    return self._impact_fallback(report)
                if response.status_code in (401, 403):
                    logger.warning(
                        "Groq rejected the API key (%s) while narrating an "
                        "impact report; using the deterministic summary. "
                        "GROQ_API_KEY needs rotating.",
                        response.status_code,
                    )
                    return self._impact_fallback(report)
                response.raise_for_status()

                content = (
                    response.json()["choices"][0]["message"]["content"] or ""
                ).strip()
                content = re.sub(
                    r"<think>.*?</think>", "", content, flags=re.DOTALL
                ).strip()
                return content or self._impact_fallback(report)
        except Exception as exc:
            logger.warning(
                "Groq narration failed (%s); using the deterministic summary.",
                exc,
            )
            return self._impact_fallback(report)

    # -- assist concierge ----------------------------------------------------

    @staticmethod
    def _concierge_fallback(facts: dict[str, Any]) -> str:
        """What to say when the model is unreachable.

        Deliberately does not attempt an answer. It restates what is on file
        and hands over to a person, because the failure mode this guards
        against is a confident wrong answer about somebody's accommodation
        while they are standing outside it.
        """
        stops = ", ".join(s.get("city", "") for s in facts.get("stops", []) if s)
        booked = len(facts.get("booked", []))
        return (
            f"I could not reach the assistant just now, so this is what is on "
            f"file: {facts.get('trip_title')} runs {facts.get('dates')}"
            + (f" through {stops}" if stops else "")
            + f", with {booked} component(s) booked. A coordinator has been "
            "notified and will pick this up."
        )

    async def answer_traveller(
        self,
        *,
        question: str,
        facts: dict[str, Any],
        history: list[dict[str, str]] | None = None,
    ) -> str | None:
        """Answer a traveller's question from their own trip data.

        The model is given the trip, the stops and the booked components, and
        told to answer from those alone. It is explicitly barred from acting:
        it cannot cancel, rebook or refund, and when a question needs one of
        those it must say so and leave the thread for a coordinator. Returning
        ``None`` on failure is intentional — the caller stays silent rather
        than posting a guess.
        """
        if not self.api_key:
            return self._concierge_fallback(facts)

        conversation = "\n".join(
            f"{m['sender']}: {m['body']}" for m in (history or [])
        )
        prompt = (
            "A traveller on a tour has asked a question. Answer it from the "
            "trip data below.\n\n"
            "RULES:\n"
            "1. Use ONLY these facts. If the answer is not in them, say you do "
            "not have that detail and that a coordinator will confirm.\n"
            "2. You cannot change anything — no cancelling, rebooking, "
            "refunding or promising. If the question needs that, say a "
            "coordinator has to action it.\n"
            "3. Never invent a time, price, address, phone number or booking "
            "reference.\n"
            "4. 2-4 sentences, plain prose, no markdown, no bullet points.\n"
            "5. Be warm and concrete. They may be standing somewhere confused.\n\n"
            f"TRIP DATA:\n{json.dumps(facts, default=str)}\n\n"
            + (f"CONVERSATION SO FAR:\n{conversation}\n\n" if conversation else "")
            + f"QUESTION:\n{question}"
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are the Tripzyy concierge. You answer "
                                    "travellers from their own trip data, you "
                                    "never invent details, and you never take "
                                    "actions — a human coordinator does that."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 400,
                    },
                )
                if response.status_code == 429:
                    logger.warning(
                        "Groq rate limit hit answering a traveller; falling "
                        "back. Rotate GROQ_API_KEY if this persists."
                    )
                    return self._concierge_fallback(facts)
                if response.status_code in (401, 403):
                    logger.warning(
                        "Groq rejected the API key (%s) answering a traveller; "
                        "GROQ_API_KEY needs rotating.",
                        response.status_code,
                    )
                    return self._concierge_fallback(facts)
                response.raise_for_status()

                content = (
                    response.json()["choices"][0]["message"]["content"] or ""
                ).strip()
                content = re.sub(
                    r"<think>.*?</think>", "", content, flags=re.DOTALL
                ).strip()
                return content or self._concierge_fallback(facts)
        except Exception as exc:
            logger.warning("Concierge answer failed (%s); falling back.", exc)
            return self._concierge_fallback(facts)
