import { useState } from 'react';

const API_BASE = '/api';

interface TopupRequest {
    requestId:    string;
    eventId:      string;
    phone:        string;
    topupNumber:  number;
    topupLimit:   number | null;
    status:       string;
    requestedAt:  string;
    adminMessage?: string;
}

export default function TopupRequestsTab() {
    const [eventId,   setEventId]   = useState('');
    const [requests,  setRequests]  = useState<TopupRequest[]>([]);
    const [loading,   setLoading]   = useState(false);
    const [msgs,      setMsgs]      = useState<{[k:string]:string}>({});
    const [busy,      setBusy]      = useState<{[k:string]:boolean}>({});
    const [error,     setError]     = useState('');

    const headers: {[k:string]:string} = { 'Content-Type': 'application/json' };

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const qs  = eventId ? ('?eventId=' + eventId) : '';
            const res = await fetch(API_BASE + '/admin/topup-requests' + qs, { headers });
            const d   = await res.json();
            if (d.success) setRequests(d.requests);
            else setError(d.message || 'Failed to load');
        } catch {
            setError('Network error');
        }
        setLoading(false);
    };

    const action = async (requestId: string, act: string) => {
        setBusy(prev => ({ ...prev, [requestId]: true }));
        try {
            const res = await fetch(
                API_BASE + '/admin/topup-requests/' + requestId + '/' + act,
                {
                    method:  'POST',
                    headers,
                    body:    JSON.stringify({ adminMessage: msgs[requestId] || '' })
                }
            );
            const d = await res.json();
            if (d.success) load();
            else setError(d.message || 'Action failed');
        } catch {
            setError('Network error');
        }
        setBusy(prev => ({ ...prev, [requestId]: false }));
    };

    const ordinal = (n: number): string => {
        const labels: {[k:number]:string} = { 1: '1st', 2: '2nd', 3: '3rd' };
        return labels[n] || (n + 'th');
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-slate-800 mb-1">Top-Up Requests</h2>
                <p className="text-sm text-slate-500">
                    Review and approve data top-up requests from users who have exhausted their allocation.
                </p>
            </div>

            <div className="flex gap-3 items-end">
                <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Filter by Event ID (optional)
                    </label>
                    <input
                        value={eventId}
                        onChange={e => setEventId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        placeholder="Leave blank for all events"
                    />
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                    {loading ? 'Loading...' : 'Load Requests'}
                </button>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {requests.length === 0 && !loading && (
                <p className="text-slate-400 text-sm text-center py-8">
                    No requests found. Click "Load Requests" to fetch.
                </p>
            )}

            {requests.map(r => {
                const isPending  = r.status === 'pending';
                const isApproved = r.status === 'approved';
                const limit      = r.topupLimit;
                const overLimit  = limit !== null && limit !== undefined && r.topupNumber > limit;

                const borderCls = isPending
                    ? 'border-amber-200 bg-amber-50'
                    : isApproved
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50';

                const badgeCls = isPending
                    ? 'bg-amber-200 text-amber-800'
                    : isApproved
                    ? 'bg-emerald-200 text-emerald-800'
                    : 'bg-red-200 text-red-800';

                return (
                    <div key={r.requestId} className={'border rounded-xl p-5 ' + borderCls}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-sm font-bold text-slate-800">
                                        {r.phone}
                                    </span>
                                    <span className={'text-xs px-2 py-0.5 rounded-full font-semibold ' + badgeCls}>
                                        {r.status.toUpperCase()}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-semibold">
                                        {ordinal(r.topupNumber)} top-up
                                    </span>
                                    {overLimit && (
                                        <span className="text-xs px-2 py-0.5 bg-red-600 text-white rounded-full font-bold">
                                            OVER LIMIT
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Event: <strong>{r.eventId}</strong>
                                    {' · '}
                                    {new Date(r.requestedAt).toLocaleString()}
                                </p>
                                {r.adminMessage && (
                                    <p className="text-xs text-slate-600 mt-1 italic">
                                        &ldquo;{r.adminMessage}&rdquo;
                                    </p>
                                )}
                            </div>

                            {isPending && (
                                <div className="flex flex-col gap-2 min-w-[220px]">
                                    <input
                                        value={msgs[r.requestId] || ''}
                                        onChange={e => setMsgs(m => ({ ...m, [r.requestId]: e.target.value }))}
                                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder="Optional message to user"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => action(r.requestId, 'approve')}
                                            disabled={busy[r.requestId]}
                                            className="flex-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => action(r.requestId, 'reject')}
                                            disabled={busy[r.requestId]}
                                            className="flex-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
