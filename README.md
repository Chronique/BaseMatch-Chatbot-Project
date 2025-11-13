Proyek BaseMatch & Chatbot Aman (Hybrid)

Repositori ini berisi dua aplikasi web terpisah yang dibuat:

BaseMatch (React/Firebase): Aplikasi kencan simulasi yang menggunakan React dan Firestore untuk manajemen data.

Chatbot Aman (HTML/CSS/JS): Aplikasi chatbot mandiri yang menerapkan filter keamanan ketat.

1. Aplikasi Chatbot Aman (chatbot.html)

Aplikasi ini berjalan sebagai file HTML mandiri.

Cara Menjalankan:

Cukup buka file chatbot.html langsung di browser Anda (klik dua kali). Tidak diperlukan server web.

2. Aplikasi BaseMatch (React/Firebase)

Aplikasi ini memerlukan setup proyek Node.js/React dasar untuk dijalankan.

Struktur Proyek:

index.html: Titik masuk utama.

src/BaseMatchApp.jsx: Logika dan UI aplikasi React.

package.json: Daftar dependensi.

Cara Menjalankan (Simulasi Setup):

Instalasi Dependensi:
Proyek ini mengasumsikan Anda menggunakan React dan Firebase. Anda perlu menginstal dependensi ini menggunakan npm atau yarn.

npm install react react-dom firebase
# Atau
yarn add react react-dom firebase


Menjalankan Proyek:
Dalam pengembangan nyata, Anda akan menggunakan alat bundler seperti Vite atau Create React App untuk menjalankan proyek.

Jika menggunakan Vite, jalankan:

npm run dev


Catatan Penting Mengenai Firebase:

Aplikasi ini menggunakan variabel global __app_id, __firebase_config, dan __initial_auth_token yang disediakan oleh lingkungan Canvas. Untuk menjalankan di GitHub, Anda harus mengganti bagian-bagian ini di BaseMatchApp.jsx dengan konfigurasi Firebase dan logika autentikasi Anda sendiri, atau menggantinya dengan nilai placeholder statis.

Contoh penggantian di BaseMatchApp.jsx:

// Ganti ini:
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// Menjadi ini (dengan config Anda):
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    // ... konfigurasi lainnya
};
