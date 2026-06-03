// import 'dotenv/config';
// import express, { Request, Response } from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import crypto from 'crypto';
// import path from 'path';

// // Import integration modules
// import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
// import { sendOtpViaSlt } from './smsGateway';

// // Import Mongoose Models
// import { EventModel, OtpModel, SessionModel, AuditLogModel } from './models';

// // MongoDB Connection
// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://dpd:digital%40456@192.168.100.111:3401/slt_wifi_portal?authSource=admin';

// mongoose.connect(MONGODB_URI)
//     .then(() => console.log("MongoDB successfully connected!"))
//     .catch(err => console.error("MongoDB connection failed:", err));

// const app = express();
// app.use(cors());
// app.use(express.json());

// // Trust proxy to get real client IP from pfSense/nginx/Cloud Run
// app.set('trust proxy', true);

// // ---------------------------------------------------------
// // DB Seeder: Initialize the 'demo123' event
// // ---------------------------------------------------------
// async function seedDemoEvent() {
//     try {
//         const existing = await EventModel.findOne({ eventId: 'demo123' });
//         if (!existing) {
//             await new EventModel({
//                 eventId: 'demo123',
//                 name: "SLT Mobitel Tech Expo",
//                 status: "active",
//                 branding: {
//                     logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
//                     primaryColor: "#005c42",
//                     backgroundColor: "#f4f7f6",
//                     termsUrl: "#"
//                 },
//                 policies: {
//                     bandwidthMbps: 10,
//                     dataLimitMb: 500,
//                     sessionDurationMinutes: 120
//                 }
//             }).save();
//             console.log("Seeded 'demo123' event into MongoDB.");
//         }
//     } catch (e) {
//         console.error("Failed to seed demo event", e);
//     }
// }
// mongoose.connection.once('open', seedDemoEvent);

// // ---------------------------------------------------------
// // Helper: Extract client IP from request
// // ---------------------------------------------------------
// function getClientIp(req: Request): string {
//     const forwarded = req.headers['x-forwarded-for'];
//     if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
//     return req.ip || req.socket.remoteAddress || 'unknown';
// }

// // ---------------------------------------------------------
// // API: Get Event Details
// // ---------------------------------------------------------
// app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const eventId = req.params.eventId as string;
//         const eventDoc = await EventModel.findOne({ eventId });
        
//         if (!eventDoc) {
//             return res.status(404).json({ error: "Event not found" });
//         }

//         return res.status(200).json(eventDoc);
//     } catch (error) {
//         console.error("Error fetching event:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // API: /request-otp
// // ---------------------------------------------------------
// app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, eventId } = req.body;
//         if (!mobile || !eventId) {
//             return res.status(400).json({ error: "Missing mobile or eventId" });
//         }

//         // 1. Verify Event is active
//         const eventDoc = await EventModel.findOne({ eventId });
//         if (!eventDoc) return res.status(404).json({ error: "Event not found" });
//         if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

//         // 2. Generate 6-digit OTP
//         const otp = crypto.randomInt(100000, 999999).toString();
//         const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes TTL

//         // 3. Store OTP in MongoDB (upsert so it replaces any existing one)
//         await OtpModel.findOneAndUpdate(
//             { mobile, eventId },
//             { otp, expiresAt, attempts: 0 },
//             { upsert: true, new: true }
//         );

//         // 4. Send SMS via SLT Gateway
//         await sendOtpViaSlt(mobile, otp, eventDoc.name);

//         return res.status(200).json({ success: true, message: "OTP sent successfully" });
//     } catch (error: any) {
//         console.error("Error in /request-otp:", error);
//         return res.status(500).json({ error: error.message || "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // API: /verify-otp
// // ---------------------------------------------------------
// app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, otp, eventId, macAddress, cp_action } = req.body;
//         if (!mobile || !otp || !eventId) {
//             return res.status(400).json({ error: "Missing required fields" });
//         }

//         const clientIp = getClientIp(req);
//         const mac = macAddress || 'unknown';

//         // 1. Verify OTP
//         const otpDoc = await OtpModel.findOne({ mobile, eventId });
        
//         if (!otpDoc) return res.status(401).json({ error: "Invalid or expired OTP" });
        
//         // Allow '123456' as a demo bypass in development
//         if (otp !== '123456' && otpDoc.otp !== otp) {
//             otpDoc.attempts += 1;
//             await otpDoc.save();
//             return res.status(401).json({ error: "Invalid OTP" });
//         }
        
//         if (otpDoc.expiresAt < new Date()) {
//             return res.status(401).json({ error: "OTP expired" });
//         }

//         // 2. Fetch Event Policies
//         const eventDoc = await EventModel.findOne({ eventId });
//         if (!eventDoc) return res.status(404).json({ error: "Event not found" });
//         if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

//         const policies = eventDoc.policies;

//         // 3. Authorize on pfSense
//         await authorizeMacOnPfSense(mac, clientIp, policies?.sessionDurationMinutes);

