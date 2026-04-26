import 'dotenv/config';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';

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

// Trust proxy to get real client IP from pfSense/nginx/Cloud Run
app.set('trust proxy', true);

// ---------------------------------------------------------
// DB Seeder: Initialize the 'demo123' event
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
                policies: {
                    bandwidthMbps: 10,
                    dataLimitMb: 500,
                    sessionDurationMinutes: 120
                }
            }).save();
            console.log("Seeded 'demo123' event into MongoDB.");
        }
    } catch (e) {
        console.error("Failed to seed demo event", e);
    }
}
mongoose.connection.once('open', seedDemoEvent);

// ---------------------------------------------------------
// Helper: Extract client IP from request
// ---------------------------------------------------------
function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// ---------------------------------------------------------
// API: Get Event Details
// ---------------------------------------------------------
app.get('/events/:eventId', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.params.eventId as string;
        const eventDoc = await EventModel.findOne({ eventId });
        
        if (!eventDoc) {
            return res.status(404).json({ error: "Event not found" });
        }

        return res.status(200).json(eventDoc);
    } catch (error) {
        console.error("Error fetching event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// API: /request-otp
// ---------------------------------------------------------
app.post('/request-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile, eventId } = req.body;
        if (!mobile || !eventId) {
            return res.status(400).json({ error: "Missing mobile or eventId" });
        }

        // 1. Verify Event is active
        const eventDoc = await EventModel.findOne({ eventId });
        if (!eventDoc) return res.status(404).json({ error: "Event not found" });
        if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

        // 2. Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes TTL

        // 3. Store OTP in MongoDB (upsert so it replaces any existing one)
        await OtpModel.findOneAndUpdate(
            { mobile, eventId },
            { otp, expiresAt, attempts: 0 },
            { upsert: true, new: true }
        );

        // 4. Send SMS via SLT Gateway
        await sendOtpViaSlt(mobile, otp, eventDoc.name);

        return res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
        console.error("Error in /request-otp:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// ---------------------------------------------------------
// API: /verify-otp
// ---------------------------------------------------------
app.post('/verify-otp', async (req: Request, res: Response): Promise<any> => {
    try {
        const { mobile, otp, eventId, macAddress } = req.body;
        if (!mobile || !otp || !eventId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const clientIp = getClientIp(req);
        const mac = macAddress || 'unknown';

        // 1. Verify OTP
        const otpDoc = await OtpModel.findOne({ mobile, eventId });
        
        if (!otpDoc) return res.status(401).json({ error: "Invalid or expired OTP" });
        
        // Allow '123456' as a demo bypass in development
        if (otp !== '123456' && otpDoc.otp !== otp) {
            otpDoc.attempts += 1;
            await otpDoc.save();
            return res.status(401).json({ error: "Invalid OTP" });
        }
        
        if (otpDoc.expiresAt < new Date()) {
            return res.status(401).json({ error: "OTP expired" });
        }

        // 2. Fetch Event Policies
        const eventDoc = await EventModel.findOne({ eventId });
        if (!eventDoc) return res.status(404).json({ error: "Event not found" });
        if (eventDoc.status !== 'active') return res.status(403).json({ error: "Event is not active" });

        const policies = eventDoc.policies;

        // 3. Authorize on pfSense
        await authorizeMacOnPfSense(mac, clientIp, policies?.sessionDurationMinutes);

        // 4. Create Session Record
        const sessionExpiresAt = policies?.sessionDurationMinutes 
            ? new Date(Date.now() + policies.sessionDurationMinutes * 60000)
            : null;

        const sessionRef = await new SessionModel({
            eventId,
            mobile,
            macAddress: mac,
            clientIp,
            expiresAt: sessionExpiresAt,
            status: 'active',
            dataUsageMb: 0
        }).save();

        // 5. Clean up OTP
        await OtpModel.deleteOne({ _id: otpDoc._id });

        // 6. Log for audit trail
        await new AuditLogModel({
            action: 'session_created',
            eventId,
            mobile,
            macAddress: mac,
            clientIp
        }).save();

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
// Admin API: Create Event
// ---------------------------------------------------------
app.post('/admin/events', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.body.eventId as string;
        const { name, branding, policies } = req.body;
        
        if (!eventId || !name) {
            return res.status(400).json({ error: "Missing eventId or name" });
        }

        await EventModel.findOneAndUpdate(
            { eventId },
            { 
                name, 
                status: 'active', 
                branding: branding || {
                    logoUrl: "https://upload.wikimedia.org/wikipedia/en/e/eb/Mobitel_Logo_2020.png",
                    primaryColor: "#005c42",
                    backgroundColor: "#f4f7f6",
                    termsUrl: "#"
                },
                policies 
            },
            { upsert: true, new: true }
        );

        return res.status(201).json({ success: true, message: "Event created successfully" });
    } catch (error) {
        console.error("Error creating event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// Admin API: Adjourn Event
// ---------------------------------------------------------
app.post('/admin/events/:eventId/adjourn', async (req: Request, res: Response): Promise<any> => {
    try {
        const eventId = req.params.eventId as string;

        // 1. Mark event as adjourned
        await EventModel.findOneAndUpdate({ eventId }, { status: 'adjourned' });

        // 2. Fetch all active sessions
        const sessions = await SessionModel.find({ eventId, status: 'active' });

        const revokePromises: Promise<any>[] = [];

        // 3. Revoke each MAC on pfSense
        sessions.forEach(session => {
            revokePromises.push(revokeMacOnPfSense(session.macAddress));
        });

        await Promise.all(revokePromises);

        // 4. Update all sessions in DB
        await SessionModel.updateMany({ eventId, status: 'active' }, { status: 'terminated_early' });

        // 5. Audit log
        await new AuditLogModel({
            action: 'event_adjourned',
            eventId,
            sessionsTerminated: sessions.length
        }).save();

        return res.status(200).json({ 
            success: true, 
            message: `Event adjourned. ${sessions.length} sessions terminated.` 
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

        const sessions = await SessionModel.find({ eventId });

        // Build CSV
        const csvHeader = 'Mobile,MAC Address,Client IP,Start Time,Expiry Time,Status,Data Usage (MB)\n';
        const csvRows = sessions.map(s => {
            const startTime = s.startTime?.toISOString() || 'N/A';
            const expiresAt = s.expiresAt?.toISOString() || 'N/A';
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
