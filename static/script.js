document.addEventListener('DOMContentLoaded', async () => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    // --- User and Lobby State ---
    let lobbyId = null;
    const socket = io();

    // Wait for authentication to be ready
    const userId = await onAuthReady;

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
            
            // Join the lobby
            socket.emit('join_lobby', { code: lobbyId, userId: userId });
        } else {
            console.error('No lobby code found in URL.');
            alert('Could not find lobby. Please create or join one.');
            return;
        }

        socket.on('lobby_update', (data) => {
            console.log('Lobby update received:', data);
            updateGlobe(data.points, data.geometric_midpoint, data.reachable_midpoint, data.participants, data.animation);
            updateChat(data.messages);
            // Update midpoint title if reachable midpoint name available
            if (data.reachable_midpoint && data.reachable_midpoint.name) {
                const cityEl = document.getElementById('midpoint-city');
                if (cityEl) cityEl.textContent = data.reachable_midpoint.name;
            }
        });

        // --- Chat Box Setup ---
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const chatContainer = document.getElementById('chat-container');
    const chatToggle = document.getElementById('chatToggle');
    const midpointPanel = document.getElementById('midpoint-panel');
    const midpointToggle = document.getElementById('midpointToggle');

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

        // Midpoint panel hide/show toggle
        if (midpointToggle && midpointPanel) {
            const setMidpointToggleState = (hidden) => {
                if (hidden) {
                    midpointToggle.textContent = '›'; // arrow pointing right (show)
                    midpointToggle.setAttribute('aria-label', 'Show midpoint info');
                    midpointToggle.setAttribute('title', 'Show midpoint info');
                } else {
                    midpointToggle.textContent = '‹'; // arrow pointing left (hide)
                    midpointToggle.setAttribute('aria-label', 'Hide midpoint info');
                    midpointToggle.setAttribute('title', 'Hide midpoint info');
                }
            };

            const midHiddenKey = `midHidden_${lobbyId}`;
            const initialMidHidden = sessionStorage.getItem(midHiddenKey) === '1';
            if (initialMidHidden) midpointPanel.classList.add('hidden');
            setMidpointToggleState(initialMidHidden);

            midpointToggle.addEventListener('click', () => {
                midpointPanel.classList.toggle('hidden');
                const isHidden = midpointPanel.classList.contains('hidden');
                sessionStorage.setItem(midHiddenKey, isHidden ? '1' : '0');
                setMidpointToggleState(isHidden);
            });
        }

        // Listen for travel info details to populate midpoint content
        socket.on('travel_info_update', (payload) => {
            const container = document.getElementById('midpoint-content');
            if (!container) return;
            const details = payload.midpoint_details || {};
            const hotels = details.hotels || [];
            const attractions = details.attractions || [];
            const cityName = details.city || '';
            const cityEl = document.getElementById('midpoint-city');
            if (cityEl && cityName) cityEl.textContent = cityName;

            if (hotels.length === 0 && attractions.length === 0) {
                container.innerHTML = '<p style="margin:10px; color:#cbd5e1;"><em>No data found.</em></p>';
                return;
            }

            // Build sections
            const sections = [];
            if (hotels.length) {
                const hotelSection = document.createElement('div');
                hotelSection.className = 'mid-list';
                const title = document.createElement('div');
                title.className = 'mid-section-title';
                title.textContent = 'Hotels';
                hotelSection.appendChild(title);
                hotels.slice(0, 6).forEach(h => hotelSection.appendChild(renderMidCard(h)));
                sections.push(hotelSection);
            }
            if (attractions.length) {
                const attrSection = document.createElement('div');
                attrSection.className = 'mid-list';
                const title = document.createElement('div');
                title.className = 'mid-section-title';
                title.textContent = 'Attractions';
                attrSection.appendChild(title);
                attractions.slice(0, 6).forEach(a => attrSection.appendChild(renderMidCard(a)));
                sections.push(attrSection);
            }

            container.innerHTML = '';
            sections.forEach(s => container.appendChild(s));
        });

        function renderMidCard(item) {
            const card = document.createElement('div');
            card.className = 'mid-card';
            const img = document.createElement('img');
            if (item.photo_url) img.src = item.photo_url; else img.style.opacity = '0.3';
            const meta = document.createElement('div');
            meta.className = 'mid-meta';
            const name = document.createElement('div');
            name.className = 'mid-name';
            name.textContent = item.name || 'Unnamed';
            const sub = document.createElement('div');
            sub.className = 'mid-sub';
            const rating = item.rating ? `⭐ ${item.rating.toFixed(1)}` : 'No rating';
            const distance = item.distance_km ? `${item.distance_km.toFixed(1)} km` : '';
            sub.textContent = [rating, distance].filter(Boolean).join(' · ');
            meta.appendChild(name);
            meta.appendChild(sub);
            if (item.googleMapsUri) {
                name.style.cursor = 'pointer';
                name.addEventListener('click', () => window.open(item.googleMapsUri, '_blank'));
            }
            card.appendChild(img);
            card.appendChild(meta);
            return card;
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

        socket.on('travel_info_update', (data) => {
            console.log('Midpoint details update:', data);
            updateMidpointInfo(data.midpoint_details);
        });

        function updateMidpointInfo(details) {
            const cityElem = document.getElementById('midpoint-city');
            const container = document.getElementById('midpoint-content');

            if (!details || Object.keys(details).length === 0) {
                cityElem.textContent = '–';
                container.innerHTML = '<p><em>No midpoint details available.</em></p>';
                return;
            }

            cityElem.textContent = details.city || 'Unknown';

            const sections = [];

            // --- Helper to build each place card ---
            function createPlaceCard(place) {
                const card = document.createElement('div');
                card.classList.add('place-card');

                const img = document.createElement('img');
                img.src = place.photo_url || 'https://via.placeholder.com/60x60?text=No+Image';
                img.alt = place.name?.text || 'Place';

                const detailsDiv = document.createElement('div');
                detailsDiv.classList.add('place-details');

                const nameEl = document.createElement('div');
                nameEl.classList.add('place-name');
                nameEl.textContent = place.name?.text || 'Unnamed place';

                const ratingEl = document.createElement('div');
                ratingEl.classList.add('place-rating');
                if (place.rating) {
                    ratingEl.textContent = `⭐ ${place.rating} (${place.userRatingCount || 0})`;
                }

                const distanceEl = document.createElement('div');
                distanceEl.classList.add('place-distance');
                if (place.distance_km) {
                    distanceEl.textContent = `${place.distance_km.toFixed(1)} km away`;
                }

                const linkEl = document.createElement('a');
                linkEl.classList.add('place-link');
                linkEl.href = place.googleMapsUri;
                linkEl.target = '_blank';
                linkEl.textContent = 'View on Google Maps';

                detailsDiv.append(nameEl, ratingEl, distanceEl, linkEl);
                card.append(img, detailsDiv);

                return card;
            }

            // --- Build hotels section ---
            if (Array.isArray(details.hotels) && details.hotels.length > 0) {
                const hotelsDiv = document.createElement('div');
                hotelsDiv.classList.add('place-section');

                const header = document.createElement('h4');
                header.textContent = 'Nearby Hotels';
                hotelsDiv.appendChild(header);

                details.hotels.slice(0, 15).forEach(hotel => {
                    hotelsDiv.appendChild(createPlaceCard(hotel));
                });
                sections.push(hotelsDiv);
            }

            // --- Build attractions section ---
            if (Array.isArray(details.attractions) && details.attractions.length > 0) {
                const attractionsDiv = document.createElement('div');
                attractionsDiv.classList.add('place-section');

                const header = document.createElement('h4');
                header.textContent = 'Nearby Attractions';
                attractionsDiv.appendChild(header);

                details.attractions.slice(0, 15).forEach(attraction => {
                    attractionsDiv.appendChild(createPlaceCard(attraction));
                });
                sections.push(attractionsDiv);
            }

            if (sections.length === 0) {
                container.innerHTML = '<p><em>No hotels or attractions found.</em></p>';
            } else {
                container.innerHTML = '';
                sections.forEach(section => container.appendChild(section));
            }
        }

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

                // Do not clear sessionStorage on quit, to persist login state
                // sessionStorage.removeItem(`userId_${lobbyId}`);

                // Optional small delay to let the disconnect propagate
                setTimeout(() => {
                    window.location.href = '/';
                }, 300);
            } else {
                window.location.href = '/';
            }
        });

        // --- Globe Update Logic ---
        function updateGlobe(points, geometricMidpoint, reachableMidpoint, participantIds, animation) {
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
                    animateLine(entity.position.getValue(viewer.clock.currentTime), midpointPosition, viewer, true, animation); // Dotted lines
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
                    animateLine(entity.position.getValue(viewer.clock.currentTime), midpointPosition, viewer, false, animation); // Filled lines
                });
            }
        }

        function animateLine(startPoint, endPoint, viewer, dotted = false, animate = true) {
            const duration = 2000; // 2 seconds
            const startTime = Cesium.JulianDate.now();

            const lineEntity = viewer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(() => {
                        if (!animate) {
                            return [startPoint, endPoint];
                        }
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