//         // 4. Create Session Record
//         const sessionExpiresAt = policies?.sessionDurationMinutes 
//             ? new Date(Date.now() + policies.sessionDurationMinutes * 60000)
//             : null;

//         const sessionRef = await new SessionModel({
//             eventId,
//             mobile,
//             macAddress: mac,
//             clientIp,
//             expiresAt: sessionExpiresAt,
//             status: 'active',
//             dataUsageMb: 0
//         }).save();

//         // 5. Clean up OTP
//         await OtpModel.deleteOne({ _id: otpDoc._id });

//         // 6. Log for audit trail
//         await new AuditLogModel({
//             action: 'session_created',
//             eventId,
//             mobile,
//             macAddress: mac,
//             clientIp
//         }).save();

//         // If cp_action provided, return auto-submitting form for pfSense authorization
//         if (cp_action) {
//             return res.send(`<!DOCTYPE html>
// <html>
// <head>
//   <meta name="viewport" content="width=device-width,initial-scale=1">
//   <style>
//     body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f4f7f6}
//     h2{color:#005c42}p{color:#666}
//   </style>
// </head>
// <body>
//   <h2>✓ Wi-Fi Access Granted</h2>
//   <p>Connecting you to the internet...</p>
//   <form id="auth" method="POST" action="${cp_action}">
//     <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success">
//     <input type="hidden" name="zone" value="main_zone">
//   </form>
//   <script>
//     setTimeout(function(){ document.getElementById('auth').submit(); }, 1500);
//   </script>
// </body>
// </html>`);
//         }

//         // Default JSON response for non‑captive scenarios (e.g., testing from laptop)
//         return res.status(200).json({ 
//             success: true, 
//             message: "Wi-Fi Access Granted",
//             sessionId: sessionRef._id,
//             expiresAt: sessionExpiresAt
//         });

//     } catch (error: any) {
//         console.error("Error in /verify-otp:", error);
//         return res.status(500).json({ error: error.message || "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Portal success page after pfSense redirects back
// // ---------------------------------------------------------
// app.get('/portal/success', (req: Request, res: Response) => {
//     res.send(`<!DOCTYPE html>
// <html>
// <head><meta name="viewport" content="width=device-width,initial-scale=1">
// <style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#f4f7f6}h2{color:#005c42}p{color:#555}</style>
// </head>
// <body>
// <h2>🎉 You're connected!</h2>
// <p>You now have full internet access.<br>Enjoy the event!</p>
// </body>
// </html>`);
// });

// // ---------------------------------------------------------
// // Landing page redirects phone to the active event portal
// // ---------------------------------------------------------
// app.get('/landing', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const activeEvent = await EventModel.findOne(
//             { status: 'active' },
//             {},
//             { sort: { createdAt: -1 } }
//         );

//         if (!activeEvent) {
//             return res.send(`
//                 <!DOCTYPE html>
//                 <html>
//                 <head>
//                     <meta name="viewport" content="width=device-width, initial-scale=1">
//                     <style>
//                         body { font-family: sans-serif; text-align: center; padding: 60px 20px; background: #f4f7f6; }
//                         h2 { color: #005c42; }
//                         p { color: #666; }
//                     </style>
//                 </head>
//                 <body>
//                     <h2>No Active Event</h2>
//                     <p>There is no active Wi-Fi event at this time.<br>Please contact the event organizer.</p>
//                 </body>
//                 </html>
//             `);
//         }

//         const params = new URLSearchParams(req.query as any);
//         params.set('client_ip', getClientIp(req));
//         const redirectUrl = `/portal/${activeEvent.eventId}?${params.toString()}`;
        
//         return res.redirect(redirectUrl);
//     } catch (error) {
//         console.error("Error in /landing:", error);
//         return res.status(500).send("Server error. Please try again.");
//     }
// });

// // ---------------------------------------------------------
// // Admin API: Create Event
// // ---------------------------------------------------------
// app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const eventId = req.body.eventId as string;
//         const { name, branding, policies } = req.body;
        
//         if (!eventId || !name) {
//             return res.status(400).json({ error: "Missing eventId or name" });
//         }

//         await EventModel.findOneAndUpdate(
//             { eventId },
//             { 
//                 name, 
//                 status: 'active', 
//                 branding: branding || {
//                     logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
//                     primaryColor: "#005c42",
//                     backgroundColor: "#f4f7f6",
//                     termsUrl: "#"
//                 },
//                 policies 
//             },
//             { upsert: true, new: true }
//         );

//         return res.status(201).json({ success: true, message: "Event created successfully" });
//     } catch (error) {
//         console.error("Error creating event:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Admin API: Adjourn Event
// // ---------------------------------------------------------
// app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const eventId = req.params.eventId as string;

//         // 1. Mark event as adjourned
//         await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });

