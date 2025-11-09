import math
from flask import Flask, render_template, jsonify, request, redirect, url_for
from flask_socketio import SocketIO, join_room, leave_room
import random
import string
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from places_api import get_city_data

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a-very-secret-key')
socketio = SocketIO(app)

# In-memory storage for lobbies
LOBBIES = {}
ARCHIVE_DIR = "archived_lobbies"
os.makedirs(ARCHIVE_DIR, exist_ok=True)

def generate_lobby_code(length=8):
    """Generate a unique, random, all-caps alphanumeric code."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if code not in LOBBIES:
            return code

@app.route('/')
def index():
    """Serves the entry page."""
    return render_template('index.html')

@app.route('/lobby')
def lobby():
    return render_template('lobby.html')

@app.route('/planet/<lobby_code>')
def planet(lobby_code):
    """Serves the planet/lobby page."""
    if lobby_code not in LOBBIES:
        # Redirect to home page if lobby doesn't exist
        return redirect(url_for('entry'))
    return render_template('planet.html', lobby_code=lobby_code)

@app.route('/create_lobby', methods=['POST'])
def create_lobby():
    """Creates a new lobby and returns the code."""
    lobby_code = generate_lobby_code()
    LOBBIES[lobby_code] = {
        'participants': {},
        'points': {}
    }
    print(f"Lobby created: {lobby_code}. Current lobbies: {list(LOBBIES.keys())}")
    return jsonify({'code': lobby_code})

@socketio.on('join_lobby')
def on_join(data):
    """Handles a user joining a lobby."""
    lobby_code = data.get('code')
    user_id = data.get('userId')

    if not lobby_code or not user_id:
        print("Join failed: Missing lobby_code or userId")
        return

    if lobby_code not in LOBBIES:
        print(f"Join failed: Lobby {lobby_code} not found.")
        # Optionally, emit an error back to the client
        return

    join_room(lobby_code)
    # Store the session ID to identify the user upon disconnect
    LOBBIES[lobby_code]['participants'][user_id] = {'id': user_id, 'sid': request.sid}
    
    print(f"User {user_id} joined lobby {lobby_code}")

    # Notify everyone in the lobby about the current state
    emit_lobby_update(lobby_code)

@socketio.on('add_point')
def on_add_point(data):
    """Handles a user adding or updating a point."""
    lobby_code = data.get('code')
    user_id = data.get('userId')
    point = data.get('point')

    if lobby_code in LOBBIES and user_id in LOBBIES[lobby_code]['participants']:
        LOBBIES[lobby_code]['points'][user_id] = point
        print(f"Point added in lobby {lobby_code} by {user_id}: {point}")
        emit_lobby_update(lobby_code)

@socketio.on('disconnect')
def on_disconnect():
    """Handles a user disconnecting."""
    disconnected_user_sid = request.sid
    for lobby_code, lobby in LOBBIES.items():
        # Find the user associated with the disconnected session
        user_id_to_update = None
        for user_id, user_info in lobby['participants'].items():
            if user_info.get('sid') == disconnected_user_sid:
                user_id_to_update = user_id
                break

        if user_id_to_update:
            # Instead of removing the user, we can just note the disconnection
            # or handle it more gracefully, e.g., by setting them as 'inactive'.
            # For a refresh, they will rejoin immediately with a new SID.
            # A more complex system might involve a timeout to fully remove inactive users.
            print(f"User {user_id_to_update} with SID {disconnected_user_sid} disconnected from lobby {lobby_code}. Their point will be preserved.")
            # We don't remove the point, allowing for seamless reconnection on refresh.
            # We can remove the sid to keep participant data clean
            if 'sid' in lobby['participants'][user_id_to_update]:
                 lobby['participants'][user_id_to_update]['sid'] = None
            
            # We can still emit an update if we want the UI to reflect the change in active participants
            emit_lobby_update(lobby_code)
            break


def get_places_data_async(lobby_code, city_name, midpoint, reachable_midpoint):
    """Background task to fetch travel info and emit an update."""
    with app.app_context():
        data = get_city_data(city_name, midpoint, reachable_midpoint)
        if data:
            print(f"Data for {city_name}: {data}")
            # get_city_data returns a JSON string, so we parse it.
            socketio.emit('travel_info_update', {'midpoint_details': json.loads(data)}, room=lobby_code)
            print(f"Sent travel info update for lobby {lobby_code}")


def emit_lobby_update(lobby_code):
    """Calculates midpoint and broadcasts the lobby state."""
    if lobby_code not in LOBBIES:
        return

    lobby = LOBBIES[lobby_code]
    points = list(lobby['points'].values())
    
    geometric_midpoint, reachable_midpoint = None, None

    if len(points) >= 2:
        geometric_midpoint = calculate_midpoint(points)
        reachable_midpoint = find_closest_town(geometric_midpoint)

    # Send initial payload without blocking
    payload = {
        'code': lobby_code,
        'participants': list(lobby['participants'].keys()),
        'points': lobby['points'],
        'geometric_midpoint': geometric_midpoint,
        'reachable_midpoint': reachable_midpoint,
        'midpoint_details': {},  # Initially empty
        'messages': lobby.get('messages', [])
    }
    socketio.emit('lobby_update', payload, room=lobby_code)
    print(f"Sent initial update for lobby {lobby_code}")

    # If a midpoint is found, start the background task for the heavy lifting
    if reachable_midpoint and geometric_midpoint:
        socketio.start_background_task(
            get_places_data_async, lobby_code, reachable_midpoint['name'], geometric_midpoint, reachable_midpoint
        )

import requests

def find_closest_town(midpoint):
    lat = midpoint['lat']
    lon = midpoint['lon']

    url = "http://getnearbycities.geobytes.com/GetNearbyCities"
    params = {
        'latitude': lat,
        'longitude': lon,
        'radius': 100000,         
        'limit': 1            
    }

    try:
        resp = requests.get(url, params=params, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None

        # Data is an array of arrays; pick first
        first = data[0]
        # According to spec:
        # [0] = bearing
        # [1] = city name
        # [2] = region/state code
        # [3] = country name
        # [4] = direction
        # [5] = nautical miles
        # [6] = internet country code
        # [7] = kilometres
        # [8] = latitude
        # [9] = geobytes location code
        # [10] = longitude
        # [11] = miles
        # [12] = region or state name
        city_name = first[1]
        country = first[3]
        lat2 = first[8]
        lon2 = first[10]
        return {
            'lat': lat2,
            'lon': lon2,
            'name': f"{city_name}, {country}"
        }

    except Exception as e:
        print(f"Geobytes lookup failed at {lat},{lon}: {e}")
        return None

def calculate_midpoint(points):
    """
    Calculates the geographic midpoint (centroid) of a list of points.
    Points are dictionaries with 'lat' and 'lon'.
    """

    from math import radians, degrees, sin, cos, atan2, sqrt
    
    x, y, z = 0.0, 0.0, 0.0
    
    for p in points:
        lat = radians(p['lat'])
        lon = radians(p['lon'])
        x += cos(lat) * cos(lon)
        y += cos(lat) * sin(lon)
        z += sin(lat)
        
    num_points = len(points)
    x /= num_points
    y /= num_points
    z /= num_points
    
    lon = atan2(y, x)
    hyp = sqrt(x * x + y * y)
    lat = atan2(z, hyp)
    
    return {'lat': degrees(lat), 'lon': degrees(lon)}


def save_lobby_to_file(lobby_code):
    """Saves a lobby's state to a JSON file and removes it from memory."""
    if lobby_code not in LOBBIES:
        print(f"Cannot save: Lobby {lobby_code} not found.")
        return False

    lobby_data = LOBBIES[lobby_code]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{ARCHIVE_DIR}/{lobby_code}_{timestamp}.json"

    try:
        with open(filename, "w") as f:
            json.dump(lobby_data, f, indent=2)
        print(f"Lobby {lobby_code} archived as {filename}")
        del LOBBIES[lobby_code]  # remove from active memory
        return True
    except Exception as e:
        print(f"Error saving lobby {lobby_code}: {e}")
        return False


