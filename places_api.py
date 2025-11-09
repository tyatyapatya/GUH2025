import os
import requests
import json
from dotenv import load_dotenv
from math import radians, cos, sin, asin, sqrt

load_dotenv()

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY")
TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

def get_places(city, place_type, location_bias=None):
    """
    Get places of a certain type in a city using the new Places API.
    """
    if not API_KEY:
        raise ValueError("GOOGLE_PLACES_API_KEY environment variable not set.")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.priceLevel,places.photos.name,places.rating,places.location,places.userRatingCount,places.googleMapsUri"
    }

    data = {
        "textQuery": f"{place_type} in {city}"
    }

    if location_bias:
        data["locationBias"] = {
            "circle": {
                "center": {
                    "latitude": location_bias['lat'],
                    "longitude": location_bias['lon']
                },
                "radius": 50000.0  # 50km radius
            }
        }

    response = requests.post(TEXT_SEARCH_URL, json=data, headers=headers)
    
    # Check for errors and print response for debugging if needed
    if response.status_code != 200:
        print(f"Error fetching {place_type} in {city}: {response.status_code}")
        print(response.text)
        response.raise_for_status()
        
    return response.json().get("places", [])

def format_price_level(price_level_enum):
    """Converts the price level enum to a dollar sign string."""
    if not price_level_enum:
        return ""
    
    price_map = {
        "PRICE_LEVEL_FREE": "Free",
        "PRICE_LEVEL_INEXPENSIVE": "$",
        "PRICE_LEVEL_MODERATE": "$$",
        "PRICE_LEVEL_EXPENSIVE": "$$$",
        "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
    }
    return price_map.get(price_level_enum, "")

def get_photo_url(photo_resource_name, max_height=400):
    """Constructs a photo URL from its resource name."""
    if not photo_resource_name:
        return None
    return f"https://places.googleapis.com/v1/{photo_resource_name}/media?maxHeightPx={max_height}&key={API_KEY}"

def get_city_data(city, midpoint=None, reachable_midpoint=None):
    """
    Get hotels and attractions for a given city.
    """
    hotels = get_places(city, "hotel", location_bias=reachable_midpoint)
    attractions = get_places(city, "local tourist attraction", location_bias=reachable_midpoint)

    # The new API can return details in the search result, so we don't need a separate details call.
    hotel_details = []
    for hotel in hotels:
        # Get the first photo's resource name, if available
        photo_name = hotel.get("photos", [{}])[0].get("name")
        
        distance = None
        if midpoint and hotel.get("location"):
            place_loc = hotel["location"]
            distance = haversine_distance(midpoint['lat'], midpoint['lon'], place_loc['latitude'], place_loc['longitude'])

        hotel_details.append({
            "name": hotel.get("displayName"),
            "price": format_price_level(hotel.get("priceLevel")),
            "photo_url": get_photo_url(photo_name),
            "rating": hotel.get("rating"),
            "userRatingCount": hotel.get("userRatingCount"),
            "googleMapsUri": hotel.get("googleMapsUri"),
            "distance_km": distance
        })

    attraction_details = []
    for attraction in attractions:
        photo_name = attraction.get("photos", [{}])[0].get("name")

        distance = None
        if midpoint and attraction.get("location"):
            place_loc = attraction["location"]
            distance = haversine_distance(midpoint['lat'], midpoint['lon'], place_loc['latitude'], place_loc['longitude'])

        attraction_details.append({
            "name": attraction.get("displayName"),
            "photo_url": get_photo_url(photo_name),
            "rating": attraction.get("rating"),
            "userRatingCount": attraction.get("userRatingCount"),
            "googleMapsUri": attraction.get("googleMapsUri"),
            "distance_km": distance
        })

    return json.dumps({
        "city": city,
        "hotels": hotel_details,
        "attractions": attraction_details
    }, indent=4)

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great-circle distance between two points
    on the earth (specified in decimal degrees).
    """
    # convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

    # haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radius of earth in kilometers.
    return c * r

if __name__ == "__main__":
    city_name = "New York"
    # For testing, provide a sample midpoint
    sample_midpoint = {'lat': 40.7128, 'lon': -74.0060}
    data = get_city_data(city_name, sample_midpoint, sample_midpoint)
    print(data)
