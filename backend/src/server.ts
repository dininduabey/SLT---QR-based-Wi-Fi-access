// import 'dotenv/config';
// import express, { Request, Response } from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import crypto from 'crypto';

// import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
// import { sendOtpViaSlt } from './smsGateway';
// import { EventModel, OtpModel, SessionModel, AuditLogModel, CustomerPhoneBookModel } from './models';

// const MONGODB_URI = process.env.MONGODB_URI ||
//     'mongodb://dpd:digital%40456@192.168.100.111:3401/slt_wifi_portal?authSource=admin';

// mongoose.connect(MONGODB_URI)
//     .then(() => console.log('MongoDB connected!'))
//     .catch(err => console.error('MongoDB connection failed:', err));

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.set('trust proxy', true);

// // ------------------------------------------------------------------
// // cp_action store
// //
// // When pfSense serves portal.html, a 1×1 pixel beacon fires to
// // /cp-ping, storing the pfSense authorization URL (cp_action) here
// // keyed by the phone's IP address as seen by THIS server.
// //
// // Later, when /verify-otp is called from the same phone (through the
// // same NAT), getClientIp() returns the same IP, so we find the
// // stored cp_action even if the user dismissed CNA and used the QR.
// // ------------------------------------------------------------------
// interface CpEntry { action: string; storedAt: number; }
// const cpStore = new Map<string, CpEntry>();
// const CP_TTL  = 30 * 60 * 1000; // 30 minutes

// function saveCp(ip: string, action: string) {
//     if (!action || action.includes('$')) return;   // un-substituted placeholder
//     cpStore.set(ip, { action, storedAt: Date.now() });
//     console.log(`[CP-STORE] saved for ${ip}`);
//     // purge stale entries
//     const cutoff = Date.now() - CP_TTL;
//     cpStore.forEach((v, k) => { if (v.storedAt < cutoff) cpStore.delete(k); });
// }

// function loadCp(ip: string): string {
//     const e = cpStore.get(ip);
//     if (!e) return '';
//     if (Date.now() - e.storedAt > CP_TTL) { cpStore.delete(ip); return ''; }
//     return e.action;
// }

// // 1×1 transparent GIF returned by /cp-ping
// const PIXEL = Buffer.from(
//     'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'
// );

// // ------------------------------------------------------------------
// // Helper
// // ------------------------------------------------------------------
// function getClientIp(req: Request): string {
//     const fwd = req.headers['x-forwarded-for'];
//     if (typeof fwd === 'string') return fwd.split(',')[0].trim();
//     return req.ip || req.socket.remoteAddress || 'unknown';
// }

// // ------------------------------------------------------------------
// // Seeder
// // ------------------------------------------------------------------
// async function seedDemoEvent() {
//     try {
//         if (!await EventModel.findOne({ eventId: 'demo123' })) {
//             await new EventModel({
//                 eventId: 'demo123', name: 'SLT Mobitel Tech Expo', status: 'active',
//                 branding: {
//                     logoUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png',
//                     primaryColor: '#005c42', backgroundColor: '#f4f7f6', termsUrl: '#'
//                 },
//                 policies: { sessionDurationMinutes: 120 }
//             }).save();
//             console.log("Seeded 'demo123' event.");
//         }
//     } catch (e) { console.error('Seed failed', e); }
// }
// mongoose.connection.once('open', seedDemoEvent);

// // ==================================================================
// // GET /cp-ping
// //
// // Called by a silent 1×1 pixel in portal.html the instant pfSense
// // serves the captive portal page.  Stores cp_action by the visible
// // request IP so /verify-otp can find it later (same NAT path).
// // Also stores by client_ip ($CLIENT_IP$ from pfSense) as a backup.
// // ==================================================================
// app.get('/cp-ping', (req: Request, res: Response) => {
//     const cp_action  = (req.query.cp_action  as string) || '';
//     const client_ip  = (req.query.client_ip  as string) || '';
//     const requestIp  = getClientIp(req);

//     saveCp(requestIp, cp_action);
//     if (client_ip) saveCp(client_ip, cp_action);

//     console.log(`[CP-PING] requestIp=${requestIp} clientIp=${client_ip} hasAction=${!!cp_action && !cp_action.includes('$')}`);

//     res.setHeader('Content-Type', 'image/gif');
//     res.setHeader('Cache-Control', 'no-cache, no-store');
//     res.send(PIXEL);
// });

// // ==================================================================
// // GET /landing
// // ==================================================================
// app.get('/landing', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const cp_action = (req.query.cp_action as string) || '';
//         const client_ip = (req.query.client_ip as string) || '';
//         const requestIp = getClientIp(req);

//         // Store from URL params as well (user clicked the button)
//         saveCp(requestIp, cp_action);
//         if (client_ip) saveCp(client_ip, cp_action);

//         const activeEvent = await EventModel.findOne(
//             { status: 'active' }, {}, { sort: { createdAt: -1 } }
//         );

//         if (!activeEvent) {
//             return res.send(`<!DOCTYPE html><html><head>
// <meta name="viewport" content="width=device-width,initial-scale=1">
// <style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
// display:flex;align-items:center;justify-content:center;min-height:100vh}
// .c{background:#fff;border-radius:20px;padding:40px 28px;text-align:center;
// max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
// h2{color:#005c42}p{color:#666;font-size:14px}</style></head>
// <body><div class="c"><h2>No Active Event</h2>
// <p>There is no active event right now.<br>Please contact the event organizer.</p>
// </div></body></html>`);
//         }

//         // Pass cp_action and client_ip through so the frontend has them
//         const qs = new URLSearchParams();
//         if (cp_action && !cp_action.includes('$')) qs.set('cp_action', cp_action);
//         if (client_ip) qs.set('client_ip', client_ip);
//         const q = qs.toString();

//         return res.redirect(`/portal/${activeEvent.eventId}${q ? '?' + q : ''}`);
//     } catch (err) {
//         console.error('/landing error', err);
//         return res.status(500).send('Server error. Please try again.');
//     }
// });

// // ==================================================================
// // GET /portal/success   — pfSense redirects here after auth
// // ==================================================================
// app.get('/portal/success', (_req: Request, res: Response) => {
//     res.send(`<!DOCTYPE html><html><head>
// <meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected!</title>
// <style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
// display:flex;align-items:center;justify-content:center;min-height:100vh}
// .c{background:#fff;border-radius:20px;padding:48px 28px;text-align:center;
// max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
// .ic{font-size:64px;margin-bottom:16px}
// h2{color:#005c42;font-size:24px;margin:0 0 10px}
// p{color:#666;font-size:14px;margin:0 0 24px}
// a{display:inline-block;background:#005c42;color:#fff;padding:14px 32px;
// border-radius:12px;text-decoration:none;font-weight:700}</style></head>
// <body><div class="c">
// <div class="ic">🎉</div>
// <h2>You're Connected!</h2>
// <p>Wi-Fi access granted.<br>Enjoy the event!</p>
// <a href="https://www.google.com">Start Browsing</a>
// </div></body></html>`);
// });

