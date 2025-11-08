"""
Flask + Flask-SocketIO backend for a "meet halfway" web app.

Features:
- Create and manage sessions (virtual rooms) where users can join.
- Users can add/update their geolocation (latitude, longitude).
- Server computes a live "midpoint" for each session (geographic centroid of participants).
- Real-time updates over WebSockets (Socket.IO). Room-based broadcast.
- In-memory store by default; optional Redis message queue/manager for scaling (commented guidance included).

Run:
1) pip install -r requirements.txt
   Requirements: flask flask-socketio eventlet geopy
   (If using Redis/multiple workers: install redis, flask-socketio[redis])
2) python flask_socket_halfway_backend.py

Socket.IO usage (from browser JS):
  const socket = io("https://yourserver.com");
  socket.emit('join_session', { session_id, user_id, name });
  socket.emit('update_location', { session_id, user_id, lat, lon });
  socket.on('session_update', (data) => { /* contains participants and midpoint */ });

HTTP API (JSON):
- POST /create_session -> { session_id }
- POST /join_session -> { session_id, user_id, name }
- POST /leave_session -> { session_id, user_id }
- POST /update_location -> { session_id, user_id, lat, lon }
- GET  /session/<session_id> -> session data

Note: This is a complete backend example but is intentionally minimal: add auth, rate-limiting,
persistence, and HTTPS for production.
"""

from flask import Flask, request, jsonify, abort, render_template_string
from flask_socketio import SocketIO, join_room, leave_room, emit
from uuid import uuid4
from math import radians, degrees, sin, cos, atan2, sqrt
from typing import Dict, Any
import eventlet

eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'replace-with-a-secure-random-key'
# For production, use message_queue='redis://localhost:6379/0' (or appropriate URL)
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')

# === In-memory store ===
# sessions: session_id -> { 'id', 'name', 'participants': { user_id: {name, lat, lon, ts} }, 'meta': {} }
SESSIONS: Dict[str, Dict[str, Any]] = {}

# Utility: geographic centroid (convert to cartesian unit vectors, average, convert back)
def geographic_centroid(points):
    """
    points: list of (lat_degrees, lon_degrees)
    returns (lat, lon) of centroid on the unit sphere.
    """
    if not points:
        return None
    x = y = z = 0.0
    for lat_deg, lon_deg in points:
        lat = radians(lat_deg)
        lon = radians(lon_deg)
        x += cos(lat) * cos(lon)
        y += cos(lat) * sin(lon)
        z += sin(lat)
    n = len(points)
    x /= n; y /= n; z /= n
    hyp = sqrt(x * x + y * y)
    lon = atan2(y, x)
    lat = atan2(z, hyp)
    return (degrees(lat), degrees(lon))

# Optional: great-circle midpoint between two points
def great_circle_midpoint(a, b):
    (lat1, lon1) = (radians(a[0]), radians(a[1]))
    (lat2, lon2) = (radians(b[0]), radians(b[1]))
    # Convert to Cartesian
    x1, y1, z1 = cos(lat1) * cos(lon1), cos(lat1) * sin(lon1), sin(lat1)
    x2, y2, z2 = cos(lat2) * cos(lon2), cos(lat2) * sin(lon2), sin(lat2)
    x, y, z = x1 + x2, y1 + y2, z1 + z2
    # Normalize
    norm = sqrt(x * x + y * y + z * z)
    x /= norm; y /= norm; z /= norm
    lat = atan2(z, sqrt(x * x + y * y))
    lon = atan2(y, x)
    return (degrees(lat), degrees(lon))

# Helper to compute session midpoint
def compute_session_midpoint(session):
    participants = session.get('participants', {})
    points = []
    for uid, p in participants.items():
        lat = p.get('lat')
        lon = p.get('lon')
        if lat is None or lon is None:
            continue
        points.append((lat, lon))
    if not points:
        return None
    # If exactly 2 participants, return great-circle midpoint (often expected for two people)
    if len(points) == 2:
        return great_circle_midpoint(points[0], points[1])
    # Otherwise return geographic centroid
    return geographic_centroid(points)

# Broadcast helper
def broadcast_session_update(session_id):
    session = SESSIONS.get(session_id)
    if not session:
        return
    midpoint = compute_session_midpoint(session)
    payload = {
        'session_id': session_id,
        'participants': session['participants'],
        'midpoint': {'lat': midpoint[0], 'lon': midpoint[1]} if midpoint else None,
    }
    # Emit to the Socket.IO room
    socketio.emit('session_update', payload, room=session_id)

