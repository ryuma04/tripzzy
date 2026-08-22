
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
You are an expert travel planner. The user wants a trip with the following details:
- Destinations: {", ".join(destinations)}
- Dates: {start_date} to {end_date}
- Budget Tier: {budget_tier}
- Travel Style / Vibes: {travel_style}
- Number of Travellers: {traveller_count}

Create a realistic itinerary for this trip. You MUST respond with ONLY valid JSON (no markdown formatting, no comments, just the raw JSON object).

The JSON structure must match exactly this schema:
{{
  "title": "A catchy title for the trip",
  "description": "A short summary of the trip",
  "estimated_budget": 1500.00,
  "stops": [
    {{
      "destination_name": "City Name",
      "arrival_date": "YYYY-MM-DD",
      "departure_date": "YYYY-MM-DD",
      "activities": [
        {{
          "title": "Activity name",
          "date": "YYYY-MM-DD",
          "start_time": "HH:MM",
          "end_time": "HH:MM",
          "estimated_cost": 50.0,
          "notes": "Short description of the activity"
        }}
      ]
    }}
  ]
}}

Make sure the dates fit between {start_date} and {end_date}. Provide realistic costs based on the budget tier ({budget_tier}). Ensure the response is valid JSON.
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a helpful travel assistant that outputs raw JSON matching the exact requested schema."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
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
                
                # Sometimes models wrap JSON in markdown block even when instructed not to
                match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if match:
                    content = match.group(1).strip()
                else:
                    # Fallback to finding the first { and last }
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
