import * as dgram  from 'dgram';
import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';
import * as os     from 'os';
import { DataTokenModel } from './models';

const radius = require('radius') as any;

// Write pfSense RADIUS dictionary
const PFSENSE_DICT = [
    'VENDOR\tpfSense\t13644',
    'BEGIN-VENDOR\tpfSense',
    'ATTRIBUTE\tpfSense-Bandwidth-Max-Up\t1\tinteger',
    'ATTRIBUTE\tpfSense-Bandwidth-Max-Down\t2\tinteger',
    'ATTRIBUTE\tpfSense-Max-Total-Octets\t3\tinteger',
    'END-VENDOR\tpfSense'
].join('\n');

const dictPath = path.join(os.tmpdir(), 'dictionary.pfsense');
fs.writeFileSync(dictPath, PFSENSE_DICT);
radius.add_dictionary(dictPath);

export const RADIUS_SECRET       = process.env.RADIUS_SECRET       || 'slt-radius-secret-2026';
export const RADIUS_TOKEN_SECRET = process.env.RADIUS_TOKEN_SECRET || 'slt-token-secret-2026';

export function makeTokenPassword(tokenId: string): string {
    return crypto.createHmac('sha256', RADIUS_TOKEN_SECRET)
        .update(tokenId).digest('hex').slice(0, 32);
}

// Normalise any MAC format → aa:bb:cc:dd:ee:ff
function normalizeMac(input: string): string {
    const clean = (input || '').toLowerCase().replace(/[:\-\. ]/g, '');
    if (clean.length === 12 && /^[0-9a-f]+$/.test(clean)) {
        return clean.match(/.{2}/g)!.join(':');
    }
    return (input || '').toLowerCase();
}

