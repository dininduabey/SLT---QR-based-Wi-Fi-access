import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API_URL = `http://${window.location.hostname}:8080`;

// ============================================================
// Types
// ============================================================
interface EventData {
    name: string;
    status: string;
    branding: {
        logoUrl: string;
        primaryColor: string;
        backgroundColor: string;
        termsUrl: string;
    };
    policies?: {
        bandwidthMbps: number;
        dataLimitMb: number;
        sessionDurationMinutes: number;
    } | null;
}

interface SessionData {
    id: string;
    mobile: string;
    macAddress: string;
    clientIp: string;
    status: string;
    startTime: string;
    expiresAt: string;
}

// ============================================================
// Admin Dashboard
// ============================================================
export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 font-sans">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">SLT Wi-Fi Platform</h1>
                            <p className="text-xs text-slate-500">Admin Dashboard</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium">● Backend Connected</span>
                        <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full font-medium">pfSense: Mock Mode</span>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="max-w-7xl mx-auto px-6 pt-6">
                <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200 w-fit">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'create' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        + Create Event
                    </button>
                    <button
                        onClick={() => setActiveTab('manage')}
                        className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'manage' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        Manage Events
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-6">
                {activeTab === 'create' && <CreateEventTab />}
                {activeTab === 'manage' && <ManageEventsTab />}
            </div>
        </div>
    );
}

