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
});
