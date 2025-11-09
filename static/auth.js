// For Firebase JS SDK v9 and later, your web app's Firebase configuration
// TODO: Replace with your own Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDmmBIxTKj-Oocw-yA1DYhLl2n5DxrOcss",
  authDomain: "hackathon-799dc.firebaseapp.com",
  projectId: "hackathon-799dc",
  storageBucket: "hackathon-799dc.firebasestorage.app",
  messagingSenderId: "502160043829",
  appId: "1:502160043829:web:93841883dbc1752f65e67c",
  measurementId: "G-XNEPMRLJHB"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');

// This promise resolves when the authentication state is known.
const onAuthReady = new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
        let userId;
        if (user) {
            // User is signed in.
            userId = user.uid;
            sessionStorage.setItem('userId', userId);
            console.log('User is signed in with uid:', userId);

            if (loginBtn) loginBtn.style.display = 'none';
            if (userInfo) userInfo.style.display = 'block';
            if (userName) userName.textContent = user.displayName;

        } else {
            // User is signed out or a guest.
            userId = sessionStorage.getItem('userId');
            if (!userId || !userId.startsWith('guest_')) {
                userId = 'guest_' + new Date().getTime() + Math.random().toString(36).substring(2, 15);
                sessionStorage.setItem('userId', userId);
            }
            console.log('User is a guest with temporary id:', userId);

            if (loginBtn) loginBtn.style.display = 'block';
            if (userInfo) userInfo.style.display = 'none';
            if (userName) userName.textContent = '';
        }
        resolve(userId); // Resolve the promise with the determined user ID
    });
});


if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      auth.signInWithPopup(provider)
        .then((result) => {
          console.log('User logged in:', result.user);
          // The onAuthStateChanged listener will handle the UI update.
        })
        .catch((error) => {
          console.error('Login failed:', error.message);
        });
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      auth.signOut().then(() => {
        console.log('User signed out');
        // The onAuthStateChanged listener will handle the UI update and guest ID.
      }).catch((error) => {
        console.error('Sign out error:', error);
      });
    });
}
