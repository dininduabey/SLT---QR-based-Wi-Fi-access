import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

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
    requestOtp: async (mobile: string, eventId: string) => {
        const res = await fetch(`${API_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile, eventId })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
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
            await api.requestOtp(mobile, eventId as string);
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
export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/portal/success" element={<SuccessPage />} />
                <Route path="/portal/:eventId" element={<EventPortal />} />
                <Route path="/"               element={<ProtectedAdmin />} />
            </Routes>
        </Router>
    );
}