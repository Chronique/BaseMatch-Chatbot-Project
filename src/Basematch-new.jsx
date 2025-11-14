import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { Sparkles, X, Heart, RefreshCw, Link as LinkIcon, Wallet, MessageSquare } from 'lucide-react';

// --- GLOBAL VARIABLES (Provided by Canvas Environment - Mocks for local run) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'basematch-default';
// MOCK FIREBASE CONFIG: Replace with your actual config in a real project
const firebaseConfig = { 
    apiKey: "AIzaSy...", 
    authDomain: "projectId.firebaseapp.com",
    projectId: "projectId",
    storageBucket: "projectId.appspot.com",
    messagingSenderId: "...",
    appId: "..."
}; 
const initialAuthToken = null; 

// --- CONFIGURATION ---
const DAILY_SWIPE_LIMIT = 50; 
const UNLIMITED_SWIPE_SIMULATION = 9999; 

// --- UTILITY FUNCTIONS ---
const getTodayDateString = () => new Date().toISOString().split('T')[0];
const getSafeAppId = (id) => id.replace(/\//g, '__');

// --- FIREBASE CONTEXT (Initialization) ---
let db, auth;
let app;

if (Object.keys(firebaseConfig).length > 0 && typeof window !== 'undefined' && !app) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    } catch (e) {
        console.error("Firebase initialization failed. Running in mock mode.", e);
    }
}

const getUserDocRef = (userId) => {
    if (!db || !userId) return null;
    const safeAppId = getSafeAppId(appId);
    // Path: /artifacts/{safeAppId}/users/{userId}
    return doc(db, 'artifacts', safeAppId, 'users', userId);
};

// --- DATA MOCKING ---
const MOCK_PROFILES = [
    { id: 'p1', name: 'Rizky', age: 26, bio: 'Insinyur software, penggemar hiking. Siap untuk petualangan baru.', color: 'bg-blue-600', text: 'Rizky 26' },
    { id: 'p2', name: 'Siska', age: 23, bio: 'Artis digital, mendengarkan musik indie. Mari kita bahas hal-hal keren!', color: 'bg-red-500', text: 'Siska 23' },
    { id: 'p3', name: 'Ayu', age: 24, bio: 'Suka kopi dan diskusi filosofis. Mencari koneksi yang tulus.', color: 'bg-indigo-600', text: 'Ayu 24' },
    { id: 'p4', name: 'Deni', age: 30, bio: 'Web3 developer dan penggemar Base L2.', color: 'bg-emerald-600', text: 'Deni 30' },
];

// --- COMPONENTS ---

/**
 * Komponen utama untuk tampilan Swipe (meniru tampilan video)
 */