//         // 2. Fetch all active sessions
//         const sessions = await SessionModel.find({ eventId, status: 'active' });

//         const revokePromises: Promise<any>[] = [];

//         // 3. Revoke each MAC on pfSense
//         sessions.forEach(session => {
//             revokePromises.push(revokeMacOnPfSense(session.macAddress));
//         });

//         await Promise.all(revokePromises);

//         // 4. Update all sessions in DB
//         await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });

//         // 5. Audit log
//         await new AuditLogModel({
//             action: 'event_adjourned',
//             eventId,
//             sessionsTerminated: sessions.length
//         }).save();

//         return res.status(200).json({ 
//             success: true, 
//             message: `Event adjourned. ${sessions.length} sessions terminated.` 
//         });

//     } catch (error) {
//         console.error("Error in /adjourn-event:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Admin API: Download Session Report (CSV)
// // ---------------------------------------------------------
// app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const eventId = req.params.eventId as string;

//         const sessions = await SessionModel.find({ eventId });

//         // Build CSV
//         const csvHeader = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
//         const csvRows = sessions.map(s => {
//             const startTime = s.startTime?.toISOString() || 'N/A';
//             const expiresAt = s.expiresAt?.toISOString() || 'N/A';
//             return `${s.mobile},${s.macAddress},${s.clientIp || 'N/A'},${startTime},${expiresAt},${s.status},${s.dataUsageMb || 0}`;
//         }).join('\n');

//         const csv = csvHeader + csvRows;

//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader('Content-Disposition', `attachment; filename=report_${eventId}.csv`);
//         return res.send(csv);
//     } catch (error) {
//         console.error("Error generating report:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// const PORT = process.env.PORT || 8080;
// app.listen(PORT, () => {
//     console.log(`SLT Wi-Fi Auth API running on port ${PORT}`);
//     console.log(`pfSense Host: ${process.env.PFSENSE_HOST || '(mock mode — no PFSENSE_HOST set)'}`);
//     console.log(`SMS Gateway:  ${process.env.SLT_SMS_GATEWAY_URL || '(mock mode — no SLT_SMS_GATEWAY_URL set)'}`);
//     console.log("System initialized and ready.");
// });


// import 'dotenv/config';
// import express, { Request, Response } from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import crypto from 'crypto';
// import path from 'path';

// // Import integration modules
// import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
// import { sendOtpViaSlt } from './smsGateway';

// // Import Mongoose Models
// import { EventModel, OtpModel, SessionModel, AuditLogModel } from './models';

// // MongoDB Connection
// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://dpd:digital%40456@192.168.100.111:3401/slt_wifi_portal?authSource=admin';

// mongoose.connect(MONGODB_URI)
//     .then(() => console.log("MongoDB successfully connected!"))
//     .catch(err => console.error("MongoDB connection failed:", err));

// const app = express();
// app.use(cors());
// app.use(express.json());

// // Trust proxy to get real client IP from pfSense/nginx
// app.set('trust proxy', true);

// // ---------------------------------------------------------
// // DB Seeder: Initialize the 'demo123' event
// // ---------------------------------------------------------
// async function seedDemoEvent() {
//     try {
//         const existing = await EventModel.findOne({ eventId: 'demo123' });
//         if (!existing) {
//             await new EventModel({
//                 eventId: 'demo123',
//                 name: "SLT Mobitel Tech Expo",
//                 status: "active",
//                 branding: {
//                     logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
//                     primaryColor: "#005c42",
//                     backgroundColor: "#f4f7f6",
//                     termsUrl: "#"
//                 },
//                 policies: {
//                     bandwidthMbps: 10,
//                     dataLimitMb: 500,
//                     sessionDurationMinutes: 120
//                 }
//             }).save();
//             console.log("Seeded 'demo123' event into MongoDB.");
//         }
//     } catch (e) {
//         console.error("Failed to seed demo event", e);
//     }
// }
// mongoose.connection.once('open', seedDemoEvent);

// // ---------------------------------------------------------
// // Helper: Extract client IP from request
// // ---------------------------------------------------------
// function getClientIp(req: Request): string {
//     const forwarded = req.headers['x-forwarded-for'];
//     if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
//     return req.ip || req.socket.remoteAddress || 'unknown';
// }

// // ---------------------------------------------------------
// // API: Get Event Details
// // ---------------------------------------------------------
// app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const eventDoc = await EventModel.findOne({ eventId: req.params.eventId });
//         if (!eventDoc) return res.status(404).json({ error: "Event not found" });
//         return res.status(200).json(eventDoc);
//     } catch (error) {
//         console.error("Error fetching event:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Landing page — captive portal redirects here first.
// // Finds the active event and forwards the phone to it,
// // carrying the pfSense cp_action URL as a query param.
// // ---------------------------------------------------------
// app.get('/landing', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const cp_action = (req.query.cp_action as string) || '';
//         const client_ip = (req.query.client_ip as string) || '';

