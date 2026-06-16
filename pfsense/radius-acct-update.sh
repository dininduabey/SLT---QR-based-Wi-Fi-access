#!/bin/sh
# NOTE: Legacy from RADIUS-based approach. Kept for reference.
MAC=$(echo "$CALLING_STATION_ID" | tr -d '"')
IN=$(echo "$ACCT_INPUT_OCTETS" | tr -d '"')
OUT=$(echo "$ACCT_OUTPUT_OCTETS" | tr -d '"')
SESSION=$(echo "$ACCT_SESSION_ID" | tr -d '"')
STATUS=$(echo "$ACCT_STATUS_TYPE" | tr -d '"')
if [ -z "$MAC" ] || [ -z "$IN" ]; then exit 0; fi
if [ "$STATUS" != "Interim-Update" ] && [ "$STATUS" != "Stop" ]; then exit 0; fi
/usr/local/bin/curl -s -m 5 -X POST \
  "http://124.43.216.136:45080/internal/radius-acct" \
  -H "Content-Type: application/json" \
  --data-raw "{\"mac\":\"$MAC\",\"sessionId\":\"$SESSION\",\"inOctets\":$IN,\"outOctets\":$OUT}" \
  >> /tmp/acct.log 2>&1
exit 0
