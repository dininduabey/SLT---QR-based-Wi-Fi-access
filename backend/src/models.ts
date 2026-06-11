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
        sessionDurationMinutes?: number;
        qrRefreshMinutes?: number;
        dataLimitMb?: number;
        topupLimitPerUser?: number | null;
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
            sessionDurationMinutes: Number,
        qrRefreshMinutes:       Number,
        dataLimitMb:            Number,
        topupLimitPerUser:      { type: Number, default: null },
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

// ==========================================
// Customer Phone Book Collection
// ==========================================
export interface ICustomerPhoneBook extends Document {
    phone: string;
    firstSeen: Date;
    lastSeen: Date;
    events: Array<{ eventId: string; eventName: string; timestamp: Date; }>;
}

const CustomerPhoneBookSchema = new Schema({
    phone:     { type: String, required: true, unique: true },
    firstSeen: { type: Date, default: Date.now },
    lastSeen:  { type: Date, default: Date.now },
    events: [{ eventId: String, eventName: String, timestamp: { type: Date, default: Date.now } }]
});

// ==========================================
// DataToken Collection
// ==========================================
export interface IDataToken extends Document {
    tokenId:      string;
    eventId:      string;
    phone:        string;
    macAddress:   string;
    dataLimitMb:  number;
    dataUsedMb:   number;
    topupCount:   number;
    status:       'active' | 'exhausted';
    acctSessions: Array<{ sessionId: string; octets: number; }>;
    createdAt:    Date;
    updatedAt:    Date;
}

const DataTokenSchema = new Schema({
    tokenId:      { type: String, required: true, unique: true },
    eventId:      { type: String, required: true },
    phone:        { type: String, required: true },
    macAddress:   { type: String, default: '' },
    dataLimitMb:  { type: Number, required: true },
    dataUsedMb:   { type: Number, default: 0 },
    topupCount:   { type: Number, default: 0 },
    status:       { type: String, enum: ['active', 'exhausted'], default: 'active' },
    acctSessions: [{ sessionId: String, octets: { type: Number, default: 0 } }]
}, { timestamps: true });

DataTokenSchema.index({ eventId: 1, phone: 1 });

// ==========================================
// DataRequest Collection
// ==========================================
export interface IDataRequest extends Document {
    requestId:    string;
    eventId:      string;
    phone:        string;
    tokenId:      string;
    topupNumber:  number;
    status:       'pending' | 'approved' | 'rejected';
    requestedAt:  Date;
    resolvedAt?:  Date;
    newTokenId?:  string;
    adminMessage?: string;
}

const DataRequestSchema = new Schema({
    requestId:    { type: String, required: true, unique: true },
    eventId:      { type: String, required: true },
    phone:        { type: String, required: true },
    tokenId:      { type: String, required: true },
    topupNumber:  { type: Number, required: true },
    status:       { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt:  { type: Date, default: Date.now },
    resolvedAt:   { type: Date },
    newTokenId:   { type: String },
    adminMessage: { type: String }
});

DataRequestSchema.index({ eventId: 1, phone: 1 });
DataRequestSchema.index({ status: 1 });

// Export Models
export const EventModel             = mongoose.model<IEvent>('Event', EventSchema);
export const OtpModel               = mongoose.model<IOtp>('Otp', OtpSchema);
export const SessionModel           = mongoose.model<ISession>('Session', SessionSchema);
export const AuditLogModel          = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export const CustomerPhoneBookModel = mongoose.model<ICustomerPhoneBook>('CustomerPhoneBook', CustomerPhoneBookSchema);
export const DataTokenModel   = mongoose.model<IDataToken>('DataToken', DataTokenSchema);
export const DataRequestModel = mongoose.model<IDataRequest>('DataRequest', DataRequestSchema);
