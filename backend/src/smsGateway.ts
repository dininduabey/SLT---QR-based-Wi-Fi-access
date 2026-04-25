import axios from 'axios';

// ---------------------------------------------------------
// SLT SMS Gateway Integration
// ---------------------------------------------------------
// This module sends OTP messages via SLT Mobitel's SMS Gateway.
// The SMS is sent SERVER-SIDE (our backend → SLT Gateway),
// so it works even when the user has no internet connection.
// The user receives the SMS via their cellular network.
// ---------------------------------------------------------

interface SmsGatewayConfig {
    url: string;          // SLT SMS Gateway API endpoint
    apiKey: string;       // Authentication key
    senderId: string;     // SMS sender ID (e.g., "SLTWiFi")
}

// Load from environment variables
const smsConfig: SmsGatewayConfig = {
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
export async function sendOtpViaSlt(mobile: string, otp: string, eventName: string): Promise<boolean> {
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
        const response = await axios.post(smsConfig.url, {
            api_key: smsConfig.apiKey,
            sender_id: smsConfig.senderId,
            to: `94${mobile}`,   // Sri Lanka country code + number
            message: message,
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });

        console.log(`[SLT SMS] OTP sent to +94${mobile}, Gateway Response:`, response.data);
        return true;
    } catch (error: any) {
        console.error(`[SLT SMS] Failed to send OTP to +94${mobile}:`, error.message);
        throw new Error('Failed to send OTP. Please try again.');
    }
}
