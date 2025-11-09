document.addEventListener('DOMContentLoaded', () => {
    const createLobbyBtn = document.getElementById('createLobbyBtn');
    const joinLobbyBtn = document.getElementById('joinLobbyBtn');
    const modal = document.getElementById('joinLobbyModal');
    const closeButton = document.querySelector('.close-button');
    const joinLobbySubmit = document.getElementById('joinLobbySubmit');
    const lobbyCodeInput = document.getElementById('lobbyCodeInput');

    let currentUser = null;

    onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            console.log("User is signed in:", user.displayName);
        } else {
            console.log("User is signed out.");
        }
    });

    createLobbyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentUser) {
            signInWithGoogle().then(result => {
                currentUser = result.user;
                createLobby();
            }).catch(error => {
                console.error("Google Sign-In failed:", error);
                alert("You must be signed in to create a lobby.");
            });
        } else {
            createLobby();
        }
    });

    function createLobby() {
        fetch('/create_lobby', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            window.location.href = `/planet/${data.code}`;
        })
        .catch(error => {
            console.error('Error creating lobby:', error);
            alert('Could not create a lobby. Please try again.');
        });
    }

    joinLobbyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentUser) {
            signInWithGoogle().then(result => {
                currentUser = result.user;
                modal.style.display = 'block';
            }).catch(error => {
                console.error("Google Sign-In failed:", error);
                alert("You must be signed in to join a lobby.");
            });
        } else {
            modal.style.display = 'block';
        }
    });

    closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    joinLobbySubmit.addEventListener('click', () => {
        const code = lobbyCodeInput.value.toUpperCase();
        if (code.length > 0) {
            window.location.href = `/planet/${code}`;
        } else {
            alert('Please enter a lobby code.');
        }
    });
});
