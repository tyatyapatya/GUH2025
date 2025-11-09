// IMPORTANT: Replace with your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

function signInWithGoogle() {
    return auth.signInWithPopup(provider);
}

function signOut() {
    return auth.signOut();
}

function onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
}

function getCurrentUserToken() {
    if (!auth.currentUser) {
        return Promise.resolve(null);
    }
    return auth.currentUser.getIdToken(true);
}