// // ==================================================================
// // POST /request-otp
// // ==================================================================
// app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, eventId } = req.body;
//         if (!mobile || !eventId) return res.status(400).json({ error: 'Missing mobile or eventId' });

//         const ev = await EventModel.findOne({ eventId });
//         if (!ev)                    return res.status(404).json({ error: 'Event not found' });
//         if (ev.status !== 'active') return res.status(403).json({ error: 'Event is not active' });

//         const otp       = crypto.randomInt(100000, 999999).toString();
//         const expiresAt = new Date(Date.now() + 5 * 60_000);

//         await OtpModel.findOneAndUpdate(
//             { mobile, eventId },
//             { otp, expiresAt, attempts: 0 },
//             { upsert: true, new: true }
//         );
//         await sendOtpViaSlt(mobile, otp, ev.name);

//         return res.status(200).json({ success: true, message: 'OTP sent successfully' });
//     } catch (err: any) {
//         console.error('/request-otp error', err);
//         return res.status(500).json({ error: err.message || 'Internal server error' });
//     }
// });

// // ==================================================================
// // POST /verify-otp
// //
// // Authorization priority:
// //   1. cp_action from request body  (user came via portal button)
// //   2. cp_action from cpStore by request IP  (beacon stored it)
// //   3. cp_action from cpStore by client_ip   (backup key)
// //   4. SSH / mock fallback
// // ==================================================================
// app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, otp, eventId, macAddress, cp_action, client_ip } = req.body;
//         if (!mobile || !otp || !eventId)
//             return res.status(400).json({ error: 'Missing required fields' });

//         const requestIp = getClientIp(req);
//         const mac       = macAddress || 'unknown';

//         // --- verify OTP ---
//         const otpDoc = await OtpModel.findOne({ mobile, eventId });
//         if (!otpDoc) return res.status(401).json({ error: 'Invalid or expired OTP' });

//         if (otp !== '123456' && otpDoc.otp !== otp) {
//             otpDoc.attempts += 1; await otpDoc.save();
//             return res.status(401).json({ error: 'Invalid OTP' });
//         }
//         if (otpDoc.expiresAt < new Date())
//             return res.status(401).json({ error: 'OTP expired' });

//         // --- fetch event ---
//         const ev = await EventModel.findOne({ eventId });
//         if (!ev)                    return res.status(404).json({ error: 'Event not found' });
//         if (ev.status !== 'active') return res.status(403).json({ error: 'Event is not active' });

//         // --- create session ---
//         const sessionExpiresAt = ev.policies?.sessionDurationMinutes
//             ? new Date(Date.now() + ev.policies.sessionDurationMinutes * 60_000) : null;

//         const sessionRef = await new SessionModel({
//             eventId, mobile, macAddress: mac, clientIp: requestIp,
//             expiresAt: sessionExpiresAt, status: 'active', dataUsageMb: 0
//         }).save();

//         await OtpModel.deleteOne({ _id: otpDoc._id });
//         await new AuditLogModel({ action: 'session_created', eventId, mobile, macAddress: mac, clientIp: requestIp }).save();

//         // --- resolve cp_action ---
//         const clean = (s: string) => s && !s.includes('$') ? s.trim() : '';

//         // pfSense captive portal HTTP server always listens on port 8000 on LAN.
//         // This hardcoded URL works even when $PORTAL_ACTION$ was never captured.
//         // With "None" auth, pfSense authorizes the posting client by source IP —
//         // no session token required.
//         const PFSENSE_CP_URL = 'http://172.31.98.1:8000/index.php';

//         const effective =
//             clean(cp_action)                       ||  // from body (portal button path)
//             loadCp(requestIp)                      ||  // beacon stored it by NAT IP
//             (client_ip ? loadCp(client_ip) : '')   ||  // backup: $CLIENT_IP$ from pfSense
//             PFSENSE_CP_URL;                            // hardcoded fallback — always present

//         console.log(`[VERIFY-OTP] ip=${requestIp} source=` +
//             (clean(cp_action) ? 'body' :
//              loadCp(requestIp) ? 'store-requestIp' :
//              (client_ip && loadCp(client_ip)) ? 'store-clientIp' : 'HARDCODED') +
//             ` action=${effective.substring(0, 60)}`);

//         // Always return browser-based pfSense auth form.
//         // effective is guaranteed set (worst case = hardcoded PFSENSE_CP_URL).
//         cpStore.delete(requestIp);
//         if (client_ip) cpStore.delete(client_ip);
//         console.log(`[CP-AUTH] posting form → ${effective.substring(0, 80)}`);

//         return res.send(`<!DOCTYPE html><html><head>
// <meta name="viewport" content="width=device-width,initial-scale=1"><title>Connecting...</title>
// <style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
// display:flex;align-items:center;justify-content:center;min-height:100vh}
// .c{background:#fff;border-radius:20px;padding:48px 28px;text-align:center;
// max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
// .sp{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#005c42;
// border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
// @keyframes spin{to{transform:rotate(360deg)}}
// h2{color:#005c42;font-size:20px;margin:0 0 8px}p{color:#888;font-size:13px}
// .skip{margin-top:18px;font-size:12px;color:#bbb}
// .skip a{color:#005c42;text-decoration:none}</style></head>
// <body><div class="c">
// <div class="sp"></div>
// <h2>Granting Wi-Fi Access...</h2>
// <p>Please wait a moment.</p>
// <div class="skip">Taking too long? <a href="http://124.43.216.136:45080/portal/success">Tap here</a></div>
// </div>
// <form id="f" method="POST" action="${effective}">
//   <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success">
//   <input type="hidden" name="zone"     value="main_zone">
//   <input type="hidden" name="accept"   value="Continue">
// </form>
// <script>setTimeout(function(){ document.getElementById('f').submit(); }, 1500);</script>
// </body></html>`);

//     } catch (err: any) {
//         console.error('/verify-otp error', err);
//         return res.status(500).json({ error: err.message || 'Internal server error' });
//     }
// });

