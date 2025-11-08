from flask import Flask, request, jsonify, abort, render_template_string
from flask_socketio import SocketIO, join_room, leave_room, emit
from uuid import uuid4
from math import radians, degrees, sin, cos, atan2, sqrt
import eventlet

eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'replace-with-a-secure-random-key'
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')

SESSIONS = {}

def geographic_centroid(points):
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

def great_circle_midpoint(a, b):
    (lat1, lon1) = (radians(a[0]), radians(a[1]))
    (lat2, lon2) = (radians(b[0]), radians(b[1]))
    x1, y1, z1 = cos(lat1) * cos(lon1), cos(lat1) * sin(lon1), sin(lat1)
    x2, y2, z2 = cos(lat2) * cos(lon2), cos(lat2) * sin(lon2), sin(lat2)
    x, y, z = x1 + x2, y1 + y2, z1 + z2
    norm = sqrt(x * x + y * y + z * z)
    x /= norm; y /= norm; z /= norm
    lat = atan2(z, sqrt(x * x + y * y))
    lon = atan2(y, x)
    return (degrees(lat), degrees(lon))

def compute_session_midpoint(session):
    participants = session.get('participants', {})
    points = [(p['lat'], p['lon']) for p in participants.values() if p.get('lat') is not None and p.get('lon') is not None]
    if not points:
        return None
    if len(points) == 2:
        return great_circle_midpoint(points[0], points[1])
    return geographic_centroid(points)

def broadcast_session_update(session_id):
    session = SESSIONS.get(session_id)
    if not session:
        return
    midpoint = compute_session_midpoint(session)
    payload = {
        'sessions': get_all_sessions_data(),
        'session_id': session_id,
        'participants': session['participants'],
        'midpoint': {'lat': midpoint[0], 'lon': midpoint[1]} if midpoint else None,
    }
    socketio.emit('session_update', payload)

def get_all_sessions_data():
    data = {}
    for sid, session in SESSIONS.items():
        midpoint = compute_session_midpoint(session)
        data[sid] = {
            'id': sid,
            'participants': session['participants'],
            'midpoint': {'lat': midpoint[0], 'lon': midpoint[1]} if midpoint else None
        }
    return data

@app.route('/')
def index():
    return render_template_string('''
<!DOCTYPE html>
<html>
<head>
  <title>Meet Halfway - Dashboard</title>
  <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
  <style>
    body { font-family: Arial; margin: 20px; }
    .flex { display: flex; gap: 20px; }
    .box { border: 1px solid #ccc; padding: 10px; border-radius: 10px; width: 45%; }
    pre { background: #f5f5f5; padding: 10px; }
  </style>
</head>
<body>
  <h1>Meet Halfway - Real-Time Test</h1>
  <div>
    <input id="name" placeholder="Your name" />
    <input id="session_id" placeholder="Session ID (optional)" />
    <button onclick="joinSession()">Create / Join</button>
  </div>
  <p id="status"></p>

  <div class="flex">
    <div class="box">
      <h3>All Sessions</h3>
      <pre id="sessions"></pre>
    </div>
    <div class="box">
      <h3>Current Session Details</h3>
      <pre id="current"></pre>
    </div>
  </div>

  <script>
    const socket = io();
    let session_id = null;
    let user_id = null;

    async function joinSession() {
      const sid = document.getElementById('session_id').value;
      const name = document.getElementById('name').value || 'Anon';
      if (!sid) {
        const res = await fetch('/create_session', {method: 'POST'});
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
      document.getElementById('sessions').innerText = JSON.stringify(data.sessions, null, 2);
      if (data.session_id === session_id)
        document.getElementById('current').innerText = JSON.stringify(data, null, 2);
    });
  </script>
</body>
</html>
''')

@app.route('/create_session', methods=['POST'])
def create_session():
    session_id = str(uuid4())
    SESSIONS[session_id] = {'id': session_id, 'participants': {}}
    return jsonify({'session_id': session_id})

@app.route('/join_session', methods=['POST'])
def join_session():
    data = request.json or {}
    session_id = data.get('session_id')
    name = data.get('name', 'Anonymous')
    user_id = str(uuid4())
    if session_id not in SESSIONS:
        abort(404)
    SESSIONS[session_id]['participants'][user_id] = {'name': name, 'lat': None, 'lon': None}
    broadcast_session_update(session_id)
    return jsonify({'session_id': session_id, 'user_id': user_id})

@socketio.on('join_session')
def on_join(data):
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    join_room(session_id)
    broadcast_session_update(session_id)

@socketio.on('update_location')
def on_location(data):
    session_id = data.get('session_id')
    user_id = data.get('user_id')
    lat, lon = float(data.get('lat')), float(data.get('lon'))
    if session_id in SESSIONS and user_id in SESSIONS[session_id]['participants']:
        SESSIONS[session_id]['participants'][user_id].update({'lat': lat, 'lon': lon})
    broadcast_session_update(session_id)

if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5000)
