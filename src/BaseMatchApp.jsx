import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    addDoc, 
    getDocs, 
    onSnapshot 
} from 'firebase/firestore';

// ===============================================
// 1. FIREBASE & UTILS SETUP
// ===============================================

// Global variables provided by the environment (MANDATORY USE)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Mock data (with GENDER added)
const MOCK_PROFILES = [
    { id: 'profile_1', name: 'Luna', age: 24, description: 'Suka coding & kopi, Base maxi.', img: 'https://placehold.co/400x500/06B6D4/FFFFFF?text=Luna+24', gender: 'female' },
    { id: 'profile_2', name: 'Kore', age: 28, description: 'Mencari partner diskusi tentang DeFi & teknologi ZK.', img: 'https://placehold.co/400x500/1D4ED8/FFFFFF?text=Kore+28', gender: 'male' },
    { id: 'profile_3', name: 'Anya', age: 21, description: 'Senang main game on-chain dan membuat memes.', img: 'https://placehold.co/400x500/6D28D9/FFFFFF?text=Anya+21', gender: 'female' },
    { id: 'profile_4', name: 'Zeta', age: 26, description: 'Artis NFT, cari yang bisa diajak ke galeri digital.', img: 'https://placehold.co/400x500/9D174D/FFFFFF?text=Zeta+26', gender: 'female' },
    { id: 'profile_5', name: 'Nova', age: 27, description: 'Backend developer, selalu penasaran dengan Layer 2 terbaru.', img: 'https://placehold.co/400x500/047857/FFFFFF?text=Nova+27', gender: 'male' },
    // --- PROFIL BARU TAMBAHAN ---
    { id: 'profile_6', name: 'Rian', age: 30, description: 'Kolektor NFT era Base, suka hiking.', img: 'https://placehold.co/400x500/EF4444/FFFFFF?text=Rian+30', gender: 'male' },
    { id: 'profile_7', name: 'Tania', age: 25, description: 'Web3 Marketing & suka membuat thread di Farcaster.', img: 'https://placehold.co/400x500/F97316/FFFFFF?text=Tania+25', gender: 'female' },
    { id: 'profile_8', name: 'Yoga', age: 29, description: 'Validator Ethereum & penggemar Base Dapps.', img: 'https://placehold.co/400x500/EAB308/FFFFFF?text=Yoga+29', gender: 'male' },
    { id: 'profile_9', name: 'Sari', age: 22, description: 'Penyuka musik elektronik, mencari teman ke konser.', img: 'https://placehold.co/400x500/84CC16/FFFFFF?text=Sari+22', gender: 'female' },
    { id: 'profile_10', name: 'Aron', age: 32, description: 'Desainer UI/UX, fokus pada estetika Base.', img: 'https://placehold.co/400x500/3B82F6/FFFFFF?text=Aron+32', gender: 'male' },
];

const MAX_SWIPES_PER_DAY = 50;

// Utility to check if today is a new day
const isNewDay = (lastDate) => {
    if (!lastDate) return true;
    const lastDay = new Date(lastDate).toDateString();
    const today = new Date().toDateString();
    return lastDay !== today;
};

// ===============================================
// 2. MAIN APP COMPONENT
// ===============================================

