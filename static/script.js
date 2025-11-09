document.addEventListener('DOMContentLoaded', async () => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    // --- User and Lobby State ---
    let lobbyId = null;
    let userId = null;
    const socket = io();

    // --- Cesium Setup ---
    try {
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjZDA0NjZjNi05ZDlmLTQ5NDUtOTI5ZS05NjkyYWRiNDkwZTkiLCJpZCI6MzU4NDE4LCJpYXQiOjE3NjI2MDY2NTV9.zVeLQskbSywA8kQk1_3hAk-AAVLGup-MdPz7rfJXpjQ';

        const viewer = new Cesium.Viewer('cesiumContainer', {
            imageryProvider: new Cesium.OpenStreetMapImageryProvider({
                url: 'https://a.tile.openstreetmap.org/'
            }),
            infoBox: false,
            selectionIndicator: false,
            shadows: true,
            shouldAnimate: true,
            timeline: false,
            animation: false,
        });

        viewer.scene.globe.enableLighting = false;

        const listener = viewer.scene.globe.tileLoadProgressEvent.addEventListener(function (queueLength) {
            if (queueLength === 0) {
                loadingIndicator.style.display = 'none';
                listener(); // Remove the listener once loading is complete
            }
        });

        let pointEntities = new Map(); // Map userId to entity
        let geometricMidpointEntity = null;
        let reachableMidpointEntity = null;
        let animatedLines = [];

        const quitButton = document.getElementById('quitButton');
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        // --- Socket.IO Integration ---
        lobbyId = window.location.pathname.split('/').pop();

        if (lobbyId) {
            document.getElementById('lobby-code').textContent = lobbyId;
            // Use sessionStorage to ensure a new user ID for each tab/session.
            userId = sessionStorage.getItem(`userId_${lobbyId}`) || crypto.randomUUID();
            sessionStorage.setItem(`userId_${lobbyId}`, userId);

            // Join the lobby
            socket.emit('join_lobby', { code: lobbyId, userId: userId });
        } else {
            console.error('No lobby code found in URL.');
            alert('Could not find lobby. Please create or join one.');
            return;
        }

        socket.on('lobby_update', (data) => {
            console.log('Lobby update received:', data);
            updateGlobe(data.points, data.geometric_midpoint, data.reachable_midpoint, data.participants);
            updateChat(data.messages);
        });

        // --- Chat Box Setup ---
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const chatContainer = document.getElementById('chat-container');
    const chatToggle = document.getElementById('chatToggle');

        sendButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        function sendMessage() {
            const text = chatInput.value.trim();
            if (!text) return;

            socket.emit('chat_message', {
                code: lobbyId,
                name: userId.slice(0, 6), // Shortened anonymous name
                text: text
            });
            chatInput.value = '';
        }

        // Chat hide/show toggle
        if (chatToggle && chatContainer) {
            const setToggleState = (hidden) => {
                // Keep size and position constant; only swap arrow and accessibility labels
                if (hidden) {
                    chatToggle.textContent = '‹'; // show
                    chatToggle.setAttribute('aria-label', 'Show chat');
                    chatToggle.setAttribute('title', 'Show chat');
                    chatToggle.classList.add('collapsed');
                } else {
                    chatToggle.textContent = '›'; // hide
                    chatToggle.setAttribute('aria-label', 'Hide chat');
                    chatToggle.setAttribute('title', 'Hide chat');
                    chatToggle.classList.remove('collapsed');
                }
            };

            // Initialize from sessionStorage (persist per-lobby)
            const hiddenKey = `chatHidden_${lobbyId}`;
            const initialHidden = sessionStorage.getItem(hiddenKey) === '1';
            if (initialHidden) chatContainer.classList.add('hidden');
            setToggleState(initialHidden);

            chatToggle.addEventListener('click', () => {
                const nowHidden = !chatContainer.classList.toggle('hidden');
                // classList.toggle returns true if element now has the class; we want hidden state
                const isHidden = chatContainer.classList.contains('hidden');
                sessionStorage.setItem(hiddenKey, isHidden ? '1' : '0');
                setToggleState(isHidden);
            });
        }

        function updateChat(messages) {
            chatMessages.innerHTML = '';
            if (!messages || messages.length === 0) {
                chatMessages.innerHTML = '<p><em>No messages yet.</em></p>';
                return;
            }

            messages.forEach((msg, index) => {
                const p = document.createElement('p');
                p.innerHTML = `<strong>${msg.name}:</strong> ${msg.text} `;

                const speakBtn = document.createElement('button');
                speakBtn.textContent = '🔊';
                speakBtn.style.marginLeft = '6px';
                speakBtn.addEventListener('click', async () => {
                    try {
                        const res = await fetch('/tts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: msg.text })
                        });

                        if (!res.ok) {
                            console.error('TTS error:', await res.text());
                            return;
                        }

                        const blob = await res.blob();
                        const audioUrl = URL.createObjectURL(blob);
                        const audio = new Audio(audioUrl);
                        audio.play();
                    } catch (err) {
                        console.error('Error playing TTS:', err);
                    }
                });

                p.appendChild(speakBtn);
                chatMessages.appendChild(p);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        socket.on('error', (data) => {
            console.error('Socket error:', data.message);
            alert(`Error: ${data.message}`);
        });

        // --- Globe Interaction ---
        handler.setInputAction((event) => {
            const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                const lat = Cesium.Math.toDegrees(cartographic.latitude);
                const lon = Cesium.Math.toDegrees(cartographic.longitude);

                // Send location update to the server
                socket.emit('add_point', { code: lobbyId, userId: userId, point: { lat, lon } });
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        quitButton.addEventListener('click', () => {
            if (lobbyId && userId) {
                console.log(`User ${userId} leaving lobby ${lobbyId}`);
                socket.emit('leave_lobby', { code: lobbyId, userId: userId });

                // Disconnect from the socket
                socket.disconnect();

                // Clear the stored session for this lobby
                sessionStorage.removeItem(`userId_${lobbyId}`);

                // Optional small delay to let the disconnect propagate
                setTimeout(() => {
                    window.location.href = '/';
                }, 300);
            } else {
                window.location.href = '/';
            }
        });

        // --- Globe Update Logic ---
        function updateGlobe(points, geometricMidpoint, reachableMidpoint, participantIds) {
            // Clear existing entities that are not in the new participants list
            const currentPointIds = Object.keys(points);
            const entitiesToRemove = [];
            pointEntities.forEach((entity, id) => {
                if (!currentPointIds.includes(id)) {
                    entitiesToRemove.push(entity);
                    pointEntities.delete(id);
                }
            });
            entitiesToRemove.forEach(entity => viewer.entities.remove(entity));
            
            // Clear lines and midpoints
            animatedLines.forEach(entity => viewer.entities.remove(entity));
            animatedLines = [];
            if (geometricMidpointEntity) {
                viewer.entities.remove(geometricMidpointEntity);
                geometricMidpointEntity = null;
            }
            if (reachableMidpointEntity) {
                viewer.entities.remove(reachableMidpointEntity);
                reachableMidpointEntity = null;
            }

            // Add/update points for participants
            for (const id in points) {
                const p = points[id];
                if (p.lat !== null && p.lon !== null) {
                    const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat);
                    let entity = pointEntities.get(id);
                    if (entity) {
                        entity.position = position;
                    } else {
                        entity = viewer.entities.add({
                            position: position,
                            point: {
                                pixelSize: 10,
                                color: id === userId ? Cesium.Color.AQUA : Cesium.Color.WHITE,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 2
                            }
                        });
                        pointEntities.set(id, entity);
                    }
                }
            }

            // Add geometric midpoint and lines if it exists
            if (geometricMidpoint && geometricMidpoint.lat !== null && geometricMidpoint.lon !== null) {
                const midpointPosition = Cesium.Cartesian3.fromDegrees(geometricMidpoint.lon, geometricMidpoint.lat);
                geometricMidpointEntity = viewer.entities.add({
                    position: midpointPosition,
                    point: {
                        pixelSize: 12,
                        color: Cesium.Color.ORANGE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2
                    }
                });

                // Draw lines from each participant to the midpoint
                pointEntities.forEach(entity => {
                    animateLine(entity.position.getValue(viewer.clock.currentTime), midpointPosition, viewer, true); // Dotted lines
                });
            }

            // Add reachable midpoint and lines if it exists
            if (reachableMidpoint && reachableMidpoint.lat !== null && reachableMidpoint.lon !== null) {
                const midpointPosition = Cesium.Cartesian3.fromDegrees(reachableMidpoint.lon, reachableMidpoint.lat);
                reachableMidpointEntity = viewer.entities.add({
                    position: midpointPosition,
                    point: {
                        pixelSize: 12,
                        color: Cesium.Color.GOLD,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2
                    },
                    label: {
                        text: reachableMidpoint.name,
                        font: '12pt monospace',
                        outlineWidth: 2,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -9)
                    }
                });

                // Draw lines from each participant to the midpoint
                pointEntities.forEach(entity => {
                    animateLine(entity.position.getValue(viewer.clock.currentTime), midpointPosition, viewer, false); // Filled lines
                });
            }
        }

        function animateLine(startPoint, endPoint, viewer, dotted = false) {
            const duration = 2000; // 2 seconds
            const startTime = Cesium.JulianDate.now();

            const lineEntity = viewer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(() => {
                        const elapsedTime = Cesium.JulianDate.secondsDifference(Cesium.JulianDate.now(), startTime);
                        const t = Math.min(elapsedTime / (duration / 1000), 1.0);
                        
                        const currentPos = Cesium.Cartesian3.lerp(startPoint, endPoint, t, new Cesium.Cartesian3());
                        return [startPoint, currentPos];
                    }, false),
                    width: 3,
                    material: dotted ? new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.RED }) : Cesium.Color.RED,
                    clampToGround: true
                }
            });
            animatedLines.push(lineEntity);
        }

    } catch (error) {
        console.error('Failed to initialize Cesium or connect to lobby:', error);
        loadingIndicator.style.display = 'none';
        alert('There was an error setting up the map. Please try refreshing.');
    }
});

