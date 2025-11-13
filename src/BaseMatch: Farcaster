import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// Atur log level debug untuk Firestore (membantu debugging)
setLogLevel('debug');

// Konstanta global yang disediakan oleh lingkungan Canvas
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const DAILY_SWIPE_LIMIT = 50;

// --- Inisialisasi Firebase ---
let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    } catch (e) {
        console.error("Gagal menginisialisasi Firebase:", e);
    }
} else {
    console.error("Konfigurasi Firebase tidak tersedia. Aplikasi tidak akan berfungsi dengan Firestore.");
}

// ----------------------------------------------------------------------
// UTILITAS FIREBASE - PERBAIKAN PATH KRITIS
// ----------------------------------------------------------------------
// Ganti garis miring dalam appId agar selalu dianggap sebagai SATU dokumen ID.
const safeAppId = appId.replace(/\//g, '__'); 

const getUserDocRef = (db, userId) => {
    if (!db || !userId) return null;
    // Path Dokumen yang BENAR: artifacts (C) / safeAppId (D) / users (C) / userId (D)
    // Jumlah segmen: 4 (Genap), yang merupakan Dokumen.
    return doc(db, 'artifacts', safeAppId, 'users', userId);
};

// Fungsi untuk mengecek apakah sudah hari baru
const isNewDay = (lastResetDate) => {
    if (!lastResetDate) return true;
    const today = new Date();
    // lastReset adalah Timestamp Firestore, perlu dikonversi ke Date objek
    const lastReset = lastResetDate.toDate(); 
    return today.toDateString() !== lastReset.toDateString();
};

// ----------------------------------------------------------------------
// HOOK SIMULASI WALLET/FARCASTER
// ----------------------------------------------------------------------
const useWeb3Wallet = () => {
    const [walletConnected, setWalletConnected] = useState(false);
    const [farcasterConnected, setFarcasterConnected] = useState(false);
    const [walletAddress, setWalletAddress] = useState('0x...');

    const connectWallet = () => {
        // Simulasi koneksi dompet di jaringan Base
        setTimeout(() => {
            setWalletConnected(true);
            setWalletAddress('0x4bA8...9dEa'); // Mock address
        }, 500);
    };

    const connectFarcaster = () => {
        // Simulasi Sign In with Farcaster (SIWF)
        setTimeout(() => {
            setFarcasterConnected(true);
        }, 700);
    };

    return { walletConnected, farcasterConnected, walletAddress, connectWallet, connectFarcaster };
};


// ----------------------------------------------------------------------
// Komponen DatingSwipeApp
// ----------------------------------------------------------------------
const DatingSwipeScreen = ({ db, auth, userId, isAuthReady, web3 }) => {
    const [swipeData, setSwipeData] = useState({
        count: 0,
        isPremium: false,
        lastReset: null,
    });
    const [currentProfile, setCurrentProfile] = useState(0);
    const [message, setMessage] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalStep, setModalStep] = useState('limit'); // 'limit', 'connect', 'mint'

    const mockProfiles = [
        { name: "Ayu", age: 24, bio: "Suka kopi dan diskusi filosofis. Mencari koneksi yang tulus.", image: "https://placehold.co/400x450/4C4CFF/FFFFFF?text=Ayu+24" },
        { name: "Rizky", age: 26, bio: "Insinyur software, penggemar hiking. Siap untuk petualangan baru.", image: "https://placehold.co/400x450/004080/FFFFFF?text=Rizky+26" },
        { name: "Siska", age: 23, bio: "Artis digital, mendengarkan musik indie. Mari kita bahas hal-hal keren!", image: "https://placehold.co/400x450/FF6347/FFFFFF?text=Siska+23" },
    ];
    const profile = mockProfiles[currentProfile % mockProfiles.length];

    // 2. Fetch Data Limit dari Firestore secara real-time
    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;

        const docRef = getUserDocRef(db, userId); 
        if (!docRef) return; // Guard against null ref

        console.log(`Mendengarkan Dokumen: ${docRef.path}`); // Log path yang benar

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const status = data.status || {}; 
                setSwipeData({
                    count: status.swipesToday || 0,
                    isPremium: status.isPremium || false,
                    lastReset: status.lastResetDate,
                });
            } else {
                // Dokumen tidak ada, inisialisasi
                console.log("Dokumen user tidak ditemukan, membuat dokumen baru.");
                setDoc(docRef, {
                    status: { 
                        swipesToday: 0,
                        isPremium: false,
                        lastResetDate: new Date(),
                    }
                }, { merge: true }).catch(e => console.error("Gagal membuat dokumen awal:", e));
            }
        }, (error) => {
            console.error("Kesalahan membaca status pengguna:", error);
            setMessage("Gagal memuat status, coba refresh.");
        });

        return () => unsubscribe();
    }, [isAuthReady, userId, db]);

    // 3. Cek dan Reset Limit Harian
    useEffect(() => {
        if (isAuthReady && userId && db && swipeData.lastReset && isNewDay(swipeData.lastReset)) {
            const docRef = getUserDocRef(db, userId); 
            if (!docRef) return;

            console.log("Hari baru terdeteksi, mereset hitungan swipe.");
            updateDoc(docRef, {
                'status.swipesToday': 0, 
                'status.lastResetDate': new Date(), 
            }).catch(e => console.error("Gagal mereset swipe count:", e));
        }
    }, [isAuthReady, userId, db, swipeData.lastReset]);


    // 4. Handler Swipe (Like/Dislike)
    const handleSwipe = async (direction) => {
        if (!db || !userId) {
            setMessage("Autentikasi belum siap.");
            return;
        }

        const canSwipe = swipeData.isPremium || swipeData.count < DAILY_SWIPE_LIMIT;
        
        if (!canSwipe) {
            setShowModal(true); 
            setModalStep('limit');
            return;
        }

        setMessage(`Anda ${direction === 'LIKE' ? 'Suka' : 'Tidak Suka'} ${profile.name}!`);

        setCurrentProfile(prev => prev + 1);

        // Update hitungan di Firestore (Hanya jika BUKAN premium)
        if (!swipeData.isPremium) {
            const docRef = getUserDocRef(db, userId); 
            if (!docRef) return;

            try {
                await updateDoc(docRef, {
                    'status.swipesToday': swipeData.count + 1, 
                });
                console.log("Swipe count berhasil diperbarui.");
            } catch (e) {
                console.error("Gagal memperbarui swipe count:", e);
                setMessage("Kesalahan saat menyimpan swipe count.");
            }
        }
    };

    // 5. Handler Mint Premium NFT di Base
    const handleMintOnBase = async () => {
        if (!db || !userId) return;

        setModalStep('minting');
        setMessage("Memproses Minting NFT di Base L2...");

        // SIMULASI MINTING DAN TRANSAKSI DI BASE L2
        setTimeout(async () => {
            setMessage(`Simulasi: Transaksi Mint NFT Base berhasil dari ${web3.walletAddress}!`);
            
            const docRef = getUserDocRef(db, userId); 
            if (!docRef) return;

            try {
                // Gunakan setDoc untuk mengaktifkan status Premium
                await setDoc(docRef, { 
                    status: {
                        isPremium: true,
                        swipesToday: 0,
                        lastResetDate: new Date(),
                    }
                }, { merge: true });

                setShowModal(false);
                setMessage("Selamat! Anda sekarang pengguna Premium dengan UNLIMITED SWIPE!");
            } catch (e) {
                console.error("Gagal mengaktifkan status Premium setelah Mint:", e);
                setMessage("Gagal mengaktifkan status Premium.");
            }
        }, 2000); // Simulasi waktu transaksi
    };

    // Fungsi untuk menutup modal dan mereset langkah
    const closeModal = () => {
        setShowModal(false);
        setModalStep('limit');
    };

    if (!isAuthReady) {
        return <div className="text-center p-8 text-gray-500">Menunggu Autentikasi...</div>;
    }

    const swipesRemaining = DAILY_SWIPE_LIMIT - swipeData.count;
    const isLimitReached = !swipeData.isPremium && swipesRemaining <= 0;

    return (
        <div className="flex flex-col items-center p-4 h-full">
            {/* Modal Premium (jika batas tercapai) */}
            {showModal && (
                <UpgradeModal 
                    onClose={closeModal} 
                    onMint={handleMintOnBase}
                    web3={web3}
                    step={modalStep}
                    setStep={setModalStep}
                />
            )}

            <h2 className="text-2xl font-extrabold mb-4 text-indigo-700">
                {swipeData.isPremium ? "BaseMatch Premium 🔥" : "BaseMatch Swiping"}
            </h2>

            {/* Status Swipe */}
            <div className={`mb-4 p-3 rounded-xl w-full max-w-sm text-center font-semibold 
                ${swipeData.isPremium 
                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' 
                    : isLimitReached 
                        ? 'bg-red-100 text-red-700 border border-red-300' 
                        : 'bg-green-100 text-green-700 border border-green-300'}`}
            >
                {swipeData.isPremium
                    ? 'Swipe Tak Terbatas (PREMIUM)'
                    : `Sisa Swipe Hari Ini: ${swipesRemaining} / ${DAILY_SWIPE_LIMIT}`
                }
            </div>

            {/* Kartu Profil */}
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden relative border-4 border-indigo-500/50">
                <div 
                    className="h-[450px] bg-cover bg-center" 
                    style={{ backgroundImage: `url(${profile.image})` }}
                >
                </div>
                <div className="p-4">
                    <h3 className="text-3xl font-bold text-gray-800">{profile.name}, {profile.age}</h3>
                    <p className="text-gray-600 mt-2">{profile.bio}</p>
                </div>
            </div>

            {/* Tombol Swipe */}
            <div className="flex space-x-6 mt-6 w-full max-w-sm">
                <button
                    onClick={() => handleSwipe('DISLIKE')}
                    disabled={isLimitReached}
                    className="flex-1 p-4 bg-red-500 text-white rounded-full font-bold shadow-lg shadow-red-300 hover:bg-red-600 transition duration-150 transform hover:scale-105 disabled:bg-gray-400 disabled:shadow-none"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 10-2 0v6a1 1 0 102 0V8z" clipRule="evenodd" />
                    </svg>
                </button>
                <button
                    onClick={() => handleSwipe('LIKE')}
                    disabled={isLimitReached}
                    className="flex-1 p-4 bg-green-500 text-white rounded-full font-bold shadow-lg shadow-green-300 hover:bg-green-600 transition duration-150 transform hover:scale-105 disabled:bg-gray-400 disabled:shadow-none"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 12a1 1 0 11-2 0v-4a1 1 0 112 0v4zm-1-9a1 1 0 100 2 1 1 0 000-2z" />
                    </svg>
                </button>
            </div>
            
            {/* Pesan Aksi */}
            {message && (
                <div className="mt-4 p-2 bg-blue-100 text-blue-700 rounded-lg text-sm w-full max-w-sm text-center">
                    {message}
                </div>
            )}
            
            {/* Opsi Upgrade Terpisah (Jika belum premium) */}
            {!swipeData.isPremium && (
                <button 
                    onClick={() => { setShowModal(true); setModalStep('limit'); }}
                    className="mt-6 text-sm text-indigo-500 hover:text-indigo-700 font-semibold underline"
                >
                    Dapatkan UNLIMITED SWIPE dengan Mint NFT Base?
                </button>
            )}
        </div>
    );
};