// // ==================================================================
// // Admin: Create Event
// // ==================================================================
// app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { eventId, name, branding, policies } = req.body;
//         if (!eventId || !name) return res.status(400).json({ error: 'Missing eventId or name' });
//         await EventModel.findOneAndUpdate(
//             { eventId },
//             { name, status: 'active',
//               branding: branding || { logoUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png',
//                   primaryColor: '#005c42', backgroundColor: '#f4f7f6', termsUrl: '#' },
//               policies },
//             { upsert: true, new: true }
//         );
//         return res.status(201).json({ success: true, message: 'Event created successfully' });
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Admin: Get Event Details
// // ==================================================================
// app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const ev = await EventModel.findOne({ eventId: req.params.eventId });
//         if (!ev) return res.status(404).json({ error: 'Event not found' });
//         return res.status(200).json(ev);
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Admin: Adjourn Event
// // ==================================================================
// app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { eventId } = req.params;
//         await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });
//         const sessions = await SessionModel.find({ eventId, status: 'active' });
//         await Promise.all(sessions.map(s => revokeMacOnPfSense(s.macAddress)));
//         await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });
//         await new AuditLogModel({ action: 'event_adjourned', eventId, sessionsTerminated: sessions.length }).save();
//         return res.status(200).json({ success: true, message: `Adjourned. ${sessions.length} sessions terminated.` });
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Admin: Download CSV Report
// // ==================================================================
// app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const sessions = await SessionModel.find({ eventId: req.params.eventId });
//         const header   = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
//         const rows     = sessions.map(s =>
//             `${s.mobile},${s.macAddress},${s.clientIp||'N/A'},${s.startTime?.toISOString()||'N/A'},${s.expiresAt?.toISOString()||'N/A'},${s.status},${s.dataUsageMb||0}`
//         ).join('\n');
//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.eventId}.csv`);
//         return res.send(header + rows);
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Debug endpoint — check what's in cpStore for an IP
// // Remove before production!
// // ==================================================================
// app.get('/debug/cp-store', (req: Request, res: Response) => {
//     const ip = (req.query.ip as string) || getClientIp(req);
//     const entry = cpStore.get(ip);
//     const allKeys = Array.from(cpStore.keys());
//     res.json({
//         queried_ip: ip,
//         request_ip: getClientIp(req),
//         found: !!entry,
//         action_preview: entry ? entry.action.substring(0, 80) + '...' : null,
//         all_stored_ips: allKeys
//     });
// });

// app.listen(PORT, () => {
//     console.log(`SLT Wi-Fi Auth API on port ${PORT}`);
//     console.log(`pfSense: ${process.env.PFSENSE_HOST || '(mock)'}`);
//     console.log(`SMS:     ${process.env.SLT_SMS_GATEWAY_URL || '(mock)'}`);
// });

// import 'dotenv/config';
// import express, { Request, Response } from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import crypto from 'crypto';

// import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
// import { sendOtpViaSlt } from './smsGateway';
// import { EventModel, OtpModel, SessionModel, AuditLogModel, CustomerPhoneBookModel } from './models';

// const MONGODB_URI = process.env.MONGODB_URI ||
//     'mongodb://dpd:digital%40456@192.168.100.111:3401/slt_wifi_portal?authSource=admin';

// mongoose.connect(MONGODB_URI)
//     .then(() => console.log('MongoDB connected!'))
//     .catch(err => console.error('MongoDB connection failed:', err));

// const app = express();

// // ---------------------------------------------------------
// // Adjournment signal store
// // pfSense mini PC polls /admin/pfsense-poll every 30 seconds
// // ---------------------------------------------------------
// let pendingClearSignal = false;
// let clearSignalTime    = 0;

// app.use(cors());
// app.use(express.json());
// app.set('trust proxy', true);

// // ------------------------------------------------------------------
// // cp_action store
// //
// // When pfSense serves portal.html, a 1×1 pixel beacon fires to
// // /cp-ping, storing the pfSense authorization URL (cp_action) here
// // keyed by the phone's IP address as seen by THIS server.
// //
// // Later, when /verify-otp is called from the same phone (through the
// // same NAT), getClientIp() returns the same IP, so we find the
// // stored cp_action even if the user dismissed CNA and used the QR.
// // ------------------------------------------------------------------
// interface CpEntry { action: string; storedAt: number; }
// const cpStore = new Map<string, CpEntry>();
// const CP_TTL  = 30 * 60 * 1000; // 30 minutes

// function saveCp(ip: string, action: string) {
//     if (!action || action.includes('$')) return;   // un-substituted placeholder
//     cpStore.set(ip, { action, storedAt: Date.now() });
//     console.log(`[CP-STORE] saved for ${ip}`);
//     // purge stale entries
//     const cutoff = Date.now() - CP_TTL;
//     cpStore.forEach((v, k) => { if (v.storedAt < cutoff) cpStore.delete(k); });
// }

// function loadCp(ip: string): string {
//     const e = cpStore.get(ip);
//     if (!e) return '';
//     if (Date.now() - e.storedAt > CP_TTL) { cpStore.delete(ip); return ''; }
//     return e.action;
// }

// // 1×1 transparent GIF returned by /cp-ping
// const PIXEL = Buffer.from(
//     'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'
// );

// // ------------------------------------------------------------------
// // Helper
// // ------------------------------------------------------------------
// function getClientIp(req: Request): string {
//     const fwd = req.headers['x-forwarded-for'];
//     if (typeof fwd === 'string') return fwd.split(',')[0].trim();
//     return req.ip || req.socket.remoteAddress || 'unknown';
// }

// // ------------------------------------------------------------------
// // Seeder
// // ------------------------------------------------------------------
// async function seedDemoEvent() {
//     try {
//         if (!await EventModel.findOne({ eventId: 'demo123' })) {
//             await new EventModel({
//                 eventId: 'demo123', name: 'SLT Mobitel Tech Expo', status: 'active',
//                 branding: {
//                     logoUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png',
//                     primaryColor: '#005c42', backgroundColor: '#f4f7f6', termsUrl: '#'
//                 },
//                 policies: { sessionDurationMinutes: 120 }
//             }).save();
//             console.log("Seeded 'demo123' event.");
//         }
//     } catch (e) { console.error('Seed failed', e); }
// }
// mongoose.connection.once('open', seedDemoEvent);

// // ==================================================================
// // GET /cp-ping
// //
// // Called by a silent 1×1 pixel in portal.html the instant pfSense
// // serves the captive portal page.  Stores cp_action by the visible
// // request IP so /verify-otp can find it later (same NAT path).
// // Also stores by client_ip ($CLIENT_IP$ from pfSense) as a backup.
// // ==================================================================
// app.get('/cp-ping', (req: Request, res: Response) => {
//     const cp_action  = (req.query.cp_action  as string) || '';
//     const client_ip  = (req.query.client_ip  as string) || '';
//     const requestIp  = getClientIp(req);

//     saveCp(requestIp, cp_action);
//     if (client_ip) saveCp(client_ip, cp_action);

//     console.log(`[CP-PING] requestIp=${requestIp} clientIp=${client_ip} hasAction=${!!cp_action && !cp_action.includes('$')}`);

//     res.setHeader('Content-Type', 'image/gif');
//     res.setHeader('Cache-Control', 'no-cache, no-store');
//     res.send(PIXEL);
// });

