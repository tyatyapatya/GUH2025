import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

load_dotenv()

def get_suggestions(user_preferences, places_data):
    """
    Given user preferences and a list of places, returns AI-powered suggestions.
    """
    try:
        google_api_key = os.environ.get("GEMINI_API_KEY")
        if not google_api_key:
            return "Error: GEMINI_API_KEY not configured on the server."
        
        genai.configure(api_key=google_api_key)

        # Set up the model
        generation_config = {
            "temperature": 0.9,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }

        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ]

        model = genai.GenerativeModel(model_name="gemini-2.5-flash-lite",
                                      generation_config=generation_config,
                                      safety_settings=safety_settings)

        if not places_data or not any(places_data.values()):
            return "I can't suggest any places right now. Once we have some options, ask me again!"

        # Create a clean, readable list of places for the prompt
        places_list = []
        for category, items in places_data.items():
            if items:
                for item in items:
                    # Defensive check: ensure item is a dictionary before access
                    if isinstance(item, dict) and 'name' in item:
                        places_list.append(f"- {item['name']} ({category})")
                    else:
                        # Log if the structure is not what we expect
                        print(f"Skipping malformed item in '{category}': {item}")
        
        places_string = "\n".join(places_list)

        if not places_string:
            return "I couldn't find any valid places to suggest from. Please try again."

        prompt_parts = [
            "You are a helpful assistant for a group of friends trying to decide where to go.",
            "Your task is to suggest the best places from a given list based on the user's stated preferences.",
            "Do not suggest any places that are not on the provided list.",
            "Be friendly, concise, and explain *why* you are recommending a place.",
            "\n",
            "Here is the list of available places:",
            places_string,
            "\n",
            f"The user's preference is: '{user_preferences}'",
            "\n",
            "Based on this, what are your top 1-3 suggestions? Explain your choices briefly."
        ]

        response = model.generate_content(prompt_parts)
        return response.text

    except Exception as e:
        print(f"An error occurred in get_suggestions: {e}")
        return "Sorry, I encountered a problem while thinking of a suggestion."