// ============================================================
// Tab 1: Create Event & Generate QR
// ============================================================
function CreateEventTab() {
    const [eventId, setEventId] = useState('');
    const [eventName, setEventName] = useState('');
    const [sessionDuration, setSessionDuration] = useState(120);
    const [bandwidthMbps, setBandwidthMbps] = useState(10);
    const [dataLimitMb, setDataLimitMb] = useState(500);
    const [logoUrl, setLogoUrl] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#005c42');
    const [status, setStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({ type: '', message: '' });
    const [isRegistering, setIsRegistering] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [hasLimits, setHasLimits] = useState(true);

    // Portal Base URL: This is the address users will reach when scanning the QR.
    // In PRODUCTION: Set this to the pfSense walled garden server (e.g., https://wifi.slt.lk)
    // In DEVELOPMENT: Use your machine's local IP so phones on the same network can reach it.
    const [portalBaseUrl, setPortalBaseUrl] = useState(() => {
        // Auto-detect: if opened from localhost, suggest the network IP instead
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `http://${window.location.hostname}:${window.location.port}`;
        }
        return window.location.origin;
    });

    const portalUrl = `${portalBaseUrl}/portal/${eventId}`;

    const handleRegisterEvent = async () => {
        if (!eventId.trim() || !eventName.trim()) {
            setStatus({ type: 'error', message: 'Event ID and Name are required.' });
            return;
        }
        setIsRegistering(true);
        setStatus({ type: '', message: '' });
        try {
            const res = await fetch(`${API_URL}/admin/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: eventId.trim(),
                    name: eventName.trim(),
                    branding: {
                        logoUrl: logoUrl || "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
                        primaryColor,
                        backgroundColor: "#f4f7f6",
                        termsUrl: "#"
                    },
                    policies: hasLimits ? {
                        bandwidthMbps,
                        dataLimitMb,
                        sessionDurationMinutes: sessionDuration,
                    } : null
                })
            });
            const data = await res.json();
            if (res.ok) {
                setStatus({ type: 'success', message: `Event "${eventName}" created! QR code is ready below.` });
                setShowQr(true);
            } else {
                throw new Error(data.error || 'Failed to register event');
            }
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setIsRegistering(false);
        }
    };

    const handleDownloadQr = () => {
        const svg = document.getElementById('qr-code-svg');
        if (!svg) return;
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = () => {
            ctx?.drawImage(img, 0, 0, 600, 600);
            const pngFile = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.download = `QR_${eventId}.png`;
            downloadLink.href = pngFile;
            downloadLink.click();
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    };

    return (
        <div className="grid lg:grid-cols-5 gap-6">
            {/* Left: Form */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Create New Event</h2>
                <p className="text-sm text-slate-500 mb-6">Fill in event details to generate a unique QR code for attendees.</p>

                {/* Portal Server URL */}
                <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <label className="block text-xs font-bold text-blue-800 mb-1.5">
                        🌐 Portal Server URL (QR codes will point here)
                    </label>
                    <input type="url" value={portalBaseUrl} onChange={e => setPortalBaseUrl(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono bg-white"
                        placeholder="e.g. https://wifi.slt.lk or http://192.168.1.100:5173" />
                    <p className="text-xs text-blue-600 mt-1.5">
                        <strong>Production:</strong> Use pfSense walled garden server (e.g. <code className="bg-blue-100 px-1 rounded">https://wifi.slt.lk</code>).&nbsp;
                        <strong>Dev testing from phone:</strong> Use your PC's IP (e.g. <code className="bg-blue-100 px-1 rounded">http://192.168.x.x:5173</code>).
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Event ID (URL slug)</label>
                        <input type="text" value={eventId} onChange={e => setEventId(e.target.value.replace(/\s/g, '-').toLowerCase())}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            placeholder="e.g. tech-expo-2026" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Event Name</label>
                        <input type="text" value={eventName} onChange={e => setEventName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            placeholder="e.g. SLT Tech Expo 2026" />
                    </div>
                </div>

                {/* Policies */}
                <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-slate-700">Wi-Fi Access Policies</h3>
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={hasLimits} onChange={e => setHasLimits(e.target.checked)} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                            Set Access Limits
                        </label>
                    </div>
                    <div className={`grid grid-cols-3 gap-4 transition-opacity ${hasLimits ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Session Duration (min)</label>
                            <input type="number" value={sessionDuration} onChange={e => setSessionDuration(Number(e.target.value))} disabled={!hasLimits}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm disabled:bg-slate-50" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Bandwidth (Mbps)</label>
                            <input type="number" value={bandwidthMbps} onChange={e => setBandwidthMbps(Number(e.target.value))} disabled={!hasLimits}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm disabled:bg-slate-50" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Limit (MB)</label>
                            <input type="number" value={dataLimitMb} onChange={e => setDataLimitMb(Number(e.target.value))} disabled={!hasLimits}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm disabled:bg-slate-50" />
                        </div>
                    </div>
                </div>

                {/* Branding */}
                <div className="mt-5 pt-5 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700 mb-3">Portal Branding</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Logo URL (optional)</label>
                            <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                                placeholder="https://example.com/logo.png" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Primary Color</label>
                            <div className="flex gap-2 items-center">
                                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                                <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 outline-none text-sm font-mono" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center gap-3">
                    <button onClick={handleRegisterEvent} disabled={isRegistering}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition shadow-sm disabled:opacity-60">
                        {isRegistering ? 'Creating...' : 'Create Event & Generate QR'}
                    </button>
                </div>

                {status.message && (
                    <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {status.message}
                    </div>
                )}
            </div>

            {/* Right: QR Code Preview */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center">
                {eventId ? (
                    <>
                        <div className="bg-white p-3 rounded-xl shadow-md border border-slate-100 mb-4">
                            <QRCodeSVG
                                id="qr-code-svg"
                                value={portalUrl}
                                size={220}
                                level={"H"}
                                includeMargin={true}
                            />
                        </div>
                        <p className="text-xs text-slate-500 mb-1 font-medium">Portal URL:</p>
                        <a href={portalUrl} target="_blank" className="text-xs text-emerald-600 hover:underline break-all text-center mb-4">{portalUrl}</a>
                        <button onClick={handleDownloadQr}
                            className="px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition shadow-sm">
                            ⬇ Download QR (PNG)
                        </button>
                    </>
                ) : (
                    <div className="text-center text-slate-400">
                        <svg className="w-16 h-16 mx-auto mb-3 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <p className="text-sm font-medium">Enter an Event ID to preview QR</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Tab 2: Manage Events (Lookup, Monitor, Adjourn, Download CSV)
// ============================================================
function ManageEventsTab() {
    const [lookupId, setLookupId] = useState('');
    const [event, setEvent] = useState<EventData | null>(null);
    const [loadedEventId, setLoadedEventId] = useState('');
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loadError, setLoadError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAdjourning, setIsAdjourning] = useState(false);
    const [adjournMsg, setAdjournMsg] = useState('');

    const handleLookup = async () => {
        if (!lookupId.trim()) return;
        setIsLoading(true);
        setLoadError('');
        setEvent(null);
        setAdjournMsg('');
        try {
            const res = await fetch(`${API_URL}/events/${lookupId.trim()}`);
            if (!res.ok) throw new Error('Event not found');
            const data = await res.json();
            setEvent(data);
            setLoadedEventId(lookupId.trim());
        } catch (e: any) {
            setLoadError(e.message || 'Failed to load event');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdjourn = async () => {
        if (!loadedEventId) return;
        if (!window.confirm(`Are you sure you want to ADJOURN "${event?.name}"?\n\nThis will immediately:\n• Terminate ALL active user sessions\n• Disconnect all devices from pfSense\n• Deactivate the QR code`)) return;

        setIsAdjourning(true);
        try {
            const res = await fetch(`${API_URL}/admin/events/${loadedEventId}/adjourn`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setAdjournMsg(`✅ ${data.message}`);
                // Reload event data
                handleLookup();
            } else {
                throw new Error(data.error);
            }
        } catch (e: any) {
            setAdjournMsg(`❌ ${e.message}`);
        } finally {
            setIsAdjourning(false);
        }
    };

    const handleDownloadCsv = () => {
        if (!loadedEventId) return;
        window.open(`${API_URL}/admin/events/${loadedEventId}/report`, '_blank');
    };

    return (
        <div className="space-y-6">
            {/* Lookup Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Manage Event</h2>
                <p className="text-sm text-slate-500 mb-4">Enter an Event ID to view its status, active sessions, and manage it.</p>
                <div className="flex gap-3">
                    <input type="text" value={lookupId} onChange={e => setLookupId(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        placeholder="Enter Event ID (e.g. demo123)" />
                    <button onClick={handleLookup} disabled={isLoading}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-60">
                        {isLoading ? 'Loading...' : 'Load Event'}
                    </button>
                </div>
                {loadError && <p className="mt-3 text-sm text-red-600 font-medium">{loadError}</p>}
            </div>

            {/* Event Details */}
            {event && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <img src={event.branding.logoUrl} alt="Logo" className="h-12 object-contain"
                                onError={e => { e.currentTarget.src = 'https://placehold.co/100x40?text=Logo' }} />
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{event.name}</h3>
                                <p className="text-sm text-slate-500">ID: {loadedEventId}</p>
                            </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                            event.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                            event.status === 'adjourned' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-600'
                        }`}>
                            {event.status}
                        </span>
                    </div>

                    {/* Policies */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-slate-800">{event.policies?.sessionDurationMinutes || '∞'}</p>
                            <p className="text-xs text-slate-500 font-medium">{event.policies?.sessionDurationMinutes ? 'Minutes / Session' : 'Unlimited Duration'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-slate-800">{event.policies?.bandwidthMbps || '∞'}</p>
                            <p className="text-xs text-slate-500 font-medium">{event.policies?.bandwidthMbps ? 'Mbps / User' : 'Unlimited Bandwidth'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-slate-800">{event.policies?.dataLimitMb || '∞'}</p>
                            <p className="text-xs text-slate-500 font-medium">{event.policies?.dataLimitMb ? 'MB Data Limit' : 'Unlimited Data'}</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 flex-wrap">
                        {event.status === 'active' && (
                            <button onClick={handleAdjourn} disabled={isAdjourning}
                                className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-60">
                                {isAdjourning ? 'Adjourning...' : '⏹ Adjourn Event (Terminate All Sessions)'}
                            </button>
                        )}
                        <button onClick={handleDownloadCsv}
                            className="px-5 py-2.5 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-800 transition">
                            📥 Download Session Report (.CSV)
                        </button>
                    </div>

                    {adjournMsg && <p className="mt-3 text-sm font-medium">{adjournMsg}</p>}
                </div>
            )}

            {/* Info Box */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="font-bold text-amber-800 text-sm mb-2">⚠️ Development Mode Notice</h3>
                <ul className="text-amber-700 text-sm space-y-1 list-disc list-inside">
                    <li><strong>pfSense:</strong> Running in mock mode. Set <code className="bg-amber-100 px-1 rounded">PFSENSE_HOST</code> in <code className="bg-amber-100 px-1 rounded">.env</code> to connect to your real firewall.</li>
                    <li><strong>SMS Gateway:</strong> OTPs are logged to the backend terminal. Set <code className="bg-amber-100 px-1 rounded">SLT_SMS_GATEWAY_URL</code> to send real SMS.</li>
                    <li><strong>Test OTP:</strong> Use <code className="bg-amber-100 px-1 rounded font-bold">123456</code> as a bypass OTP for testing.</li>
                </ul>
            </div>
        </div>
    );
}
