
"""AI Service for dynamically generating itineraries using Groq API."""

import json
import logging
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
            logger.warning("GROQ_API_KEY is not set. AI Service will fail.")

    async def generate_itinerary(
        self,
        destinations: list[str],
        start_date: str,
        end_date: str,
        budget_tier: str,
        travel_style: str,
        traveller_count: int,
    ) -> dict[str, Any]:
        """
        Prompt the Groq API to generate a structured itinerary.
        """
        if not self.api_key:
            raise AIServiceError("Groq API key is missing. Please configure it in .env.")

        prompt = f"""
You are an expert travel planner. Create a structured travel itinerary in JSON format for the following trip request:
- Destinations: {", ".join(destinations)}
- Travel Dates: {start_date} to {end_date}
- Budget Tier: {budget_tier}
- Travel Style / Vibes: {travel_style}
- Number of Travellers: {traveller_count}

You MUST respond ONLY with a valid JSON object matching this schema:
{{
  "title": "A catchy title for the trip",
  "description": "A short summary of the trip",
  "estimated_budget": 25000.00,
  "stops": [
    {{
      "destination_name": "{destinations[0] if destinations else 'Destination'}",
      "arrival_date": "{start_date}",
      "departure_date": "{end_date}",
      "activities": [
        {{
          "title": "Activity name",
          "date": "{start_date}",
          "start_time": "10:00",
          "end_time": "13:00",
          "estimated_cost": 500.0,
          "notes": "Short description of the activity"
        }}
      ]
    }}
  ]
}}

Requirements:
1. Ensure all stop arrival_date and departure_date strings are in YYYY-MM-DD format and fall strictly between {start_date} and {end_date}.
2. Ensure every activity date falls strictly within its parent stop's arrival and departure dates.
3. Provide realistic INR estimated_cost for activities and estimated_budget.
4. Output strictly valid JSON with no markdown, no thinking blocks, and no commentary.
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a professional travel planning API that outputs strictly valid JSON objects only."},
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
                
                content = data["choices"][0]["message"]["content"]
                
                content = content.strip()
                
                # Strip out thinking process tags (e.g. <think>...</think>) if returned by reasoning models
                import re
                content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
                match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if match:
                    content = match.group(1).strip()
                else:
                    start = content.find('{')
                    end = content.rfind('}')
                    if start != -1 and end != -1:
                        content = content[start:end+1]
                    
                result = json.loads(content)
                return result
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Groq API HTTP error: {e} - Response: {e.response.text}")
            raise AIServiceError("Failed to communicate with the AI provider.")
        except httpx.RequestError as e:
            logger.error(f"Groq API Request error: {e}")
            raise AIServiceError("Failed to communicate with the AI provider.")
        except json.JSONDecodeError as e:
            logger.error(f"Groq API returned invalid JSON: {content} - {e}")
            raise AIServiceError("AI returned an invalid response format.")
        except Exception as e:
            logger.error(f"Unexpected error in AI service: {e}")
            raise AIServiceError("An unexpected error occurred during AI generation.")
