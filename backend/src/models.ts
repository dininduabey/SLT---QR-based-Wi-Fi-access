import mongoose, { Schema, Document } from 'mongoose';

// ==========================================
// Events Collection
// ==========================================
export interface IEvent extends Document {
    eventId: string;
    name: string;
    status: 'active' | 'adjourned';
    branding: {
        logoUrl: string;
        primaryColor: string;
        backgroundColor: string;
        termsUrl: string;
    };
    policies: {
        bandwidthMbps: number;
        dataLimitMb: number;
        sessionDurationMinutes: number;
    } | null;
    createdAt: Date;
    updatedAt: Date;
}

const EventSchema = new Schema({
    eventId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, required: true, enum: ['active', 'adjourned'], default: 'active' },
    branding: {
        logoUrl: { type: String, default: '' },
        primaryColor: { type: String, default: '#005c42' },
        backgroundColor: { type: String, default: '#f4f7f6' },
        termsUrl: { type: String, default: '#' },
    },
    policies: {
        type: {
            bandwidthMbps: Number,
            dataLimitMb: Number,
            sessionDurationMinutes: Number,
        },
        default: null
    }
}, { timestamps: true });

// ==========================================
// OTPs Collection
// ==========================================
export interface IOtp extends Document {
    mobile: string;
    eventId: string;
    otp: string;
    expiresAt: Date;
    attempts: number;
}

const OtpSchema = new Schema({
    mobile: { type: String, required: true },
    eventId: { type: String, required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // Auto-delete document when expired
    attempts: { type: Number, default: 0 }
});

// Compound index for finding specific OTP
OtpSchema.index({ mobile: 1, eventId: 1 }, { unique: true });

// ==========================================
// Sessions Collection
// ==========================================
export interface ISession extends Document {
    eventId: string;
    mobile: string;
    macAddress: string;
    clientIp: string;
    startTime: Date;
    expiresAt: Date | null;
    status: 'active' | 'expired' | 'terminated';
    dataUsageMb: number;
}

const SessionSchema = new Schema({
    eventId: { type: String, required: true },
    mobile: { type: String, required: true },
    macAddress: { type: String, required: true },
    clientIp: { type: String, required: true },
    startTime: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    status: { type: String, required: true, enum: ['active', 'expired', 'terminated'], default: 'active' },
    dataUsageMb: { type: Number, default: 0 }
});

// ==========================================
// Audit Logs Collection
// ==========================================
export interface IAuditLog extends Document {
    action: string;
    eventId: string;
    mobile?: string;
    macAddress?: string;
    clientIp?: string;
    timestamp: Date;
}

const AuditLogSchema = new Schema({
    action: { type: String, required: true },
    eventId: { type: String, required: true },
    mobile: { type: String },
    macAddress: { type: String },
    clientIp: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// Export Models
export const EventModel = mongoose.model<IEvent>('Event', EventSchema);
export const OtpModel = mongoose.model<IOtp>('Otp', OtpSchema);
export const SessionModel = mongoose.model<ISession>('Session', SessionSchema);
export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
