"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataRequestModel = exports.DataTokenModel = exports.CustomerPhoneBookModel = exports.AuditLogModel = exports.SessionModel = exports.OtpModel = exports.EventModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const EventSchema = new mongoose_1.Schema({
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
            qrRefreshMinutes: Number,
            dataLimitMb: Number,
            topupLimitPerUser: { type: Number, default: null },
        },
        default: null
    }
}, { timestamps: true });
const OtpSchema = new mongoose_1.Schema({
    mobile: { type: String, required: true },
    eventId: { type: String, required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // Auto-delete document when expired
    attempts: { type: Number, default: 0 }
});
// Compound index for finding specific OTP
OtpSchema.index({ mobile: 1, eventId: 1 }, { unique: true });
const SessionSchema = new mongoose_1.Schema({
    eventId: { type: String, required: true },
    mobile: { type: String, required: true },
    macAddress: { type: String, required: true },
    clientIp: { type: String, required: true },
    startTime: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    status: { type: String, required: true, enum: ['active', 'expired', 'terminated'], default: 'active' },
    dataUsageMb: { type: Number, default: 0 }
});
const AuditLogSchema = new mongoose_1.Schema({
    action: { type: String, required: true },
    eventId: { type: String, required: true },
    mobile: { type: String },
    macAddress: { type: String },
    clientIp: { type: String },
    timestamp: { type: Date, default: Date.now }
});
const CustomerPhoneBookSchema = new mongoose_1.Schema({
    phone: { type: String, required: true, unique: true },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    events: [{ eventId: String, eventName: String, timestamp: { type: Date, default: Date.now } }]
});
const DataTokenSchema = new mongoose_1.Schema({
    tokenId: { type: String, required: true, unique: true },
    eventId: { type: String, required: true },
    phone: { type: String, required: true },
    macAddress: { type: String, default: '' },
    dataLimitMb: { type: Number, required: true },
    dataUsedMb: { type: Number, default: 0 },
    topupCount: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'exhausted'], default: 'active' },
    acctSessions: [{ sessionId: String, octets: { type: Number, default: 0 } }]
}, { timestamps: true });
DataTokenSchema.index({ eventId: 1, phone: 1 });
const DataRequestSchema = new mongoose_1.Schema({
    requestId: { type: String, required: true, unique: true },
    eventId: { type: String, required: true },
    phone: { type: String, required: true },
    tokenId: { type: String, required: true },
    topupNumber: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    newTokenId: { type: String },
    adminMessage: { type: String }
});
DataRequestSchema.index({ eventId: 1, phone: 1 });
DataRequestSchema.index({ status: 1 });
// Export Models
exports.EventModel = mongoose_1.default.model('Event', EventSchema);
exports.OtpModel = mongoose_1.default.model('Otp', OtpSchema);
exports.SessionModel = mongoose_1.default.model('Session', SessionSchema);
exports.AuditLogModel = mongoose_1.default.model('AuditLog', AuditLogSchema);
exports.CustomerPhoneBookModel = mongoose_1.default.model('CustomerPhoneBook', CustomerPhoneBookSchema);
exports.DataTokenModel = mongoose_1.default.model('DataToken', DataTokenSchema);
exports.DataRequestModel = mongoose_1.default.model('DataRequest', DataRequestSchema);