def load_archived_lobby(lobby_code):
    """Loads an archived lobby from a JSON file into active memory."""
    # find the most recent archive for this code
    files = [f for f in os.listdir(ARCHIVE_DIR) if f.startswith(lobby_code)]
    if not files:
        print(f"No archived sessions found for lobby {lobby_code}")
        return False

    latest_file = max(files, key=lambda f: os.path.getmtime(os.path.join(ARCHIVE_DIR, f)))
    filepath = os.path.join(ARCHIVE_DIR, latest_file)

    try:
        with open(filepath, "r") as f:
            lobby_data = json.load(f)
        LOBBIES[lobby_code] = lobby_data
        print(f"Lobby {lobby_code} restored from {filepath}")
        return True
    except Exception as e:
        print(f"Error loading lobby {lobby_code}: {e}")
        return False
    
@socketio.on('chat_message')
def on_chat(data):
    lobby_code = data.get('code')
    name = data.get('name', 'Anon')
    text = data.get('text', '').strip()
    if not text:
        return
    if lobby_code not in LOBBIES:
        return
    message = {'name': name, 'text': text}
    LOBBIES[lobby_code].setdefault('messages', []).append(message)
    emit_lobby_update(lobby_code)


@app.route('/debug')
def api_debug():
    return render_template('api_debug.html')


if __name__ == '__main__':
    socketio.run(app, debug=True)