const DatingSwipeScreen = ({ profile, handleSwipe, handleUpgrade, userStatus, swipesRemaining }) => {
    const [message, setMessage] = useState('');
    const [cardPosition, setCardPosition] = useState({ x: 0, y: 0, rotate: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const cardRef = useRef(null);
    const isPremium = userStatus?.isPremium || false;

    const handleSwipeClick = useCallback((direction) => {
        if (!isPremium && swipesRemaining <= 0) {
            setMessage('Batas harian Anda telah habis!');
            setTimeout(() => setMessage(''), 1500);
            // Panggil handleUpgrade untuk memicu modal
            handleUpgrade('limit_reached'); 
            return;
        }

        const actionText = direction === 'LIKE' ? 'Suka' : 'Tidak Suka';
        setMessage(`Anda ${actionText} ${profile.name}!`);
        handleSwipe(direction);
        setTimeout(() => setMessage(''), 1000); 

        // Animasikan keluar kartu jika tombol diklik
        setCardPosition({ 
            x: direction === 'LIKE' ? window.innerWidth : -window.innerWidth, 
            y: 0, 
            rotate: direction === 'LIKE' ? 15 : -15 
        });
    }, [isPremium, swipesRemaining, profile, handleSwipe, handleUpgrade]);


    // --- SWIPE LOGIC (Menggunakan logika swipe kanan/kiri) ---

    const startDrag = (clientX) => {
        if (!profile || (!isPremium && swipesRemaining <= 0)) return;
        setIsDragging(true);
        setStartX(clientX);
        setMessage('');
        if (cardRef.current) {
            cardRef.current.style.transition = 'none'; 
        }
    };

    const onDrag = useCallback((clientX) => {
        if (!isDragging) return;
        const deltaX = clientX - startX;
        const rotate = deltaX / 20; 
        setCardPosition({ x: deltaX, y: 0, rotate: rotate });
    }, [isDragging, startX]);

    const endDrag = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);

        if (cardRef.current) {
            cardRef.current.style.transition = 'transform 0.3s ease-out'; 
        }

        const threshold = 100; // Ambang batas geser horizontal
        
        if (cardPosition.x > threshold) {
            // Geser ke kanan (Positive X) -> LIKE
            handleSwipeClick('LIKE');
        } else if (cardPosition.x < -threshold) {
            // Geser ke kiri (Negative X) -> DISLIKE
            handleSwipeClick('DISLIKE'); 
        } else {
            // Snap back to center
            setCardPosition({ x: 0, y: 0, rotate: 0 });
        }
    }, [isDragging, cardPosition.x, handleSwipeClick]);


    // Mouse/Touch Handlers setup (sama seperti kode sebelumnya)
    const handleMouseDown = (e) => startDrag(e.clientX);
    const handleMouseMove = useCallback((e) => onDrag(e.clientX), [onDrag]);
    const handleMouseUp = endDrag;
    const handleTouchStart = (e) => startDrag(e.targetTouches[0].clientX);
    const handleTouchMove = useCallback((e) => onDrag(e.targetTouches[0].clientX), [onDrag]);
    const handleTouchEnd = endDrag;

    const onCardTransitionEnd = useCallback(() => {
        if (Math.abs(cardPosition.x) > 0 || Math.abs(cardPosition.y) > 0 || Math.abs(cardPosition.rotate) > 0) {
             // Reset posisi setelah animasi keluar selesai, untuk kartu berikutnya
             setCardPosition({ x: 0, y: 0, rotate: 0 });
        }
    }, [cardPosition]);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);
    // --- END SWIPE LOGIC ---


    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6 bg-white rounded-lg shadow-lg">
                <RefreshCw className="w-10 h-10 text-emerald-400 mb-4 animate-spin" />
                <h2 className="text-xl font-semibold mb-2 text-gray-800">Semua Profil Sudah Dilihat!</h2>
                <p className="text-gray-500">Coba lagi besok atau *Bayar Token* Premium untuk fitur khusus.</p>
            </div>
        );
    }

    return (
        <div className="relative flex flex-col items-center w-full max-w-lg p-4">
            {/* Status Swipe Harian */}
            <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-sm font-medium shadow-md mb-6 w-full text-center">
                {isPremium ? (
                    <span className='font-bold text-lg text-red-500'>Swipe Tak Terbatas (PREMIUM) 🔥</span>
                ) : (
                    <>Sisa Swipe Hari Ini: **{swipesRemaining} / {DAILY_SWIPE_LIMIT}**</>
                )}
            </div>
            
            {/* Swipe Status Message */}
            {message && (
                <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full z-20 shadow-lg animate-pulse">
                    {message}
                </div>
            )}

            {/* Profile Card */}
            <div className="relative w-full max-w-sm h-[400px] mb-6">
                <div className={`absolute w-full h-full rounded-2xl shadow-xl overflow-hidden flex flex-col justify-end p-0 ${profile.color}`}
                    ref={cardRef}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    style={{
                        transform: `translateX(${cardPosition.x}px) translateY(${cardPosition.y}px) rotate(${cardPosition.rotate}deg)`,
                        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                        cursor: 'grab'
                    }}
                    onTransitionEnd={onCardTransitionEnd}
                >
                    {/* Teks Besar (seperti di video) */}
                    <div className="flex flex-col justify-center items-center h-full text-white text-6xl font-extrabold p-8">
                        {profile.text}
                    </div>

                    {/* Info Bio di bawah */}
                    <div className="bg-white p-4 text-gray-900 border-t border-gray-200">
                        <h2 className="text-xl font-bold">{profile.name}, {profile.age}</h2>
                        <p className="text-sm mt-1">{profile.bio}</p>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center w-full max-w-sm space-x-6 mt-6">
                <button
                    onClick={() => handleSwipeClick('DISLIKE')}
                    disabled={!isPremium && swipesRemaining <= 0}
                    className={`p-4 ${(!isPremium && swipesRemaining <= 0) ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'} text-white rounded-full shadow-xl transition duration-200 transform active:scale-95`}
                    aria-label="Tidak Suka / Dislike"
                >
                    <X className="w-8 h-8" />
                </button>

                <button
                    onClick={() => handleSwipeClick('LIKE')}
                    disabled={!isPremium && swipesRemaining <= 0}
                    className={`p-4 ${(!isPremium && swipesRemaining <= 0) ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600'} text-white rounded-full shadow-xl transition duration-200 transform active:scale-95`}
                    aria-label="Suka / Like"
                >
                    <Heart className="w-8 h-8 fill-white" />
                </button>
            </div>
            
            {/* Mint NFT Link */}
            {!isPremium && (
                <button 
                    onClick={() => handleUpgrade('limit_reached')} // Langsung arahkan ke modal limit_reached
                    className="text-sm text-blue-600 hover:text-blue-800 font-semibold mt-4 underline"
                >
                    Dapatkan UNLIMITED SWIPE dengan Bayar Token Base?
                </button>
            )}

            {/* Pesan Suka/Tidak Suka di bawah (seperti di video) */}
            <div className="absolute bottom-[-50px] text-gray-500 text-sm font-medium">
                {profile.id === 'p1' && 'Anda Suka Ayu!'}
                {profile.id === 'p2' && 'Anda Suka Rizky!'}
                {profile.id === 'p3' && 'Anda Tidak Suka Siska!'}
            </div>
        </div>
    );
};