// True if the string looks like a MAC address
function isMacAddress(s: string): boolean {
    return /^([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}$/i.test(s) ||
           /^[0-9a-f]{12}$/i.test(s);
}

// Build pfSense-Max-Total-Octets VSA buffer
function makeQuotaAttrs(bytes: number): any[] {
    const vsaBuf    = Buffer.allocUnsafe(6);
    vsaBuf.writeUInt8(3, 0);
    vsaBuf.writeUInt8(6, 1);
    vsaBuf.writeUInt32BE(bytes, 2);
    const vendorBuf = Buffer.allocUnsafe(4);
    vendorBuf.writeUInt32BE(13644, 0);
    return [['Vendor-Specific', Buffer.concat([vendorBuf, vsaBuf])]];
}

export function startRadiusServers() {

    // ── Auth server (UDP 1812) ─────────────────────────────────────
    const authSock = dgram.createSocket('udp4');

    authSock.on('message', async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        try {
            const packet   = radius.decode({ packet: msg, secret: RADIUS_SECRET });
            if (packet.code !== 'Access-Request') return;

            const userName = (packet.attributes['User-Name']         as string) || '';
            const password = (packet.attributes['User-Password']      as string) || '';
            const callingMac = normalizeMac(
                (packet.attributes['Calling-Station-Id'] as string) || ''
            );

            let code  = 'Access-Reject';
            let attrs: any[] = [];

            if (isMacAddress(userName)) {
                // ── RADIUS MAC Authentication ──────────────────────
                const mac   = normalizeMac(userName);
                const token = await DataTokenModel.findOne(
                    { macAddress: mac, status: 'active' },
                    null,
                    { sort: { createdAt: -1 } }
                );
                if (token) {
                    const remainBytes = Math.max(0,
                        Math.floor((token.dataLimitMb - token.dataUsedMb) * 1048576));
                    code  = 'Access-Accept';
                    attrs = makeQuotaAttrs(remainBytes);
                    console.log(`[RADIUS-AUTH] MAC-ACCEPT ${mac} token=${token.tokenId} remaining=${(remainBytes/1048576).toFixed(1)}MB`);
                } else {
                    console.log(`[RADIUS-AUTH] MAC-REJECT ${mac} (no active token)`);
                }

            } else {
                // ── TokenId / HMAC credential auth (form submit) ───
                const tokenId = userName;
                const token   = await DataTokenModel.findOne({ tokenId });
                if (token && token.status === 'active') {
                    const expectedPw = makeTokenPassword(tokenId);
                    if (password === expectedPw) {
                        const remainBytes = Math.max(0,
                            Math.floor((token.dataLimitMb - token.dataUsedMb) * 1048576));
                        code  = 'Access-Accept';
                        attrs = makeQuotaAttrs(remainBytes);
                        // Persist MAC if not yet set
                        if (callingMac && !token.macAddress) {
                            await DataTokenModel.updateOne(
                                { tokenId },
                                { $set: { macAddress: callingMac } }
                            );
                        }
                        console.log(`[RADIUS-AUTH] TOKEN-ACCEPT ${tokenId} remaining=${(remainBytes/1048576).toFixed(1)}MB`);
                    } else {
                        console.log(`[RADIUS-AUTH] TOKEN-REJECT ${tokenId} bad password`);
                    }
                } else {
                    console.log(`[RADIUS-AUTH] TOKEN-REJECT ${tokenId} status=${token?.status || 'not found'}`);
                }
            }

            const response = radius.encode_response({
                packet, code, secret: RADIUS_SECRET, attributes: attrs
            });
            authSock.send(response, rinfo.port, rinfo.address);
        } catch (err) {
            console.error('[RADIUS-AUTH] error:', err);
        }
    });

    authSock.bind(1812, '0.0.0.0', () =>
        console.log('[RADIUS] Auth server listening on UDP 1812'));

    // ── Accounting server (UDP 1813) ───────────────────────────────
    const acctSock = dgram.createSocket('udp4');

    acctSock.on('message', async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        try {
            const packet     = radius.decode({ packet: msg, secret: RADIUS_SECRET });
            if (packet.code !== 'Accounting-Request') return;

            const statusType = (packet.attributes['Acct-Status-Type']   as string) || '';
            const sessionId  = (packet.attributes['Acct-Session-Id']    as string) || '';
            const inOctets   = (packet.attributes['Acct-Input-Octets']  as number) || 0;
            const outOctets  = (packet.attributes['Acct-Output-Octets'] as number) || 0;
            const totalOcts  = inOctets + outOctets;

            // Identify token by Calling-Station-Id (MAC) — works for both auth modes
            const callingMac = normalizeMac(
                (packet.attributes['Calling-Station-Id'] as string) || ''
            );
            const userName   = (packet.attributes['User-Name'] as string) || '';
            const lookupMac  = callingMac || normalizeMac(userName);

            if (statusType === 'Interim-Update' || statusType === 'Stop') {
                const token = await DataTokenModel.findOne(
                    { macAddress: lookupMac },
                    null,
                    { sort: { createdAt: -1 } }
                );
                if (token) {
                    const sessions = token.acctSessions as any[];
                    const idx = sessions.findIndex((s: any) => s.sessionId === sessionId);
                    if (idx >= 0) { sessions[idx].octets = totalOcts; }
                    else          { sessions.push({ sessionId, octets: totalOcts }); }

                    const totalUsedMb = sessions.reduce(
                        (sum: number, s: any) => sum + (s.octets || 0), 0) / 1048576;
                    const newStatus   = totalUsedMb >= token.dataLimitMb ? 'exhausted' : 'active';

                    await DataTokenModel.updateOne({ _id: token._id }, {
                        $set: { acctSessions: sessions, dataUsedMb: totalUsedMb, status: newStatus }
                    });

                    if (newStatus === 'exhausted' && token.status === 'active') {
                        console.log(`[RADIUS-ACCT] ${lookupMac} EXHAUSTED (${totalUsedMb.toFixed(1)}MB)`);
                    }
                }
            }

            const response = radius.encode_response({
                packet, code: 'Accounting-Response', secret: RADIUS_SECRET
            });
            acctSock.send(response, rinfo.port, rinfo.address);
        } catch (err) {
            console.error('[RADIUS-ACCT] error:', err);
        }
    });

    acctSock.bind(1813, '0.0.0.0', () =>
        console.log('[RADIUS] Accounting server listening on UDP 1813'));
}
