/* ==========================================================================
   CollabCal Desktop - Central Firebase Cloud Configuration
   ==========================================================================
   Paste your Firebase project credentials below ONCE.
   Every user / team member who runs the app will automatically connect
   and live-sync with the entire team out-of-the-box!
   ========================================================================== */

const FIREBASE_APP_CONFIG = {
  apiKey: "AIzaSyDXX1iOdNiOx5sHBEqs8QKxtC1uoXh1DWM",
  authDomain: "teamco-27.firebaseapp.com",
  projectId: "teamco-27",
  storageBucket: "teamco-27.firebasestorage.app",
  messagingSenderId: "634467501824",
  appId: "1:634467501824:web:118896126558ec862055e5",

  // Auto-connect on app launch for all users
  autoConnect: true,

  // Automatically upload initial schedule & team roster if cloud database is empty
  autoSeedIfEmpty: false
};

window.FIREBASE_APP_CONFIG = FIREBASE_APP_CONFIG;