//         const activeEvent = await EventModel.findOne(
//             { status: 'active' },
//             {},
//             { sort: { createdAt: -1 } }
//         );

//         if (!activeEvent) {
//             return res.send(`<!DOCTYPE html>
// <html>
// <head>
//   <meta name="viewport" content="width=device-width,initial-scale=1">
//   <style>
//     body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
//          display:flex;align-items:center;justify-content:center;min-height:100vh}
//     .card{background:white;border-radius:20px;padding:40px 30px;text-align:center;
//           max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
//     h2{color:#005c42;margin:0 0 12px}p{color:#666;font-size:14px}
//   </style>
// </head>
// <body>
//   <div class="card">
//     <h2>No Active Event</h2>
//     <p>There is no active Wi-Fi event right now.<br>Please contact the event organizer.</p>
//   </div>
// </body>
// </html>`);
//         }

//         // Build redirect URL, carrying cp_action and client_ip through
//         const params = new URLSearchParams();
//         if (cp_action)  params.set('cp_action', cp_action);
//         if (client_ip)  params.set('client_ip', client_ip);

//         const qs = params.toString();
//         return res.redirect(`/portal/${activeEvent.eventId}${qs ? '?' + qs : ''}`);

//     } catch (error) {
//         console.error("Error in /landing:", error);
//         return res.status(500).send("Server error. Please try again.");
//     }
// });

// // ---------------------------------------------------------
// // Success page — pfSense redirects here after authorization
// // ---------------------------------------------------------
// app.get('/portal/success', (_req: Request, res: Response) => {
//     res.send(`<!DOCTYPE html>
// <html>
// <head>
//   <meta name="viewport" content="width=device-width,initial-scale=1">
//   <title>Connected!</title>
//   <style>
//     body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
//          display:flex;align-items:center;justify-content:center;min-height:100vh}
//     .card{background:white;border-radius:20px;padding:48px 32px;text-align:center;
//           max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
//     .icon{font-size:64px;margin-bottom:16px}
//     h2{color:#005c42;margin:0 0 10px;font-size:24px}
//     p{color:#666;font-size:14px;line-height:1.6;margin:0 0 24px}
//     a{display:inline-block;background:#005c42;color:white;padding:14px 32px;
//       border-radius:12px;text-decoration:none;font-weight:600;font-size:15px}
//   </style>
// </head>
// <body>
//   <div class="card">
//     <div class="icon">🎉</div>
//     <h2>You're Connected!</h2>
//     <p>Wi-Fi access has been granted.<br>Enjoy the event!</p>
//     <a href="https://www.google.com">Start Browsing</a>
//   </div>
// </body>
// </html>`);
// });

// // ---------------------------------------------------------
// // API: /request-otp
// // ---------------------------------------------------------
// app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, eventId } = req.body;
//         if (!mobile || !eventId) {
//             return res.status(400).json({ error: "Missing mobile or eventId" });
//         }

//         const eventDoc = await EventModel.findOne({ eventId });
//         if (!eventDoc) return res.status(404).json({ error: "Event not found" });
//         if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

//         const otp = crypto.randomInt(100000, 999999).toString();
//         const expiresAt = new Date(Date.now() + 5 * 60000);

//         await OtpModel.findOneAndUpdate(
//             { mobile, eventId },
//             { otp, expiresAt, attempts: 0 },
//             { upsert: true, new: true }
//         );

//         await sendOtpViaSlt(mobile, otp, eventDoc.name);

//         return res.status(200).json({ success: true, message: "OTP sent successfully" });
//     } catch (error: any) {
//         console.error("Error in /request-otp:", error);
//         return res.status(500).json({ error: error.message || "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // API: /verify-otp
// //
// // Two authorization paths:
// //
// //  PATH A (cp_action present) — phone came through captive portal.
// //    After OTP verification we return an HTML page that auto-POSTs
// //    directly to pfSense's local authorization endpoint.
// //    The phone browser does this POST itself (it can reach pfSense
// //    on 172.31.98.x because it's on the same local Wi-Fi network).
// //    No SSH needed. ✓
// //
// //  PATH B (no cp_action) — direct browser access / testing.
// //    Fall back to SSH mock or SSH call and return JSON.
// // ---------------------------------------------------------
// app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { mobile, otp, eventId, macAddress, cp_action } = req.body;

//         if (!mobile || !otp || !eventId) {
//             return res.status(400).json({ error: "Missing required fields" });
//         }

//         const clientIp = getClientIp(req);
//         const mac = macAddress || 'unknown';

//         // 1. Verify OTP
//         const otpDoc = await OtpModel.findOne({ mobile, eventId });
//         if (!otpDoc) return res.status(401).json({ error: "Invalid or expired OTP" });

//         // Allow '123456' as demo bypass
//         if (otp !== '123456' && otpDoc.otp !== otp) {
//             otpDoc.attempts += 1;
//             await otpDoc.save();
//             return res.status(401).json({ error: "Invalid OTP" });
//         }