const App = () => {
    // --- Firebase State ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // --- App State ---
    const [profiles, setProfiles] = useState([]);
    const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
    const [swipedProfileIds, setSwipedProfileIds] = useState(new Set());
    const [dailySwipeCount, setDailySwipeCount] = useState(0);
    const [hasSubscriptionNFT, setHasSubscriptionNFT] = useState(false); // Mocks NFT gate
    const [likesYouList, setLikesYouList] = useState([]);
    const [hasPaidToViewLikes, setHasPaidToViewLikes] = useState(false); // Mocks premium payment
    const [userGender, setUserGender] = useState(null); // State for user's selected gender
    const [matchesList, setMatchesList] = useState([]); // NEW: State for confirmed matches

    const [viewMode, setViewMode] = useState('swipe'); // 'swipe' | 'likes' | 'matches'
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [matchNotification, setMatchNotification] = useState(null); // State for match pop-up

    // ---------------------------------------------
    // Initialization and Authentication (useEffect 1)
    // ---------------------------------------------
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestore);
            setAuth(firebaseAuth);

            // Authentication logic
            const signIn = async () => {
                if (initialAuthToken) {
                    await signInWithCustomToken(firebaseAuth, initialAuthToken);
                } else {
                    await signInAnonymously(firebaseAuth);
                }
            };
            
            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Force sign in if no user is found
                    signIn().catch(err => {
                        console.error("Auth Sign In Error:", err);
                        setError("Gagal melakukan autentikasi.");
                    });
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Init Error:", e);
            setError("Gagal menginisialisasi Firebase.");
        }
    }, [initialAuthToken, firebaseConfig]);


    // ---------------------------------------------
    // Data Loading and Sync (useEffect 2)
    // ---------------------------------------------
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;

        const loadData = async () => {
            setIsLoading(true);
            try {
                // 1. Get current user status (swipes, NFT status, payment status, GENDER)
                const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/metadata/data`);
                const userDocSnap = await getDoc(userDocRef);
                const userData = userDocSnap.data();

                let currentSwipeCount = userData?.dailySwipeCount || 0;
                let lastReset = userData?.lastSwipeReset ? userData.lastSwipeReset.toDate() : null;
                
                if (isNewDay(lastReset)) {
                    // Reset swipe count for a new day
                    currentSwipeCount = 0;
                    await setDoc(userDocRef, { dailySwipeCount: 0, lastSwipeReset: new Date() }, { merge: true });
                }

                setDailySwipeCount(currentSwipeCount);
                setHasSubscriptionNFT(userData?.hasSubscriptionNFT || false);
                setHasPaidToViewLikes(userData?.hasPaidToViewLikes || false);

                // Load Gender
                const gender = userData?.userGender || null;
                setUserGender(gender);
                
                // If gender is not set, stop loading data and wait for user selection
                if (!gender) {
                    setIsLoading(false);
                    return;
                }

                // Determine target gender for matching (opposite of user's selection)
                const targetGender = gender === 'male' ? 'female' : 'male';


                // 2. Load all potential profiles and my past swipes
                const likesRef = collection(db, `artifacts/${appId}/users/${userId}/likes`);
                const likesSnapshot = await getDocs(likesRef);
                const mySwipes = new Set();
                likesSnapshot.forEach(doc => {
                    const data = doc.data();
                    // Assuming doc ID stores a relationship (like_profileId)
                    mySwipes.add(data.likedProfileId); 
                });
                setSwipedProfileIds(mySwipes);
                
                // 3. Filter profiles to show only unwiped and **opposite gender** ones
                const unwipedProfiles = MOCK_PROFILES.filter(p => 
                    p.id !== userId && // Not my own mock ID
                    !mySwipes.has(p.id) && // Not already swiped
                    p.gender === targetGender // Filter by opposite gender
                );
                setProfiles(unwipedProfiles);

                // 4. Load who liked *me* (Public data for cross-user likes)
                const publicLikesRef = collection(db, `artifacts/${appId}/public/data/likes`);
                const q = query(publicLikesRef, where("likedId", "==", userId));
                const likedMeSnapshot = await getDocs(q);
                
                const likedList = likedMeSnapshot.docs.map(d => {
                    const likerProfile = MOCK_PROFILES.find(p => p.id === d.data().likerId);
                    return likerProfile ? { ...likerProfile, timestamp: d.data().timestamp.toDate() } : null;
                }).filter(p => p !== null);

                setLikesYouList(likedList);

                // 5. Load Confirmed Matches (NEW)
                const matchesRef = collection(db, `artifacts/${appId}/users/${userId}/matches`);
                const matchesSnapshot = await getDocs(matchesRef);
                const confirmedMatches = matchesSnapshot.docs.map(d => {
                    const matchId = d.id;
                    const partnerId = d.data().partnerId;
                    const partnerProfile = MOCK_PROFILES.find(p => p.id === partnerId);
                    return partnerProfile ? { ...partnerProfile, matchId: matchId } : null;
                }).filter(p => p !== null);

                setMatchesList(confirmedMatches);


            } catch (e) {
                console.error("Firestore Data Load Error:", e);
                setError("Gagal memuat data aplikasi.");
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [isAuthReady, db, userId, userGender]); // Added userGender dependency


    // ---------------------------------------------
    // Matchmaking Logic (NEW)
    // ---------------------------------------------

    const checkForMatch = useCallback(async (likedProfileId, likedProfileName) => {
        // 1. Check if the user I just liked has already liked ME (the current userId)
        const publicLikesRef = collection(db, `artifacts/${appId}/public/data/likes`);
        // Query: check if the person I liked (likedProfileId) has a public 'like' where the likedId is ME (userId)
        const q = query(
            publicLikesRef, 
            where("likerId", "==", likedProfileId), 
            where("likedId", "==", userId)
        );
        
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // MATCH FOUND! Both users liked each other.
            
            // 2. Create a unique match ID (sorted IDs ensures the ID is the same for both users)
            const matchId = [userId, likedProfileId].sort().join('_');

            // 3. Save the match in the current user's private 'matches' collection
            const myMatchDocRef = doc(db, `artifacts/${appId}/users/${userId}/matches/${matchId}`);
            await setDoc(myMatchDocRef, { 
                partnerId: likedProfileId, 
                timestamp: new Date()
            }, { merge: true });

            // 4. Also save the match in the partner's (likedProfileId) private 'matches' collection (Simulasi, karena kita tidak bisa login sebagai partner)
            // Note: Since the 'partner' profiles are mock, this step is symbolic but essential for real apps.
            // For this mock, we only save it on my side, and update the list.
            
            // 5. Trigger match notification
            setMatchNotification({ name: likedProfileName, id: likedProfileId });

            // 6. Update local state
            setMatchesList(prev => [...prev, { id: likedProfileId, name: likedProfileName, matchId }]);

        }
    }, [db, userId]);


    // ---------------------------------------------
    // Handlers
    // ---------------------------------------------

    // Handler to save the user's chosen gender
    const handleGenderSelect = useCallback(async (gender) => {
        if (!db || !userId) return;
        setIsLoading(true);
        try {
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/metadata/data`);
            await setDoc(userDocRef, { userGender: gender }, { merge: true });
            setUserGender(gender);
            setError(`✅ Anda memilih gender: ${gender}. Memuat profil lawan jenis...`);
            // The useEffect 2 (Data Loading) will automatically re-run due to userGender state change
        } catch (e) {
            console.error("Gender Select Error:", e);
            setError("Gagal menyimpan gender. Coba lagi.");
            setIsLoading(false);
        }
    }, [db, userId]);


    const handleSwipe = useCallback(async (action) => {
        if (!db || !userId || isLoading) return;

        const currentProfile = profiles[currentProfileIndex];
        if (!currentProfile) return;

        // --- Swipe Limit Check ---
        const isSwipeLimited = dailySwipeCount >= MAX_SWIPES_PER_DAY && !hasSubscriptionNFT;
        if (isSwipeLimited) {
            setError(`Batas 50 swipe/hari tercapai. Silakan beli NFT Langganan untuk lanjut!`);
            return;
        }

        setIsLoading(true);

        try {
            // 1. Record the swipe in local state
            const newSwipedIds = new Set(swipedProfileIds).add(currentProfile.id);
            setSwipedProfileIds(newSwipedIds);

            // 2. Update local swipe count
            const newCount = dailySwipeCount + 1;
            setDailySwipeCount(newCount);

            // 3. Update Firestore for the current user's metadata
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/metadata/data`);
            await setDoc(userDocRef, { dailySwipeCount: newCount, lastSwipeReset: new Date() }, { merge: true });

            // 4. Record the swipe in user's private 'likes' collection (for tracking who *I* swiped)
            const privateLikeRef = doc(db, `artifacts/${appId}/users/${userId}/likes/${currentProfile.id}`);
            await setDoc(privateLikeRef, { 
                likedProfileId: currentProfile.id, 
                action: action, 
                timestamp: new Date() 
            });

            // 5. If it's a 'LIKE', record it in the public collection (for others to see who liked them)
            if (action === 'like') {
                const publicLikesRef = collection(db, `artifacts/${appId}/public/data/likes`);
                await addDoc(publicLikesRef, {
                    likerId: userId,
                    likedId: currentProfile.id, // The profile I liked
                    timestamp: new Date(),
                });
                
                // NEW: Check for match immediately after liking
                await checkForMatch(currentProfile.id, currentProfile.name);
            }

            // 6. Move to the next profile
            setCurrentProfileIndex(prev => prev + 1);

        } catch (e) {
            console.error("Swipe Error:", e);
            setError("Gagal menyimpan swipe. Coba lagi.");
        } finally {
            setIsLoading(false);
        }
    }, [db, userId, profiles, currentProfileIndex, dailySwipeCount, hasSubscriptionNFT, isLoading, swipedProfileIds, checkForMatch]);


    const handleMockNFTPurchase = useCallback(async () => {
        if (!db || !userId) return;
        setIsLoading(true);
        try {
            // MOCK: Simulate successful NFT purchase on Base
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/metadata/data`);
            await updateDoc(userDocRef, { hasSubscriptionNFT: true });
            setHasSubscriptionNFT(true);
            setError("✅ Langganan NFT aktif! Swipe 50x per hari sudah dibuka.");
        } catch (e) {
            console.error("Mock NFT Error:", e);
            setError("Gagal mengaktifkan NFT (Mock).");
        } finally {
            setIsLoading(false);
        }
    }, [db, userId]);

    const handleMockPaymentForLikes = useCallback(async () => {
        if (!db || !userId) return;
        setIsLoading(true);
        try {
            // MOCK: Simulate a successful 0.1 USD payment via Base ETH
            const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/metadata/data`);
            await updateDoc(userDocRef, { hasPaidToViewLikes: true });
            setHasPaidToViewLikes(true);
            setError("✅ Pembayaran 0.1 USD berhasil! Anda sekarang bisa melihat yang menyukai Anda.");
        } catch (e) {
            console.error("Mock Payment Error:", e);
            setError("Gagal melakukan pembayaran (Mock).");
        } finally {
            setIsLoading(false);
        }
    }, [db, userId]);


    // ---------------------------------------------
    // Derived State and Render Logic
    // ---------------------------------------------
    const currentProfile = profiles[currentProfileIndex];
    const isOutOfProfiles = currentProfileIndex >= profiles.length;
    const isSwipeLimited = dailySwipeCount >= MAX_SWIPES_PER_DAY && !hasSubscriptionNFT;
    
    // NEW Component: Match Notification Modal
    const MatchNotification = ({ match, onClose }) => {
        if (!match) return null;

        // Find the full profile data for the match
        const matchedProfile = MOCK_PROFILES.find(p => p.id === match.id);

        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
                <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full transform transition-all duration-300 scale-100 animate-pulse-once border-4 border-pink-500">
                    <h2 className="text-4xl font-extrabold text-pink-600 mb-2">🎉 IT'S A MATCH! 🎉</h2>
                    <p className="text-xl text-gray-700 mb-4">Anda punya kecocokan dengan:</p>
                    
                    {matchedProfile && (
                         <div className="my-4">
                            <img 
                                src={matchedProfile.img} 
                                alt={matchedProfile.name} 
                                className="w-24 h-24 object-cover rounded-full mx-auto ring-4 ring-pink-300 mb-3"
                            />
                            <h3 className="text-3xl font-bold text-gray-900">{matchedProfile.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{matchedProfile.description}</p>
                        </div>
                    )}

                    <button
                        onClick={onClose}
                        className="mt-6 w-full py-3 bg-gradient-to-r from-pink-500 to-red-600 text-white font-bold rounded-lg shadow-lg hover:from-pink-600 hover:to-red-700 transition duration-200"
                    >
                        Mulai Chatting! (Simulasi)
                    </button>
                </div>
            </div>
        );
    };


    // Gender Selection Screen Component
    const GenderSelectionScreen = () => (
        <div className="bg-white p-8 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-center">
            <h2 className="text-3xl font-extrabold text-indigo-700 mb-4">⚛️ BaseMatch</h2>
            <p className="text-xl text-gray-700 mb-8">Selamat datang! Pilih gender Anda untuk memulai.</p>
            
            <div className="flex space-x-6">
                <button
                    onClick={() => handleGenderSelect('male')}
                    disabled={isLoading}
                    className="flex flex-col items-center p-4 bg-blue-100 rounded-xl shadow-lg hover:bg-blue-200 transition duration-200 disabled:opacity-50 w-32 h-32 justify-center"
                >
                    <svg className="w-10 h-10 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="font-bold text-lg text-blue-800">Laki-laki</span>
                </button>
                <button
                    onClick={() => handleGenderSelect('female')}
                    disabled={isLoading}
                    className="flex flex-col items-center p-4 bg-pink-100 rounded-xl shadow-lg hover:bg-pink-200 transition duration-200 disabled:opacity-50 w-32 h-32 justify-center"
                >
                    <svg className="w-10 h-10 text-pink-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8 12v-3"></path></svg>
                    <span className="font-bold text-lg text-pink-800">Perempuan</span>
                </button>
            </div>
            <p className="mt-6 text-sm text-gray-500">Pilihan ini dapat diubah nanti di pengaturan (simulasi).</p>
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
            {isLoading && <p className="mt-4 text-sm text-gray-500">Memuat...</p>}
        </div>
    );


    const LoadingOverlay = () => (
        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center rounded-xl z-50">
            <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );

    const SwipeCard = () => {
        if (isLoading && !currentProfile) return <LoadingOverlay />;
        
        if (isOutOfProfiles) {
            return (
                <div className="bg-white p-6 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-center">
                    <h2 className="text-2xl font-bold text-gray-800">Semua Profil Sudah Di-Swipe!</h2>
                    <p className="mt-4 text-gray-600">Anda telah melihat semua orang saat ini. Coba lagi besok atau ajak lebih banyak teman Farcaster bergabung!</p>
                </div>
            );
        }

        if (isSwipeLimited) {
             return (
                <div className="bg-white p-6 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-center border-4 border-yellow-500">
                    <h2 className="text-2xl font-bold text-yellow-600 mb-4">NFT Gate Aktif!</h2>
                    <p className="text-gray-700 mb-6">Anda telah mencapai batas **{MAX_SWIPES_PER_DAY} swipe** hari ini.</p>
                    <p className="text-lg font-medium text-gray-800 mb-6">Lakukan *Mock* Pembelian NFT Base untuk Lanjut Swipe Tanpa Batas!</p>
                    <button
                        onClick={handleMockNFTPurchase}
                        disabled={isLoading}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-lg shadow-lg hover:from-blue-600 hover:to-indigo-700 transition duration-200 disabled:opacity-50"
                    >
                        {isLoading ? 'Memproses...' : 'Mock Beli NFT (Base)'}
                    </button>
                    <p className="mt-4 text-xs text-gray-500">Simulasi: Cek kepemilikan NFT di Base Network.</p>
                </div>
            );
        }

        return (
            <div className="relative bg-white rounded-xl shadow-2xl h-full flex flex-col overflow-hidden">
                {isLoading && <LoadingOverlay />}
                {/* Profile Image */}
                <div className="flex-grow bg-cover bg-center" style={{ backgroundImage: `url(${currentProfile.img})` }}>
                    <div className="p-4 bg-gradient-to-t from-black/70 to-transparent absolute bottom-0 w-full">
                        <h3 className="text-4xl font-extrabold text-white">{currentProfile.name}, {currentProfile.age}</h3>
                        <p className="text-white mt-1">{currentProfile.description}</p>
                    </div>
                </div>
                
                {/* Swipe Buttons */}
                <div className="flex justify-around p-4 bg-gray-50 border-t border-gray-100">
                    <button
                        onClick={() => handleSwipe('reject')}
                        disabled={isLoading}
                        className="p-4 rounded-full bg-red-100 text-red-500 shadow-xl hover:bg-red-200 transition transform hover:scale-105"
                        aria-label="Reject"
                    >
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <button
                        onClick={() => handleSwipe('like')}
                        disabled={isLoading}
                        className="p-4 rounded-full bg-emerald-100 text-emerald-500 shadow-xl hover:bg-emerald-200 transition transform hover:scale-105"
                        aria-label="Like"
                    >
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </button>
                </div>
            </div>
        );
    };

    const MatchesView = () => {
        if (matchesList.length === 0) {
            return (
                <div className="bg-white p-6 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-center">
                    <h2 className="text-2xl font-bold text-gray-800">Belum Ada Kecocokan 💔</h2>
                    <p className="mt-4 text-gray-600">Saatnya kembali *swipe* untuk menemukan *match* Base Anda!</p>
                </div>
            );
        }

        return (
            <div className="h-full overflow-y-auto p-4 bg-white rounded-xl shadow-2xl">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Kecocokan Anda ({matchesList.length})</h2>
                <div className="space-y-3">
                    {matchesList.map((profile) => (
                        <div key={profile.id} className="flex items-center p-3 bg-gray-100 rounded-lg shadow-sm hover:bg-gray-200 transition cursor-pointer">
                            <img 
                                src={profile.img} 
                                alt={profile.name} 
                                className="w-12 h-12 object-cover rounded-full mr-4" 
                            />
                            <div className="flex-grow">
                                <span className="font-bold text-lg text-gray-800">{profile.name}, {profile.age}</span>
                                <p className="text-sm text-gray-500 truncate">{profile.description}</p>
                            </div>
                            <span className="text-pink-500 font-bold ml-4">MATCH!</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const LikesYouView = () => {
        if (!hasPaidToViewLikes) {
            return (
                <div className="bg-white p-6 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-center border-4 border-indigo-500">
                    <h2 className="text-2xl font-bold text-indigo-600 mb-4">Fitur Premium: Who Liked Me</h2>
                    <p className="text-gray-700 mb-6">Anda memiliki **{likesYouList.length} like** yang menunggu untuk dilihat!</p>
                    <p className="text-lg font-medium text-gray-800 mb-6">Bayar **$\approx 0.10$ USD (Base ETH)** untuk mengaktifkan!</p>
                    <button
                        onClick={handleMockPaymentForLikes}
                        disabled={isLoading}
                        className="w-full py-3 bg-gradient-to-r from-teal-400 to-cyan-500 text-white font-bold rounded-lg shadow-lg hover:from-teal-500 hover:to-cyan-600 transition duration-200 disabled:opacity-50"
                    >
                        {isLoading ? 'Memproses Transaksi...' : 'Mock Bayar 0.1 USD (Base ETH)'}
                    </button>
                    <p className="mt-4 text-xs text-gray-500">Simulasi: Transaksi on-chain menggunakan Base Network.</p>
                </div>
            );
        }

        if (likesYouList.length === 0) {
            return (
                <div className="bg-white p-6 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-center">
                    <h2 className="text-2xl font-bold text-gray-800">Kotak Masuk Kosong 😥</h2>
                    <p className="mt-4 text-gray-600">Saat ini belum ada yang menyukai Anda. Teruslah *swipe*!</p>
                </div>
            );
        }

        return (
            <div className="h-full overflow-y-auto p-4 bg-white rounded-xl shadow-2xl">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Orang yang Menyukai Anda ({likesYouList.length})</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {likesYouList.map((profile) => (
                        <div key={profile.id} className="relative rounded-lg overflow-hidden shadow-md">
                            <img src={profile.img} alt={profile.name} className="w-full h-40 object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-end p-2">
                                <span className="text-white font-bold text-lg">{profile.name}, {profile.age}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    
    // ---------------------------------------------
    // Main Render
    // ---------------------------------------------
    if (!isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <p className="text-white text-lg">Memuat BaseMatch...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 font-sans p-4 flex flex-col items-center">
            {/* NEW: Match Notification Modal */}
            <MatchNotification 
                match={matchNotification} 
                onClose={() => setMatchNotification(null)}
            />

            {/* Header / Nav */}
            <header className="w-full max-w-md bg-gray-800 p-4 rounded-xl shadow-lg mb-4 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <span className="text-xl font-bold text-cyan-400">⚛️ BaseMatch</span>
                    {/* FIXED: Check if userId is not null before calling substring */}
                    <span className="text-xs text-gray-500">
                        | User ID: {userId ? userId.substring(0, 8) : 'Loading'}...
                    </span>
                </div>
                
                {/* Nav Buttons (Hidden if gender not selected) */}
                {userGender && (
                    <nav className="flex space-x-2">
                        <button
                            onClick={() => setViewMode('swipe')}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition ${viewMode === 'swipe' ? 'bg-cyan-500 text-white shadow-md' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            Swipe
                        </button>
                        <button
                            onClick={() => setViewMode('matches')}
                            className={`relative px-3 py-1 rounded-full text-sm font-medium transition ${viewMode === 'matches' ? 'bg-cyan-500 text-white shadow-md' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            Matches
                            {matchesList.length > 0 && (
                                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                                    {matchesList.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setViewMode('likes')}
                            className={`relative px-3 py-1 rounded-full text-sm font-medium transition ${viewMode === 'likes' ? 'bg-cyan-500 text-white shadow-md' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            Likes You
                            {likesYouList.length > 0 && (
                                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                                    {likesYouList.length}
                                </span>
                            )}
                        </button>
                    </nav>
                )}
            </header>

            {/* Swipe Counter */}
             {userGender && viewMode === 'swipe' && (
                <div className="w-full max-w-md text-center text-sm text-gray-400 mb-2">
                    Swipe Harian: {dailySwipeCount}/{MAX_SWIPES_PER_DAY} {hasSubscriptionNFT ? '(Premium)' : ''}
                </div>
            )}


            {/* Error/Info Message Box */}
            {error && (
                <div className="w-full max-w-md bg-red-500 text-white p-3 rounded-lg mb-4 text-center shadow-md">
                    {error}
                </div>
            )}
            {hasSubscriptionNFT && (
                 <div className="w-full max-w-md bg-green-500 text-white p-2 rounded-lg mb-4 text-center shadow-md text-sm">
                    ✅ NFT Subscription Aktif! Swipe tak terbatas.
                </div>
            )}

            {/* Main Content Area */}
            <main className="w-full max-w-md flex-grow" style={{ height: '70vh' }}>
                {userGender === null ? (
                    <GenderSelectionScreen />
                ) : (
                    viewMode === 'swipe' ? <SwipeCard /> : (viewMode === 'likes' ? <LikesYouView /> : <MatchesView />)
                )}
            </main>
            
            {/* Mock Farcaster Footer */}
             <footer className="mt-6 w-full max-w-md text-center text-gray-500 text-sm p-4 border-t border-gray-700">
                <p>Aplikasi ini mensimulasikan integrasi Farcaster dan Base Network.</p>
                <button 
                    className="mt-2 text-cyan-400 font-medium hover:text-cyan-300"
                    onClick={() => alert("Simulasi: Panggilan ke Farcaster Auth API untuk Login/Signing.")}
                >
                    Klik untuk Simulasi Connect Farcaster Wallet
                </button>
            </footer>
        </div>
    );
};

export default App;
