import axios from 'axios';

// ---------------------------------------------------------
// pfSense Captive Portal API Integration
// ---------------------------------------------------------
// This module communicates with the pfSense firewall to
// whitelist/revoke MAC addresses after OTP verification.
//
// pfSense must have the REST API package installed:
//   System > Package Manager > Available Packages > pfSense-pkg-API
//
// Alternatively, FauxAPI can be used: https://github.com/ndejong/pfsense_fauxapi
// ---------------------------------------------------------

interface PfSenseConfig {
    host: string;         // e.g., "https://192.168.1.1"
    apiKey: string;       // pfSense API key
    apiSecret: string;    // pfSense API secret
    cpZone: string;       // Captive Portal zone ID (e.g., "zone0" or "slt-wifi-events")
}

// Load from environment variables
const pfSenseConfig: PfSenseConfig = {
    host: process.env.PFSENSE_HOST || 'https://192.168.1.1',
    apiKey: process.env.PFSENSE_API_KEY || '',
    apiSecret: process.env.PFSENSE_API_SECRET || '',
    cpZone: process.env.PFSENSE_CP_ZONE || 'zone0',
};

// Create axios instance for pfSense API calls
const pfSenseApi = axios.create({
    baseURL: pfSenseConfig.host,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `${pfSenseConfig.apiKey} ${pfSenseConfig.apiSecret}`,
    },
    // In development, pfSense uses self-signed certs
    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    timeout: 10000,
});

/**
 * Whitelist a MAC address in pfSense Captive Portal.
 * This is called after successful OTP verification.
 * 
 * pfSense Captive Portal API endpoint:
 *   POST /api/v1/services/captiveportal/authorize
 * 
 * This tells pfSense: "Allow this device through the firewall."
 */
export async function authorizeMacOnPfSense(
    macAddress: string, 
    ipAddress: string,
    sessionDurationMinutes?: number | null
): Promise<boolean> {
    // If no pfSense API key configured, run in mock mode
    if (!pfSenseConfig.apiKey) {
        console.log(`[PFSENSE-MOCK] Would authorize MAC: ${macAddress}, IP: ${ipAddress} for ${sessionDurationMinutes ? sessionDurationMinutes + ' min' : 'unlimited'}`);
        return true;
    }

    try {
        const payload: any = {
            zone: pfSenseConfig.cpZone,
            user: macAddress,              // Use MAC as username
            ip: ipAddress,                 // Client IP from the request
            mac: macAddress,
        };

        // Session timeout in seconds, omit if unlimited
        if (sessionDurationMinutes) {
            payload.timeout = sessionDurationMinutes * 60;
        }

        const response = await pfSenseApi.post('/api/v1/services/captiveportal/authorize', payload);

        console.log(`[PFSENSE] Authorized MAC: ${macAddress}, Response:`, response.data);
        return true;
    } catch (error: any) {
        console.error(`[PFSENSE] Failed to authorize MAC: ${macAddress}`, error.message);
        throw new Error('Failed to authorize device on network');
    }
}

/**
 * Revoke/disconnect a MAC address from pfSense Captive Portal.
 * This is called when an event is adjourned or a session expires.
 * 
 * pfSense Captive Portal API endpoint:
 *   POST /api/v1/services/captiveportal/disconnect
 */
export async function revokeMacOnPfSense(macAddress: string): Promise<boolean> {
    if (!pfSenseConfig.apiKey) {
        console.log(`[PFSENSE-MOCK] Would revoke MAC: ${macAddress}`);
        return true;
    }

    try {
        const response = await pfSenseApi.post('/api/v1/services/captiveportal/disconnect', {
            zone: pfSenseConfig.cpZone,
            mac: macAddress,
        });

        console.log(`[PFSENSE] Revoked MAC: ${macAddress}, Response:`, response.data);
        return true;
    } catch (error: any) {
        console.error(`[PFSENSE] Failed to revoke MAC: ${macAddress}`, error.message);
        // Don't throw here — revocation failure shouldn't crash the session
        return false;
    }
}

/**
 * Get all currently connected clients from pfSense Captive Portal.
 * Useful for the admin dashboard monitoring view.
 */
export async function getConnectedClients(): Promise<any[]> {
    if (!pfSenseConfig.apiKey) {
        console.log(`[PFSENSE-MOCK] Would fetch connected clients`);
        return [];
    }

    try {
        const response = await pfSenseApi.get(`/api/v1/services/captiveportal`, {
            params: { zone: pfSenseConfig.cpZone }
        });
        return response.data?.data || [];
    } catch (error: any) {
        console.error(`[PFSENSE] Failed to fetch connected clients`, error.message);
        return [];
    }
}
