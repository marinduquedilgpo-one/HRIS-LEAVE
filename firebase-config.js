// firebase-config.js
const { initializeApp } = require('firebase/app');
const { getDatabase } = require('firebase/database');

// Your Firebase configuration (get this from Firebase console)
const firebaseConfig = {
  apiKey: "AIzaSyAN_qdfURolEyQx-6ZcgsWmSW53FvqoO9s",  // Same config!
  authDomain: "dilg-leave-system-a4de2.firebaseapp.com",
  projectId: "dilg-leave-system-a4de2",
  storageBucket: "dilg-leave-system-a4de2.firebasestorage.app",
  messagingSenderId: "650541375074",
  appId: "1:650541375074:web:8c82759b17342135f0fb3b",
  measurementId: "G-42B40MDHLM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

module.exports = { database };