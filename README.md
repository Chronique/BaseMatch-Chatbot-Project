# BaseMatch & Secure Chatbot Project 

This repository contains two distinct web applications developed as part of a single project:

BaseMatch: A simulation dating application built with React and utilizing Firebase Firestore for data management.

Secure Chatbot: A standalone, simple chatbot application implemented purely with HTML, CSS, and vanilla JavaScript, featuring strict safety filters.

# 1. Secure Chatbot Application (chatbot.html)

This application is designed to run as a single, self-contained HTML file.

# 🚀 How to Run

Locate the File: Find the chatbot.html file in the repository (Note: This file is assumed to exist alongside the React project, as per the description).

Open Directly: Simply double-click on chatbot.html to open it directly in any modern web browser.

No web server is required to run the Chatbot application.

# 2. BaseMatch Application (React/Firebase)

The BaseMatch application requires a standard Node.js/React project setup to be run locally or deployed.

# 📂 Project Structure

| File/Folder | Description |
| index.html | The main entry point for the React application. |
| src/BaseMatchApp.jsx | Contains all the core logic, components, and UI for the BaseMatch app. |
| package.json | Lists all necessary dependencies (React, Firebase, etc.). |

# 🛠️ How to Run (Simulated Setup)

Step 1: Install Dependencies

This project assumes a standard React and Firebase environment. You must install the required libraries using npm or yarn:

```sh
npm install react react-dom firebase
```
or
```sh
yarn add react react-dom firebase
```


# Step 2: Run the Project

In a real-world development environment, you would use a bundler tool like Vite or Create React App to start the local development server.

If using Vite (recommended for modern React projects), run:

```sh
npm run dev
```

# ⚠️ Important Note Regarding Firebase Configuration

The BaseMatch application was initially developed within a specific execution environment (Canvas) which automatically provided Firebase configuration and authentication tokens via global variables: __app_id, __firebase_config, and __initial_auth_token.

To run this application successfully on your local machine or after cloning to GitHub, you MUST replace the dynamic variable references in src/BaseMatchApp.jsx with your own Firebase project credentials and standard authentication logic.

Example of Necessary Replacement in BaseMatchApp.jsx:

Replace the conditional configuration loading (or similar logic):

```sh
// REPLACE THIS (Canvas environment setup):
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

```

With your actual Firebase configuration object:

```sh
// WITH THIS (Your actual Firebase project configuration):
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```





