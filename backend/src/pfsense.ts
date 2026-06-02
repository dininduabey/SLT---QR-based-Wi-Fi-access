import { NodeSSH } from 'node-ssh';

// ---------------------------------------------------------
// pfSense Captive Portal SSH Integration
// ---------------------------------------------------------
// This module communicates with the pfSense firewall using SSH
// to whitelist/revoke MAC addresses using pfSsh.php.
// ---------------------------------------------------------

interface PfSenseConfig {
    host: string;         // e.g., "192.168.1.1" or "https://192.168.1.1"
    user: string;         // pfSense SSH user
    pass: string;         // pfSense SSH password
    cpZone: string;       // Captive Portal zone ID (e.g., "zone0" or "main_zone")
}

// Load from environment variables
const pfSenseConfig: PfSenseConfig = {
    host: process.env.PFSENSE_HOST || '192.168.1.1',
    user: process.env.PFSENSE_SSH_USER || 'admin',
    pass: process.env.PFSENSE_SSH_PASS || '',
    cpZone: process.env.PFSENSE_CP_ZONE || 'zone0',
};

// Clean the host in case they left https:// in it
const sshHost = pfSenseConfig.host.replace(/^https?:\/\//, '').split('/')[0];

/**
 * Whitelist a MAC address in pfSense Captive Portal.
 * This is called after successful OTP verification.
 */
export async function authorizeMacOnPfSense(
    macAddress: string, 
    ipAddress: string,
    sessionDurationMinutes?: number | null
): Promise<boolean> {
    if (!pfSenseConfig.pass) {
        console.log(`[PFSENSE-MOCK] Would authorize MAC: ${macAddress}, IP: ${ipAddress} for ${sessionDurationMinutes ? sessionDurationMinutes + ' min' : 'unlimited'}`);
        return true;
    }

    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: sshHost,
            username: pfSenseConfig.user,
            password: pfSenseConfig.pass,
            readyTimeout: 10000
        });

        // Use pfSense PHP shell to add MAC passthrough
        const phpCode = `require_once("captiveportal.inc"); captiveportal_passthrumac_add("${macAddress}", "${ipAddress}", false, "SLT Event Auth", "${pfSenseConfig.cpZone}", "pass");`;

        // Execute by piping into pfSsh.php
        await ssh.execCommand(`echo '${phpCode}' | pfSsh.php`, { cwd: '/' });

        console.log(`[PFSENSE-SSH] Authorized MAC: ${macAddress} on zone ${pfSenseConfig.cpZone}`);
        return true;
    } catch (error: any) {
        console.error(`[PFSENSE-SSH] Failed to authorize MAC: ${macAddress}`, error.message);
        throw new Error('Failed to authorize device on network via SSH');
    } finally {
        ssh.dispose();
    }
}

/**
 * Revoke/disconnect a MAC address from pfSense Captive Portal.
 */
export async function revokeMacOnPfSense(macAddress: string): Promise<boolean> {
    if (!pfSenseConfig.pass) {
        console.log(`[PFSENSE-MOCK] Would revoke MAC: ${macAddress}`);
        return true;
    }

    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: sshHost,
            username: pfSenseConfig.user,
            password: pfSenseConfig.pass,
            readyTimeout: 10000
        });

        // Use pfSense PHP shell to delete MAC passthrough
        const phpCode = `require_once("captiveportal.inc"); captiveportal_passthrumac_delete_entry(captiveportal_passthrumac_findby_mac("${macAddress}", "${pfSenseConfig.cpZone}"));`;
        await ssh.execCommand(`echo '${phpCode}' | pfSsh.php`, { cwd: '/' });

        console.log(`[PFSENSE-SSH] Revoked MAC: ${macAddress} on zone ${pfSenseConfig.cpZone}`);
        return true;
    } catch (error: any) {
        console.error(`[PFSENSE-SSH] Failed to revoke MAC: ${macAddress}`, error.message);
        return false;
    } finally {
        ssh.dispose();
    }
}

/**
 * Get all currently connected clients from pfSense Captive Portal.
 * (Not easily supported via SSH passthrough without parsing config, returning empty list for now)
 */
export async function getConnectedClients(): Promise<any[]> {
    return [];
}
