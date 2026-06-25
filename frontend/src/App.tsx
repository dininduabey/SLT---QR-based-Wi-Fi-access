import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import { QRCodeSVG } from 'qrcode.react';

const API_URL = '/api';

// ---------------------------------------------------------
// API helpers
// ---------------------------------------------------------
const api = {
    getEventDetails: async (eventId: string) => {
        const res = await fetch(`${API_URL}/events/${eventId}`);
        if (!res.ok) throw new Error('Event not found');
        return await res.json();
    },
    requestOtp: async (mobile: string, eventId: string, qrToken?: string) => {
        const res = await fetch(`${API_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile, eventId, ...(qrToken ? { qrToken } : {}) })
        });
        const data = await res.json();
        if (!data.success && data.code !== 'DATA_EXHAUSTED') throw new Error(data.error || data.message);
        return data;
    },
    verifyOtp: async (mobile: string, otp: string, eventId: string, mac: string, cpAction: string) => {
        const res = await fetch(`${API_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile, otp, eventId, macAddress: mac, cp_action: cpAction })
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            const html = await res.text();
            document.open();
            document.write(html);
            document.close();
            return { success: true, redirecting: true };
        }
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'OTP verification failed');
        return data;
    },
    adminLogin: async (username: string, password: string) => {
        const res = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Invalid credentials');
        return data;
    }
};