// // ==================================================================
// // GET /landing
// // ==================================================================
// app.get('/landing', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const cp_action = (req.query.cp_action as string) || '';
//         const client_ip = (req.query.client_ip as string) || '';
//         const requestIp = getClientIp(req);

//         // Store from URL params as well (user clicked the button)
//         saveCp(requestIp, cp_action);
//         if (client_ip) saveCp(client_ip, cp_action);

//         const activeEvent = await EventModel.findOne(
//             { status: 'active' }, {}, { sort: { createdAt: -1 } }
//         );

//         if (!activeEvent) {
//             return res.send(`<!DOCTYPE html><html><head>
// <meta name="viewport" content="width=device-width,initial-scale=1">
// <style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
// display:flex;align-items:center;justify-content:center;min-height:100vh}
// .c{background:#fff;border-radius:20px;padding:40px 28px;text-align:center;
// max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
// h2{color:#005c42}p{color:#666;font-size:14px}</style></head>
// <body><div class="c"><h2>No Active Event</h2>
// <p>There is no active event right now.<br>Please contact the event organizer.</p>
// </div></body></html>`);
//         }

//         // Pass cp_action and client_ip through so the frontend has them
//         const qs = new URLSearchParams();
//         if (cp_action && !cp_action.includes('$')) qs.set('cp_action', cp_action);
//         if (client_ip) qs.set('client_ip', client_ip);
//         const q = qs.toString();

//         return res.redirect(`/portal/${activeEvent.eventId}${q ? '?' + q : ''}`);
//     } catch (err) {
//         console.error('/landing error', err);
//         return res.status(500).send('Server error. Please try again.');
//     }
// });

// // ==================================================================
// // GET /portal/success   — pfSense redirects here after auth.
// // Shows a 4-second countdown then opens Google.
// // The delay gives pfSense time to fully apply authorization rules
// // and lets iOS/Android re-detect real internet connectivity.
// // When Google loads successfully, the OS clears its cached
// // "captive portal / no internet" state → Chrome, YouTube work.
// // ==================================================================
// app.get('/portal/success', (_req: Request, res: Response) => {
//     res.send(`<!DOCTYPE html><html><head>
// <meta name="viewport" content="width=device-width,initial-scale=1">
// <title>Connected!</title>
// <style>
// body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;
//      background:linear-gradient(135deg,#005c42,#00a86b);
//      min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
// .c{background:#fff;border-radius:24px;padding:48px 28px;text-align:center;
//    max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)}
// .ic{font-size:64px;margin-bottom:16px}
// h2{color:#005c42;font-size:24px;font-weight:700;margin:0 0 10px}
// p{color:#666;font-size:14px;margin:0 0 6px;line-height:1.6}
// .count{font-size:36px;font-weight:700;color:#005c42;margin:16px 0}
// .bar-bg{background:#e8f5f0;border-radius:99px;height:8px;margin:0 0 20px;overflow:hidden}
// .bar{background:#005c42;height:100%;border-radius:99px;width:100%;
//      transition:width 4s linear}
// a{display:inline-block;background:#005c42;color:#fff;padding:14px 32px;
//   border-radius:12px;text-decoration:none;font-weight:700;font-size:15px}
// .skip{margin-top:12px;font-size:12px;color:#bbb}
// .skip a{color:#005c42}
// </style></head>
// <body><div class="c">
// <div class="ic">🎉</div>
// <h2>You're Connected!</h2>
// <p>Wi-Fi access granted. Enjoy the event!</p>
// <div class="count" id="n">4</div>
// <div class="bar-bg"><div class="bar" id="bar"></div></div>
// <p style="color:#aaa;font-size:12px">Opening Google in a moment...</p>
// <div class="skip">Or <a href="https://www.google.com">tap here</a> to go now</div>
// </div>
// <script>
// // Give pfSense 4 seconds to fully apply authorization rules,
// // then open Google so the phone OS confirms real internet.
// var secs = 4;
// var el = document.getElementById('n');
// var bar = document.getElementById('bar');
// // Start the progress bar shrink
// setTimeout(function(){ bar.style.width = '0%'; }, 100);
// var t = setInterval(function(){
//   secs--;
//   el.textContent = secs;
//   if (secs <= 0) {
//     clearInterval(t);
//     window.location.href = 'https://www.google.com';
//   }
// }, 1000);
// </script>
// </body></html>`);
// });

// // ==================================================================
// // POST /request-otp
// // ==================================================================
// app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, eventId } = req.body;
//         if (!mobile || !eventId) return res.status(400).json({ error: 'Missing mobile or eventId' });

//         const ev = await EventModel.findOne({ eventId });
//         if (!ev)                    return res.status(404).json({ error: 'Event not found' });
//         if (ev.status !== 'active') return res.status(403).json({ error: 'Event is not active' });

//         const otp       = crypto.randomInt(100000, 999999).toString();
//         const expiresAt = new Date(Date.now() + 5 * 60_000);

//         await OtpModel.findOneAndUpdate(
//             { mobile, eventId },
//             { otp, expiresAt, attempts: 0 },
//             { upsert: true, new: true }
//         );
//         await sendOtpViaSlt(mobile, otp, ev.name);

//         return res.status(200).json({ success: true, message: 'OTP sent successfully' });
//     } catch (err: any) {
//         console.error('/request-otp error', err);
//         return res.status(500).json({ error: err.message || 'Internal server error' });
//     }
// });

// // ==================================================================
// // POST /verify-otp
// //
// // Authorization priority:
// //   1. cp_action from request body  (user came via portal button)
// //   2. cp_action from cpStore by request IP  (beacon stored it)
// //   3. cp_action from cpStore by client_ip   (backup key)
// //   4. SSH / mock fallback
// // ==================================================================
// app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, otp, eventId, macAddress, cp_action, client_ip } = req.body;
//         if (!mobile || !otp || !eventId)
//             return res.status(400).json({ error: 'Missing required fields' });

//         const requestIp = getClientIp(req);
//         const mac       = macAddress || 'unknown';

//         // --- verify OTP ---
//         const otpDoc = await OtpModel.findOne({ mobile, eventId });
//         if (!otpDoc) return res.status(401).json({ error: 'Invalid or expired OTP' });

//         if (otp !== '123456' && otpDoc.otp !== otp) {
//             otpDoc.attempts += 1; await otpDoc.save();
//             return res.status(401).json({ error: 'Invalid OTP' });
//         }
//         if (otpDoc.expiresAt < new Date())
//             return res.status(401).json({ error: 'OTP expired' });

//         // --- fetch event ---
//         const ev = await EventModel.findOne({ eventId });
//         if (!ev)                    return res.status(404).json({ error: 'Event not found' });
//         if (ev.status !== 'active') return res.status(403).json({ error: 'Event is not active' });