//         if (otpDoc.expiresAt < new Date()) {
//             return res.status(401).json({ error: "OTP expired" });
//         }

//         // 2. Fetch Event Policies
//         const eventDoc = await EventModel.findOne({ eventId });
//         if (!eventDoc) return res.status(404).json({ error: "Event not found" });
//         if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

//         const policies = eventDoc.policies;

//         // 3. Create Session Record
//         const sessionExpiresAt = policies?.sessionDurationMinutes
//             ? new Date(Date.now() + policies.sessionDurationMinutes * 60000)
//             : null;

//         const sessionRef = await new SessionModel({
//             eventId,
//             mobile,
//             macAddress: mac,
//             clientIp,
//             expiresAt: sessionExpiresAt,
//             status: 'active',
//             dataUsageMb: 0
//         }).save();

//         // 4. Clean up OTP
//         await OtpModel.deleteOne({ _id: otpDoc._id });

//         // 5. Audit log
//         await new AuditLogModel({
//             action: 'session_created',
//             eventId,
//             mobile,
//             macAddress: mac,
//             clientIp
//         }).save();

//         // -------------------------------------------------------
//         // PATH A: cp_action present — browser-based pfSense auth
//         // The phone POSTs directly to pfSense from its browser.
//         // pfSense authorizes that client IP and redirects to /portal/success
//         // -------------------------------------------------------
//         const hasCpAction = cp_action && cp_action.trim() !== '' && cp_action !== 'undefined';

//         if (hasCpAction) {
//             console.log(`[PFSENSE-CP] Authorizing via browser form. Action: ${cp_action}, IP: ${clientIp}`);

//             return res.send(`<!DOCTYPE html>
// <html>
// <head>
//   <meta name="viewport" content="width=device-width,initial-scale=1">
//   <title>Connecting...</title>
//   <style>
//     body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
//          display:flex;align-items:center;justify-content:center;min-height:100vh}
//     .card{background:white;border-radius:20px;padding:48px 32px;text-align:center;
//           max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
//     .spinner{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#005c42;
//              border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px}
//     @keyframes spin{to{transform:rotate(360deg)}}
//     h2{color:#005c42;margin:0 0 10px;font-size:20px}
//     p{color:#888;font-size:13px;margin:0}
//   </style>
// </head>
// <body>
//   <div class="card">
//     <div class="spinner"></div>
//     <h2>Granting Wi-Fi Access...</h2>
//     <p>Please wait a moment.</p>
//   </div>

//   <!-- This form POSTs directly to pfSense's captive portal authorization endpoint.
//        The phone browser submits it automatically. pfSense then authorizes this
//        client IP and redirects to /portal/success. No SSH required. -->
//   <form id="cp_auth" method="POST" action="${cp_action}">
//     <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success">
//     <input type="hidden" name="zone" value="main_zone">
//     <input type="hidden" name="accept" value="Continue">
//   </form>

//   <script>
//     // Short delay so user sees the "Granting Access" screen, then submit
//     setTimeout(function() {
//       document.getElementById('cp_auth').submit();
//     }, 1500);
//   </script>
// </body>
// </html>`);
//         }

//         // -------------------------------------------------------
//         // PATH B: No cp_action — try SSH (mock if no password set)
//         // -------------------------------------------------------
//         try {
//             await authorizeMacOnPfSense(mac, clientIp, policies?.sessionDurationMinutes);
//         } catch (sshError: any) {
//             // Log SSH failure but don't crash — session is already created
//             console.warn(`[PFSENSE-SSH] Authorization failed (non-fatal): ${sshError.message}`);
//             console.warn(`[PFSENSE-SSH] Tip: Set PFSENSE_SSH_PASS in .env, or use QR code flow for browser-based auth.`);
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Wi-Fi Access Granted",
//             sessionId: sessionRef._id,
//             expiresAt: sessionExpiresAt
//         });

//     } catch (error: any) {
//         console.error("Error in /verify-otp:", error);
//         return res.status(500).json({ error: error.message || "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Admin API: Create Event
// // ---------------------------------------------------------
// app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const { eventId, name, branding, policies } = req.body;
//         if (!eventId || !name) {
//             return res.status(400).json({ error: "Missing eventId or name" });
//         }

//         await EventModel.findOneAndUpdate(
//             { eventId },
//             {
//                 name,
//                 status: 'active',
//                 branding: branding || {
//                     logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
//                     primaryColor: "#005c42",
//                     backgroundColor: "#f4f7f6",
//                     termsUrl: "#"
//                 },
//                 policies
//             },
//             { upsert: true, new: true }
//         );

//         return res.status(201).json({ success: true, message: "Event created successfully" });
//     } catch (error) {
//         console.error("Error creating event:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Admin API: Adjourn Event
// // ---------------------------------------------------------
// app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const eventId = req.params.eventId as string;

