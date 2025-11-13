import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Send, User, MessageSquare, Heart, Settings, Loader, Users, Zap, Search, Check, X } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, addDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

// Utility function for exponential backoff retry (Essential for API calls)
const fetchWithRetry = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } catch (error) {
            if (i === retries - 1) {
                console.error("Fetch failed after all retries:", error);
                throw error;
            }
            const delay = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Global variables for Firebase configuration (provided by environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? initialAuthToken : null;

// Helper to construct Firestore collection reference using FID
const getUserCollectionRef = (db, fid, collectionName) => {
    // Path structure: artifacts/{appId}/users/{fid}/{collectionName}
    return collection(db, "artifacts", appId, "users", fid, collectionName);
};

// Helper to construct the document reference for the user's own profile/settings
const getUserProfileDocRef = (db, fid) => {
    return doc(db, "artifacts", appId, "users", fid, 'settings', 'user_profile');
};

// --- Component 1: Chat Input Area (Highly Memoized) ---
const ChatInputArea = React.memo(({ chatInput, setChatInput, handleSendMessage, userName }) => {
    
    // Handler for sending the message
    const handleSend = () => {
        if (chatInput.trim()) {
            handleSendMessage();
        }
    };
    
    // Handler for the Enter key
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex items-center space-x-3">
                <input
                    type="text"
                    // Uses the stable chatInput prop (passed from App state)
                    value={chatInput} 
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={`Type a message to ${userName}...`}
                    className="flex-1 p-3 border border-gray-300 rounded-full focus:ring-pink-500 focus:border-pink-500 transition duration-150"
                />
                <button 
                    onClick={handleSend}
                    disabled={!chatInput.trim()}
                    className="p-3 bg-pink-500 text-white rounded-full shadow-lg hover:bg-pink-600 disabled:opacity-50 transition duration-150"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
});


// --- Component 2: Chat Window (Isolated for Stability) ---
const ChatWindow = React.memo(({ selectedChat, selectedChatId, chatInput, setChatInputStable, handleSendMessage, setSelectedChatId, db, fid }) => {
    if (!selectedChat) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500">
                <p className="text-lg font-medium">Select a conversation to start chatting.</p>
            </div>
        );
    }
    
    // Safety check just in case props are null despite the outer check
    if (!selectedChat.messages) selectedChat.messages = [];

    return (
        <div className="w-full md:w-2/3 flex flex-col h-full bg-gray-50">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 bg-white shadow-sm flex items-center">
                <button onClick={() => setSelectedChatId(null)} className="md:hidden p-1 mr-2 text-gray-500 hover:text-gray-800">
                    <span className="sr-only">Back to Chat List</span>
                    &larr;
                </button>
                <h3 className="text-xl font-semibold text-gray-800">{selectedChat.user}</h3>
            </div>

            {/* Messages Area */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar">
                {selectedChat.messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-2xl shadow-md ${
                            msg.sender === 'me' 
                                ? 'bg-pink-500 text-white rounded-br-none' 
                                : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                        }`}>
                            <p>{msg.text}</p>
                        </div>
                    </div>
                ))}
                {/* Optional: Add a smooth scroll to bottom here in a useEffect */}
            </div>

            {/* Input Area using the separated component */}
            <ChatInputArea 
                chatInput={chatInput} 
                setChatInput={setChatInputStable} 
                handleSendMessage={handleSendMessage}
                userName={selectedChat.user} 
            />
        </div>
    );
});


// --- Main App Component ---
export default function App() {
    const [activeTab, setActiveTab] = useState('match'); 
    const [profiles, setProfiles] = useState([]); 
    const [chats, setChats] = useState([]);
    const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
    const [selectedChatId, setSelectedChatId] = useState(null);
    
    // CHAT INPUT STATE
    const [chatInput, setChatInput] = useState(''); 
    // REF TO TRACK THE CURRENT INPUT VALUE WITHOUT RECREATING THE SEND FUNCTION
    const chatInputRef = useRef(''); 
    
    const [chatbotQuery, setChatbotQuery] = useState('');
    const [chatbotResponse, setChatbotResponse] = useState('');
    const [isChatbotLoading, setIsChatbotLoading] = useState(false);

    // Profile Setup State
    const [isProfileSetupNeeded, setIsProfileSetupNeeded] = useState(true); 
    const [userProfile, setUserProfile] = useState(null); 

    // Match Modal State
    const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
    const [matchedUserName, setMatchedUserName] = useState('');
    const [newChatId, setNewChatId] = useState(null);

    // Firebase State
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [fid, setFid] = useState(null); 
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Constants for API access
    const apiKey = "";
    const geminiFlashApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        setLogLevel('debug'); // Enable Firestore logging

        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing. Using mock data fallback.");
            setIsAuthReady(true);
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestore);
        setAuth(firebaseAuth);

        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) {
                setFid(user.uid); 
            } else {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                    } else {
                        await signInAnonymously(firebaseAuth);
                    }
                } catch (error) {
                    console.error("Firebase Sign-in Error:", error);
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    // Helper function for stable setting of chat input
    // This ensures that when the input changes, the ref is also updated.
    const setChatInputStable = useCallback((newValue) => {
        setChatInput(newValue);
        chatInputRef.current = newValue;
    }, []);

    // --- Firestore Data Fetching: User Profile & Matches ---
    useEffect(() => {
        if (!isAuthReady || !db || !fid) return;

        // 1. Fetch User's OWN Profile
        const profileDocRef = getUserProfileDocRef(db, fid);
        const userProfileUnsub = onSnapshot(profileDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const profileData = docSnap.data();
                setUserProfile(profileData);
                setIsProfileSetupNeeded(false); 
            } else {
                setIsProfileSetupNeeded(true); 
                setUserProfile(null);
            }
        }, (error) => {
            console.error("Error fetching user profile:", error.message);
            setIsProfileSetupNeeded(true); 
        });

        // 2. Fetch Profiles for Matching 
        let profilesUnsub = () => {};
        if (!isProfileSetupNeeded) {
            const profilesRef = getUserCollectionRef(db, fid, 'profiles');
            profilesUnsub = onSnapshot(profilesRef, (snapshot) => {
                const fetchedProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // If no mock profiles exist, create them for demonstration
                if (fetchedProfiles.length === 0) {
                    const initialMockProfiles = [
                        { name: "Alexander R.", age: 28, bio: "Software Engineer. Loves hiking and coffee. Looking for genuine connection.", tags: ["Tech", "Coffee", "Hiking"], imageUrl: "https://placehold.co/100x100/A1C4FD/ffffff?text=Alex", gender: "Male" },
                        { name: "Samantha L.", age: 25, bio: "Freelance Designer. Passionate about art and indie films.", tags: ["Art", "Film", "Creative"], imageUrl: "https://placehold.co/100x100/FFC9C9/ffffff?text=Sam", gender: "Female" },
                        { name: "Michael B.", age: 31, bio: "Data Scientist. Guitar player and dog owner.", tags: ["Data", "Music", "Dogs"], imageUrl: "https://placehold.co/100x100/B2F0C1/ffffff?text=Mike", gender: "Male" },
                    ];
                    initialMockProfiles.forEach((profile, index) => {
                        const profileDocRef = doc(profilesRef, `profile_${index}`);
                        setDoc(profileDocRef, {...profile, fid: 1000 + index}, { merge: true }).catch(e => console.error("Error creating mock profile:", e));
                    });
                }
                setProfiles(fetchedProfiles);
            }, (error) => {
                console.error("Error fetching match profiles:", error.message);
            });
        }
        
        // 3. Fetch Chats
        const chatsRef = getUserCollectionRef(db, fid, 'chats');
        const chatsUnsub = onSnapshot(chatsRef, (snapshot) => {
            const fetchedChats = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                messages: doc.data().messages || [] 
            }));
            setChats(fetchedChats);
        }, (error) => {
            console.error("Error fetching chats:", error.message);
        });

        return () => {
            userProfileUnsub();
            profilesUnsub();
            chatsUnsub();
        };
    }, [isAuthReady, db, fid, isProfileSetupNeeded]); 

    // Current displayed profile
    const currentProfile = profiles.length > 0 ? profiles[currentProfileIndex % profiles.length] : null;
    // Selected chat data
    const selectedChat = useMemo(() => chats.find(c => c.id === selectedChatId), [chats, selectedChatId]);

    // Handle 'Like' action (stable)
    const handleLike = useCallback(() => {
        if (!currentProfile || !db || !fid) return;
        
        const newChatId = `chat_${currentProfile.id}`;
        const chatsRef = getUserCollectionRef(db, fid, 'chats');
        const chatDocRef = doc(chatsRef, newChatId);
        
        // Simulate match and create chat entry
        setDoc(chatDocRef, {
            user: currentProfile.name,
            profileId: currentProfile.id,
            lastActive: serverTimestamp(),
            messages: [{ sender: 'system', text: `You matched with ${currentProfile.name}! Say hi to start chatting.` }]
        }, { merge: true })
        .then(() => {
            // Show pop-up modal after chat is created
            setMatchedUserName(currentProfile.name);
            setNewChatId(newChatId);
            setIsMatchModalOpen(true);
        })
        .catch(e => console.error("Error creating mock chat:", e));

        // Move to the next profile
        setCurrentProfileIndex(prev => (prev + 1) % profiles.length);
    }, [currentProfile, profiles.length, db, fid, profiles]);

    // Handle 'Pass' action (stable)
    const handlePass = useCallback(() => {
        setCurrentProfileIndex(prev => (prev + 1) % profiles.length);
    }, [profiles.length]);

    // Function to close the modal and navigate to chat (stable)
    const handleGoToChat = useCallback(() => {
        setIsMatchModalOpen(false);
        setActiveTab('chat');
        if (newChatId) {
            setSelectedChatId(newChatId);
        }
    }, [newChatId]);

    // Function to close the modal and stay on match (stable)
    const handleStayOnMatch = useCallback(() => {
        setIsMatchModalOpen(false);
        setNewChatId(null);
        setMatchedUserName('');
    }, []);


    // Handle sending a message - DOES NOT HAVE chatInput AS A DEPENDENCY
    const handleSendMessage = useCallback(async () => {
        // Get the latest value from the Ref, NOT from the state closure
        const messageText = chatInputRef.current.trim(); 
        
        // Safety checks: check required variables for the function
        if (!messageText || !selectedChatId || !db || !fid) {
             console.error("Cannot send message: Missing message text, chat ID, or Firebase connection.");
             return;
        }

        const newMessage = { sender: 'me', text: messageText, timestamp: new Date().toISOString() };
        
        const chatsRef = getUserCollectionRef(db, fid, 'chats');
        const chatDocRef = doc(chatsRef, selectedChatId);

        try {
            const chatSnapshot = await getDoc(chatDocRef);
            if (chatSnapshot.exists()) {
                const currentMessages = chatSnapshot.data().messages || [];
                // Update Firestore document with new message
                await setDoc(chatDocRef, { 
                    messages: [...currentMessages, newMessage],
                    lastActive: serverTimestamp() 
                }, { merge: true });
                
                // Clear the input using the stable setter
                setChatInputStable(''); 
            } else {
                console.error("Chat document not found:", selectedChatId);
            }
        } catch (error) {
            console.error("Error sending message to Firestore:", error);
        }
    }, [selectedChatId, db, fid, setChatInputStable]); // chatInput removed from dependencies!

    // --- Gemini API Chatbot Logic (for advice/query) ---
    const handleChatbotSubmit = async () => {
        if (!chatbotQuery.trim()) return;

        setIsChatbotLoading(true);
        setChatbotResponse('');
        
        const userPrompt = `You are a helpful and supportive dating and social advisor for the 'BaseMatch' app. Provide a friendly and concise answer (max 3 sentences) to the user's question: ${chatbotQuery.trim()}`;
        
        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: "Act as a friendly dating advisor." }] },
        };

        try {
            const response = await fetchWithRetry(geminiFlashApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that request. Please try again with another question.";
            setChatbotResponse(text);
            
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            setChatbotResponse("An error occurred while connecting to the AI advisor. Please try again.");
        } finally {
            setIsChatbotLoading(false);
            setChatbotQuery('');
        }
    };


    // --- UI Components ---
    const LoadingState = () => (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader className="w-8 h-8 animate-spin text-pink-500 mb-4" />
            <p className="text-lg font-medium">Loading data...</p>
            {!isAuthReady && <p className="text-sm mt-2">Setting up Firebase authentication.</p>}
            {isAuthReady && !fid && <p className="text-sm mt-2">Failed to get Farcaster ID. Check console logs.</p>}
        </div>
    );

    const MatchModal = () => {
        if (!isMatchModalOpen) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full relative transform scale-100 transition-transform duration-300 ease-out animate-pop-in">
                    <button 
                        onClick={handleStayOnMatch} 
                        className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 p-2 rounded-full transition"
                        aria-label="Close"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    
                    <Heart className="w-16 h-16 mx-auto text-red-500 fill-red-400 mb-4 animate-bounce-heart" />
                    
                    <h2 className="text-3xl font-extrabold text-pink-600 mb-2">🎉 Match Baru! 🎉</h2>
                    <p className="text-xl text-gray-700 mb-6">Anda cocok dengan <span className="font-bold">{matchedUserName}</span>!</p>
                    
                    <div className="space-y-3">
                        <button 
                            onClick={handleGoToChat}
                            className="w-full py-3 bg-pink-500 text-white font-bold rounded-full shadow-lg hover:bg-pink-600 transition flex items-center justify-center"
                        >
                            <MessageSquare className="w-5 h-5 mr-2" /> Kirim Pesan Sekarang
                        </button>
                        <button 
                            onClick={handleStayOnMatch}
                            className="w-full py-3 bg-gray-200 text-gray-800 font-bold rounded-full hover:bg-gray-300 transition"
                        >
                            Lanjutkan Mencari
                        </button>
                    </div>
                </div>
                <style jsx="true">{`
                    @keyframes pop-in {
                        from { transform: scale(0.8); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                    @keyframes bounce-heart {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                    }
                    .animate-pop-in {
                        animation: pop-in 0.3s ease-out;
                    }
                    .animate-bounce-heart {
                        animation: bounce-heart 1.5s infinite;
                    }
                `}</style>
            </div>
        );
    };

    const ProfileSetupScreen = () => {
        const [name, setName] = useState('');
        const [age, setAge] = useState('');
        const [gender, setGender] = useState('');
        // New state for optional 'About Me' field
        const [aboutMe, setAboutMe] = useState('');
        const [error, setError] = useState('');

        const GENDERS = ['Male', 'Female'];

        // Automatically determine 'Seeking' based on 'Gender'
        const getSeekingGender = (selectedGender) => {
            if (selectedGender === 'Male') return 'Female';
            if (selectedGender === 'Female') return 'Male';
            return ''; // Should not happen with current options
        };

        const handleSaveProfile = async () => {
            // Only check for mandatory fields: Name, Age, Gender
            if (!name || !age || !gender || !db || !fid) {
                setError("Please fill in Name, Age, and Gender.");
                return;
            }
            if (parseInt(age) < 18 || parseInt(age) > 100) {
                 setError("Age must be between 18 and 100.");
                 return;
            }

            setError('');
            const seeking = getSeekingGender(gender); // Determine seeking preference

            const newProfileData = {
                name,
                age: parseInt(age),
                gender,
                seeking,
                // Use the provided 'aboutMe' (bio) if available, otherwise use a default text
                bio: aboutMe.trim() || `Hi there! I'm ${name} and I'm looking for ${seeking.toLowerCase()}s.`,
                fid,
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            };

            const profileDocRef = getUserProfileDocRef(db, fid);
            try {
                await setDoc(profileDocRef, newProfileData);
                // The onSnapshot listener will catch this change and set isProfileSetupNeeded to false
            } catch (e) {
                console.error("Error saving profile:", e);
                setError("Failed to save profile. Please try again.");
            }
        };

        const SelectButton = ({ value, currentValue, setter }) => (
            <div className={`p-3 rounded-xl text-center cursor-pointer transition-colors ${currentValue === value ? 'bg-pink-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} onClick={() => setter(value)}>
                {value}
            </div>
        );

        return (
            <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-50">
                <div className="bg-white p-8 shadow-2xl rounded-xl w-full max-w-lg mx-auto">
                    <h2 className="text-3xl font-extrabold text-pink-600 mb-2">Selamat Datang di BaseMatch!</h2>
                    <p className="text-gray-600 mb-6">Mari siapkan profil Anda untuk menemukan pasangan.</p>
                    
                    {error && <div className="p-3 mb-4 bg-red-100 text-red-700 border border-red-300 rounded-lg">{error}</div>}

                    <div className="space-y-5">
                        <input
                            type="text"
                            placeholder="Nama Anda"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500"
                        />
                         <input
                            type="number"
                            placeholder="Usia Anda (Min 18)"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500"
                            min="18"
                            max="100"
                        />

                        {/* Gender Selection */}
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Saya adalah seorang:</p>
                            <div className="grid grid-cols-2 gap-3">
                                {GENDERS.map(g => (
                                    <SelectButton key={g} value={g} currentValue={gender} setter={setGender} />
                                ))}
                            </div>
                        </div>
                        
                        {/* About Me Field (Optional) */}
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Tentang Saya (Opsional):</p>
                            <textarea
                                placeholder="Ceritakan sedikit tentang diri Anda (misalnya, hobi, minat, pekerjaan)"
                                value={aboutMe}
                                onChange={(e) => setAboutMe(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500"
                                rows="3"
                            />
                        </div>


                        {/* Seeking Display (Read-only, based on selection) */}
                        <div className="pt-2">
                            <p className="text-sm font-medium text-gray-700 mb-2">Saya tertarik pada:</p>
                            <div className="p-3 bg-indigo-100 text-indigo-700 font-semibold rounded-xl border border-indigo-200">
                                {gender ? getSeekingGender(gender) : 'Pilih jenis kelamin Anda terlebih dahulu'}
                            </div>
                        </div>

                        <button 
                            onClick={handleSaveProfile}
                            className="w-full py-3 mt-4 bg-pink-500 text-white font-bold rounded-lg hover:bg-pink-600 transition shadow-lg flex items-center justify-center"
                            disabled={!gender || !name || !age}
                        >
                            <Check className="w-5 h-5 mr-2"/> Selesaikan Profil
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const MatchCard = ({ currentProfile, handleLike, handlePass }) => {
        const [isDragging, setIsDragging] = useState(false);
        const [translate, setTranslate] = useState({ x: 0, y: 0 });
        const [startPoint, setStartPoint] = useState(0);
        const cardRef = useRef(null);

        // Reset position when a new profile loads
        useEffect(() => {
            setTranslate({ x: 0, y: 0 });
            setIsDragging(false);
        }, [currentProfile]);

        // --- Event Handlers for Touch and Mouse ---

        const handleSwipeStart = (e) => {
            setIsDragging(true);
            // Check if it's a touch event (e.touches[0]) or a mouse event (e.clientX)
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            setStartPoint(clientX);
        };

        const handleSwipeMove = (e) => {
            if (!isDragging) return;
            
            // Prevent default touch behavior (like scrolling) for horizontal movement
            if (e.touches && Math.abs(e.touches[0].clientX - startPoint) > 10) {
                 e.preventDefault();
            }

            const currentX = e.touches ? e.touches[0].clientX : e.clientX;
            const deltaX = currentX - startPoint;

            setTranslate({ 
                x: deltaX, 
                y: 0 
            });
        };

        const handleSwipeEnd = () => {
            if (!isDragging) return;
            setIsDragging(false);
            const swipeThreshold = 100; // Minimum distance to register a swipe

            if (translate.x > swipeThreshold) {
                // Swipe Right (Like)
                handleSwipeOut('right');
            } else if (translate.x < -swipeThreshold) {
                // Swipe Left (Pass)
                handleSwipeOut('left');
            } else {
                // Reset to center
                setTranslate({ x: 0, y: 0 });
            }
        };

        // --- Visual Swipe Out Animation ---
        const handleSwipeOut = (direction) => {
            const finalX = direction === 'right' ? 800 : -800; // Off-screen distance
            
            // Set the final position to trigger the CSS transition
            setTranslate({ x: finalX, y: 0 });

            // Wait for the animation to finish before moving to the next profile
            setTimeout(() => {
                // Reset visual state for the next card
                setTranslate({ x: 0, y: 0 }); 
                if (direction === 'right') {
                    handleLike(); 
                } else {
                    handlePass(); 
                }
            }, 300); 
        };

        // Calculate card styling based on drag state
        const rotation = translate.x / 20; // Slight rotation effect
        const opacity = 1 - (Math.abs(translate.x) / 400); // Fade effect
        
        const cardStyle = {
            transform: `translateX(${translate.x}px) rotate(${rotation}deg)`,
            // Use no transition while dragging for smooth movement
            transition: isDragging || Math.abs(translate.x) > 100 ? 'none' : 'transform 0.3s ease-out',
            opacity: opacity,
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none' // Prevents browser default swipe actions
        };

        // Visual feedback indicators (Like/Pass)
        const likeOpacity = translate.x > 0 ? Math.min(translate.x / 100, 1) : 0;
        const passOpacity = translate.x < 0 ? Math.min(Math.abs(translate.x) / 100, 1) : 0;
        
        // --- End of Swipe Logic ---

        if (!currentProfile) {
            return (
                <div className="text-center p-8 bg-white rounded-xl shadow-md w-full max-w-sm mx-auto">
                    <p className="text-xl font-medium text-gray-700">Tidak ada profil lagi!</p>
                    <p className="text-gray-500 mt-2">Coba sesuaikan pengaturan penemuan Anda.</p>
                </div>
            );
        }

        return (
            <div className="relative w-full max-w-sm mx-auto h-[450px]">
                {/* The Swipeable Card Container */}
                <div 
                    ref={cardRef}
                    className="absolute inset-0 bg-white p-6 shadow-2xl rounded-xl flex flex-col items-center"
                    style={cardStyle}
                    // Touch events for mobile
                    onTouchStart={handleSwipeStart}
                    onTouchMove={handleSwipeMove}
                    onTouchEnd={handleSwipeEnd}
                    // Mouse events for desktop
                    onMouseDown={handleSwipeStart}
                    onMouseMove={handleSwipeMove}
                    onMouseUp={handleSwipeEnd}
                    onMouseLeave={isDragging ? handleSwipeEnd : undefined} // End drag if mouse leaves the card
                >
                    {/* Visual Indicators */}
                    <div 
                        className="absolute top-4 left-4 border-4 border-red-500 text-red-500 px-4 py-2 text-3xl font-bold rounded-lg rotate-[-30deg] pointer-events-none"
                        style={{ opacity: passOpacity, transition: 'opacity 0.1s' }}
                    >
                        PASS
                    </div>
                    <div 
                        className="absolute top-4 right-4 border-4 border-green-500 text-green-500 px-4 py-2 text-3xl font-bold rounded-lg rotate-[30deg] pointer-events-none"
                        style={{ opacity: likeOpacity, transition: 'opacity 0.1s' }}
                    >
                        LIKE
                    </div>
                    
                    {/* Profile Content */}
                    <div className="relative w-40 h-40 mb-4 flex-shrink-0">
                        <img 
                            src={currentProfile.imageUrl} 
                            alt={currentProfile.name} 
                            className="w-full h-full object-cover rounded-full border-4 border-pink-400 shadow-md"
                            onError={(e) => e.target.src = `https://placehold.co/160x160/94A3B8/ffffff?text=${currentProfile.name.split(' ')[0]}`}
                        />
                        <Zap className="absolute bottom-0 right-0 p-1 bg-pink-500 text-white rounded-full h-8 w-8 shadow-lg" />
                    </div>

                    <h2 className="text-3xl font-extrabold text-gray-800 mb-1">{currentProfile.name}, {currentProfile.age}</h2>
                    <p className="text-sm text-gray-500 text-center mb-4 italic flex-1 overflow-hidden">"{currentProfile.bio}"</p>
                    
                    <div className="flex flex-wrap justify-center gap-2 mb-4">
                        {currentProfile.tags.map((tag, index) => (
                            <span key={index} className="px-3 py-1 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full">
                                {tag}
                            </span>
                        ))}
                    </div>

                    {/* Buttons remain functional as alternative interaction */}
                    <div className="flex gap-6 w-full justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleSwipeOut('left'); }}
                            className="p-4 bg-red-100 text-red-600 rounded-full shadow-lg hover:bg-red-200 transition duration-150 transform hover:scale-105"
                            aria-label="Pass Profile"
                        >
                            <Loader className="w-6 h-6 rotate-45" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleSwipeOut('right'); }}
                            className="p-4 bg-pink-500 text-white rounded-full shadow-xl shadow-pink-300 hover:bg-pink-600 transition duration-150 transform hover:scale-110"
                            aria-label="Like Profile"
                        >
                            <Heart className="w-6 h-6 fill-white" />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const ChatList = () => (
        <div className="w-full md:w-1/3 bg-white border-r border-gray-100 p-4 h-full overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-between">
                Pesan 
                {fid && <span className="text-xs text-gray-400 truncate ml-2" title={fid}>FID Anda: {fid}</span>}
            </h2>
            <div className="space-y-3">
                {chats.map(chat => (
                    <div 
                        key={chat.id}
                        onClick={() => setSelectedChatId(chat.id)}
                        className={`flex items-center p-3 rounded-xl cursor-pointer transition duration-150 ${selectedChatId === chat.id ? 'bg-pink-50 ring-2 ring-pink-400' : 'hover:bg-gray-50'}`}
                    >
                        <User className="h-8 w-8 text-pink-500 mr-3 p-1 bg-pink-100 rounded-full" />
                        <div>
                            <p className="font-semibold text-gray-700">{chat.user}</p>
                            <p className="text-sm text-gray-500 truncate">{chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : "Mulai obrolan baru..."}</p>
                        </div>
                    </div>
                ))}
                {chats.length === 0 && <p className="text-center text-gray-400 mt-8">Belum ada obrolan. Mulai *like* profil untuk mendapatkan pasangan!</p>}
            </div>
        </div>
    );
    
    const SettingsPanel = () => (
        <div className="w-full p-6 space-y-8 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-3 mb-6">Pengaturan & Penasihat AI</h2>
            
            {/* Account Settings */}
            <section className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-pink-600 mb-4 flex items-center"><User className="w-5 h-5 mr-2"/> Profil Anda</h3>
                <div className="space-y-4">
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate">
                        Farcaster ID (FID): {fid || "Memuat..."}
                    </div>
                    {userProfile ? (
                        <div className="space-y-2 text-gray-700">
                            <p><strong>Nama:</strong> {userProfile.name}</p>
                            <p><strong>Usia:</strong> {userProfile.age}</p>
                            <p><strong>Jenis Kelamin:</strong> {userProfile.gender}</p>
                            <p><strong>Mencari:</strong> {userProfile.seeking}s</p>
                            <textarea placeholder="Perbarui Bio" className="w-full p-3 border border-gray-300 rounded-lg" defaultValue={userProfile.bio} rows="3"></textarea>
                            <button className="w-full py-3 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 transition" disabled>Simpan Perubahan (Mock)</button>
                            <p className="text-xs text-gray-500 mt-1">Perubahan di sini dimock; gunakan layar pengaturan untuk memperbarui data inti.</p>
                        </div>
                    ) : (
                        <p className="text-red-500">Data profil hilang. Harap selesaikan penyiapan terlebih dahulu.</p>
                    )}
                </div>
            </section>

            {/* AI Advisor Chatbot */}
            <section className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-pink-600 mb-4 flex items-center"><Search className="w-5 h-5 mr-2"/> Penasihat Kencan & Sosial AI</h3>
                <p className="text-gray-600 mb-4">Mintalah saran dari penasihat AI BaseMatch tentang pembuka percakapan, kiat profil, atau etiket berkencan.</p>
                
                <div className="space-y-3">
                    <input
                        type="text"
                        value={chatbotQuery}
                        onChange={(e) => setChatbotQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !isChatbotLoading && handleChatbotSubmit()}
                        placeholder="Contoh: 'Apa pesan pertama yang bagus untuk seseorang yang suka hiking?'"
                        className="w-full p-3 border border-pink-300 rounded-lg focus:ring-pink-500 focus:border-pink-500"
                        disabled={isChatbotLoading}
                    />
                    <button 
                        onClick={handleChatbotSubmit}
                        disabled={isChatbotLoading || !chatbotQuery.trim()}
                        className="w-full py-3 bg-pink-500 text-white font-bold rounded-lg hover:bg-pink-600 disabled:opacity-50 transition flex items-center justify-center"
                    >
                        {isChatbotLoading ? (
                            <>
                                <Loader className="w-5 h-5 mr-2 animate-spin"/> Berpikir...
                            </>
                        ) : (
                            'Dapatkan Saran'
                        )}
                    </button>
                </div>

                {chatbotResponse && (
                    <div className="mt-4 p-4 bg-gray-100 border-l-4 border-pink-500 rounded-r-lg">
                        <p className="font-medium text-gray-800">Respon AI:</p>
                        <p className="text-gray-600">{chatbotResponse}</p>
                    </div>
                )}
            </section>
        </div>
    );

    // --- Main Render based on Active Tab ---
    const renderContent = () => {
        if (!isAuthReady || !db || !fid) {
            return <LoadingState />;
        }
        
        // CRITICAL: Force profile setup if data is missing
        if (isProfileSetupNeeded) {
            return <ProfileSetupScreen />;
        }

        switch (activeTab) {
            case 'match':
                return (
                    <div className="flex flex-col items-center justify-center h-full p-4">
                        <h1 className="text-3xl font-extrabold text-pink-600 mb-6 hidden sm:block">Temukan Pasangan BaseMatch Anda</h1>
                        {/* MatchCard now receives handleLike and handlePass */}
                        <MatchCard currentProfile={currentProfile} handleLike={handleLike} handlePass={handlePass} />
                    </div>
                );
            case 'chat':
                const isChatListVisible = selectedChatId === null || window.innerWidth >= 768;
                
                // Pass necessary props to the memoized ChatWindow
                const chatWindowProps = {
                    selectedChat: selectedChat,
                    selectedChatId: selectedChatId,
                    chatInput: chatInput,
                    setChatInputStable: setChatInputStable,
                    handleSendMessage: handleSendMessage,
                    setSelectedChatId: setSelectedChatId,
                    db: db,
                    fid: fid 
                };

                return (
                    <div className="flex h-full overflow-hidden">
                        <div className={`md:block ${isChatListVisible ? 'w-full md:w-1/3' : 'hidden'}`}>
                            <ChatList />
                        </div>
                        <div className={`md:block ${!isChatListVisible ? 'w-full md:w-2/3' : 'hidden md:w-2/3'}`}>
                            {/* Using the memoized ChatWindow and giving it a unique key */}
                            <ChatWindow key={selectedChatId || 'no-chat'} {...chatWindowProps} />
                        </div>
                    </div>
                );
            case 'settings':
                return (
                    <SettingsPanel />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100 font-sans">
            
            {/* Match Pop-up Modal */}
            <MatchModal />

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
                {renderContent()}
            </main>

            {/* Navigation Bar (Footer) - Hidden during setup */}
            {!isProfileSetupNeeded && (
                <footer className="bg-white border-t border-gray-200 shadow-lg sticky bottom-0 z-10">
                    <nav className="flex justify-around items-center h-16 max-w-md mx-auto">
                        <NavItem icon={Heart} label="Match" active={activeTab === 'match'} onClick={() => setActiveTab('match')} />
                        <NavItem icon={MessageSquare} label="Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
                        <NavItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                    </nav>
                </footer>
            )}
        </div>
    );
}

// Nav Item Helper Component
const NavItem = ({ icon: Icon, label, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center p-2 rounded-lg transition duration-200 ${
            active 
                ? 'text-pink-500 font-semibold transform scale-105' 
                : 'text-gray-400 hover:text-pink-400'
        }`}
        aria-label={label}
    >
        <Icon className="w-6 h-6" />
        <span className="text-xs mt-1 hidden sm:block">{label}</span>
    </button>
);