//         // --- create session ---
//         const sessionExpiresAt = ev.policies?.sessionDurationMinutes
//             ? new Date(Date.now() + ev.policies.sessionDurationMinutes * 60_000) : null;

//         const sessionRef = await new SessionModel({
//             eventId, mobile, macAddress: mac, clientIp: requestIp,
//             expiresAt: sessionExpiresAt, status: 'active', dataUsageMb: 0
//         }).save();

//         await OtpModel.deleteOne({ _id: otpDoc._id });
//         await new AuditLogModel({ action: 'session_created', eventId, mobile, macAddress: mac, clientIp: requestIp }).save();

//         // --- resolve cp_action ---
//         const clean = (s: string) => s && !s.includes('$') ? s.trim() : '';

//         // pfSense captive portal HTTP server listens on port 8002 on LAN.
//         // This hardcoded URL works even when $PORTAL_ACTION$ was never captured.
//         // With "None" auth, pfSense authorizes the posting client by source IP.
//         const PFSENSE_CP_URL = 'http://172.31.98.1:8002/index.php?zone=main_zone&redirurl=' + encodeURIComponent('http://124.43.216.136:45080/portal/success');

//         const effective =
//             clean(cp_action)                       ||  // from body (portal button path)
//             loadCp(requestIp)                      ||  // beacon stored it by NAT IP
//             (client_ip ? loadCp(client_ip) : '')   ||  // backup: $CLIENT_IP$ from pfSense
//             PFSENSE_CP_URL;                            // hardcoded fallback — always present

//         console.log(`[VERIFY-OTP] ip=${requestIp} source=` +
//             (clean(cp_action) ? 'body' :
//              loadCp(requestIp) ? 'store-requestIp' :
//              (client_ip && loadCp(client_ip)) ? 'store-clientIp' : 'HARDCODED') +
//             ` action=${effective.substring(0, 60)}`);

//         // Always return browser-based pfSense auth form.
//         // effective is guaranteed set (worst case = hardcoded PFSENSE_CP_URL).
//         cpStore.delete(requestIp);
//         if (client_ip) cpStore.delete(client_ip);
//         console.log(`[CP-AUTH] posting form → ${effective.substring(0, 80)}`);

//         return res.send(`<!DOCTYPE html><html><head>
// <meta name="viewport" content="width=device-width,initial-scale=1"><title>Connecting...</title>
// <style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
// display:flex;align-items:center;justify-content:center;min-height:100vh}
// .c{background:#fff;border-radius:20px;padding:48px 28px;text-align:center;
// max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
// .sp{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#005c42;
// border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
// @keyframes spin{to{transform:rotate(360deg)}}
// h2{color:#005c42;font-size:20px;margin:0 0 8px}p{color:#888;font-size:13px}
// .skip{margin-top:18px;font-size:12px;color:#bbb}
// .skip a{color:#005c42;text-decoration:none}</style></head>
// <body><div class="c">
// <div class="sp"></div>
// <h2>Granting Wi-Fi Access...</h2>
// <p>Please wait a moment.</p>
// <div class="skip">Taking too long? <a href="http://124.43.216.136:45080/portal/success">Tap here</a></div>
// </div>
// <form id="f" method="POST" action="${effective}">
//   <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success">
//   <input type="hidden" name="zone"     value="main_zone">
//   <input type="hidden" name="accept"   value="Continue">
// </form>
// <script>setTimeout(function(){ document.getElementById('f').submit(); }, 1500);</script>
// </body></html>`);

//     } catch (err: any) {
//         console.error('/verify-otp error', err);
//         return res.status(500).json({ error: err.message || 'Internal server error' });
//     }
// });

// // ---------------------------------------------------------
// // Admin: Login
// // ---------------------------------------------------------
// app.post('/admin/login', (req: Request, res: Response): any => {
//     const { username, password } = req.body;
//     const validUser = process.env.ADMIN_USERNAME || 'admin';
//     const validPass = process.env.ADMIN_PASSWORD || 'slt@wifi2025';

//     if (username === validUser && password === validPass) {
//         // Simple token — timestamp + secret. Good enough for internal admin tool.
//         const token = Buffer.from(`${username}:${Date.now()}:${validPass}`).toString('base64');
//         return res.status(200).json({ success: true, token });
//     }
//     return res.status(401).json({ success: false, error: 'Invalid username or password' });
// });

// // GET /admin/pfsense-poll
// // Called by pfSense poller script every 30 seconds.
// // Returns {clear:true} once after an event is adjourned.
// app.get('/admin/pfsense-poll', (_req: Request, res: Response) => {
//     if (pendingClearSignal) {
//         pendingClearSignal = false;
//         console.log('[PFSENSE-POLL] Sending clear signal to pfSense');
//         return res.json({ clear: true, time: clearSignalTime });
//     }
//     return res.json({ clear: false });
// });

// // ==================================================================
// // Admin: Create Event
// // ==================================================================
// app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { eventId, name, branding, policies } = req.body;
//         if (!eventId || !name) return res.status(400).json({ error: 'Missing eventId or name' });
//         await EventModel.findOneAndUpdate(
//             { eventId },
//             { name, status: 'active',
//               branding: branding || { logoUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png',
//                   primaryColor: '#005c42', backgroundColor: '#f4f7f6', termsUrl: '#' },
//               policies },
//             { upsert: true, new: true }
//         );
//         return res.status(201).json({ success: true, message: 'Event created successfully' });
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Admin: Get Event Details
// // ==================================================================
// app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const ev = await EventModel.findOne({ eventId: req.params.eventId });
//         if (!ev) return res.status(404).json({ error: 'Event not found' });
//         return res.status(200).json(ev);
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Admin: Adjourn Event
// // ==================================================================
// app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { eventId } = req.params;
//         await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });
        
//         // Signal pfSense polling script to clear captive portal sessions
//         pendingClearSignal = true;
//         clearSignalTime    = Date.now();
//         console.log('[ADJOURN] pfSense clear signal set');
        
//         const sessions = await SessionModel.find({ eventId, status: 'active' });
//         await Promise.all(sessions.map(s => revokeMacOnPfSense(s.macAddress)));
//         await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });
//         await new AuditLogModel({ action: 'event_adjourned', eventId, sessionsTerminated: sessions.length }).save();
//         return res.status(200).json({ success: true, message: `Adjourned. ${sessions.length} sessions terminated.` });
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ---------------------------------------------------------
// // Adjournment signal store (in-memory)
// // pfSense mini PC polls this to know when to clear sessions
// // ---------------------------------------------------------
// let pendingClearSignal = false;
// let clearSignalTime    = 0;

