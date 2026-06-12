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
exports.RADIUS_TOKEN_SECRET = exports.RADIUS_SECRET = void 0;
exports.makeTokenPassword = makeTokenPassword;
exports.startRadiusServers = startRadiusServers;
const dgram = __importStar(require("dgram"));
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const models_1 = require("./models");
const radius = require('radius');
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
exports.RADIUS_SECRET = process.env.RADIUS_SECRET || 'slt-radius-secret-2026';
exports.RADIUS_TOKEN_SECRET = process.env.RADIUS_TOKEN_SECRET || 'slt-token-secret-2026';
function makeTokenPassword(tokenId) {
    return crypto.createHmac('sha256', exports.RADIUS_TOKEN_SECRET)
        .update(tokenId).digest('hex').slice(0, 32);
}
// Normalise any MAC format → aa:bb:cc:dd:ee:ff
function normalizeMac(input) {
    const clean = (input || '').toLowerCase().replace(/[:\-\. ]/g, '');
    if (clean.length === 12 && /^[0-9a-f]+$/.test(clean)) {
        return clean.match(/.{2}/g).join(':');
    }
    return (input || '').toLowerCase();
}
// True if the string looks like a MAC address
function isMacAddress(s) {
    return /^([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}$/i.test(s) ||
        /^[0-9a-f]{12}$/i.test(s);
}
// Build pfSense-Max-Total-Octets VSA buffer
function makeQuotaAttrs(bytes) {
    const vsaBuf = Buffer.allocUnsafe(6);
    vsaBuf.writeUInt8(3, 0);
    vsaBuf.writeUInt8(6, 1);
    vsaBuf.writeUInt32BE(bytes, 2);
    const vendorBuf = Buffer.allocUnsafe(4);
    vendorBuf.writeUInt32BE(13644, 0);
    return [['Vendor-Specific', Buffer.concat([vendorBuf, vsaBuf])]];
}
function startRadiusServers() {
    // ── Auth server (UDP 1812) ─────────────────────────────────────
    const authSock = dgram.createSocket('udp4');
    authSock.on('message', (msg, rinfo) => __awaiter(this, void 0, void 0, function* () {
        try {
            const packet = radius.decode({ packet: msg, secret: exports.RADIUS_SECRET });
            if (packet.code !== 'Access-Request')
                return;
            const userName = packet.attributes['User-Name'] || '';
            const password = packet.attributes['User-Password'] || '';
            const callingMac = normalizeMac(packet.attributes['Calling-Station-Id'] || '');
            let code = 'Access-Reject';
            let attrs = [];
            if (isMacAddress(userName)) {
                // ── RADIUS MAC Authentication ──────────────────────
                const mac = normalizeMac(userName);
                const token = yield models_1.DataTokenModel.findOne({ macAddress: mac, status: 'active' }, null, { sort: { createdAt: -1 } });
                if (token) {
                    const remainBytes = Math.max(0, Math.floor((token.dataLimitMb - token.dataUsedMb) * 1048576));
                    code = 'Access-Accept';
                    attrs = makeQuotaAttrs(remainBytes);
                    console.log(`[RADIUS-AUTH] MAC-ACCEPT ${mac} token=${token.tokenId} remaining=${(remainBytes / 1048576).toFixed(1)}MB`);
                }
                else {
                    console.log(`[RADIUS-AUTH] MAC-REJECT ${mac} (no active token)`);
                }
            }
            else {
                // ── TokenId / HMAC credential auth (form submit) ───
                const tokenId = userName;
                const token = yield models_1.DataTokenModel.findOne({ tokenId });
                if (token && token.status === 'active') {
                    const expectedPw = makeTokenPassword(tokenId);
                    if (password === expectedPw) {
                        const remainBytes = Math.max(0, Math.floor((token.dataLimitMb - token.dataUsedMb) * 1048576));
                        code = 'Access-Accept';
                        attrs = makeQuotaAttrs(remainBytes);
                        // Persist MAC if not yet set
                        if (callingMac && !token.macAddress) {
                            yield models_1.DataTokenModel.updateOne({ tokenId }, { $set: { macAddress: callingMac } });
                        }
                        console.log(`[RADIUS-AUTH] TOKEN-ACCEPT ${tokenId} remaining=${(remainBytes / 1048576).toFixed(1)}MB`);
                    }
                    else {
                        console.log(`[RADIUS-AUTH] TOKEN-REJECT ${tokenId} bad password`);
                    }
                }
                else {
                    console.log(`[RADIUS-AUTH] TOKEN-REJECT ${tokenId} status=${(token === null || token === void 0 ? void 0 : token.status) || 'not found'}`);
                }
            }
            const response = radius.encode_response({
                packet, code, secret: exports.RADIUS_SECRET, attributes: attrs
            });
            authSock.send(response, rinfo.port, rinfo.address);
        }
        catch (err) {
            console.error('[RADIUS-AUTH] error:', err);
        }
    }));
    authSock.bind(1812, '0.0.0.0', () => console.log('[RADIUS] Auth server listening on UDP 1812'));
    // ── Accounting server (UDP 1813) ───────────────────────────────
    const acctSock = dgram.createSocket('udp4');
    acctSock.on('message', (msg, rinfo) => __awaiter(this, void 0, void 0, function* () {
        try {
            const packet = radius.decode({ packet: msg, secret: exports.RADIUS_SECRET });
            if (packet.code !== 'Accounting-Request')
                return;
            const statusType = packet.attributes['Acct-Status-Type'] || '';
            const sessionId = packet.attributes['Acct-Session-Id'] || '';
            const inOctets = packet.attributes['Acct-Input-Octets'] || 0;
            const outOctets = packet.attributes['Acct-Output-Octets'] || 0;
            const totalOcts = inOctets + outOctets;
            // Identify token by Calling-Station-Id (MAC) — works for both auth modes
            const callingMac = normalizeMac(packet.attributes['Calling-Station-Id'] || '');
            const userName = packet.attributes['User-Name'] || '';
            const lookupMac = callingMac || normalizeMac(userName);
            if (statusType === 'Interim-Update' || statusType === 'Stop') {
                const token = yield models_1.DataTokenModel.findOne({ macAddress: lookupMac }, null, { sort: { createdAt: -1 } });
                if (token) {
                    const sessions = token.acctSessions;
                    const idx = sessions.findIndex((s) => s.sessionId === sessionId);
                    if (idx >= 0) {
                        sessions[idx].octets = totalOcts;
                    }
                    else {
                        sessions.push({ sessionId, octets: totalOcts });
                    }
                    const totalUsedMb = sessions.reduce((sum, s) => sum + (s.octets || 0), 0) / 1048576;
                    const newStatus = totalUsedMb >= token.dataLimitMb ? 'exhausted' : 'active';
                    yield models_1.DataTokenModel.updateOne({ _id: token._id }, {
                        $set: { acctSessions: sessions, dataUsedMb: totalUsedMb, status: newStatus }
                    });
                    if (newStatus === 'exhausted' && token.status === 'active') {
                        console.log(`[RADIUS-ACCT] ${lookupMac} EXHAUSTED (${totalUsedMb.toFixed(1)}MB)`);
                    }
                }
            }
            const response = radius.encode_response({
                packet, code: 'Accounting-Response', secret: exports.RADIUS_SECRET
            });
            acctSock.send(response, rinfo.port, rinfo.address);
        }
        catch (err) {
            console.error('[RADIUS-ACCT] error:', err);
        }
    }));
    acctSock.bind(1813, '0.0.0.0', () => console.log('[RADIUS] Accounting server listening on UDP 1813'));
}
