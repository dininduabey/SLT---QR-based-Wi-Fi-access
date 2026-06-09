"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOtpViaSlt = sendOtpViaSlt;
const axios_1 = __importDefault(require("axios"));
// Load from environment variables
const smsConfig = {
    url: process.env.SLT_SMS_GATEWAY_URL || '',
    apiKey: process.env.SLT_SMS_API_KEY || '',
    senderId: process.env.SLT_SMS_SENDER_ID || 'SLTWiFi',
};
/**
 * Send an OTP via SLT's SMS Gateway.
 *
 * IMPORTANT: This is a server-to-server call. The user's device
 * does NOT need internet for this to work. Our backend (which
 * HAS internet) calls SLT's SMS API, and the SMS is delivered
 * to the user's phone via the cellular network.
 *
 * The actual API format depends on SLT's documentation.
 * Below is a common pattern — adjust once SLT provides their API spec.
 */
function sendOtpViaSlt(mobile, otp, eventName) {
    return __awaiter(this, void 0, void 0, function* () {
        const message = `Your SLT Wi-Fi OTP for ${eventName} is: ${otp}. Valid for 5 minutes.`;
        // If no SMS Gateway URL configured, run in mock mode
        if (!smsConfig.url) {
            console.log(`[SLT SMS - MOCK MODE]`);
            console.log(`  To: +94${mobile}`);
            console.log(`  Message: ${message}`);
            console.log(`  OTP: ${otp}`);
            console.log(`  (Configure SLT_SMS_GATEWAY_URL to send real SMS)`);
            return true;
        }
        try {
            // Common SLT SMS Gateway format (adjust based on actual API docs)
            const response = yield axios_1.default.post(smsConfig.url, {
                api_key: smsConfig.apiKey,
                sender_id: smsConfig.senderId,
                to: `94${mobile}`, // Sri Lanka country code + number
                message: message,
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            });
            console.log(`[SLT SMS] OTP sent to +94${mobile}, Gateway Response:`, response.data);
            return true;
        }
        catch (error) {
            console.error(`[SLT SMS] Failed to send OTP to +94${mobile}:`, error.message);
            throw new Error('Failed to send OTP. Please try again.');
        }
    });
}
