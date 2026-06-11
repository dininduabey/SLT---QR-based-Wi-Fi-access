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

export function startRadiusServers() {

    // ── Auth server (UDP 1812) ─────────────────────────────────────
    const authSock = dgram.createSocket('udp4');

    authSock.on('message', async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        try {
            const packet = radius.decode({ packet: msg, secret: RADIUS_SECRET });
            if (packet.code !== 'Access-Request') return;

            const tokenId  = (packet.attributes['User-Name']         as string) || '';
            const password = (packet.attributes['User-Password']      as string) || '';
            const mac      = (packet.attributes['Calling-Station-Id'] as string || '').toLowerCase();

            const token = await DataTokenModel.findOne({ tokenId });

            let code  = 'Access-Reject';
            let attrs: any[] = [];

            if (token && token.status === 'active') {
                const expectedPw = makeTokenPassword(tokenId);
                if (password === expectedPw) {
                    const remainBytes = Math.max(0,
                        Math.floor((token.dataLimitMb - token.dataUsedMb) * 1048576));
                    code  = 'Access-Accept';
                    // Construct pfSense VSA manually (Vendor 13644, Attr 3, uint32 BE)
                    const vsaBuf = Buffer.allocUnsafe(6);
                    vsaBuf.writeUInt8(3, 0);          // vendor attribute type
                    vsaBuf.writeUInt8(6, 1);          // length (2 header + 4 value)
                    vsaBuf.writeUInt32BE(remainBytes, 2); // value in bytes
                    const vendorBuf = Buffer.allocUnsafe(4);
                    vendorBuf.writeUInt32BE(13644, 0); // pfSense vendor ID
                    attrs = [['Vendor-Specific', Buffer.concat([vendorBuf, vsaBuf])]];
                    if (!token.macAddress) {
                        await DataTokenModel.updateOne({ tokenId }, { $set: { macAddress: mac } });
                    }
                    console.log(`[RADIUS-AUTH] ACCEPT ${tokenId} remaining=${(remainBytes/1048576).toFixed(1)}MB`);
                } else {
                    console.log(`[RADIUS-AUTH] REJECT ${tokenId} bad password`);
                }
            } else {
                console.log(`[RADIUS-AUTH] REJECT ${tokenId} status=${token?.status || 'not found'}`);
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

            const tokenId    = (packet.attributes['User-Name']           as string) || '';
            const statusType = (packet.attributes['Acct-Status-Type']    as string) || '';
            const sessionId  = (packet.attributes['Acct-Session-Id']     as string) || '';
            const inOctets   = (packet.attributes['Acct-Input-Octets']   as number) || 0;
            const outOctets  = (packet.attributes['Acct-Output-Octets']  as number) || 0;
            const totalOcts  = inOctets + outOctets;

            if (statusType === 'Interim-Update' || statusType === 'Stop') {
                const token = await DataTokenModel.findOne({ tokenId });
                if (token) {
                    const sessions = token.acctSessions as any[];
                    const idx = sessions.findIndex((s: any) => s.sessionId === sessionId);
                    if (idx >= 0) { sessions[idx].octets = totalOcts; }
                    else          { sessions.push({ sessionId, octets: totalOcts }); }

                    const totalUsedMb = sessions.reduce(
                        (sum: number, s: any) => sum + (s.octets || 0), 0) / 1048576;
                    const newStatus   = totalUsedMb >= token.dataLimitMb ? 'exhausted' : 'active';

                    await DataTokenModel.updateOne({ tokenId }, {
                        $set: { acctSessions: sessions, dataUsedMb: totalUsedMb, status: newStatus }
                    });

                    if (newStatus === 'exhausted' && token.status === 'active') {
                        console.log(`[RADIUS-ACCT] ${tokenId} EXHAUSTED (${totalUsedMb.toFixed(1)}MB)`);
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
