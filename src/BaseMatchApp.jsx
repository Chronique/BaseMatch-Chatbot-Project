import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Send, User, MessageSquare, Heart, Settings, Loader, Users, Zap, Search, Check } from 'lucide-react';

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
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper to construct Firestore collection reference using FID
const getUserCollectionRef = (db, fid, collectionName) => {
    // Path structure: artifacts/{appId}/users/{fid}/{collectionName}
    return collection(db, "artifacts", appId, "users", fid, collectionName);
};

// Helper to construct the document reference for the user's own profile/settings
const getUserProfileDocRef = (db, fid) => {
    return doc(db, "artifacts", appId, "users", fid, 'settings', 'user_profile');
};


// --- Main App Component ---
export default function App() {
    const [activeTab, setActiveTab] = useState('match'); // 'match', 'chat', 'settings'
    const [profiles, setProfiles] = useState([]); // Profiles to be matched with
    const [chats, setChats] = useState([]);
    const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
    const [selectedChatId, setSelectedChatId] = useState(null);
    const [chatInput, setChatInput] = useState('');
    const [chatbotQuery, setChatbotQuery] = useState('');
    const [chatbotResponse, setChatbotResponse] = useState('');
    const [isChatbotLoading, setIsChatbotLoading] = useState(false);

    // Profile Setup State
    const [isProfileSetupNeeded, setIsProfileSetupNeeded] = useState(true); // Assume setup needed until profile loads
    const [userProfile, setUserProfile] = useState(null); // The authenticated user's profile data

    // Firebase State
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [fid, setFid] = useState(null); // Farcaster ID (mapped from Firebase UID)
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


    // --- Firestore Data Fetching: User Profile & Matches ---
    useEffect(() => {
        if (!isAuthReady || !db || !fid) return;

        // 1. Fetch User's OWN Profile
        const profileDocRef = getUserProfileDocRef(db, fid);
        const userProfileUnsub = onSnapshot(profileDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const profileData = docSnap.data();
                setUserProfile(profileData);
                // Profile exists, no setup needed
                setIsProfileSetupNeeded(false); 
            } else {
                // Profile does not exist, setup is required
                setIsProfileSetupNeeded(true); 
                setUserProfile(null);
            }
        }, (error) => {
            console.error("Error fetching user profile:", error.message);
            // Even if there's an error, we assume setup might be needed if data load fails
            setIsProfileSetupNeeded(true); 
        });

        // 2. Fetch Profiles for Matching (Only if the user's profile is ready)
        // This is a simplified fetching. In a real app, filtering by userProfile.seeking would happen here.
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
    }, [isAuthReady, db, fid, isProfileSetupNeeded]); // Rerun when profile status changes

    // Current displayed profile
    const currentProfile = profiles.length > 0 ? profiles[currentProfileIndex % profiles.length] : null;
    // Selected chat data
    const selectedChat = useMemo(() => chats.find(c => c.id === selectedChatId), [chats, selectedChatId]);

    // Handle 'Like' action
    const handleLike = useCallback(() => {
        if (!currentProfile || !db || !fid) return;
        
        // Create a mock chat entry in Firestore upon 'liking'
        const chatsRef = getUserCollectionRef(db, fid, 'chats');
        const newChatId = `chat_${currentProfile.id}`;
        const chatDocRef = doc(chatsRef, newChatId);
        setDoc(chatDocRef, {
            user: currentProfile.name,
            profileId: currentProfile.id,
            lastActive: serverTimestamp(),
            messages: [{ sender: 'system', text: `You matched with ${currentProfile.name}! Say hi to start a conversation.` }]
        }, { merge: true }).catch(e => console.error("Error creating mock chat:", e));

        setCurrentProfileIndex(prev => (prev + 1) % profiles.length);
    }, [currentProfile, profiles.length, db, fid, profiles]);

    // Handle 'Pass' action
    const handlePass = useCallback(() => {
        setCurrentProfileIndex(prev => (prev + 1) % profiles.length);
    }, [profiles.length]);

    // Handle sending a message
    const handleSendMessage = useCallback(async () => {
        if (!chatInput.trim() || !selectedChat || !db || !fid) return;

        const newMessage = { sender: 'me', text: chatInput.trim(), timestamp: new Date().toISOString() };
        
        const chatsRef = getUserCollectionRef(db, fid, 'chats');
        const chatDocRef = doc(chatsRef, selectedChatId);

        try {
            const chatSnapshot = await getDoc(chatDocRef);
            if (chatSnapshot.exists()) {
                const currentMessages = chatSnapshot.data().messages || [];
                await setDoc(chatDocRef, { 
                    messages: [...currentMessages, newMessage],
                    lastActive: serverTimestamp() 
                }, { merge: true });
                setChatInput('');
            }
        } catch (error) {
            console.error("Error sending message to Firestore:", error);
        }
    }, [chatInput, selectedChatId, db, fid]);

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
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that request. Please try again with a different query.";
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

    const ProfileSetupScreen = () => {
        const [name, setName] = useState('');
        const [age, setAge] = useState('');
        const [gender, setGender] = useState('');
        const [error, setError] = useState('');

        const GENDERS = ['Male', 'Female'];

        // Automatically determine 'Seeking' based on 'Gender'
        const getSeekingGender = (selectedGender) => {
            if (selectedGender === 'Male') return 'Female';
            if (selectedGender === 'Female') return 'Male';
            return ''; // Should not happen with current options
        };

        const handleSaveProfile = async () => {
            if (!name || !age || !gender || !db || !fid) {
                setError("Please fill in all fields.");
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
                bio: `Hello! I'm ${name} and I'm looking for ${seeking.toLowerCase()}s.`,
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
                    <h2 className="text-3xl font-extrabold text-pink-600 mb-2">Welcome to BaseMatch!</h2>
                    <p className="text-gray-600 mb-6">Let's set up your profile to find your matches.</p>
                    
                    {error && <div className="p-3 mb-4 bg-red-100 text-red-700 border border-red-300 rounded-lg">{error}</div>}

                    <div className="space-y-5">
                        <input
                            type="text"
                            placeholder="Your Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500"
                        />
                         <input
                            type="number"
                            placeholder="Your Age (18+)"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500"
                            min="18"
                            max="100"
                        />

                        {/* Gender Selection */}
                        <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">I am a:</p>
                            <div className="grid grid-cols-2 gap-3">
                                {GENDERS.map(g => (
                                    <SelectButton key={g} value={g} currentValue={gender} setter={setGender} />
                                ))}
                            </div>
                        </div>

                        {/* Seeking Display (Read-only, based on selection) */}
                        <div className="pt-2">
                            <p className="text-sm font-medium text-gray-700 mb-2">I am interested in:</p>
                            <div className="p-3 bg-indigo-100 text-indigo-700 font-semibold rounded-xl border border-indigo-200">
                                {gender ? getSeekingGender(gender) : 'Please select your gender first'}
                            </div>
                        </div>

                        <button 
                            onClick={handleSaveProfile}
                            className="w-full py-3 mt-4 bg-pink-500 text-white font-bold rounded-lg hover:bg-pink-600 transition shadow-lg flex items-center justify-center"
                            disabled={!gender}
                        >
                            <Check className="w-5 h-5 mr-2"/> Complete Profile
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const MatchCard = () => {
        if (!currentProfile) {
            return (
                <div className="text-center p-8 bg-white rounded-xl shadow-md w-full max-w-sm mx-auto">
                    <p className="text-xl font-medium text-gray-700">No more profiles nearby!</p>
                    <p className="text-gray-500 mt-2">Try adjusting your discovery settings.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center bg-white p-6 shadow-2xl rounded-xl w-full max-w-sm mx-auto transform transition-all hover:scale-[1.01] duration-300">
                <div className="relative w-40 h-40 mb-4">
                    <img 
                        src={currentProfile.imageUrl} 
                        alt={currentProfile.name} 
                        className="w-full h-full object-cover rounded-full border-4 border-pink-400 shadow-md"
                        onError={(e) => e.target.src = `https://placehold.co/160x160/94A3B8/ffffff?text=${currentProfile.name.split(' ')[0]}`}
                    />
                    <Zap className="absolute bottom-0 right-0 p-1 bg-pink-500 text-white rounded-full h-8 w-8 shadow-lg" />
                </div>

                <h2 className="text-3xl font-extrabold text-gray-800 mb-1">{currentProfile.name}, {currentProfile.age}</h2>
                <p className="text-sm text-gray-500 text-center mb-4 italic">"{currentProfile.bio}"</p>
                <p className="text-xs text-gray-400 mb-4">Gender: {currentProfile.gender}</p>

                <div className="flex flex-wrap justify-center gap-2 mb-8">
                    {currentProfile.tags.map((tag, index) => (
                        <span key={index} className="px-3 py-1 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full">
                            {tag}
                        </span>
                    ))}
                </div>

                <div className="flex gap-6 w-full justify-center">
                    <button 
                        onClick={handlePass}
                        className="p-4 bg-red-100 text-red-600 rounded-full shadow-lg hover:bg-red-200 transition duration-150 transform hover:scale-105"
                        aria-label="Pass Profile"
                    >
                        <Loader className="w-6 h-6 rotate-45" />
                    </button>
                    <button 
                        onClick={handleLike}
                        className="p-4 bg-pink-500 text-white rounded-full shadow-xl shadow-pink-300 hover:bg-pink-600 transition duration-150 transform hover:scale-110"
                        aria-label="Like Profile"
                    >
                        <Heart className="w-6 h-6 fill-white" />
                    </button>
                </div>
            </div>
        );
    };

    const ChatList = () => (
        <div className="w-full md:w-1/3 bg-white border-r border-gray-100 p-4 h-full overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-between">
                Messages 
                {fid && <span className="text-xs text-gray-400 truncate ml-2" title={fid}>Your FID: {fid}</span>}
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
                            <p className="text-sm text-gray-500 truncate">{chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : "Start a new chat..."}</p>
                        </div>
                    </div>
                ))}
                {chats.length === 0 && <p className="text-center text-gray-400 mt-8">No chats yet. Start liking profiles to get matches!</p>}
            </div>
        </div>
    );

    const ChatWindow = () => (
        <div className="w-full md:w-2/3 flex flex-col h-full bg-gray-50">
            {selectedChat ? (
                <>
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
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-gray-200 bg-white">
                        <div className="flex items-center space-x-3">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder={`Type a message to ${selectedChat.user}...`}
                                className="flex-1 p-3 border border-gray-300 rounded-full focus:ring-pink-500 focus:border-pink-500 transition duration-150"
                            />
                            <button 
                                onClick={handleSendMessage}
                                disabled={!chatInput.trim()}
                                className="p-3 bg-pink-500 text-white rounded-full shadow-lg hover:bg-pink-600 disabled:opacity-50 transition duration-150"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                    <p className="text-lg font-medium">Select a conversation to start chatting.</p>
                </div>
            )}
        </div>
    );
    
    const SettingsPanel = () => (
        <div className="w-full p-6 space-y-8 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-3 mb-6">Settings & AI Advisor</h2>
            
            {/* Account Settings */}
            <section className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-pink-600 mb-4 flex items-center"><User className="w-5 h-5 mr-2"/> Your Profile</h3>
                <div className="space-y-4">
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate">
                        Farcaster ID (FID): {fid || "Loading..."}
                    </div>
                    {userProfile ? (
                        <div className="space-y-2 text-gray-700">
                            <p><strong>Name:</strong> {userProfile.name}</p>
                            <p><strong>Age:</strong> {userProfile.age}</p>
                            <p><strong>Gender:</strong> {userProfile.gender}</p>
                            <p><strong>Seeking:</strong> {userProfile.seeking}s</p>
                            <textarea placeholder="Update Bio" className="w-full p-3 border border-gray-300 rounded-lg" defaultValue={userProfile.bio} rows="3"></textarea>
                            <button className="w-full py-3 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 transition" disabled>Save Changes (Mock)</button>
                            <p className="text-xs text-gray-500 mt-1">Changes here are mock; use the setup screen to update core data.</p>
                        </div>
                    ) : (
                        <p className="text-red-500">Profile data missing. Please complete setup first.</p>
                    )}
                </div>
            </section>

            {/* AI Advisor Chatbot */}
            <section className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-pink-600 mb-4 flex items-center"><Search className="w-5 h-5 mr-2"/> AI Dating & Social Advisor</h3>
                <p className="text-gray-600 mb-4">Ask the BaseMatch AI for advice on conversation starters, profile tips, or dating etiquette.</p>
                
                <div className="space-y-3">
                    <input
                        type="text"
                        value={chatbotQuery}
                        onChange={(e) => setChatbotQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !isChatbotLoading && handleChatbotSubmit()}
                        placeholder="e.g., 'What's a good first message for someone who likes hiking?'"
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
                                <Loader className="w-5 h-5 mr-2 animate-spin"/> Thinking...
                            </>
                        ) : (
                            'Get Advice'
                        )}
                    </button>
                </div>

                {chatbotResponse && (
                    <div className="mt-4 p-4 bg-gray-100 border-l-4 border-pink-500 rounded-r-lg">
                        <p className="font-medium text-gray-800">AI Response:</p>
                        <p className="text-600">{chatbotResponse}</p>
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
                        <h1 className="text-3xl font-extrabold text-pink-600 mb-6 hidden sm:block">Find Your BaseMatch</h1>
                        <MatchCard />
                    </div>
                );
            case 'chat':
                const isChatListVisible = selectedChatId === null || window.innerWidth >= 768;

                return (
                    <div className="flex h-full overflow-hidden">
                        <div className={`md:block ${isChatListVisible ? 'w-full md:w-1/3' : 'hidden'}`}>
                            <ChatList />
                        </div>
                        <div className={`md:block ${!isChatListVisible ? 'w-full md:w-2/3' : 'hidden md:w-2/3'}`}>
                            <ChatWindow />
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
