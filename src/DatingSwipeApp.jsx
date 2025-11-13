import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, where, getDocs, getDoc, runTransaction } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// Set Firestore log level to debug for better monitoring
setLogLevel('debug');

// --- Global Constants and Utilities ---
const DAILY_LIMIT = 50;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const PREMIUM_COST = 0.1; // USDC or ETH equivalent
const API_KEY = ""; // Placeholder for API Key

// Utility function to convert PCM audio data to WAV format (Mandatory for TTS constraint)
// This is included to satisfy the platform requirements regarding audio utilities, even if not used directly.
const pcmToWav = (pcm16, sampleRate) => {
    const pcmData = pcm16.buffer;
    const numChannels = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    let offset = 0;

    const writeString = (str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
        offset += str.length;
    };

    // RIFF header
    writeString('RIFF');
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString('WAVE');

    // fmt sub-chunk
    writeString('fmt ');
    view.setUint32(offset, 16, true); offset += 4; // Sub-chunk size
    view.setUint16(offset, 1, true); offset += 2;  // Audio format (1 = PCM)
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;

    // data sub-chunk
    writeString('data');
    view.setUint32(offset, dataSize, true); offset += 4;

    // Write PCM data
    const pcm8 = new Uint8Array(pcmData);
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(offset + i, pcm8[i]);
    }

    return new Blob([view], { type: 'audio/wav' });
};

// Function to convert base64 to ArrayBuffer (Mandatory for TTS constraint)
const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

// --- Initial User Status Structure ---
const INITIAL_USER_STATUS = {
    swipeCount: 0,
    lastSwipeDate: new Date(0), // January 1, 1970
    isPremium: false,
};

