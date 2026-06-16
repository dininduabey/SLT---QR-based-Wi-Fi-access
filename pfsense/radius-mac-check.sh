#!/bin/sh
# NOTE: Legacy from RADIUS-based approach. Current system uses IPFW traffic_quota
# enforcement (see runbook). Kept for reference / fallback only.
STATUS=$(echo "$ACCT_STATUS_TYPE" | tr -d '"')
if [ -n "$STATUS" ]; then
    exec /usr/local/bin/radius-acct-update.sh
fi
USERNAME=$(echo "$USER_NAME" | tr -d '"')
PASSWORD=$(echo "$USER_PASSWORD" | tr -d '"')
CMAC_RAW=$(echo "$CALLING_STATION_ID" | tr -d '"')
norm_mac() {
    RAW=$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr -d ':-')
    A=$(echo "$RAW"|cut -c1-2); B=$(echo "$RAW"|cut -c3-4)
    C=$(echo "$RAW"|cut -c5-6); D=$(echo "$RAW"|cut -c7-8)
    E=$(echo "$RAW"|cut -c9-10); F=$(echo "$RAW"|cut -c11-12)
    echo "$A:$B:$C:$D:$E:$F"
}
is_mac() {
    echo "$1"|grep -qiE '^[0-9a-f]{2}(:[0-9a-f]{2}){5}$|^[0-9a-f]{12}$'
}
if is_mac "$USERNAME"; then
    MAC=$(norm_mac "$USERNAME")
    BODY="{\"mac\":\"$MAC\"}"
else
    CMAC=$(norm_mac "$CMAC_RAW")
    BODY="{\"tokenId\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"callingMac\":\"$CMAC\"}"
fi
RESULT=$(/usr/local/bin/curl -s -m 5 -X POST \
    "http://124.43.216.136:45080/internal/radius-check" \
    -H "Content-Type: application/json" \
    --data-raw "$BODY")
if echo "$RESULT" | grep -q '"accept":true'; then
    exit 0
else
    exit 1
fi