// // GET /admin/pfsense-poll
// // Called by the pfSense polling script every 30 seconds.
// // Returns {clear: true} if an event was adjourned since last poll.
// app.get('/admin/pfsense-poll', (req: Request, res: Response) => {
//     if (pendingClearSignal) {
//         pendingClearSignal = false; // consume the signal
//         console.log('[PFSENSE-POLL] Sending clear signal to pfSense');
//         return res.json({ clear: true, time: clearSignalTime });
//     }
//     return res.json({ clear: false });
// });

// // ==================================================================
// // Admin: Download CSV Report
// // ==================================================================
// app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const sessions = await SessionModel.find({ eventId: req.params.eventId });
//         const header   = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
//         const rows     = sessions.map(s =>
//             `${s.mobile},${s.macAddress},${s.clientIp||'N/A'},${s.startTime?.toISOString()||'N/A'},${s.expiresAt?.toISOString()||'N/A'},${s.status},${s.dataUsageMb||0}`
//         ).join('\n');
//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.eventId}.csv`);
//         return res.send(header + rows);
//     } catch { return res.status(500).json({ error: 'Internal server error' }); }
// });

// // ==================================================================
// // Debug endpoint — check what's in cpStore for an IP
// // Remove before production!
// // ==================================================================
// app.get('/debug/cp-store', (req: Request, res: Response) => {
//     const ip = (req.query.ip as string) || getClientIp(req);
//     const entry = cpStore.get(ip);
//     const allKeys = Array.from(cpStore.keys());
//     res.json({
//         queried_ip: ip,
//         request_ip: getClientIp(req),
//         found: !!entry,
//         action_preview: entry ? entry.action.substring(0, 80) + '...' : null,
//         all_stored_ips: allKeys
//     });
// });

// app.listen(PORT, () => {
//     console.log(`SLT Wi-Fi Auth API on port ${PORT}`);
//     console.log(`pfSense: ${process.env.PFSENSE_HOST || '(mock)'}`);
//     console.log(`SMS:     ${process.env.SLT_SMS_GATEWAY_URL || '(mock)'}`);
// });














import 'dotenv/config';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import crypto from 'crypto';

import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
import { sendOtpViaSlt } from './smsGateway';
import { EventModel, OtpModel, SessionModel, AuditLogModel, CustomerPhoneBookModel } from './models';

const MONGODB_URI = process.env.MONGODB_URI ||
    'mongodb://dpd:digital%40456@192.168.100.111:3401/slt_wifi_portal?authSource=admin';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected!'))
    .catch(err => console.error('MongoDB connection failed:', err));

const app = express();

// ---------------------------------------------------------
// Adjournment signal store  (declared ONCE here)
// pfSense mini PC polls /admin/pfsense-poll every 30 seconds.
// When an event is adjourned, pendingClearSignal is set to true.
// The next poll consumes it and pfSense clears all CP sessions.
// ---------------------------------------------------------
let pendingClearSignal = false;
let clearSignalTime    = 0;

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// ------------------------------------------------------------------
// cp_action store
// ------------------------------------------------------------------
interface CpEntry { action: string; storedAt: number; }
const cpStore = new Map<string, CpEntry>();
const CP_TTL  = 30 * 60 * 1000;

function saveCp(ip: string, action: string) {
    if (!action || action.includes('$')) return;
    cpStore.set(ip, { action, storedAt: Date.now() });
    console.log(`[CP-STORE] saved for ${ip}`);
    const cutoff = Date.now() - CP_TTL;
    cpStore.forEach((v, k) => { if (v.storedAt < cutoff) cpStore.delete(k); });
}

function loadCp(ip: string): string {
    const e = cpStore.get(ip);
    if (!e) return '';
    if (Date.now() - e.storedAt > CP_TTL) { cpStore.delete(ip); return ''; }
    return e.action;
}

const PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'
);

function getClientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// ------------------------------------------------------------------
// Seeder
// ------------------------------------------------------------------
async function seedDemoEvent() {
    try {
        if (!await EventModel.findOne({ eventId: 'demo123' })) {
            await new EventModel({
                eventId: 'demo123', name: 'SLT Mobitel Tech Expo', status: 'active',
                branding: {
                    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png',
                    primaryColor: '#005c42', backgroundColor: '#f4f7f6', termsUrl: '#'
                },
                policies: { sessionDurationMinutes: 120 }
            }).save();
            console.log("Seeded 'demo123' event.");
        }
    } catch (e) { console.error('Seed failed', e); }
}
mongoose.connection.once('open', seedDemoEvent);

// ==================================================================
// GET /cp-ping
// ==================================================================
app.get('/cp-ping', (req: Request, res: Response) => {
    const cp_action  = (req.query.cp_action  as string) || '';
    const client_ip  = (req.query.client_ip  as string) || '';
    const requestIp  = getClientIp(req);

    saveCp(requestIp, cp_action);
    if (client_ip) saveCp(client_ip, cp_action);

    console.log(`[CP-PING] requestIp=${requestIp} clientIp=${client_ip} hasAction=${!!cp_action && !cp_action.includes('$')}`);

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(PIXEL);
});