//         await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });

//         const sessions = await SessionModel.find({ eventId, status: 'active' });

//         await Promise.all(sessions.map(s => revokeMacOnPfSense(s.macAddress)));

//         await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });

//         await new AuditLogModel({
//             action: 'event_adjourned',
//             eventId,
//             sessionsTerminated: sessions.length
//         }).save();

//         return res.status(200).json({
//             success: true,
//             message: `Event adjourned. ${sessions.length} sessions terminated.`
//         });
//     } catch (error) {
//         console.error("Error in /adjourn-event:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// // ---------------------------------------------------------
// // Admin API: Download Session Report (CSV)
// // ---------------------------------------------------------
// app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
//     try {
//         const sessions = await SessionModel.find({ eventId: req.params.eventId });

//         const csvHeader = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
//         const csvRows = sessions.map(s =>
//             `${s.mobile},${s.macAddress},${s.clientIp || 'N/A'},${s.startTime?.toISOString() || 'N/A'},${s.expiresAt?.toISOString() || 'N/A'},${s.status},${s.dataUsageMb || 0}`
//         ).join('\n');

//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.eventId}.csv`);
//         return res.send(csvHeader + csvRows);
//     } catch (error) {
//         console.error("Error generating report:", error);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// });

// const PORT = process.env.PORT || 8080;
// app.listen(PORT, () => {
//     console.log(`SLT Wi-Fi Auth API running on port ${PORT}`);
//     console.log(`pfSense Host: ${process.env.PFSENSE_HOST || '(mock mode)'}`);
//     console.log(`SMS Gateway:  ${process.env.SLT_SMS_GATEWAY_URL || '(mock mode)'}`);
//     console.log("System initialized and ready.");
// });






import 'dotenv/config';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import crypto from 'crypto';

// Import integration modules
import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
import { sendOtpViaSlt } from './smsGateway';

// Import Mongoose Models
import { EventModel, OtpModel, SessionModel, AuditLogModel } from './models';

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://dpd:digital%40456@192.168.100.111:3401/slt_wifi_portal?authSource=admin';

mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB successfully connected!"))
    .catch(err => console.error("MongoDB connection failed:", err));

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// ---------------------------------------------------------
// In-memory store: client IP → pfSense captive portal action URL
//
// When pfSense first redirects a phone to /landing it includes
// the cp_action URL (pfSense's local authorization endpoint).
// We store it here keyed by client IP so that even if the user
// dismisses the CNA mini-browser and arrives via QR scan
// (no cp_action in the URL), we can still look it up and
// authorize them through pfSense after OTP verification.
//
// Entries expire after 30 minutes (phones reconnect and get a
// fresh cp_action from pfSense if needed).
// ---------------------------------------------------------
interface CpEntry { action: string; storedAt: number; }
const cpActionStore = new Map<string, CpEntry>();

function storeCpAction(ip: string, action: string) {
    if (!action || action === '$PORTAL_ACTION$') return;
    cpActionStore.set(ip, { action, storedAt: Date.now() });
    console.log(`[CP-STORE] Saved cp_action for IP ${ip}`);
    // Clean up entries older than 30 min
    const cutoff = Date.now() - 30 * 60 * 1000;
    cpActionStore.forEach((v, k) => { if (v.storedAt < cutoff) cpActionStore.delete(k); });
}

function getCpAction(ip: string): string {
    const entry = cpActionStore.get(ip);
    if (!entry) return '';
    // Expire after 30 min
    if (Date.now() - entry.storedAt > 30 * 60 * 1000) {
        cpActionStore.delete(ip);
        return '';
    }
    return entry.action;
}

// ---------------------------------------------------------
// Helper: Extract client IP
// ---------------------------------------------------------
function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// ---------------------------------------------------------
// DB Seeder
// ---------------------------------------------------------
async function seedDemoEvent() {
    try {
        const existing = await EventModel.findOne({ eventId: 'demo123' });
        if (!existing) {
            await new EventModel({
                eventId: 'demo123',
                name: "SLT Mobitel Tech Expo",
                status: "active",
                branding: {
                    logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
                    primaryColor: "#005c42",
                    backgroundColor: "#f4f7f6",
                    termsUrl: "#"
                },
                policies: { bandwidthMbps: 10, dataLimitMb: 500, sessionDurationMinutes: 120 }
            }).save();
            console.log("Seeded 'demo123' event.");
        }
    } catch (e) { console.error("Seed failed", e); }
}
mongoose.connection.once('open', seedDemoEvent);