# === HTTP endpoints ===
@app.route('/')
def index():
    return render_template_string('''
    <!DOCTYPE html>
    <html>
    <head>
    <title>Meet Halfway Test</title>
    <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
    </head>
    <body>
    <h2>Meet Halfway - Demo</h2>
    <div>
    <label>Session ID:</label>
    <input id="session_id" placeholder="leave blank to create" />
    <label>Name:</label>
    <input id="name" placeholder="Your name" />
    <button onclick="joinSession()">Join</button>
    </div>
    <div id="status"></div>
    <pre id="data"></pre>
    <script>
    const socket = io();
    let session_id = null;
    let user_id = null;
    
    
    async function joinSession() {
    const sid = document.getElementById('session_id').value;
    const name = document.getElementById('name').value || 'Anon';
    if (!sid) {
    const res = await fetch('/create_session', {method:'POST'});
    const js = await res.json();
    session_id = js.session_id;
    } else {
    session_id = sid;
    }
    const res2 = await fetch('/join_session', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({session_id, name})
    });
    const js2 = await res2.json();
    user_id = js2.user_id;
    document.getElementById('status').innerText = `Joined session ${session_id}`;
    socket.emit('join_session', {session_id, user_id, name});
    if (navigator.geolocation) {
    navigator.geolocation.watchPosition(pos => {
    const {latitude, longitude} = pos.coords;
    socket.emit('update_location', {session_id, user_id, lat: latitude, lon: longitude});
    });
    }
    }
    
    
    socket.on('session_update', data => {
    document.getElementById('data').innerText = JSON.stringify(data, null, 2);
    });
    </script>
    </body>
    </html>
    ''')

@app.route('/create_session', methods=['POST'])
def create_session():
    data = request.json or {}
    name = data.get('name', 'Room')
    session_id = str(uuid4())
    session = {
        'id': session_id,
        'name': name,
        'participants': {},
        'meta': {}
    }
    SESSIONS[session_id] = session
    return jsonify({'session_id': session_id, 'session': session})

@app.route('/join_session', methods=['POST'])
def join_session():
    data = request.json or {}
    session_id = data.get('session_id')
    name = data.get('name', 'Anonymous')
    user_id = data.get('user_id') or str(uuid4())
    if not session_id or session_id not in SESSIONS:
        abort(404, 'session not found')
    SESSIONS[session_id]['participants'][user_id] = {'name': name, 'lat': None, 'lon': None}
    # After joining, broadcast update
    broadcast_session_update(session_id)
    return jsonify({'session_id': session_id, 'user_id': user_id})

@app.route('/leave_session', methods=['POST'])
def leave_session():
    data = request.json or {}
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    if not session_id or session_id not in SESSIONS:
        abort(404, 'session not found')
    SESSIONS[session_id]['participants'].pop(user_id, None)
    broadcast_session_update(session_id)
    return jsonify({'ok': True})

@app.route('/update_location', methods=['POST'])
def update_location():
    data = request.json or {}
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    lat = data.get('lat')
    lon = data.get('lon')
    if not session_id or session_id not in SESSIONS:
        abort(404, 'session not found')
    if user_id not in SESSIONS[session_id]['participants']:
        abort(404, 'user not in session')
    try:
        lat = float(lat); lon = float(lon)
    except Exception:
        abort(400, 'invalid coordinates')
    SESSIONS[session_id]['participants'][user_id].update({'lat': lat, 'lon': lon})
    broadcast_session_update(session_id)
    return jsonify({'ok': True})

@app.route('/session/<session_id>', methods=['GET'])
def get_session(session_id):
    session = SESSIONS.get(session_id)
    if not session:
        abort(404)
    midpoint = compute_session_midpoint(session)
    resp = {
        'session': session,
        'midpoint': {'lat': midpoint[0], 'lon': midpoint[1]} if midpoint else None,
    }
    return jsonify(resp)

# === Socket.IO events ===
@socketio.on('join_session')
def on_join_session(data):
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    name = data.get('name', 'Anon')
    if not session_id or session_id not in SESSIONS:
        emit('error', {'message': 'session not found'})
        return
    # Add participant if missing
    if user_id not in SESSIONS[session_id]['participants']:
        SESSIONS[session_id]['participants'][user_id] = {'name': name, 'lat': None, 'lon': None}
    join_room(session_id)
    broadcast_session_update(session_id)

@socketio.on('leave_session')
def on_leave_session(data):
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    if session_id in SESSIONS:
        SESSIONS[session_id]['participants'].pop(user_id, None)
    leave_room(session_id)
    broadcast_session_update(session_id)

@socketio.on('update_location')
def on_update_location(data):
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    lat = data.get('lat')
    lon = data.get('lon')
    # validate
    if not session_id or session_id not in SESSIONS:
        emit('error', {'message': 'session not found'})
        return
    if user_id not in SESSIONS[session_id]['participants']:
        emit('error', {'message': 'user not in session'})
        return
    try:
        lat = float(lat); lon = float(lon)
    except Exception:
        emit('error', {'message': 'invalid coordinates'})
        return
    SESSIONS[session_id]['participants'][user_id].update({'lat': lat, 'lon': lon})
    broadcast_session_update(session_id)

# Basic health
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True})

if __name__ == '__main__':
    print('Starting Flask SocketIO server on http://127.0.0.1:5000')
    # eventlet recommended in production for Flask-SocketIO
    socketio.run(app, host='127.0.0.1', port=5000)
