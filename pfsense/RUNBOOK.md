# SLT Mobitel QR Wi-Fi — System Runbook

How the system works and how to rebuild the pfSense box. The pfSense-side
config does NOT live in git (it lives on the device); this documents it.

## Architecture
Phone -> SLT WiFi (Aruba AP) -> pfSense captive portal -> Internet
pfSense also talks to: Node API + MongoDB at 124.43.216.136 (port 45080 -> 8000 -> 8080).

- Login: captive portal "None" auth. User scans rotating QR, enters phone + OTP,
  portal page auto-submits accept=Continue to pfSense to grant access. No RADIUS.
- Data limits: enforced natively by pfSense traffic_quota (needs IPFW pipes via
  per-user bandwidth restriction). pfSense prune disconnects clients over quota.
- Per-event limit: poller reads active event dataLimitMb, sets global trafficquota.
- Top-ups: poller reports usage to /internal/radius-acct, binds MAC to active-event
  token, marks exhausted. Re-scan skips OTP, shows top-up page. Approval auto-resumes.

## Critical: IPFW
pfSense 2.8.1 has IPFW but it is NOT loaded by default. Load it:
  kldload ipfw
  echo 'ipfw_load="YES"' >> /boot/loader.conf.local   (persists on boot)

## pfSense captive portal settings (Services -> Captive Portal -> main_zone)
- Authentication method: None
- Per-user bandwidth restriction: Enabled (default 100000 Kbit/s up/down)
- Traffic quota: set by poller (syncs to active event dataLimitMb)
- redirurl: http://124.43.216.136:45080/portal/success
- Custom page: captiveportal_main_zone.html (instruction page)

## Walled garden (CRITICAL - pfSense's allowedip apply is BROKEN in this build)
The configured allowedip does NOT populate the live pf table. Must add manually:
  pfctl -t cpzoneid_2_cpips -T add 124.43.216.136
  pfctl -t cpzoneid_2_cpips -T add 8.8.8.8 8.8.4.4
Table must contain: 124.43.216.136, 8.8.8.8, 8.8.4.4, 172.31.98.1
NOTE: this table can get wiped on CP reinit - poller should re-add it (TODO: add self-heal line).

## DNS
DHCP hands out 8.8.8.8 / 8.8.4.4 to clients (reliable browsing).
Do NOT edit /var/unbound/unbound.conf by hand - it corrupts. Use the GUI
DNS Resolver "Custom options" field if unbound changes are ever needed.

## Files (mirror in this folder -> install location)
- slt-wifi-poller.sh   -> /usr/local/bin/slt-wifi-poller.sh
- slt-wifi-poller.rc    -> /usr/local/etc/rc.d/slt-wifi-poller.sh  (chmod +x)
- captiveportal_main_zone.html -> /var/etc/captiveportal_main_zone.html
- radius-mac-check.sh, radius-acct-update.sh -> /usr/local/bin/ (LEGACY, reference only)
Enable poller on boot: echo 'slt_wifi_poller_enable="YES"' >> /etc/rc.conf

## Network
LAN 172.31.98.1/23 on re1, DHCP pool 172.31.99.x, WAN re0 DHCP.
Captive nginx on 8002. DB: /var/db/captiveportalmain_zone.db.

## Health checks
  kldstat | grep ipfw
  ps aux | grep slt-wifi-poller | grep -v grep
  tail -20 /var/log/slt-wifi-poller.log
  pfctl -t cpzoneid_2_cpips -T show
  sqlite3 /var/db/captiveportalmain_zone.db "SELECT ip,mac,username FROM captiveportal;"

## FIXED (handled by the poller, self-healing every cycle)
- Walled garden wipe: poller re-adds 124.43.216.136 / 8.8.8.8 / 8.8.4.4 to the
  cpzoneid_2_cpips table every cycle, so the portal can never silently break.
- Android Private DNS: poller blocks DNS-over-TLS (port 853) via the slt_block_dot
  anchor, forcing Android (default 'Automatic' Private DNS) to fall back to regular
  DNS. TESTED working on a real Android with Private DNS on Automatic.

## KNOWN OPEN ISSUES (not yet fixed)
1. Top-up counter not reset on pfSense side - phone can re-disconnect after top-up
   if already near global quota. Less likely at large limits.
2. CNA popup still appears - cannot be suppressed (Aruba is open-bridge only, no
   ClearPass; pfSense captive portal inherently redirects the OS probe). Handled by
   the Step 1 / Step 2 instruction page on the QR display screen instead.
3. Only tested up to ~6 phones. Not validated at full event scale.

## Verified working (real phone tests)
- QR -> phone -> OTP -> internet on iPhones
- Data limit enforcement + auto-disconnect at quota
- Top-up request -> admin approval -> auto-resume (no re-scan)
- Multi-phone: 5-6 phones at 100MB, independent token tracking, correct usage

## Pre-go-live checklist
- [ ] Replace SLT_SMS_GATEWAY_URL in server .env (currently mock)
- [ ] Remove OTP bypass 123456 in verify-otp
- [ ] Confirm ipfw_load="YES" in /boot/loader.conf.local
- [ ] Confirm slt_wifi_poller_enable="YES" in /etc/rc.conf
- [ ] Fix Android DNS, top-up counter reset, walled-garden self-heal
- [ ] Reboot pfSense once and re-verify health checks