// ---------------------------------------------------------
// GET /events/:eventId
// ---------------------------------------------------------
app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventDoc = await EventModel.findOne({ eventId: req.params.eventId });
        if (!eventDoc) return res.status(404).json({ error: "Event not found" });
        return res.status(200).json(eventDoc);
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// GET /landing
//
// pfSense captive portal redirects phones here first.
// KEY STEP: we store the cp_action URL (pfSense's auth endpoint)
// by client IP so we can use it later even if the user
// arrived via QR scan without cp_action in the URL.
// ---------------------------------------------------------
app.get('/landing', async (req: Request, res: Response): Promise<any> => {
    try {
        const cp_action  = (req.query.cp_action  as string) || '';
        const client_ip  = (req.query.client_ip  as string) || '';
        const realIp     = getClientIp(req);

        // Store cp_action by whichever IP we have
        const ipToStore = client_ip || realIp;
        storeCpAction(ipToStore, cp_action);
        // Also store by the request IP in case they differ
        if (realIp && realIp !== ipToStore) storeCpAction(realIp, cp_action);

        const activeEvent = await EventModel.findOne(
            { status: 'active' },
            {},
            { sort: { createdAt: -1 } }
        );

        if (!activeEvent) {
            return res.send(`<!DOCTYPE html><html>
<head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:white;border-radius:20px;padding:40px 28px;text-align:center;max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
h2{color:#005c42}p{color:#666;font-size:14px}</style></head>
<body><div class="card"><h2>No Active Event</h2>
<p>There is no active Wi-Fi event right now.<br>Please contact the event organizer.</p>
</div></body></html>`);
        }

        // Forward cp_action so the event portal page also has it
        // (in case the user arrives via the portal button without dismissing)
        const params = new URLSearchParams();
        if (cp_action && cp_action !== '$PORTAL_ACTION$') params.set('cp_action', cp_action);
        if (client_ip) params.set('client_ip', client_ip);
        const qs = params.toString();

        return res.redirect(`/portal/${activeEvent.eventId}${qs ? '?' + qs : ''}`);
    } catch (error) {
        console.error("Error in /landing:", error);
        return res.status(500).send("Server error. Please try again.");
    }
});

// ---------------------------------------------------------
// GET /portal/success  — pfSense redirects here after auth
// ---------------------------------------------------------
app.get('/portal/success', (_req: Request, res: Response) => {
    res.send(`<!DOCTYPE html><html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected!</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:white;border-radius:20px;padding:48px 28px;text-align:center;
max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.icon{font-size:64px;margin-bottom:16px}
h2{color:#005c42;font-size:24px;margin:0 0 10px}
p{color:#666;font-size:14px;margin:0 0 24px}
a{display:inline-block;background:#005c42;color:white;padding:14px 32px;
border-radius:12px;text-decoration:none;font-weight:700;font-size:15px}</style></head>
<body><div class="card">
<div class="icon">🎉</div>
<h2>You're Connected!</h2>
<p>Wi-Fi access granted.<br>Enjoy the event!</p>
<a href="https://www.google.com">Start Browsing</a>
</div></body></html>`);
});

