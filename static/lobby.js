document.addEventListener('DOMContentLoaded', () => {
    const socket = new WebSocket('ws://localhost:5000/lobby');

    const playersList = document.getElementById('players');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');

    socket.onopen = () => {
        console.log('WebSocket connection established');
        const playerName = prompt('Enter your name:') || 'Anonymous';
        socket.send(JSON.stringify({ type: 'join', name: playerName }));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'player_list') {
            playersList.innerHTML = '';
            data.players.forEach(player => {
                const li = document.createElement('li');
                li.textContent = player;
                playersList.appendChild(li);
            });
        } else if (data.type === 'chat_message') {
            const p = document.createElement('p');
            p.textContent = `${data.name}: ${data.message}`;
            chatMessages.appendChild(p);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    };

    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const message = chatInput.value;
            if (message) {
                socket.send(JSON.stringify({ type: 'chat', message: message }));
                chatInput.value = '';
            }
        }
    });

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    socket.on('lobby_update', (data) => {
        console.log('Lobby update received:', data);
        // Your existing logic to update the lobby
        updateLobbyView(data);
    });

    socket.on('travel_info_update', (data) => {
        console.log('Travel info update received:', data);
        // Logic to update only the travel info part of your UI
        updateTravelDetails(data.midpoint_details);
    });
});