/**
 * Komponen untuk tampilan Chatbot (meniru tampilan video)
 */
const ChatbotScreen = () => {
    const [messages, setMessages] = useState([
        { id: 1, text: "Selamat datang di BaseMatch Chat! Saya adalah AI Matchmaker Anda.", sender: "AI" },
        { id: 2, text: "Apa fitur favorit Anda di Farcaster?", sender: "AI" },
    ]);
    const [input, setInput] = useState('');

    const sendMessage = () => {
        if (input.trim() === '') return;

        const newMessage = { id: messages.length + 1, text: input, sender: 'Anda' };
        setMessages([...messages, newMessage]);
        setInput('');

        // Simulasi respons AI
        setTimeout(() => {
            const aiResponse = { id: messages.length + 2, text: `(AI Merespons) Menarik! Kami menggunakan Base untuk...`, sender: 'AI' };
            setMessages(prev => [...prev, aiResponse]);
        }, 1000);
    };

    return (
        <div className="flex flex-col h-[70vh] w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-hidden">
            <h3 className="p-4 text-center font-bold text-lg text-gray-800 border-b border-gray-200">
                BaseMatch Chat (Web3 Integrasi)
            </h3>
            
            {/* Message Area */}
            <div className="flex-grow p-4 overflow-y-auto space-y-3">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'Anda' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] p-3 rounded-xl shadow-md ${
                            msg.sender === 'Anda' 
                            ? 'bg-emerald-500 text-white' 
                            : 'bg-gray-200 text-gray-800'
                        }`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Kirim pesan (Simula: Kirim)"
                        className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-gray-800"
                    />
                    <button
                        onClick={sendMessage}
                        className="px-4 py-2 bg-emerald-500 text-white font-semibold rounded-lg hover:bg-emerald-600 transition"
                    >
                        Kirim
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Fitur ini mensimulasikan interaksi yang mungkin menggunakan konteks Farcaster atau data Base L2 Anda.
                </p>
            </div>
        </div>
    );
}

/**
 * Komponen Modal Web3/Pembayaran Token
 */
const Web3Modal = ({ isOpen, step, onClose, onConnectWallet, onMintNFT }) => { // Nama fungsi tetap onMintNFT agar tidak merombak fungsi pemanggil
    if (!isOpen) return null;

    const [walletAddress, setWalletAddress] = useState(null);

    const handleConnect = () => {
        // Simulasi koneksi wallet
        const mockAddress = '0x4Ba8...9dEA'; 
        setWalletAddress(mockAddress);
        onConnectWallet(mockAddress);
    };

    const handlePayment = () => { // Mengganti nama fungsi lokal
        onMintNFT(walletAddress);
    };

    const modalContent = {
        'limit_reached': {
            title: "Batas Swipe Tercapai!",
            body: (
                <>
                    Anda telah mencapai batas harian **{DAILY_SWIPE_LIMIT} *swipe***. Tingkatkan ke Premium dengan Pembayaran Token Base untuk mendapatkan *swipe* tak terbatas.
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800">
                        **BaseMatch Premium** (Simulasi): <br/>
                        Bayar sekali di Jaringan Base: **0.1 USDC (atau setara ETH)**
                    </div>
                </>
            ),
            buttons: [
                { text: "Tutup", action: onClose, color: "bg-gray-300 text-gray-800" },
                { text: "Lanjut ke Pembayaran", action: () => onConnectWallet(null), color: "bg-emerald-500 text-white" }
            ],
        },
        'connect_wallet': {
            title: "Hubungkan Wallet Web3",
            body: (
                <p>Anda perlu menghubungkan dompet Ethereum Anda (diutamakan di jaringan Base) untuk Beli Premium.</p>
            ),
            buttons: [
                { text: "Tutup", action: onClose, color: "bg-gray-300 text-gray-800" },
                { text: "Hubungkan Wallet", action: handleConnect, color: "bg-blue-500 text-white" }
            ],
        },
        'mint_confirm': {
            title: "Konfirmasi Pembayaran di Base",
            body: (
                <>
                    <p>
                        Dompet Anda **({walletAddress})** siap Bayar Token Premium di Jaringan Base. Ini akan mengaktifkan *Unlimited Swipe*.
                    </p>
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-gray-800 font-semibold">
                        Biaya Pembayaran (Simulasi): <br/>
                        0.1 USDC atau setara ETH + Gas Fee
                    </div>
                </>
            ),
            buttons: [
                { text: "Kembali", action: () => onConnectWallet(null), color: "bg-gray-300 text-gray-800" },
                { text: "Bayar Token Sekarang!", action: handlePayment, color: "bg-emerald-500 text-white font-bold" }
            ],
        },
        'mint_processing': {
            title: "Transaksi Base Sedang Diproses...",
            body: (
                <div className="flex flex-col items-center">
                    <RefreshCw className="w-8 h-8 text-blue-500 mb-4 animate-spin" />
                    <p>Mohon tunggu. Pembayaran Token Base Anda sedang diverifikasi.</p>
                </div>
            ),
            buttons: [], // Tidak ada tombol saat loading
        },
        // Step baru untuk konfirmasi koneksi
        'wallet_connected': {
            title: "Wallet Terhubung!",
            body: (
                <p>
                    Dompet **{walletAddress}** berhasil terhubung (Simulasi). Lanjutkan untuk Bayar Premium.
                </p>
            ),
            buttons: [
                { text: "Lanjut Bayar", action: handlePayment, color: "bg-emerald-500 text-white font-bold" }
            ],
        }
    };

    const currentStep = modalContent[step] || modalContent['limit_reached'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl max-w-sm w-full shadow-2xl">
                <h3 className="text-xl font-bold text-gray-900 mb-4">{currentStep.title}</h3>
                <div className="text-gray-700 mb-6 text-sm">
                    {currentStep.body}
                </div>
                <div className="flex justify-between space-x-4">
                    {currentStep.buttons.map((btn, index) => (
                        <button
                            key={index}
                            onClick={btn.action}
                            className={`flex-1 px-4 py-2 rounded-lg font-semibold transition ${btn.color}`}
                        >
                            {btn.text}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App = () => {
    // ID Farcaster simulasi
    const [userId, setUserId] = useState('42069'); 
    const [userStatus, setUserStatus] = useState({
        swipesToday: 49, // Dimulai dari 49 agar cepat mencapai limit
        isPremium: false,
        lastResetDate: getTodayDateString(),
        matches: [],
        walletAddress: null,
        farcasterConnected: false,
    });
    const [profiles, setProfiles] = useState(MOCK_PROFILES);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [activeTab, setActiveTab] = useState('swiping'); // 'swiping' atau 'chatbot'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalStep, setModalStep] = useState('limit_reached'); // State modal

    // Simulasikan Auth/Firebase Initialization
    useEffect(() => {
        // Asumsi autentikasi sudah selesai dan userId sudah ada
        console.log("App Initialized. User ID:", userId);
    }, [userId]);


    // FIREBASE STATUS LISTENER (Simulasi untuk mengikuti status video)
    useEffect(() => {
        if (!db || !userId) return;

        const docRef = getUserDocRef(userId);

        const initialStatus = {
            swipesToday: 49, // Mulai dari 49 seperti di video
            isPremium: false,
            lastResetDate: getTodayDateString(),
            matches: [], 
            walletAddress: null,
            farcasterConnected: false,
        };

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            let data = docSnap.exists() ? docSnap.data().status : initialStatus;
            
            // Reset logic
            if (data.lastResetDate !== getTodayDateString()) {
                data = { ...data, swipesToday: 0, lastResetDate: getTodayDateString() };
                updateDoc(docRef, { 'status': data }).catch(e => console.error("Failed to reset status:", e));
            }

            setUserStatus(data);

            if (!docSnap.exists()) {
                setDoc(docRef, { status: initialStatus }).catch(e => console.error("Failed to create initial status:", e));
            }
        }, (error) => {
            console.warn("Firestore error, running with local mock status.", error);
            setUserStatus(initialStatus); // Fallback
        });

        return () => unsubscribe();
    }, [userId]);


    const currentProfile = profiles[currentIndex % profiles.length];
    const swipeLimit = userStatus.isPremium ? UNLIMITED_SWIPE_SIMULATION : DAILY_SWIPE_LIMIT;
    const swipesRemaining = swipeLimit - (userStatus.swipesToday || 0);
    
    // --- HANDLERS ---
    
    // Fungsi yang diperbarui untuk menangani alur modal
    const handleUpgrade = useCallback((step) => {
        if (!userStatus.isPremium) {
            setIsModalOpen(true);
            setModalStep(step || 'limit_reached');
        }
    }, [userStatus.isPremium]);


    const handleSwipe = useCallback(async (direction) => {
        if (!userStatus.isPremium && swipesRemaining <= 0) {
             // Panggil handleUpgrade untuk memicu modal
             handleUpgrade('limit_reached');
             return;
        }

        if (!currentProfile || !userId) return;

        const docRef = getUserDocRef(userId);

        try {
            // 1. Update swipe count (Only increment if not Premium)
            let newSwipes = userStatus.swipesToday || 0;
            if (!userStatus.isPremium) {
                newSwipes = newSwipes + 1;
            } 
            
            const updates = { 'status.swipesToday': newSwipes };

            // 2. Update matches (if liked)
            if (direction === 'LIKE') {
                updates['status.matches'] = arrayUnion(currentProfile.id);
            } 

            // Simulasikan update ke Firebase (jika db ada)
            if (docRef) {
                await updateDoc(docRef, updates);
            } else {
                 // Update status lokal untuk mock run
                 setUserStatus(prev => ({
                     ...prev, 
                     swipesToday: newSwipes,
                     matches: direction === 'LIKE' ? [...prev.matches, currentProfile.id] : prev.matches
                 }));
            }

            // 3. Move to next profile (looping the array)
            setCurrentIndex(prev => prev + 1);

        } catch (error) {
            console.error("Error during swipe operation:", error);
        }
    }, [currentProfile, userId, userStatus.isPremium, userStatus.swipesToday, swipesRemaining, handleUpgrade]);

    // --- PEMBAYARAN TOKEN PROSES HANDLERS ---
    const handleConnectWallet = (address) => {
        if (address) {
            // Wallet terhubung
            setModalStep('mint_confirm');
            setUserStatus(prev => ({ ...prev, walletAddress: address }));
        } else {
            // Mengarahkan ke step koneksi wallet dari 'limit_reached'
            setModalStep('connect_wallet');
        }
    };

    const handleMintNFT = async (walletAddress) => {
        setIsModalOpen(true);
        setModalStep('mint_processing');

        // Simulasi Transaksi Base L2 (1.5 detik)
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        // Update status di Firebase (atau lokal) menjadi Premium
        const docRef = getUserDocRef(userId);
        const premiumUpdates = {
            isPremium: true,
            swipesToday: 0, 
            walletAddress: walletAddress,
        };

        if (docRef) {
             await updateDoc(docRef, { 'status': premiumUpdates }).catch(e => console.error("Failed to update status to Premium:", e));
        }
        
        // Update status lokal
        setUserStatus(prev => ({
            ...prev, 
            ...premiumUpdates
        }));
        
        // Tutup modal dan tampilkan pesan sukses
        setIsModalOpen(false);
        // Ganti alert dengan pesan di UI yang lebih baik jika ini adalah aplikasi nyata.
        // Karena ini hanya simulasi, kita gunakan window.alert
        window.alert("Selamat! Pembayaran berhasil. Anda SEKARANG pengguna Premium dengan UNLIMITED SWIPE!");
    };


    // --- UI RENDER ---

    const Header = () => (
        <header className="w-full max-w-lg flex flex-col items-center bg-white p-4 shadow-md">
            <div className="flex justify-between w-full mb-3">
                <div className="flex flex-col text-sm text-gray-500">
                    <h1 className="text-xl font-bold text-gray-800">BaseMatch</h1>
                    <span className="text-xs">ID Pengguna Farcaster: {userId}</span>
                </div>
                <div className="flex flex-col items-end text-sm">
                    <button 
                        className={`text-xs p-1 rounded ${userStatus.farcasterConnected ? 'text-blue-600' : 'text-gray-500'}`}
                        onClick={() => setUserStatus(prev => ({...prev, farcasterConnected: !prev.farcasterConnected}))}
                    >
                        Hubungkan Farcaster {userStatus.farcasterConnected ? 'Terhubung' : ''}
                    </button>
                    <button 
                        className={`text-xs p-1 rounded ${userStatus.walletAddress ? 'text-emerald-600' : 'text-gray-500'}`}
                        onClick={() => handleUpgrade('connect_wallet')} // Panggil handleUpgrade ke connect_wallet
                    >
                        Wallet Base {userStatus.walletAddress || 'Hubungkan Wallet'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex w-full bg-gray-100 p-1 rounded-lg">
                <button
                    onClick={() => setActiveTab('swiping')}
                    className={`flex-1 flex items-center justify-center p-2 rounded-lg font-semibold transition ${activeTab === 'swiping' ? 'bg-white text-pink-600 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Heart className="w-5 h-5 mr-1 fill-pink-600" /> Swiping
                </button>
                <button
                    onClick={() => setActiveTab('chatbot')}
                    className={`flex-1 flex items-center justify-center p-2 rounded-lg font-semibold transition ${activeTab === 'chatbot' ? 'bg-white text-gray-800 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <MessageSquare className="w-5 h-5 mr-1" /> Chatbot AI
                </button>
            </div>
            
            {userStatus.isPremium && (
                <div className="mt-3 w-full text-center bg-yellow-500 text-gray-900 font-bold p-1 rounded-md text-sm">
                    BaseMatch Premium <Sparkles className="w-4 h-4 inline" />
                </div>
            )}
        </header>
    );

    return (
        <div className="flex flex-col min-h-screen bg-gray-50 items-center">
            <Header />
            <main className="flex-grow w-full max-w-lg flex items-start justify-center pt-8 pb-4 bg-gray-50">
                {activeTab === 'swiping' ? (
                    <DatingSwipeScreen
                        profile={currentProfile}
                        handleSwipe={handleSwipe}
                        handleUpgrade={handleUpgrade}
                        userStatus={userStatus}
                        swipesRemaining={swipesRemaining}
                    />
                ) : (
                    <ChatbotScreen />
                )}
            </main>
            <Web3Modal
                isOpen={isModalOpen}
                step={modalStep}
                onClose={() => setIsModalOpen(false)}
                onConnectWallet={handleConnectWallet}
                onMintNFT={handleMintNFT}
            />
        </div>
    );
};

export default App;
