import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './BaseMatchApp.jsx';

// Ini adalah langkah penting untuk membuat kode yang sebelumnya hanya satu file
// menjadi komponen yang dapat diimpor dan dirender oleh bundler (Vite).

// Global constants must be defined here or injected via environment variables.
// Since we are running in a local environment, these are mock values.
// NOTE: In a real environment, you would use .env files for production secrets.
const __app_id = "farcaster-base-match-app-v1";
const __firebase_config = JSON.stringify({
  // **PENTING**: Ganti dengan konfigurasi Firebase Anda!
  apiKey: "MOCK_API_KEY",
  authDomain: "MOCK_AUTH_DOMAIN",
  projectId: "MOCK_PROJECT_ID",
  storageBucket: "MOCK_STORAGE_BUCKET",
  messagingSenderId: "MOCK_MESSAGING_SENDER_ID",
  appId: "MOCK_APP_ID"
});
const __initial_auth_token = null; // Token autentikasi awal (kosongkan di dev lokal)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
