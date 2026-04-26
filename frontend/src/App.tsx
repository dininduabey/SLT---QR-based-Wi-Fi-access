import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

// Dynamically resolve backend URL based on how the user reached this page.
// If opened from 192.168.x.x:5173, API calls go to 192.168.x.x:8080
// If opened from localhost:5173, API calls go to localhost:8080
const API_URL = '/api';
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
    verifyOtp: async (mobile: string, otp: string, eventId: string, mac: string) => {
        const res = await fetch(`${API_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile, otp, eventId, macAddress: mac })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        return data;
    }
};

const EventPortal = () => {
    const { eventId } = useParams();
    const [searchParams] = useSearchParams();
    const macAddress = searchParams.get('mac') || 'unknown';

    const [eventDetails, setEventDetails] = useState<any>(null);
    const [mobile, setMobile] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'LOADING' | 'MOBILE' | 'OTP' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (eventId) {
            api.getEventDetails(eventId)
                .then(data => {
                    setEventDetails(data);
                    setStep('MOBILE');
                })
                .catch(() => {
                    setStep('ERROR');
                    setErrorMsg('Invalid or inactive event QR code. Please scan again.');
                });
        }
    }, [eventId]);

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mobile.length !== 9) {
            setErrorMsg('Please enter a valid 9-digit number.');
            return;
        }
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
            await api.verifyOtp(mobile, otp, eventId as string, macAddress);
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
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-600"></div>
            </div>
        );
    }
    
    if (step === 'ERROR') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-gray-200">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-800">Connection Error</h2>
                    <p className="text-gray-600 mt-2">{errorMsg}</p>
                </div>
            </div>
        );
    }

    const { branding, name } = eventDetails;

    return (
        <div 
            className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 font-sans"
            style={{ backgroundColor: branding.backgroundColor || '#f3f4f6' }}
        >
            <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100 transition-all">
                <div className="h-3 w-full" style={{ backgroundColor: branding.primaryColor }} />
                
                <div className="p-8">
                    <div className="flex justify-center mb-6">
                        <img 
                            src={branding.logoUrl} 
                            alt={`${name} Logo`} 
                            className="h-16 object-contain"
                            onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x80?text=Event+Logo' }}
                        />
                    </div>
                    
                    <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Welcome to {name}</h1>
                    <p className="text-center text-gray-500 mb-8 text-sm font-medium">Complimentary High-Speed Wi-Fi</p>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center animate-pulse">
                            {errorMsg}
                        </div>
                    )}

                    {step === 'MOBILE' && (
                        <form onSubmit={handleRequestOtp} className="space-y-6 transition-all">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile Number</label>
                                <div className="relative flex items-center shadow-sm rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-offset-1 transition-all" style={{ '--tw-ring-color': branding.primaryColor } as any}>
                                    <div className="pl-4 pr-3 py-3 border-r border-gray-200 text-gray-500 font-medium bg-gray-50 rounded-l-xl">
                                        +94
                                    </div>
                                    <input 
                                        type="tel"
                                        required
                                        pattern="[0-9]{9}"
                                        placeholder="771234567"
                                        className="w-full pl-3 pr-4 py-3 rounded-r-xl outline-none text-gray-800 placeholder-gray-400 font-medium tracking-wide"
                                        value={mobile}
                                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>
                            
                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 px-4 rounded-xl text-white font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none flex justify-center items-center"
                                style={{ backgroundColor: branding.primaryColor }}
                            >
                                {isLoading ? <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span> : 'Send OTP via SMS'}
                            </button>
                        </form>
                    )}

                    {step === 'OTP' && (
                        <form onSubmit={handleVerifyOtp} className="space-y-6 animate-fade-in transition-all">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Enter Verification Code</label>
                                <input 
                                    type="text"
                                    required
                                    maxLength={6}
                                    placeholder="••••••"
                                    className="w-full px-4 py-4 text-center tracking-[0.75em] text-2xl font-bold text-gray-800 rounded-xl border border-gray-200 focus:ring-2 focus:border-transparent outline-none transition-all shadow-sm"
                                    style={{ '--tw-ring-color': branding.primaryColor } as any}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-center text-gray-500 mt-4 font-medium">
                                    Code sent to +94 {mobile}. <br/><button type="button" onClick={() => setStep('MOBILE')} className="text-blue-600 hover:text-blue-800 hover:underline mt-1">Change number</button>
                                </p>
                            </div>
                            
                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 px-4 rounded-xl text-white font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none flex justify-center items-center"
                                style={{ backgroundColor: branding.primaryColor }}
                            >
                                {isLoading ? <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span> : 'Connect to Internet'}
                            </button>
                        </form>
                    )}

                    {step === 'SUCCESS' && (
                        <div className="text-center animate-fade-in py-4">
                            <div className="w-24 h-24 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">You're Connected!</h2>
                            <p className="text-gray-500 mb-8 font-medium">Enjoy the high-speed internet.</p>
                            <a 
                                href="https://www.google.com" 
                                className="inline-block px-8 py-3 rounded-full border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                Continue Browsing
                            </a>
                        </div>
                    )}
                </div>

                {step === 'MOBILE' && (
                    <div className="bg-gray-50/50 p-4 text-center border-t border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">
                            By continuing, you agree to the <a href={branding.termsUrl} className="underline text-gray-600 hover:text-gray-900">Terms & Conditions</a>.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};


export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/portal/:eventId" element={<EventPortal />} />
                <Route path="/" element={<AdminDashboard />} />
            </Routes>
        </Router>
    );
}