// ---------------------------------------------------------
// Data limit API helpers
// ---------------------------------------------------------
const dataApi = {
    requestTopup: async (phone: string, eventId: string) => {
        const res = await fetch(`${API_URL}/request-topup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, eventId })
        });
        return await res.json();
    },
    topupStatus: async (requestId: string) => {
        const res = await fetch(`${API_URL}/topup-status/${requestId}`);
        return await res.json();
    },
};



// ---------------------------------------------------------
// QrDisplayPage — full-screen QR for projector / display screen
// ---------------------------------------------------------
const QrDisplayPage = () => {
    const { eventId } = useParams();
    const [qrData, setQrData]       = useState<{ token: string; expiresAt: number; validMinutes: number } | null>(null);
    const [timeLeft, setTimeLeft]   = useState(0);
    const [eventName, setEventName] = useState('');
    const [error, setError]         = useState('');

    const fetchToken = async () => {
        try {
            const res = await fetch(`/api/qr-token/${eventId}`);
            if (!res.ok) { setError('Event not found or not active'); return; }
            const data = await res.json();
            setQrData(data);
            setTimeLeft(Math.floor((data.expiresAt - Date.now()) / 1000));
        } catch { setError('Failed to connect to server'); }
    };

    useEffect(() => {
        fetchToken();
        fetch(`/api/events/${eventId}`).then(r => r.json()).then(d => setEventName(d.name || '')).catch(() => {});
    }, [eventId]);

    useEffect(() => {
        if (!qrData) return;
        const iv = setInterval(() => {
            const rem = Math.floor((qrData.expiresAt - Date.now()) / 1000);
            if (rem <= 0) { fetchToken(); } else { setTimeLeft(rem); }
        }, 1000);
        return () => clearInterval(iv);
    }, [qrData]);

    const mins = Math.floor(timeLeft / 60);
    const secs = String(timeLeft % 60).padStart(2, '0');
    const timerColor = timeLeft > 180 ? '#10b981' : timeLeft > 90 ? '#f59e0b' : '#ef4444';
    const timerBg    = timeLeft > 180 ? '#ecfdf5' : timeLeft > 90 ? '#fffbeb' : '#fef2f2';
    const qrUrl = qrData ? `${window.location.origin}/portal/${eventId}?t=${qrData.token}` : '';

    if (error) return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0f172a' }}>
            <p style={{ color:'#ef4444', fontSize:'20px' }}>{error}</p>
        </div>
    );

    return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            minHeight:'100vh', background:'#0f172a', color:'white', fontFamily:'sans-serif', padding:'2rem' }}>
            <style>{`@keyframes wifiPulse { 0%,100%{opacity:0.25} 50%{opacity:1} }`}</style>
            <p style={{ fontSize:'13px', color:'#64748b', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'4px' }}>
                {eventName || 'SLT Mobitel'}
            </p>
            <h1 style={{ fontSize:'28px', fontWeight:800, marginBottom:'2.5rem', color:'#fff' }}>Free Event Wi-Fi</h1>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'3rem', flexWrap:'wrap', justifyContent:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', maxWidth:'260px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'1.25rem' }}>
            <span style={{ background:'#10b981', color:'#04231a', width:'34px', height:'34px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'17px' }}>1</span>
            <span style={{ fontSize:'19px', fontWeight:700 }}>Connect</span>
            </div>
            <svg width="150" height="120" viewBox="0 0 100 80" style={{ marginBottom:'1.25rem' }}>
            <path style={{animation:'wifiPulse 1.8s ease-in-out infinite', animationDelay:'0.5s'}} d="M10 30 A 60 60 0 0 1 90 30" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round"/>
            <path style={{animation:'wifiPulse 1.8s ease-in-out infinite', animationDelay:'0.25s'}} d="M22 45 A 42 42 0 0 1 78 45" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round"/>
            <path style={{animation:'wifiPulse 1.8s ease-in-out infinite'}} d="M34 58 A 24 24 0 0 1 66 58" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round"/>
            <circle style={{animation:'wifiPulse 1.8s ease-in-out infinite'}} cx="50" cy="70" r="6" fill="#10b981"/>
            </svg>
            <p style={{ fontSize:'15px', color:'#cbd5e1', textAlign:'center', lineHeight:1.5 }}>Open Wi-Fi settings and join<br/><span style={{ color:'#fff', fontWeight:700, fontSize:'17px' }}>&ldquo;SLT WiFi&rdquo;</span></p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', maxWidth:'320px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'1.25rem' }}>
            <span style={{ background:'#10b981', color:'#04231a', width:'34px', height:'34px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'17px' }}>2</span>
            <span style={{ fontSize:'19px', fontWeight:700 }}>Scan with Camera</span>
            </div>

            {qrData ? (
                <>
                    <div style={{ background:'white', padding:'20px', borderRadius:'16px', marginBottom:'1.5rem', boxShadow:'0 0 60px rgba(255,255,255,0.08)' }}>
                        <QRCodeSVG value={qrUrl} size={280} level="H" includeMargin={false} />
                    </div>
                    <div style={{ background:timerBg, color:timerColor, padding:'12px 36px',
                        borderRadius:'12px', fontSize:'32px', fontWeight:700, fontFamily:'monospace',
                        marginBottom:'0.75rem', transition:'background 0.5s, color 0.5s' }}>
                        {mins}:{secs}
                    </div>
                    <p style={{ color:'#475569', fontSize:'13px' }}>QR code refreshes automatically</p>
                </>
            ) : (
                <p style={{ color:'#475569' }}>Loading...</p>
            )}

            </div>
            </div>
            <p style={{ marginTop:'2.5rem', color:'#64748b', fontSize:'14px', fontWeight:600, textAlign:'center' }}>
                Point your phone camera at the QR code — no app needed
            </p>
        </div>
    );
};

// ---------------------------------------------------------
// QrScanPage — camera-based QR scanner for event portal
// ---------------------------------------------------------
const QrScanPage = () => {
    const videoRef  = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const rafRef    = React.useRef<number>(0);
    const [status, setStatus]   = useState<'loading'|'scanning'|'found'|'error'>('loading');

    useEffect(() => {
        const start = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setStatus('scanning');
                }
            } catch {
                setStatus('error');
            }
        };
        start();
        return () => {
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    useEffect(() => {
        if (status !== 'scanning') return;
        let active = true;

        const tick = async () => {
            const video  = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.readyState < 2) {
                if (active) rafRef.current = requestAnimationFrame(tick);
                return;
            }
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const jsQR  = (await import('jsqr')).default;
            const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (result?.data && result.data.includes('/portal/')) {
                active = false;
                setStatus('found');
                streamRef.current?.getTracks().forEach(t => t.stop());
                window.location.href = result.data;
                return;
            }
            if (active) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { active = false; cancelAnimationFrame(rafRef.current); };
    }, [status]);

    const grad = 'linear-gradient(160deg,#003d2b,#00a86b)';

    if (status === 'error' || !navigator.mediaDevices) return (
        <div style={{ minHeight:'100vh', background:grad, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
            <div style={{ background:'white', borderRadius:'24px', padding:'2rem 1.5rem', maxWidth:'340px', width:'100%' }}>
                <div style={{ fontSize:'40px', textAlign:'center', marginBottom:'1rem' }}>📷</div>
                <h2 style={{ fontSize:'18px', fontWeight:700, marginBottom:'1rem', color:'#1a1a1a', textAlign:'center' }}>Scan the Event QR Code</h2>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                    {[
                        ['1', 'Tap ✕ (top-right) to close this screen'],
                        ['2', 'Tap "Use without internet" if prompted'],
                        ['3', 'Open your Camera app'],
                        ['4', 'Point it at the QR code displayed at the event'],
                        ['5', 'Tap the link that appears to connect'],
                    ].map(([n, txt]) => (
                        <div key={n} style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
                            <span style={{ background:'#005c42', color:'white', borderRadius:'50%', width:'24px', height:'24px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:700, flexShrink:0, marginTop:'1px' }}>{n}</span>
                            <span style={{ fontSize:'14px', color:'#444', lineHeight:1.5 }}>{txt}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    if (status === 'found') return (
        <div style={{ minHeight:'100vh', background:grad, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <p style={{ color:'white', fontSize:'18px', fontWeight:600 }}>QR code detected — opening...</p>
        </div>
    );

    return (
        <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <p style={{ color:'white', fontSize:'15px', fontWeight:600, marginBottom:'1rem', textAlign:'center', padding:'0 1rem' }}>
                {status === 'loading' ? 'Starting camera...' : 'Point at the event QR code'}
            </p>
            <div style={{ position:'relative', width:'min(90vw,400px)', aspectRatio:'1' }}>
                <video ref={videoRef} playsInline muted
                    style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'16px', display:'block' }} />
                <div style={{ position:'absolute', inset:0, border:'3px solid #00a86b', borderRadius:'16px', pointerEvents:'none' }} />
                <canvas ref={canvasRef} style={{ display:'none' }} />
            </div>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'13px', marginTop:'1rem' }}>Scanning automatically...</p>
        </div>
    );
};

// ---------------------------------------------------------
// Auth helpers — token stored in sessionStorage so it clears
// automatically when the browser tab is closed.
// ---------------------------------------------------------
const AUTH_KEY = 'slt_admin_token';

function getToken(): string | null {
    return sessionStorage.getItem(AUTH_KEY);
}
function setToken(token: string) {
    sessionStorage.setItem(AUTH_KEY, token);
}
function clearToken() {
    sessionStorage.removeItem(AUTH_KEY);
}

// ---------------------------------------------------------
// AdminLogin — shown when accessing / without a valid token
// ---------------------------------------------------------
const AdminLogin = ({ onSuccess }: { onSuccess: () => void }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const data = await api.adminLogin(username, password);
            setToken(data.token);
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            margin: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            background: 'linear-gradient(135deg, #005c42, #00a86b)',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: 'white',
                borderRadius: '24px',
                padding: '48px 36px',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 20px 60px rgba(0,0,0,.25)'
            }}>
                {/* Logo / title */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📶</div>
                    <h1 style={{ color: '#005c42', fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>
                        SLT Wi-Fi Platform
                    </h1>
                    <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Admin Access Only</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#444', marginBottom: '6px' }}>
                            Username
                        </label>
                        <input
                            type="text"
                            required
                            autoComplete="username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1.5px solid #e0e0e0',
                                fontSize: '15px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit'
                            }}
                            placeholder="Enter username"
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#444', marginBottom: '6px' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1.5px solid #e0e0e0',
                                fontSize: '15px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit'
                            }}
                            placeholder="Enter password"
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: '#fff0f0',
                            color: '#c0392b',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            marginBottom: '16px',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: loading ? '#ccc' : '#005c42',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '16px',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit'
                        }}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// ---------------------------------------------------------
// ProtectedAdmin — wraps AdminDashboard with auth gate
// ---------------------------------------------------------
const ProtectedAdmin = () => {
    const [authed, setAuthed] = useState<boolean | null>(null);

    useEffect(() => {
        setAuthed(!!getToken());
    }, []);

    if (authed === null) return null; // still checking

    if (!authed) {
        return <AdminLogin onSuccess={() => setAuthed(true)} />;
    }

    return (
        <div>
            {/* Logout button */}
            <div style={{
                position: 'fixed',
                top: '12px',
                right: '16px',
                zIndex: 1000
            }}>
                <button
                    onClick={() => { clearToken(); setAuthed(false); }}
                    style={{
                        background: '#c0392b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                    }}
                >
                    Logout
                </button>
            </div>
            <AdminDashboard />
        </div>
    );
};

// ---------------------------------------------------------
// SuccessPage — shown after pfSense redirects to /portal/success
// ---------------------------------------------------------
const SuccessPage = () => {
    const [count, setCount] = useState(4);

    useEffect(() => {
        const timer = setInterval(() => {
            setCount(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    window.location.href = 'https://www.google.com';
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{
            margin: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            background: 'linear-gradient(135deg, #005c42, #00a86b)',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: 'white',
                borderRadius: '24px',
                padding: '48px 28px',
                textAlign: 'center',
                maxWidth: '340px',
                width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,.25)'
            }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
                <h2 style={{ color: '#005c42', fontSize: '24px', fontWeight: 700, margin: '0 0 10px' }}>
                    You're Connected!
                </h2>
                <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.6 }}>
                    Wi-Fi access granted.<br />Enjoy the event!
                </p>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#005c42', margin: '0 0 12px' }}>
                    {count}
                </div>
                <div style={{ background: '#e8f5f0', borderRadius: '99px', height: '8px', marginBottom: '20px', overflow: 'hidden' }}>
                    <div style={{
                        background: '#005c42',
                        height: '100%',
                        borderRadius: '99px',
                        width: `${(count / 4) * 100}%`,
                        transition: 'width 1s linear'
                    }} />
                </div>
                <p style={{ color: '#aaa', fontSize: '12px', margin: '0 0 20px' }}>
                    Opening Google in a moment...
                </p>
                <a
                    href="https://www.google.com"
                    style={{
                        display: 'inline-block',
                        background: '#005c42',
                        color: 'white',
                        padding: '14px 32px',
                        borderRadius: '12px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '15px'
                    }}
                >
                    Go Now
                </a>
            </div>
        </div>
    );
};

// ---------------------------------------------------------
// EventPortal — user-facing OTP page
// ---------------------------------------------------------
const EventPortal = () => {
    const { eventId } = useParams();
    const [searchParams] = useSearchParams();

    const macAddress = searchParams.get('mac') || 'unknown';
    const cpAction   = searchParams.get('cp_action') || '';
    const qrToken    = searchParams.get('t') || undefined;

    const navigate = useNavigate();
    const [eventDetails, setEventDetails] = useState<any>(null);
    const [mobile, setMobile]             = useState('');
    const [otp, setOtp]                   = useState('');
    const [step, setStep]                 = useState<'LOADING' | 'MOBILE' | 'OTP' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [errorMsg, setErrorMsg]         = useState('');
    const [isLoading, setIsLoading]       = useState(false);

    useEffect(() => {
        if (eventId) {
            api.getEventDetails(eventId)
                .then(data => { setEventDetails(data); setStep('MOBILE'); })
                .catch(() => {
                    setStep('ERROR');
                    setErrorMsg('Invalid or inactive event. Please scan the QR code again.');
                });
        }
    }, [eventId]);

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedMobile = mobile.startsWith('0') ? mobile.slice(1) : mobile;
        if (normalizedMobile.length !== 9 || !/^[0-9]{9}$/.test(normalizedMobile)) { setErrorMsg('Please enter a valid Sri Lankan mobile number (e.g. 0711234567 or 711234567).'); return; }
        setIsLoading(true);
        try {
            const data = await api.requestOtp(mobile, eventId as string, qrToken);
            if (data.code === 'DATA_EXHAUSTED') {
                navigate('/data-exhausted', { state: { phone: mobile, eventId, ...data } });
                return;
            }
            setStep('OTP');
            setErrorMsg('');
        } catch (error: any) {
            setErrorMsg(error.message || 'Failed to send OTP. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const result = await api.verifyOtp(mobile, otp, eventId as string, macAddress, cpAction);
            if (result.redirecting) return;
            setStep('SUCCESS');
            setErrorMsg('');
        } catch (error: any) {
            setErrorMsg(error.message || 'Invalid OTP. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (step === 'LOADING') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-700"></div>
            </div>
        );
    }

    if (step === 'ERROR') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-gray-200">
                    <div className="text-5xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-800">Connection Error</h2>
                    <p className="text-gray-600 mt-2">{errorMsg}</p>
                </div>
            </div>
        );
    }

    const { branding, name } = eventDetails;

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-4 font-sans"
            style={{ backgroundColor: branding.backgroundColor || '#f3f4f6' }}
        >
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="h-3 w-full" style={{ backgroundColor: branding.primaryColor }} />
                <div className="p-8">
                    <div className="flex justify-center mb-6">
                        <img
                            src={branding.logoUrl}
                            alt={`${name} Logo`}
                            className="h-16 object-contain"
                            onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x80?text=Event+Logo'; }}
                        />
                    </div>
                    <h1 className="text-2xl font-bold text-center text-gray-800 mb-1">Welcome to {name}</h1>
                    <p className="text-center text-gray-500 mb-8 text-sm">Complimentary High-Speed Wi-Fi</p>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center">
                            {errorMsg}
                        </div>
                    )}

                    {step === 'MOBILE' && (
                        <form onSubmit={handleRequestOtp} className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile Number</label>
                                <div className="flex items-center rounded-xl border border-gray-200 shadow-sm"
                                     style={{ '--tw-ring-color': branding.primaryColor } as any}>
                                    <div className="pl-4 pr-3 py-3 border-r border-gray-200 text-gray-500 font-medium bg-gray-50 rounded-l-xl">
                                        +94
                                    </div>
                                    <input
                                        type="tel"
                                        required
                                        pattern="[0-9]{9}"
                                        placeholder="711234567"
                                        className="w-full pl-3 pr-4 py-3 rounded-r-xl outline-none text-gray-800 placeholder-gray-400 font-medium"
                                        value={mobile}
                                        onChange={(e) => {
                                            let val = e.target.value.replace(/\D/g, '');
                                            if (val.startsWith('0')) val = val.slice(1);
                                            if (val.length <= 9) setMobile(val);
                                        }}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-70 flex justify-center items-center"
                                style={{ backgroundColor: branding.primaryColor }}
                            >
                                {isLoading
                                    ? <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
                                    : 'Send OTP via SMS'}
                            </button>
                        </form>
                    )}

                    {step === 'OTP' && (
                        <form onSubmit={handleVerifyOtp} className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Verification Code</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={6}
                                    placeholder="••••••"
                                    className="w-full px-4 py-4 text-center tracking-[0.75em] text-2xl font-bold text-gray-800 rounded-xl border border-gray-200 focus:ring-2 outline-none shadow-sm"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-center text-gray-500 mt-3">
                                    Code sent to +94 {mobile}.{' '}
                                    <button type="button" onClick={() => setStep('MOBILE')} className="text-blue-600 underline">
                                        Change number
                                    </button>
                                </p>
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-70 flex justify-center items-center"
                                style={{ backgroundColor: branding.primaryColor }}
                            >
                                {isLoading
                                    ? <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
                                    : 'Connect to Internet'}
                            </button>
                        </form>
                    )}

                    {step === 'SUCCESS' && (
                        <div className="text-center py-4">
                            <div className="w-24 h-24 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
                                <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">You're Connected!</h2>
                            <p className="text-gray-500 mb-8">Enjoy the high-speed internet.</p>
                            <a href="https://www.google.com"
                               className="inline-block px-8 py-3 rounded-full border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors">
                                Start Browsing
                            </a>
                        </div>
                    )}
                </div>

                {step === 'MOBILE' && (
                    <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
                        <p className="text-xs text-gray-500">
                            By continuing, you agree to the{' '}
                            <a href={branding.termsUrl} className="underline text-gray-600">Terms & Conditions</a>.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------
// App — route definitions
// /portal/success MUST be before /portal/:eventId
// ---------------------------------------------------------

// ==========================================================
// Data Exhausted Page  /data-exhausted
// ==========================================================
function DataExhaustedPage() {
    const location = useLocation();
    const state: any = location.state || {};
    const {
        phone = '', eventId = '',
        usedMb = 0, limitMb = 0,
        topupCount = 0, topupLimit = null,
        canRequest = false, hasPending = false, pendingId = null,
    } = state;

    type Screen = 'info' | 'requesting' | 'polling' | 'approved' | 'rejected';
    const [screen, setScreen]         = useState<Screen>(hasPending && pendingId ? 'polling' : 'info');
    const [requestId, setRequestId]   = useState<string>(pendingId || '');
    const [adminMsg, setAdminMsg]     = useState('');
    const [topupNum, setTopupNum]     = useState(topupCount + 1);
    const [busy, setBusy]             = useState(false);
    const [pollErr, setPollErr]       = useState('');

    // Poll every 3 s while in polling screen
    useEffect(() => {
        if (screen !== 'polling' || !requestId) return;
        const iv = setInterval(async () => {
            try {
                const d = await dataApi.topupStatus(requestId);
                if (d.status === 'approved') {
                    setAdminMsg(d.adminMessage || 'Your top-up has been approved!');
                    clearInterval(iv);
                    setScreen('approved');
                } else if (d.status === 'rejected') {
                    setAdminMsg(d.adminMessage || 'Your request was not approved.');
                    clearInterval(iv);
                    setScreen('rejected');
                }
            } catch { setPollErr('Connection error — retrying...'); }
        }, 3000);
        return () => clearInterval(iv);
    }, [screen, requestId]);

    // When approved, auto-submit the pfSense access form to restore internet
    useEffect(() => {
        if (screen !== 'approved') return;
        const t = setTimeout(() => {
            const f = document.getElementById('resumeForm') as HTMLFormElement | null;
            if (f) f.submit();
        }, 2000);
        return () => clearTimeout(t);
    }, [screen]);

    const handleRequest = async () => {
        setBusy(true);
        try {
            const d = await dataApi.requestTopup(phone, eventId);
            if (d.success) {
                setRequestId(d.requestId);
                setTopupNum(d.topupNumber || topupCount + 1);
                setScreen(d.status === 'rejected' ? 'rejected' : 'polling');
                if (d.status === 'rejected') setAdminMsg(d.message || '');
            } else {
                setAdminMsg(d.message || 'Could not submit request.');
            }
        } catch { setAdminMsg('Network error. Please try again.'); }
        setBusy(false);
    };

    const pct = limitMb ? Math.min(100, Math.round((usedMb / limitMb) * 100)) : 0;

    const containerStyle: React.CSSProperties = {
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#003d2b 0%,#00603f 100%)',
        padding: '24px', fontFamily: 'sans-serif', color: '#fff'
    };
    const cardStyle: React.CSSProperties = {
        background: '#fff', borderRadius: 16, padding: '32px 28px',
        maxWidth: 380, width: '100%', color: '#222', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
    };
    const btnStyle = (col: string): React.CSSProperties => ({
        width: '100%', padding: '14px', borderRadius: 8, border: 'none',
        background: col, color: '#fff', fontSize: 16, fontWeight: 700,
        cursor: busy ? 'not-allowed' : 'pointer', marginTop: 20,
        opacity: busy ? 0.7 : 1
    });

    if (screen === 'info') return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <div style={{fontSize:48,marginBottom:8}}>📶</div>
                <h2 style={{color:'#c0392b',margin:'0 0 6px'}}>Data Limit Reached</h2>
                <p style={{color:'#555',marginBottom:20}}>
                    You have used <strong>{usedMb} MB</strong> of your <strong>{limitMb} MB</strong> allocation.
                </p>
                <div style={{background:'#f0f0f0',borderRadius:8,height:12,overflow:'hidden',marginBottom:20}}>
                    <div style={{width:`${pct}%`,height:'100%',background:'#c0392b',transition:'width 0.5s'}}/>
                </div>
                {canRequest ? (
                    <>
                        <p style={{color:'#555',fontSize:14}}>
                            Request a data top-up from the event admin.
                            {topupLimit !== null && (
                                <> You have used <strong>{topupCount}</strong> of <strong>{topupLimit}</strong> top-up(s).</>
                            )}
                        </p>
                        <button style={btnStyle('#005c42')} onClick={handleRequest} disabled={busy}>
                            {busy ? 'Submitting...' : '📩 Request Top-Up'}
                        </button>
                    </>
                ) : (
                    <p style={{color:'#888',fontSize:14}}>
                        {topupLimit !== null
                            ? `You have reached the maximum of ${topupLimit} top-up(s) for this event.`
                            : 'No further top-ups are available for this event.'}
                    </p>
                )}
                {adminMsg && <p style={{color:'#c0392b',marginTop:12,fontSize:14}}>{adminMsg}</p>}
            </div>
        </div>
    );

    if (screen === 'polling') return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <div style={{fontSize:48,marginBottom:8}}>⏳</div>
                <h2 style={{margin:'0 0 12px'}}>Top-Up Request Sent</h2>
                <p style={{color:'#555'}}>
                    Your request #{topupNum} is waiting for admin approval.<br/>
                    <strong>Please keep this page open.</strong>
                </p>
                <div style={{margin:'24px auto',width:48,height:48,border:'5px solid #e0e0e0',
                    borderTop:'5px solid #005c42',borderRadius:'50%',
                    animation:'spin 1s linear infinite'}}/>
                <p style={{color:'#888',fontSize:13}}>Checking every few seconds...</p>
                {pollErr && <p style={{color:'#c0392b',fontSize:13}}>{pollErr}</p>}
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        </div>
    );

    if (screen === 'approved') return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <div style={{fontSize:56,marginBottom:8}}>✅</div>
                <h2 style={{color:'#005c42',margin:'0 0 12px'}}>Top-Up Approved!</h2>
                <p style={{color:'#555'}}>{adminMsg}</p>
                <p style={{color:'#888',fontSize:14,marginTop:16}}>Restoring your connection…</p>
                <div style={{margin:'20px auto',width:40,height:40,border:'5px solid #e0e0e0',
                    borderTop:'5px solid #005c42',borderRadius:'50%',
                    animation:'spin 1s linear infinite'}}/>
                {/* Auto-submit pfSense access grant to restore internet without re-scan */}
                <form id="resumeForm" method="POST"
                    action="http://172.31.98.1:8002/index.php?zone=main_zone&redirurl=http%3A%2F%2F124.43.216.136%3A45080%2Fportal%2Fsuccess">
                    <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success" />
                    <input type="hidden" name="zone"   value="main_zone" />
                    <input type="hidden" name="accept" value="Continue" />
                </form>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        </div>
    );

    if (screen === 'rejected') return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <div style={{fontSize:56,marginBottom:8}}>❌</div>
                <h2 style={{color:'#c0392b',margin:'0 0 12px'}}>Request Not Approved</h2>
                <p style={{color:'#555'}}>{adminMsg || 'Your top-up request was not approved by the admin.'}</p>
            </div>
        </div>
    );

    return null;
}

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/portal/success" element={<SuccessPage />} />
                <Route path="/portal/:eventId" element={<EventPortal />} />
                <Route path="/qr-display/:eventId" element={<QrDisplayPage />} />
                <Route path="/qr-scan"           element={<QrScanPage />} />
                <Route path="/data-exhausted"     element={<DataExhaustedPage />} />
                <Route path="/"               element={<ProtectedAdmin />} />
            </Routes>
        </Router>
    );
}