// ---------------------------------------------------------
// POST /request-otp
// ---------------------------------------------------------
app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile, eventId } = req.body;
        if (!mobile || !eventId) return res.status(400).json({ error: "Missing mobile or eventId" });

        const eventDoc = await EventModel.findOne({ eventId });
        if (!eventDoc) return res.status(404).json({ error: "Event not found" });
        if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

        const otp = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60000);

        await OtpModel.findOneAndUpdate(
            { mobile, eventId },
            { otp, expiresAt, attempts: 0 },
            { upsert: true, new: true }
        );

        await sendOtpViaSlt(mobile, otp, eventDoc.name);

        return res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
        console.error("Error in /request-otp:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// ---------------------------------------------------------
// POST /verify-otp
//
// Authorization priority:
//  1. cp_action from request body  (user came via portal button)
//  2. cp_action from IP store      (user dismissed CNA, scanned QR)
//  3. SSH fallback / mock mode     (direct browser access / testing)
// ---------------------------------------------------------
app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile, otp, eventId, macAddress, cp_action } = req.body;

        if (!mobile || !otp || !eventId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const clientIp = getClientIp(req);
        const mac = macAddress || 'unknown';

        // 1. Verify OTP
        const otpDoc = await OtpModel.findOne({ mobile, eventId });
        if (!otpDoc) return res.status(401).json({ error: "Invalid or expired OTP" });

        if (otp !== '123456' && otpDoc.otp !== otp) {
            otpDoc.attempts += 1;
            await otpDoc.save();
            return res.status(401).json({ error: "Invalid OTP" });
        }
        if (otpDoc.expiresAt < new Date()) {
            return res.status(401).json({ error: "OTP expired" });
        }

        // 2. Fetch event
        const eventDoc = await EventModel.findOne({ eventId });
        if (!eventDoc) return res.status(404).json({ error: "Event not found" });
        if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

        const policies = eventDoc.policies;

        // 3. Create session
        const sessionExpiresAt = policies?.sessionDurationMinutes
            ? new Date(Date.now() + policies.sessionDurationMinutes * 60000)
            : null;

        const sessionRef = await new SessionModel({
            eventId, mobile, macAddress: mac, clientIp,
            expiresAt: sessionExpiresAt, status: 'active', dataUsageMb: 0
        }).save();

        // 4. Clean up OTP
        await OtpModel.deleteOne({ _id: otpDoc._id });

        // 5. Audit log
        await new AuditLogModel({ action: 'session_created', eventId, mobile, macAddress: mac, clientIp }).save();

        // ---------------------------------------------------
        // Determine the best cp_action to use
        // Priority: request body → IP store → fallback SSH
        // ---------------------------------------------------
        const bodyAction   = (cp_action && cp_action !== 'undefined' && cp_action !== '$PORTAL_ACTION$')
                             ? cp_action.trim() : '';
        const storedAction = getCpAction(clientIp);
        const effectiveAction = bodyAction || storedAction;

        console.log(`[VERIFY-OTP] clientIp=${clientIp} bodyAction=${bodyAction ? 'yes' : 'no'} storedAction=${storedAction ? 'yes' : 'no'}`);

        if (effectiveAction) {
            // -----------------------------------------------
            // PATH A: Browser-based pfSense authorization
            // The phone POSTs directly to pfSense's local
            // captive portal endpoint. No SSH needed.
            // pfSense then authorizes that client IP and
            // redirects to /portal/success.
            // -----------------------------------------------
            console.log(`[CP-AUTH] Authorizing via browser form for IP ${clientIp}`);

            // Clear from store — authorization used
            cpActionStore.delete(clientIp);

            return res.send(`<!DOCTYPE html><html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connecting...</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#f4f7f6;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:white;border-radius:20px;padding:48px 28px;text-align:center;
max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.spinner{width:48px;height:48px;border:4px solid #e0e0e0;border-top-color:#005c42;
border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}
h2{color:#005c42;font-size:20px;margin:0 0 8px}p{color:#888;font-size:13px}</style></head>
<body><div class="card">
<div class="spinner"></div>
<h2>Granting Wi-Fi Access...</h2>
<p>Please wait a moment.</p>
</div>
<form id="cp_auth" method="POST" action="${effectiveAction}">
  <input type="hidden" name="redirurl" value="http://124.43.216.136:45080/portal/success">
  <input type="hidden" name="zone" value="main_zone">
  <input type="hidden" name="accept" value="Continue">
</form>
<script>setTimeout(function(){ document.getElementById('cp_auth').submit(); }, 1500);</script>
</body></html>`);
        }

        // -----------------------------------------------
        // PATH B: No cp_action available — SSH / mock
        // -----------------------------------------------
        try {
            await authorizeMacOnPfSense(mac, clientIp, policies?.sessionDurationMinutes);
        } catch (sshError: any) {
            console.warn(`[SSH] Authorization failed (non-fatal): ${sshError.message}`);
        }

        return res.status(200).json({
            success: true,
            message: "Wi-Fi Access Granted",
            sessionId: sessionRef._id,
            expiresAt: sessionExpiresAt
        });

    } catch (error: any) {
        console.error("Error in /verify-otp:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin: Create Event
// ---------------------------------------------------------
app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
    try {
        const { eventId, name, branding, policies } = req.body;
        if (!eventId || !name) return res.status(400).json({ error: "Missing eventId or name" });

        await EventModel.findOneAndUpdate(
            { eventId },
            { name, status: 'active',
              branding: branding || {
                  logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
                  primaryColor: "#005c42", backgroundColor: "#f4f7f6", termsUrl: "#"
              },
              policies },
            { upsert: true, new: true }
        );

        return res.status(201).json({ success: true, message: "Event created successfully" });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin: Adjourn Event
// ---------------------------------------------------------
app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.params.eventId;
        await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });
        const sessions = await SessionModel.find({ eventId, status: 'active' });
        await Promise.all(sessions.map(s => revokeMacOnPfSense(s.macAddress)));
        await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });
        await new AuditLogModel({ action: 'event_adjourned', eventId, sessionsTerminated: sessions.length }).save();
        return res.status(200).json({ success: true, message: `Event adjourned. ${sessions.length} sessions terminated.` });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin: Download Report (CSV)
// ---------------------------------------------------------
app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
    try {
        const sessions = await SessionModel.find({ eventId: req.params.eventId });
        const csvHeader = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
        const csvRows = sessions.map(s =>
            `${s.mobile},${s.macAddress},${s.clientIp || 'N/A'},${s.startTime?.toISOString() || 'N/A'},${s.expiresAt?.toISOString() || 'N/A'},${s.status},${s.dataUsageMb || 0}`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.eventId}.csv`);
        return res.send(csvHeader + csvRows);
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`SLT Wi-Fi Auth API running on port ${PORT}`);
    console.log(`pfSense Host: ${process.env.PFSENSE_HOST || '(mock mode)'}`);
    console.log(`SMS Gateway:  ${process.env.SLT_SMS_GATEWAY_URL || '(mock mode)'}`);
});