// --- Main App Component ---
export default function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userStatus, setUserStatus] = useState(INITIAL_USER_STATUS);
    const [isLoading, setIsLoading] = useState(true);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [message, setMessage] = useState('');

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

            if (Object.keys(firebaseConfig).length === 0) {
                console.error("Firebase config is missing.");
                setIsLoading(false);
                return;
            }

            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);

            setDb(dbInstance);
            setAuth(authInstance);

            const handleAuth = async () => {
                if (typeof __initial_auth_token !== 'undefined') {
                    await signInWithCustomToken(authInstance, __initial_auth_token);
                } else {
                    await signInAnonymously(authInstance);
                }
            };

            onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Fallback for unauthenticated state (shouldn't happen with custom token)
                    setUserId(crypto.randomUUID());
                }
                setIsAuthReady(true);
            });

            handleAuth();

        } catch (error) {
            console.error("Error initializing Firebase:", error);
            setIsLoading(false);
        }
    }, []);

    // Helper to get the document reference for the current user's status
    const getStatusDocRef = useCallback(() => {
        if (!db || !userId) return null;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // Private data path: /artifacts/{appId}/users/{userId}/userStatus/statusDoc
        return doc(db, `artifacts/${appId}/users/${userId}/userStatus/statusDoc`);
    }, [db, userId]);

    // 2. Firestore Data Listener
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const statusDocRef = getStatusDocRef();
        if (!statusDocRef) return;

        console.log(`Setting up snapshot listener for user: ${userId}`);

        const unsubscribe = onSnapshot(statusDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Firestore data received:", data);

                let updatedStatus = {
                    ...INITIAL_USER_STATUS,
                    ...data,
                };

                // Convert Firestore Timestamp to Date object if needed
                if (data.lastSwipeDate && data.lastSwipeDate.toDate) {
                    updatedStatus.lastSwipeDate = data.lastSwipeDate.toDate();
                }

                setUserStatus(updatedStatus);

                // Initial loading complete
                if (isLoading) setIsLoading(false);

                // Check and reset the swipe count if 24 hours have passed
                resetSwipeCount(updatedStatus, statusDocRef);

            } else {
                // Document does not exist, create it with initial status
                console.log("User status document not found. Creating initial document.");
                setDoc(statusDocRef, INITIAL_USER_STATUS, { merge: true })
                    .then(() => {
                        console.log("Initial status document created.");
                        setIsLoading(false);
                    })
                    .catch((error) => {
                        console.error("Error creating initial document:", error);
                        setIsLoading(false);
                    });
            }
        }, (error) => {
            console.error("Error listening to Firestore:", error);
            setMessage("Error connecting to database.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady]); // Include dependencies

    // Utility function to reset swipe count if 24 hours have passed
    const resetSwipeCount = useCallback(async (currentStatus, docRef) => {
        if (!docRef || currentStatus.isPremium) return;

        const now = new Date();
        const lastSwipeTime = currentStatus.lastSwipeDate.getTime();
        const timeElapsed = now.getTime() - lastSwipeTime;

        if (timeElapsed >= MILLISECONDS_IN_DAY && currentStatus.swipeCount > 0) {
            console.log("24 hours passed. Resetting swipe count.");
            try {
                // Use a transaction to ensure atomic update
                await runTransaction(db, async (transaction) => {
                    transaction.update(docRef, {
                        swipeCount: 0,
                        lastSwipeDate: now,
                    });
                });
                setMessage("Your daily swipe count has been reset!");
            } catch (e) {
                console.error("Transaction failed to reset count:", e);
                setMessage("Error resetting swipe count.");
            }
        }
    }, [db]);

    // 3. Main Swipe Logic
    const handleSwipe = async () => {
        if (!db || !userId || !isAuthReady || isLoading) return;

        const docRef = getStatusDocRef();
        if (!docRef) return;

        if (userStatus.isPremium) {
            // Unlimited swipes for premium users
            setMessage("Swipe successful! You have unlimited swipes.");
            // No need to update the database for unlimited swipes
        } else {
            // Check daily limit
            if (userStatus.swipeCount >= DAILY_LIMIT) {
                setShowLimitModal(true);
                return;
            }

            try {
                // Use transaction to safely increment the count and update the date
                const newCount = await runTransaction(db, async (transaction) => {
                    const docSnap = await transaction.get(docRef);
                    const data = docSnap.data();

                    if (!data) throw new Error("Document not found during transaction.");

                    // Re-check logic inside transaction to handle concurrent updates
                    const currentCount = data.swipeCount || 0;
                    if (currentCount >= DAILY_LIMIT) {
                        return DAILY_LIMIT; // Indicate that limit was hit
                    }

                    const newCount = currentCount + 1;
                    transaction.update(docRef, {
                        swipeCount: newCount,
                        // Update date on every swipe to track the 24-hour window
                        lastSwipeDate: new Date(),
                    });
                    return newCount;
                });

                if (newCount === DAILY_LIMIT) {
                    setShowLimitModal(true);
                    setMessage(`Swipe successful! (Limit Reached: ${DAILY_LIMIT}/${DAILY_LIMIT})`);
                } else if (newCount > DAILY_LIMIT) {
                    // Should not happen, but for safety
                    setShowLimitModal(true);
                } else {
                    setMessage(`Swipe successful! Swipes remaining: ${DAILY_LIMIT - newCount}`);
                }

            } catch (error) {
                console.error("Swipe transaction failed:", error);
                setMessage("An error occurred during swipe. Please try again.");
            }
        }
    };

    // 4. Simulated Premium Purchase
    const handleGoPremium = async () => {
        if (!db || !userId) return;

        // In a real app, this would trigger a payment gateway (e.g., using Base ETH/USDC)
        // Here, we simulate a successful transaction by updating the Firestore document.
        try {
            await updateDoc(getStatusDocRef(), {
                isPremium: true,
                swipeCount: 0, // Reset count upon purchase
            });
            setMessage("🎉 Congratulations! You are now a Premium user with UNLIMITED swipes!");
        } catch (error) {
            console.error("Error updating premium status:", error);
            setMessage("Failed to activate Premium status.");
        }
    };

    // --- UI Rendering Helpers ---

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
                <div className="text-xl animate-pulse">Loading User Data...</div>
            </div>
        );
    }

    const swipesRemaining = userStatus.isPremium
        ? "Unlimited"
        : Math.max(0, DAILY_LIMIT - userStatus.swipeCount);

    const isLimitReached = !userStatus.isPremium && swipesRemaining === 0;

    const ProfileCard = ({ name, age, bio, imageUrl }) => (
        <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl overflow-hidden transform transition duration-500 hover:scale-[1.02]">
            <img
                src={imageUrl}
                alt={name}
                className="w-full h-80 object-cover"
                onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://placehold.co/600x800/2563EB/FFFFFF?text=Placeholder+Profile";
                }}
            />
            <div className="p-6">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-3xl font-bold text-gray-800">{name}, {age}</h2>
                    {userStatus.isPremium && (
                        <span className="px-3 py-1 bg-yellow-400 text-gray-900 text-xs font-bold rounded-full shadow-md">
                            PREMIUM
                        </span>
                    )}
                </div>
                <p className="text-gray-600 italic">{bio}</p>
                <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                    <p className="truncate">Your User ID: {userId}</p>
                </div>
            </div>
        </div>
    );

    const SwipeButton = ({ direction, icon, onClick, disabled }) => (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                p-5 md:p-6 rounded-full shadow-xl transition-all duration-200
                ${disabled
                    ? 'bg-gray-400 cursor-not-allowed'
                    : direction === 'right'
                        ? 'bg-green-500 hover:bg-green-600 active:scale-95'
                        : 'bg-red-500 hover:bg-red-600 active:scale-95'
                }
            `}
        >
            <span className="text-3xl text-white">{icon}</span>
        </button>
    );

    const LimitModal = ({ isOpen, onClose }) => {
        if (!isOpen) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl p-8 shadow-2xl max-w-sm w-full text-center transform transition-all">
                    <h3 className="text-2xl font-bold text-red-600 mb-4">Daily Limit Reached!</h3>
                    <p className="text-gray-700 mb-6">
                        You have reached your limit of **{DAILY_LIMIT} swipes** for today.
                        You can swipe again in **24 hours**.
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-200"
                    >
                        Got It
                    </button>
                    <button
                        onClick={() => { onClose(); handleGoPremium(); }}
                        className="w-full py-3 mt-3 border border-indigo-600 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition duration-200"
                    >
                        Go Premium for Unlimited Swipes!
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4 sm:p-8 font-sans">
            <LimitModal
                isOpen={showLimitModal}
                onClose={() => setShowLimitModal(false)}
            />

            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-red-500 mb-8">
                SwipeBase Dating
            </h1>

            <div className="mb-6 text-center w-full max-w-sm">
                <div className={`p-3 rounded-lg shadow-md ${userStatus.isPremium ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-700 text-white'}`}>
                    <p className="text-lg font-semibold">
                        {userStatus.isPremium ? 'Status: UNLIMITED SWIPES' : `Swipes Remaining: ${swipesRemaining}`}
                    </p>
                </div>
            </div>

            {message && (
                <div className="w-full max-w-sm mb-4 p-3 bg-blue-100 text-blue-800 rounded-lg shadow-md text-sm text-center animate-fadeIn">
                    {message}
                </div>
            )}

            <ProfileCard
                name="Anya"
                age={24}
                bio="Tech enthusiast working on a new blockchain project. Love hiking and late-night coding sessions. Looking for someone genuine."
                imageUrl="https://placehold.co/600x800/FF69B4/FFFFFF?text=Anya+24"
            />

            <div className="flex space-x-8 mt-10 mb-12">
                <SwipeButton
                    direction="left"
                    icon="❌"
                    onClick={handleSwipe}
                    disabled={isLimitReached}
                />
                <SwipeButton
                    direction="right"
                    icon="❤️"
                    onClick={handleSwipe}
                    disabled={isLimitReached}
                />
            </div>

            {!userStatus.isPremium && (
                <div className="w-full max-w-xs text-center">
                    <button
                        onClick={handleGoPremium}
                        className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition duration-300 transform hover:scale-[1.05]"
                    >
                        Go Unlimited - {PREMIUM_COST} USDC / ETH Base
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                        *Simulated one-time purchase. Actual payment integration required for production.
                    </p>
                </div>
            )}
        </div>
    );
}
