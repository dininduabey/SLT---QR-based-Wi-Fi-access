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
function startRadiusServers() {
    // ── Auth server (UDP 1812) ─────────────────────────────────────
    const authSock = dgram.createSocket('udp4');
    authSock.on('message', (msg, rinfo) => __awaiter(this, void 0, void 0, function* () {
        try {
            const packet = radius.decode({ packet: msg, secret: exports.RADIUS_SECRET });
            if (packet.code !== 'Access-Request')
                return;
            const tokenId = packet.attributes['User-Name'] || '';
            const password = packet.attributes['User-Password'] || '';
            const mac = (packet.attributes['Calling-Station-Id'] || '').toLowerCase();
            const token = yield models_1.DataTokenModel.findOne({ tokenId });
            let code = 'Access-Reject';
            let attrs = [];
            if (token && token.status === 'active') {
                const expectedPw = makeTokenPassword(tokenId);
                if (password === expectedPw) {
                    const remainBytes = Math.max(0, Math.floor((token.dataLimitMb - token.dataUsedMb) * 1048576));
                    code = 'Access-Accept';
                    attrs = [['pfSense-Max-Total-Octets', remainBytes]];
                    if (!token.macAddress) {
                        yield models_1.DataTokenModel.updateOne({ tokenId }, { $set: { macAddress: mac } });
                    }
                    console.log(`[RADIUS-AUTH] ACCEPT ${tokenId} remaining=${(remainBytes / 1048576).toFixed(1)}MB`);
                }
                else {
                    console.log(`[RADIUS-AUTH] REJECT ${tokenId} bad password`);
                }
            }
            else {
                console.log(`[RADIUS-AUTH] REJECT ${tokenId} status=${(token === null || token === void 0 ? void 0 : token.status) || 'not found'}`);
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
            const tokenId = packet.attributes['User-Name'] || '';
            const statusType = packet.attributes['Acct-Status-Type'] || '';
            const sessionId = packet.attributes['Acct-Session-Id'] || '';
            const inOctets = packet.attributes['Acct-Input-Octets'] || 0;
            const outOctets = packet.attributes['Acct-Output-Octets'] || 0;
            const totalOcts = inOctets + outOctets;
            if (statusType === 'Interim-Update' || statusType === 'Stop') {
                const token = yield models_1.DataTokenModel.findOne({ tokenId });
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
                    yield models_1.DataTokenModel.updateOne({ tokenId }, {
                        $set: { acctSessions: sessions, dataUsedMb: totalUsedMb, status: newStatus }
                    });
                    if (newStatus === 'exhausted' && token.status === 'active') {
                        console.log(`[RADIUS-ACCT] ${tokenId} EXHAUSTED (${totalUsedMb.toFixed(1)}MB)`);
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