// ----------------------------------------------------------------------
// Komponen Modal Upgrade Premium
// ----------------------------------------------------------------------
const UpgradeModal = ({ onClose, onMint, web3, step, setStep }) => {
    
    // Logika navigasi modal
    const handleProceed = () => {
        if (!web3.walletConnected) {
            setStep('connect');
        } else {
            setStep('mint');
        }
    };

    const renderContent = () => {
        switch (step) {
            case 'limit':
                return (
                    <>
                        <h3 className="text-3xl font-bold text-red-600 mb-4 flex items-center">
                            Batas Swipe Tercapai!
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Anda telah mencapai batas harian **50 swipe**. Tingkatkan ke Premium dengan Minting NFT Base untuk mendapatkan *swipe* tak terbatas.
                        </p>
                        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 mb-6">
                            <p className="font-bold text-lg text-purple-700">BaseMatch Premium NFT</p>
                            <p className="text-sm mt-1">Mint Sekali di Jaringan Base (Simulasi):</p>
                            <div className="flex justify-between items-center mt-3 text-xl font-mono text-purple-900">
                                <span>0.001 ETH (Base)</span>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition">Tutup</button>
                            <button onClick={handleProceed} className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 transition shadow-md shadow-indigo-300">Lanjut ke Minting</button>
                        </div>
                    </>
                );
            
            case 'connect':
                return (
                    <>
                        <h3 className="text-3xl font-bold text-indigo-600 mb-4 flex items-center">
                            Hubungkan Wallet Web3
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Anda perlu menghubungkan dompet Ethereum Anda (diutamakan di jaringan Base) untuk Mint NFT Premium.
                        </p>
                        
                        {!web3.walletConnected ? (
                            <button 
                                onClick={web3.connectWallet}
                                className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition shadow-md shadow-blue-300 flex items-center justify-center mb-4"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 00-1.414 0L15 10.586V7a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 000-1.414zM2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm0 10a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" clipRule="evenodd" /></svg>
                                Hubungkan Wallet
                            </button>
                        ) : (
                            <div className="p-3 bg-green-100 text-green-700 rounded-lg mb-4 font-semibold">
                                Wallet Terhubung: {web3.walletAddress.slice(0, 6)}...{web3.walletAddress.slice(-4)}
                            </div>
                        )}
                        
                        <div className="flex justify-end space-x-3">
                            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition">Tutup</button>
                            <button onClick={web3.walletConnected ? () => setStep('mint') : web3.connectWallet} 
                                disabled={!web3.walletConnected && step === 'connect'}
                                className={`px-4 py-2 ${web3.walletConnected ? 'bg-indigo-500' : 'bg-gray-400'} text-white rounded-lg font-semibold transition`}
                            >
                                {web3.walletConnected ? 'Lanjut Mint NFT' : 'Hubungkan...'}
                            </button>
                        </div>
                    </>
                );

            case 'mint':
                return (
                    <>
                        <h3 className="text-3xl font-bold text-purple-600 mb-4 flex items-center">
                            Konfirmasi Mint NFT di Base
                        </h3>
                        <p className="text-gray-600 mb-4">
                            Dompet Anda **({web3.walletAddress.slice(0, 6)}...)** siap Mint NFT Premium di jaringan Base. Ini akan mengaktifkan *Unlimited Swipe*.
                        </p>
                        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 mb-6">
                            <p className="font-bold text-lg text-purple-700">Biaya Mint (Simulasi)</p>
                            <div className="flex justify-between items-center mt-1 text-xl font-mono text-purple-900">
                                <span>0.001 ETH + Gas Fee</span>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setStep('connect')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition">Kembali</button>
                            <button onClick={onMint} className="px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition shadow-md shadow-green-300">
                                Mint NFT Sekarang!
                            </button>
                        </div>
                    </>
                );

            case 'minting':
                return (
                    <div className="text-center py-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500 mx-auto mb-4"></div>
                        <h3 className="text-xl font-bold text-indigo-700">Transaksi Base Sedang Diproses...</h3>
                        <p className="text-gray-500 mt-2">Mohon tunggu. Anda akan menerima Premium NFT Base sebentar lagi.</p>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md transform transition-all">
                {renderContent()}
            </div>
        </div>
    );
};


// ----------------------------------------------------------------------
// Komponen Placeholder untuk Chatbot
// ----------------------------------------------------------------------
const ChatbotScreen = ({ db, auth, userId, isAuthReady }) => {
    // Simulasi data chat dari Firestore
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');

    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;

        // Path Dokumen pengguna
        const userDocRef = getUserDocRef(db, userId); 
        if (!userDocRef) return;
        
        // Path Koleksi Chat: artifacts (C) / safeAppId (D) / users (C) / userId (D) / chats (C)
        const chatsCollectionRef = collection(userDocRef, 'chats');

        // Untuk chat yang lebih kompleks, kita akan menggunakan subkoleksi chat di bawah dokumen pengguna.
        // Di sini kita hanya mensimulasikan beberapa pesan statis
        setMessages([
            { id: 1, text: "Selamat datang di BaseMatch Chat! Saya adalah AI Matchmaker Anda.", sender: 'AI', timestamp: new Date() },
            { id: 2, text: "Apa fitur favorit Anda di Farcaster?", sender: 'AI', timestamp: new Date() },
        ]);
    }, [isAuthReady, userId]);


    const handleSendMessage = () => {
        if (!newMessage.trim()) return;

        // Simulasi pengiriman pesan dan balasan AI
        setMessages(prev => [
            ...prev,
            { id: Date.now(), text: newMessage, sender: 'User', timestamp: new Date() },
        ]);
        setNewMessage('');

        // Simulasi balasan singkat AI
        setTimeout(() => {
            setMessages(prev => [
                ...prev,
                { id: Date.now() + 1, text: `(AI Merespons) Menarik! Kami menggunakan Base untuk menyimpan data transaksi Anda.`, sender: 'AI', timestamp: new Date() },
            ]);
        }, 1000);
    }

    if (!isAuthReady) {
        return <div className="text-center p-8">Memuat Chatbot...</div>;
    }

    return (
        <div className="flex flex-col items-center justify-start p-4 h-full">
            <h2 className="text-2xl font-bold mb-6 text-green-700">BaseMatch Chat (Web3 Integrasi)</h2>
            <div className="w-full max-w-lg h-[450px] bg-white rounded-xl shadow-lg border-4 border-green-400 p-4 flex flex-col">
                <div className="flex-grow overflow-y-auto mb-4 border-b pb-2 space-y-3">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'User' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs px-4 py-2 rounded-xl text-sm ${
                                msg.sender === 'User' ? 'bg-green-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'
                            }`}>
                                {msg.text}
                                <span className="block text-xs opacity-60 mt-1">{msg.sender === 'User' ? 'Anda' : 'AI'}</span>
                            </div>
                        </div>
                    ))}
                    {messages.length === 0 && <p className="text-gray-500 text-center italic mt-10">Mulai percakapan Anda...</p>}
                </div>
                <div className="flex">
                    <input
                        type="text"
                        placeholder="Kirim pesan (Simulasi Chatbot)..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="p-3 border rounded-l-lg w-full focus:ring-green-500 focus:border-green-500"
                        disabled={!isAuthReady}
                    />
                    <button
                        onClick={handleSendMessage}
                        className="p-3 bg-green-500 text-white rounded-r-lg hover:bg-green-600 transition disabled:opacity-50"
                        disabled={!isAuthReady || !newMessage.trim()}
                    >
                        Kirim
                    </button>
                </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 italic">Fitur ini mensimulasikan interaksi yang mungkin menggunakan konteks Farcaster atau data Base L2 Anda.</p>
        </div>
    );
};


// ----------------------------------------------------------------------
// Komponen Utama yang Menggabungkan Semuanya
// ----------------------------------------------------------------------

export default function App() {
    const [dbInstance, setDbInstance] = useState(null);
    const [authInstance, setAuthInstance] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [currentPage, setCurrentPage] = useState('swipe'); // 'swipe' atau 'chat'
    const [loading, setLoading] = useState(true);
    
    // Web3/Farcaster Hook
    const web3 = useWeb3Wallet();

    // 1. Inisialisasi Firebase & Autentikasi
    useEffect(() => {
        if (!auth) {
            setLoading(false);
            setIsAuthReady(true);
            return;
        }

        setDbInstance(db);
        setAuthInstance(auth);

        const initializeAuth = async () => {
            try {
                // Mencoba sign-in dengan token kustom jika ada
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    // Jika tidak, gunakan login anonim
                    await signInAnonymously(auth);
                }
            } catch (e) {
                console.error("Gagal sign-in dengan token atau anonim:", e);
                // Jika semua gagal, biarkan onAuthStateChanged menangani (yang mungkin menghasilkan user null)
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                // Fallback userId jika auth gagal total
                setUserId(crypto.randomUUID()); 
            }
            setIsAuthReady(true);
            setLoading(false);
        });

        initializeAuth();
        return () => unsubscribe();
    }, []);

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center h-full text-lg text-gray-600">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3"></div>
                    Memuat Aplikasi...
                </div>
            );
        }

        if (!dbInstance || !userId) {
             return (
                <div className="flex items-center justify-center h-full text-lg text-red-600">
                    Koneksi database gagal atau UserID tidak tersedia.
                </div>
            );
        }

        const screenProps = {
            db: dbInstance,
            auth: authInstance,
            userId: userId,
            isAuthReady: isAuthReady,
        };

        if (currentPage === 'swipe') {
            return <DatingSwipeScreen {...screenProps} web3={web3} />;
        } else if (currentPage === 'chat') {
            return <ChatbotScreen {...screenProps} />;
        }
        return null;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col items-center p-4 sm:p-8">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                .font-sans {
                    font-family: 'Inter', sans-serif;
                }
                .nav-button {
                    transition: all 0.3s ease;
                }
                .nav-button.active {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
                }
                `}
            </style>

            <header className="w-full max-w-2xl text-center mb-6 flex justify-between items-start">
                <div>
                    <h1 className="text-4xl font-extrabold text-gray-800">
                        BaseMatch
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        ID Pengguna: <span className="font-mono text-xs bg-gray-200 p-1 rounded select-all">{userId || 'Menunggu Auth'}</span>
                    </p>
                </div>
                
                {/* Status Web3 & Farcaster */}
                <div className="text-right flex flex-col items-end space-y-1">
                    <button 
                        onClick={web3.connectFarcaster}
                        className={`text-xs p-1 px-2 rounded-full font-medium transition ${
                            web3.farcasterConnected ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-600 hover:bg-indigo-100'
                        }`}
                    >
                        {web3.farcasterConnected ? 'Farcaster Terhubung' : 'Hubungkan Farcaster'}
                    </button>
                    <button 
                        onClick={web3.connectWallet}
                        className={`text-xs p-1 px-2 rounded-full font-medium transition ${
                            web3.walletConnected ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600 hover:bg-green-100'
                        }`}
                    >
                        {web3.walletConnected ? 'Wallet Base Terhubung' : 'Hubungkan Wallet'}
                    </button>
                    {web3.walletConnected && <p className="text-xs text-gray-400 mt-1">{web3.walletAddress.slice(0, 6)}...</p>}
                </div>

            </header>

            {/* Navigasi Tab */}
            <nav className="flex space-x-4 mb-8 p-1 bg-white rounded-xl shadow-md">
                <button
                    onClick={() => setCurrentPage('swipe')}
                    className={`nav-button px-6 py-2 rounded-lg font-semibold flex items-center ${
                        currentPage === 'swipe'
                            ? 'bg-indigo-500 text-white active shadow-indigo-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-600'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                    Swiping
                </button>
                <button
                    onClick={() => setCurrentPage('chat')}
                    className={`nav-button px-6 py-2 rounded-lg font-semibold flex items-center ${
                        currentPage === 'chat'
                            ? 'bg-green-500 text-white active shadow-green-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm6 4l2-2 2 2M8 13h4" />
                    </svg>
                    Chatbot AI
                </button>
            </nav>

            {/* Konten yang Di-render */}
            <main className="w-full max-w-2xl bg-white p-6 rounded-2xl shadow-xl min-h-[500px]">
                {renderContent()}
            </main>
        </div>
    );
}
