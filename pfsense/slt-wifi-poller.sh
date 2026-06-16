#!/bin/sh
SERVER="http://124.43.216.136:45080"
LOG="/var/log/slt-wifi-poller.log"
LAST_SESSION_CHECK=0
LAST_QUOTA=""

echo "[$(date)] Poller started" >> $LOG

while true; do
    RESPONSE=$(curl -s --max-time 10 "${SERVER}/api/admin/pfsense-poll" 2>/dev/null)
    if echo "$RESPONSE" | grep -q '"clear":true'; then
        php -r "
require_once('/etc/inc/captiveportal.inc');
\$GLOBALS['cpzone'] = 'main_zone';
\$db = captiveportal_read_db();
if (count(\$db) > 0) { captiveportal_disconnect_all(7); }
" 2>/dev/null
        echo "[$(date)] Adjourn - disconnected all" >> $LOG
    fi

    NOW=$(date +%s)
    if [ $((NOW - LAST_SESSION_CHECK)) -ge 30 ]; then
        LAST_SESSION_CHECK=$NOW
        POLICY=$(curl -s --max-time 10 "${SERVER}/api/admin/pfsense-event-policy" 2>/dev/null)
        SESSION_MINS=$(echo "$POLICY" | grep -o '"sessionDurationMinutes":[0-9]*' | cut -d: -f2)
        DATA_LIMIT=$(echo "$POLICY" | grep -o '"dataLimitMb":[0-9]*' | cut -d: -f2)

        if [ -n "$DATA_LIMIT" ] && [ "$DATA_LIMIT" != "$LAST_QUOTA" ]; then
            php -r "
require_once('/etc/inc/config.inc');
require_once('/etc/inc/captiveportal.inc');
\$cp = &\$GLOBALS['config']['captiveportal']['main_zone'];
\$cp['trafficquota'] = '$DATA_LIMIT';
write_config('Sync traffic quota');
" 2>/dev/null
            LAST_QUOTA="$DATA_LIMIT"
            echo "[$(date)] Quota synced to ${DATA_LIMIT}MB" >> $LOG
        fi

        USAGE=$(php -r "
require_once('/etc/inc/captiveportal.inc');
\$GLOBALS['cpzone'] = 'main_zone';
\$db = captiveportal_read_db();
foreach (\$db as \$c) {
    \$v = getVolume(\$c['ip']);
    echo \$c['mac'] . ',' . \$c['sessionid'] . ',' . \$v['input_bytes'] . ',' . \$v['output_bytes'] . PHP_EOL;
}
" 2>/dev/null)

        if [ -n "$USAGE" ]; then
            echo "$USAGE" | while IFS=',' read MAC SID IN OUT; do
                [ -z "$MAC" ] && continue
                curl -s -m 5 -X POST "${SERVER}/internal/radius-acct" \
                    -H "Content-Type: application/json" \
                    --data-raw "{\"mac\":\"$MAC\",\"sessionId\":\"$SID\",\"inOctets\":$IN,\"outOctets\":$OUT}" \
                    >/dev/null 2>&1
            done
            echo "[$(date)] Reported usage for connected clients" >> $LOG
        fi

        php -r "
require_once('/etc/inc/captiveportal.inc');
\$GLOBALS['cpzone'] = 'main_zone';
captiveportal_prune_old();
" 2>/dev/null

        CLIENTS=$(sqlite3 /var/db/captiveportalmain_zone.db "SELECT COUNT(*) FROM captiveportal;" 2>/dev/null)
        echo "[$(date)] Check: quota=${DATA_LIMIT}MB clients=${CLIENTS}" >> $LOG
    fi

    sleep 15
done