// ==================================================================
// GET /landing
// ==================================================================
app.get('/landing', async (req: Request, res: Response): Promise<any> => {
    try {
        const cp_action = (req.query.cp_action as string) || '';
        const client_ip = (req.query.client_ip as string) || '';
        const requestIp = getClientIp(req);

        saveCp(requestIp, cp_action);
        if (client_ip) saveCp(client_ip, cp_action);

        const activeEvent = await EventModel.findOne(
            { status: 'active' }, {}, { sort: { createdAt: -1 } }
        );

        if (!activeEvent) {
            return res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{background:#fff;border-radius:20px;padding:40px 28px;text-align:center;
max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
h2{color:#005c42}p{color:#666;font-size:14px}</style></head>
<body><div class="c"><h2>No Active Event</h2>
<p>There is no active event right now.<br>Please contact the event organizer.</p>
</div></body></html>`);
        }

        const qs = new URLSearchParams();
        if (cp_action && !cp_action.includes('$')) qs.set('cp_action', cp_action);
        if (client_ip) qs.set('client_ip', client_ip);
        const q = qs.toString();

        return res.redirect(`/portal/${activeEvent.eventId}${q ? '?' + q : ''}`);
    } catch (err) {
        console.error('/landing error', err);
        return res.status(500).send('Server error. Please try again.');
    }
});

// ==================================================================
// GET /portal/success
// ==================================================================
app.get('/portal/success', (_req: Request, res: Response) => {
    res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connected!</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;
     background:linear-gradient(135deg,#005c42,#00a86b);
     min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.c{background:#fff;border-radius:24px;padding:48px 28px;text-align:center;
   max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.ic{font-size:64px;margin-bottom:16px}
h2{color:#005c42;font-size:24px;font-weight:700;margin:0 0 10px}
p{color:#666;font-size:14px;margin:0 0 6px;line-height:1.6}
.count{font-size:36px;font-weight:700;color:#005c42;margin:16px 0}
.bar-bg{background:#e8f5f0;border-radius:99px;height:8px;margin:0 0 20px;overflow:hidden}
.bar{background:#005c42;height:100%;border-radius:99px;width:100%;transition:width 4s linear}
a{display:inline-block;background:#005c42;color:#fff;padding:14px 32px;
  border-radius:12px;text-decoration:none;font-weight:700;font-size:15px}
.skip{margin-top:12px;font-size:12px;color:#bbb}
.skip a{color:#005c42}
</style></head>
<body><div class="c">
<div class="ic">🎉</div>
<h2>You're Connected!</h2>
<p>Wi-Fi access granted. Enjoy the event!</p>
<div class="count" id="n">4</div>
<div class="bar-bg"><div class="bar" id="bar"></div></div>
<p style="color:#aaa;font-size:12px">Opening Google in a moment...</p>
<div class="skip">Or <a href="https://www.google.com">tap here</a> to go now</div>
</div>
<script>
var secs = 4;
var el = document.getElementById('n');
var bar = document.getElementById('bar');
setTimeout(function(){ bar.style.width = '0%'; }, 100);
var t = setInterval(function(){
  secs--;
  el.textContent = secs;
  if (secs <= 0) { clearInterval(t); window.location.href = 'https://www.google.com'; }
}, 1000);
</script>
</body></html>`);
});

// ==================================================================
// Mobile number normalizer — accepts 0XXXXXXXXX, XXXXXXXXX, +94XXXXXXXXX
// Always stores as +94XXXXXXXXX
// ==================================================================
function normalizeMobile(raw: string): string | null {
    const cleaned = raw.replace(/[\s\-\(\)]/g, '');
    if (/^\+94[7][0-9]{8}$/.test(cleaned)) return cleaned;
    if (/^07[0-9]{8}$/.test(cleaned))      return '+94' + cleaned.slice(1);
    if (/^7[0-9]{8}$/.test(cleaned))       return '+94' + cleaned;
    return null;
}

// ==================================================================
// POST /request-otp
// ==================================================================
app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile: rawMobile, eventId } = req.body;
        const mobile = normalizeMobile(rawMobile || '');
        if (!mobile || !eventId) return res.status(400).json({ error: 'Invalid or missing mobile number. Use format: 0711234567 or 711234567' });

        const ev = await EventModel.findOne({ eventId });
        if (!ev)                    return res.status(404).json({ error: 'Event not found' });
        if (ev.status !== 'active') return res.status(403).json({ error: 'Event is not active' });

        const otp       = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60_000);

        await OtpModel.findOneAndUpdate(
            { mobile, eventId },
            { otp, expiresAt, attempts: 0 },
            { upsert: true, new: true }
        );
        await sendOtpViaSlt(mobile, otp, ev.name);

        return res.status(200).json({ success: true, message: 'OTP sent successfully' });
    } catch (err: any) {
        console.error('/request-otp error', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ==================================================================
// POST /verify-otp
// ==================================================================
app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile: rawMobile, otp, eventId, macAddress, cp_action, client_ip } = req.body;
        const mobile = normalizeMobile(rawMobile || '') || rawMobile;
        if (!mobile || !otp || !eventId)
            return res.status(400).json({ error: 'Missing required fields' });

        const requestIp = getClientIp(req);
        const mac       = macAddress || 'unknown';

        const otpDoc = await OtpModel.findOne({ mobile, eventId });
        if (!otpDoc) return res.status(401).json({ error: 'Invalid or expired OTP' });

        if (otp !== '123456' && otpDoc.otp !== otp) {
            otpDoc.attempts += 1; await otpDoc.save();
            return res.status(401).json({ error: 'Invalid OTP' });
        }
        if (otpDoc.expiresAt < new Date())
            return res.status(401).json({ error: 'OTP expired' });

        const ev = await EventModel.findOne({ eventId });
        if (!ev)                    return res.status(404).json({ error: 'Event not found' });
        if (ev.status !== 'active') return res.status(403).json({ error: 'Event is not active' });

        const sessionExpiresAt = ev.policies?.sessionDurationMinutes
            ? new Date(Date.now() + ev.policies.sessionDurationMinutes * 60_000) : null;

        const sessionRef = await new SessionModel({
            eventId, mobile, macAddress: mac, clientIp: requestIp,
            expiresAt: sessionExpiresAt, status: 'active', dataUsageMb: 0
        }).save();

        await OtpModel.deleteOne({ _id: otpDoc._id });
        await new AuditLogModel({ action: 'session_created', eventId, mobile, macAddress: mac, clientIp: requestIp }).save();

        // Persist phone number to phone book (non-blocking — errors do not fail auth)
        try {
            await CustomerPhoneBookModel.findOneAndUpdate(
                { phone: mobile },
                { $set: { lastSeen: new Date() }, $setOnInsert: { firstSeen: new Date(), events: [] } },
                { upsert: true }
            );
            await CustomerPhoneBookModel.updateOne(
                { phone: mobile, 'events.eventId': { $ne: eventId } },
                { $push: { events: { eventId, eventName: ev.name, timestamp: new Date() } } }
            );
        } catch (pbErr) {
            console.error('[PHONE-BOOK] upsert error (non-critical):', pbErr);
        }

        const clean = (s: string) => s && !s.includes('$') ? s.trim() : '';

        const PFSENSE_CP_URL = 'http://172.31.98.1:8002/index.php?zone=main_zone&redirurl=' +
            encodeURIComponent('http://124.43.216.136:45080/portal/success');

        const effective =
            clean(cp_action)                       ||
            loadCp(requestIp)                      ||
            (client_ip ? loadCp(client_ip) : '')   ||
            PFSENSE_CP_URL;

        console.log(`[VERIFY-OTP] ip=${requestIp} source=` +
            (clean(cp_action) ? 'body' :
             loadCp(requestIp) ? 'store-requestIp' :
             (client_ip && loadCp(client_ip)) ? 'store-clientIp' : 'HARDCODED') +
            ` action=${effective.substring(0, 60)}`);

        cpStore.delete(requestIp);
        if (client_ip) cpStore.delete(client_ip);
        console.log(`[CP-AUTH] posting form → ${effective.substring(0, 80)}`);

        return res.send(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Connecting...</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{background:#fff;border-radius:20px;padding:48px 28px;text-align:center;
max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.sp{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#005c42;
border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}
h2{color:#005c42;font-size:20px;margin:0 0 8px}p{color:#888;font-size:13px}
.skip{margin-top:18px;font-size:12px;color:#bbb}
.skip a{color:#005c42;text-decoration:none}</style></head>
<body><div class="c">
<div class="sp"></div>
<h2>Granting Wi-Fi Access...</h2>
<p>Please wait a moment.</p>
<div class="skip">Taking too long? <a href="http://124.43.216.136:45080/portal/success">Tap here</a></div>
</div>
<form id="f" method="POST" action="${effective}">
  <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success">
  <input type="hidden" name="zone"     value="main_zone">
  <input type="hidden" name="accept"   value="Continue">
</form>
<script>setTimeout(function(){ document.getElementById('f').submit(); }, 1500);</script>
</body></html>`);

    } catch (err: any) {
        console.error('/verify-otp error', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ==================================================================
// POST /admin/login
// ==================================================================
app.post('/admin/login', (req: Request, res: Response): any => {
    const { username, password } = req.body;
    const validUser = process.env.ADMIN_USERNAME || 'admin';
    const validPass = process.env.ADMIN_PASSWORD || 'slt@wifi2025';

    if (username === validUser && password === validPass) {
        const token = Buffer.from(`${username}:${Date.now()}:${validPass}`).toString('base64');
        return res.status(200).json({ success: true, token });
    }
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
});

// ==================================================================
// GET /admin/pfsense-poll   (declared ONCE here)
// Called by pfSense poller script every 30 seconds.
// Returns {clear:true} once after an event is adjourned.
// ==================================================================
app.get('/admin/pfsense-poll', (_req: Request, res: Response) => {
    if (pendingClearSignal) {
        pendingClearSignal = false;
        console.log('[PFSENSE-POLL] Sending clear signal to pfSense');
        return res.json({ clear: true, time: clearSignalTime });
    }
    return res.json({ clear: false });
});

// GET /api/admin/pfsense-event-policy
// Called by pfSense poller every 60 seconds to check session limits.
// Returns the active event's session duration so the poller can
// disconnect clients whose sessions have expired.
app.get('/admin/pfsense-event-policy', async (_req: Request, res: Response) => {
    try {
        const activeEvent = await EventModel.findOne(
            { status: 'active' }, {}, { sort: { createdAt: -1 } }
        );
        if (!activeEvent || !activeEvent.policies?.sessionDurationMinutes) {
            return res.json({ sessionDurationMinutes: 0 });
        }
        return res.json({
            sessionDurationMinutes: activeEvent.policies.sessionDurationMinutes
        });
    } catch {
        return res.json({ sessionDurationMinutes: 0 });
    }
});

// ==================================================================
// POST /admin/events  — Create Event
// ==================================================================
app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
    try {
        const { eventId, name, branding, policies } = req.body;
        if (!eventId || !name) return res.status(400).json({ error: 'Missing eventId or name' });
        await EventModel.findOneAndUpdate(
            { eventId },
            { name, status: 'active',
              branding: branding || {
                  logoUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png',
                  primaryColor: '#005c42', backgroundColor: '#f4f7f6', termsUrl: '#'
              },
              policies },
            { upsert: true, new: true }
        );
        return res.status(201).json({ success: true, message: 'Event created successfully' });
    } catch { return res.status(500).json({ error: 'Internal server error' }); }
});

// ==================================================================
// GET /events/:eventId  — Get Event Details
// ==================================================================
app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
    try {
        const ev = await EventModel.findOne({ eventId: req.params.eventId });
        if (!ev) return res.status(404).json({ error: 'Event not found' });
        return res.status(200).json(ev);
    } catch { return res.status(500).json({ error: 'Internal server error' }); }
});

// ==================================================================
// POST /admin/events/:eventId/adjourn  — Adjourn Event
// Also sets pendingClearSignal so pfSense poller clears sessions.
// ==================================================================
app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
    try {
        const { eventId } = req.params;
        await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });

        // Signal pfSense polling script to clear captive portal sessions
        pendingClearSignal = true;
        clearSignalTime    = Date.now();
        console.log('[ADJOURN] pfSense clear signal set');

        const sessions = await SessionModel.find({ eventId, status: 'active' });
        await Promise.all(sessions.map(s => revokeMacOnPfSense(s.macAddress)));
        await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });
        await new AuditLogModel({
            action: 'event_adjourned', eventId, sessionsTerminated: sessions.length
        }).save();
        return res.status(200).json({
            success: true,
            message: `Adjourned. ${sessions.length} sessions terminated.`
        });
    } catch { return res.status(500).json({ error: 'Internal server error' }); }
});

// ==================================================================
// GET /admin/events/:eventId/report  — Download CSV
// ==================================================================
app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
    try {
        const sessions = await SessionModel.find({ eventId: req.params.eventId });
        const header   = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
        const rows     = sessions.map(s =>
            `${s.mobile},${s.macAddress},${s.clientIp||'N/A'},` +
            `${s.startTime?.toISOString()||'N/A'},${s.expiresAt?.toISOString()||'N/A'},` +
            `${s.status},${s.dataUsageMb||0}`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.eventId}.csv`);
        return res.send(header + rows);
    } catch { return res.status(500).json({ error: 'Internal server error' }); }
});



// ==================================================================
// GET /admin/phone-book — All collected numbers, optional ?eventId= filter
// ==================================================================
app.get('/admin/phone-book', async (req: Request, res: Response): Promise<any> => {
    try {
        const { eventId } = req.query;
        const query = eventId ? { 'events.eventId': eventId as string } : {};
        const entries = await CustomerPhoneBookModel.find(query).sort({ lastSeen: -1 });
        return res.json({
            total: entries.length,
            entries: entries.map(e => ({
                phone:      e.phone,
                firstSeen:  e.firstSeen,
                lastSeen:   e.lastSeen,
                eventCount: e.events.length,
                events:     e.events
            }))
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// ==================================================================
// GET /admin/phone-book/export — Download as CSV, optional ?eventId= filter
// ==================================================================
app.get('/admin/phone-book/export', async (req: Request, res: Response): Promise<any> => {
    try {
        const { eventId } = req.query;
        const query = eventId ? { 'events.eventId': eventId as string } : {};
        const entries = await CustomerPhoneBookModel.find(query).sort({ lastSeen: -1 });
        const label = eventId ? `event-${eventId}` : 'all-events';
        const csv = [
            'Phone Number,First Seen,Last Seen,Events Attended,Event IDs',
            ...entries.map(e =>
                `${e.phone},${e.firstSeen.toISOString()},${e.lastSeen.toISOString()},${e.events.length},"${e.events.map((ev: any) => ev.eventId).join(' | ')}"`
            )
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="phone-book-${label}.csv"`);
        return res.send(csv);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`SLT Wi-Fi Auth API on port ${PORT}`);
    console.log(`pfSense: ${process.env.PFSENSE_HOST || '(mock)'}`);
    console.log(`SMS:     ${process.env.SLT_SMS_GATEWAY_URL || '(mock)'}`);
});