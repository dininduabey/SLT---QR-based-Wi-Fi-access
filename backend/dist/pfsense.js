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
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeMacOnPfSense = authorizeMacOnPfSense;
exports.revokeMacOnPfSense = revokeMacOnPfSense;
exports.getConnectedClients = getConnectedClients;
const node_ssh_1 = require("node-ssh");
// Load from environment variables
const pfSenseConfig = {
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
function authorizeMacOnPfSense(macAddress, ipAddress, sessionDurationMinutes) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!pfSenseConfig.pass) {
            console.log(`[PFSENSE-MOCK] Would authorize MAC: ${macAddress}, IP: ${ipAddress} for ${sessionDurationMinutes ? sessionDurationMinutes + ' min' : 'unlimited'}`);
            return true;
        }
        const ssh = new node_ssh_1.NodeSSH();
        try {
            yield ssh.connect({
                host: sshHost,
                username: pfSenseConfig.user,
                password: pfSenseConfig.pass,
                readyTimeout: 10000
            });
            // Use pfSense PHP shell to add MAC passthrough
            const phpCode = `require_once("captiveportal.inc"); captiveportal_passthrumac_add("${macAddress}", "${ipAddress}", false, "SLT Event Auth", "${pfSenseConfig.cpZone}", "pass");`;
            // Execute by piping into pfSsh.php
            yield ssh.execCommand(`echo '${phpCode}' | pfSsh.php`, { cwd: '/' });
            console.log(`[PFSENSE-SSH] Authorized MAC: ${macAddress} on zone ${pfSenseConfig.cpZone}`);
            return true;
        }
        catch (error) {
            console.error(`[PFSENSE-SSH] Failed to authorize MAC: ${macAddress}`, error.message);
            throw new Error('Failed to authorize device on network via SSH');
        }
        finally {
            ssh.dispose();
        }
    });
}
/**
 * Revoke/disconnect a MAC address from pfSense Captive Portal.
 */
function revokeMacOnPfSense(macAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!pfSenseConfig.pass) {
            console.log(`[PFSENSE-MOCK] Would revoke MAC: ${macAddress}`);
            return true;
        }
        const ssh = new node_ssh_1.NodeSSH();
        try {
            yield ssh.connect({
                host: sshHost,
                username: pfSenseConfig.user,
                password: pfSenseConfig.pass,
                readyTimeout: 10000
            });
            // Use pfSense PHP shell to delete MAC passthrough
            const phpCode = `require_once("captiveportal.inc"); captiveportal_passthrumac_delete_entry(captiveportal_passthrumac_findby_mac("${macAddress}", "${pfSenseConfig.cpZone}"));`;
            yield ssh.execCommand(`echo '${phpCode}' | pfSsh.php`, { cwd: '/' });
            console.log(`[PFSENSE-SSH] Revoked MAC: ${macAddress} on zone ${pfSenseConfig.cpZone}`);
            return true;
        }
        catch (error) {
            console.error(`[PFSENSE-SSH] Failed to revoke MAC: ${macAddress}`, error.message);
            return false;
        }
        finally {
            ssh.dispose();
        }
    });
}
/**
 * Get all currently connected clients from pfSense Captive Portal.
 * (Not easily supported via SSH passthrough without parsing config, returning empty list for now)
 */
function getConnectedClients() {
    return __awaiter(this, void 0, void 0, function* () {
        return [];
    });
}
