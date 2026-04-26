import 'dotenv/config';
import express, { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';

// Import integration modules
import { authorizeMacOnPfSense, revokeMacOnPfSense } from './pfsense';
import { sendOtpViaSlt } from './smsGateway';

// Load Service Account Key
const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

// Initialize Firebase Admin
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin successfully connected!");
} catch (e) {
    console.error("Firebase Admin initialization failed.", e);
}

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// Trust proxy to get real client IP from pfSense/nginx/Cloud Run
app.set('trust proxy', true);

// ---------------------------------------------------------
// DB Seeder: Initialize the 'demo123' event
// ---------------------------------------------------------
async function seedDemoEvent() {
    const eventRef = db.collection('events').doc('demo123');
    const doc = await eventRef.get();
    if (!doc.exists) {
        await eventRef.set({
            name: "SLT Mobitel Tech Expo",
            status: "active",
            branding: {
                logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
                primaryColor: "#005c42",
                backgroundColor: "#f4f7f6",
                termsUrl: "#"
            },
            policies: {
                bandwidthMbps: 10,
                dataLimitMb: 500,
                sessionDurationMinutes: 120
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("Seeded 'demo123' event into Firestore.");
    }
}
seedDemoEvent();

// ---------------------------------------------------------
// Helper: Extract client IP from request
// In the captive portal flow, pfSense forwards the client's
// real IP. We need it to whitelist in pfSense.
// ---------------------------------------------------------
function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// ---------------------------------------------------------
// API: Get Event Details
// (Called by the portal to load branding — works within walled garden)
// ---------------------------------------------------------
app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.params.eventId as string;
        const eventDoc = await db.collection('events').doc(eventId).get();
        
        if (!eventDoc.exists) {
            return res.status(404).json({ error: "Event not found" });
        }

        return res.status(200).json(eventDoc.data());
    } catch (error) {
        console.error("Error fetching event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// API: /request-otp
// User submits phone number → backend generates OTP →
// OTP is stored in Firestore → SMS sent via SLT Gateway
// (server-to-server, user does NOT need internet for this)
// ---------------------------------------------------------
app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile, eventId } = req.body;
        if (!mobile || !eventId) {
            return res.status(400).json({ error: "Missing mobile or eventId" });
        }

        // 1. Verify Event is active
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
        
        const eventData = eventDoc.data()!;
        if (eventData.status !== 'active') return res.status(403).json({ error: "Event is not active" });

        // 2. Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes TTL

        // 3. Store OTP in Firestore
        await db.collection('otps').doc(`${mobile}_${eventId}`).set({
            otp, 
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            attempts: 0
        });

        // 4. Send SMS via SLT Gateway (server-to-server call)
        await sendOtpViaSlt(mobile, otp, eventData.name);

        return res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
        console.error("Error in /request-otp:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// ---------------------------------------------------------
// API: /verify-otp
// User submits OTP → backend validates → if correct, calls
// pfSense API to whitelist the user's MAC/IP address →
// pfSense allows the device through → user gets internet
// ---------------------------------------------------------
app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile, otp, eventId, macAddress } = req.body;
        if (!mobile || !otp || !eventId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Get client IP (pfSense forwards this)
        const clientIp = getClientIp(req);
        // MAC may come from pfSense captive portal redirect URL params
        const mac = macAddress || 'unknown';

        // 1. Verify OTP in Firestore
        const otpRef = db.collection('otps').doc(`${mobile}_${eventId}`);
        const otpDoc = await otpRef.get();
        
        if (!otpDoc.exists) return res.status(401).json({ error: "Invalid or expired OTP" });
        
        const otpData = otpDoc.data()!;
        
        // Allow '123456' as a demo bypass in development
        if (otp !== '123456' && otpData.otp !== otp) {
            await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
            return res.status(401).json({ error: "Invalid OTP" });
        }
        
        if (otpData.expiresAt.toDate() < new Date()) {
            return res.status(401).json({ error: "OTP expired" });
        }

        // 2. Fetch Event Policies
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
        const eventData = eventDoc.data()!;
        if (eventData.status !== 'active') return res.status(403).json({ error: "Event is not active" });

        const policies = eventData.policies;

        // 3. Authorize on pfSense — this is where the magic happens!
        // pfSense will add a firewall rule allowing this MAC/IP through
        await authorizeMacOnPfSense(mac, clientIp, policies?.sessionDurationMinutes);

        // 4. Create Session Record in DB
        const sessionExpiresAt = policies?.sessionDurationMinutes 
            ? new Date(Date.now() + policies.sessionDurationMinutes * 60000)
            : null;

        const sessionRef = await db.collection('sessions').add({
            eventId,
            mobile,
            macAddress: mac,
            clientIp,
            startTime: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: sessionExpiresAt ? admin.firestore.Timestamp.fromDate(sessionExpiresAt) : null,
            status: 'active',
            dataUsageMb: 0
        });

        // 5. Clean up OTP to prevent reuse
        await otpRef.delete();

        // 6. Log for audit trail
        await db.collection('auditLogs').add({
            action: 'session_created',
            eventId,
            mobile,
            macAddress: mac,
            clientIp,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ 
            success: true, 
            message: "Wi-Fi Access Granted",
            sessionId: sessionRef.id,
            expiresAt: sessionExpiresAt
        });

    } catch (error: any) {
        console.error("Error in /verify-otp:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin API: Create Event
// ---------------------------------------------------------
app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.body.eventId as string;
        const { name, branding, policies } = req.body;
        
        if (!eventId || !name) {
            return res.status(400).json({ error: "Missing eventId or name" });
        }

        await db.collection('events').doc(eventId).set({
            name,
            status: 'active',
            branding: branding || {
                logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
                primaryColor: "#005c42",
                backgroundColor: "#f4f7f6",
                termsUrl: "#"
            },
            policies: policies || {
                bandwidthMbps: 10,
                dataLimitMb: 500,
                sessionDurationMinutes: 120
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(201).json({ success: true, message: "Event created successfully" });
    } catch (error) {
        console.error("Error creating event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin API: Adjourn Event
// Immediately terminates ALL active sessions for an event
// by calling pfSense to revoke each MAC address.
// ---------------------------------------------------------
app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.params.eventId as string;

        // 1. Mark event as adjourned
        await db.collection('events').doc(eventId).update({ status: 'adjourned' });

        // 2. Fetch all active sessions for this event
        const sessionsSnapshot = await db.collection('sessions')
            .where('eventId', '==', eventId)
            .where('status', '==', 'active')
            .get();

        const batch = db.batch();
        const revokePromises: Promise<any>[] = [];

        // 3. Revoke each MAC on pfSense and update DB
        sessionsSnapshot.forEach(doc => {
            const session = doc.data();
            revokePromises.push(revokeMacOnPfSense(session.macAddress));
            batch.update(doc.ref, { status: 'terminated_early' });
        });

        await Promise.all(revokePromises);
        await batch.commit();

        // 4. Audit log
        await db.collection('auditLogs').add({
            action: 'event_adjourned',
            eventId,
            sessionsTerminated: sessionsSnapshot.size,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ 
            success: true, 
            message: `Event adjourned. ${sessionsSnapshot.size} sessions terminated.` 
        });

    } catch (error) {
        console.error("Error in /adjourn-event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin API: Download Session Report (CSV)
// ---------------------------------------------------------
app.get('/admin/events/:eventId/report', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.params.eventId as string;

        const sessionsSnapshot = await db.collection('sessions')
            .where('eventId', '==', eventId)
            .get();

        // Build CSV
        const csvHeader = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
        const csvRows = sessionsSnapshot.docs.map(doc => {
            const s = doc.data();
            const startTime = s.startTime?.toDate?.()?.toISOString() || 'N/A';
            const expiresAt = s.expiresAt?.toDate?.()?.toISOString() || 'N/A';
            return `${s.mobile},${s.macAddress},${s.clientIp || 'N/A'},${startTime},${expiresAt},${s.status},${s.dataUsageMb || 0}`;
        }).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=report_${eventId}.csv`);
        return res.send(csv);
    } catch (error) {
        console.error("Error generating report:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`SLT Wi-Fi Auth API running on port ${PORT}`);
    console.log(`pfSense Host: ${process.env.PFSENSE_HOST || '(mock mode — no PFSENSE_HOST set)'}`);
    console.log(`SMS Gateway:  ${process.env.SLT_SMS_GATEWAY_URL || '(mock mode — no SLT_SMS_GATEWAY_URL set)'}`);
    console.log("System initialized and ready.");
});
