import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def get_travel_info(location_name: str):
    if not GEMINI_API_KEY:
        print("Warning: GEMINI_API_KEY not set. Skipping travel info search.")
        return {}

    model = genai.GenerativeModel('gemini-2.0-flash-lite')

    prompt = f"""
    Provide travel information for {location_name}.
    I need a structured JSON response with three keys: "hotels", "attractions", and "flights".
    Each key should have a list of 5 items.

    For "hotels", include name, rating (out of 5), a price range (e.g., $, $$, $$$), a valid URL to a real image, and availability (high, medium, or low).
    For "attractions", include name, type (e.g., Museum, Park), a brief description, and a valid URL to a real image.
    For "flights", assume a flight from a major nearby airport to {location_name}. Include airline, estimated price for an economy ticket, and flight duration.

    The JSON structure should be exactly as follows, with no extra text before or after the JSON block:
    {{
      "hotels": [],
      "attractions": [],
      "flights": []
    }}
    """

    try:
        response = model.generate_content(prompt)
        # Clean up the response to extract only the JSON part.
        json_text = response.text.strip().replace('```json', '').replace('```', '')
        return json.loads(json_text)
    except Exception as e:
        print(f"An error occurred while querying Gemini: {e}")
        return {}

