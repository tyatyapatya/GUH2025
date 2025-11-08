from flask import Flask, render_template, jsonify, request, redirect, url_for
from flask_socketio import SocketIO, join_room, leave_room
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-very-secret-key'
socketio = SocketIO(app)

# In-memory storage for lobbies
LOBBIES = {}

def generate_lobby_code(length=8):
    """Generate a unique, random, all-caps alphanumeric code."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if code not in LOBBIES:
            return code

@app.route('/')
def entry():
    """Serves the entry page."""
    return render_template('entry.html')

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


def emit_lobby_update(lobby_code):
    """Calculates midpoint and broadcasts the lobby state."""
    if lobby_code not in LOBBIES:
        return

    lobby = LOBBIES[lobby_code]
    points = list(lobby['points'].values())
    midpoint = calculate_midpoint(points)

    payload = {
        'code': lobby_code,
        'participants': list(lobby['participants'].keys()),
        'points': lobby['points'],
        'midpoint': midpoint
    }
    socketio.emit('lobby_update', payload, room=lobby_code)
    print(f"Sent update for lobby {lobby_code}: {payload}")


def calculate_midpoint(points):
    """
    Calculates the geographic midpoint (centroid) of a list of points.
    Points are dictionaries with 'lat' and 'lon'.
    """
    if not points:
        return None
    if len(points) == 1:
        return points[0]

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


if __name__ == '__main__':
    socketio.run(app, debug=True)