<!-- IP.NodeCloak production deployment and rollback runbook. -->
# IP.NodeCloak operations

Production: https://ip.nodecloak.com · API: `127.0.0.1:11967`.

## Layout

- `/srv/ipnodecloak/releases/<commit>/`: immutable source, dependencies and `dist/`.
- `/srv/ipnodecloak/current`: atomic symlink to the active release.
- `/var/lib/ipnodecloak/<name>-db/`: persistent offline datasets; each release links its `common/*-db/` directories here.
- `/opt/ipnodecloak/node-v24.22.0-linux-x64/`: dedicated Node LTS runtime, verified against the official HTTPS `SHASUMS256.txt`. System Node is unchanged.
- `/etc/ipnodecloak.env`: root-owned runtime settings based on `ipnodecloak.env.example`. Never commit live credentials.
- `/etc/systemd/system/ipnodecloak.service` and `/etc/nginx/sites-available/ip.nodecloak.com`: isolated service and vhost.

## Build and release

1. Run `corepack pnpm install --frozen-lockfile` and `corepack pnpm check` on Node 24.15 or newer. Build with `VITE_SITE_URL=https://ip.nodecloak.com`; leave optional analytics, Firebase, Sentry, docs assistant and report-storage credentials unset unless intentionally configured.
2. Archive the reviewed Git commit plus `dist/`; upload it over SSH using a separately verified server host key. Extract into a new release directory. Keep old releases for rollback.
3. Install runtime dependencies with the dedicated Node runtime on PATH: `corepack pnpm install --prod --frozen-lockfile`. The committed pnpm allowlist controls install scripts. Link `common/maxmind-db`, `common/as-org-db`, `common/as-rel-db`, `common/peeringdb-db`, `common/oui-db`, `common/tor-exits-db`, `common/drop-v4-db`, and `common/drop-v6-db` to the corresponding persistent directories, owned by `ipnodecloak`. Release code stays root-owned and world-readable.
4. First deployment only: install the service/environment files; fetch and validate Cloudflare's official IP ranges from `https://api.cloudflare.com/client/v4/ips` into `ipnodecloak-realip.conf` (`set_real_ip_from <CIDR>;` and `real_ip_header CF-Connecting-IP;`). Do not trust arbitrary forwarded headers. Install an HTTP ACME vhost, issue a Let's Encrypt webroot certificate for `ip.nodecloak.com`, then install `nginx.conf`.
5. Record the previous symlink target, create `current.next`, then `mv -Tf /srv/ipnodecloak/current.next /srv/ipnodecloak/current`. Restart `ipnodecloak`, run `nginx -t`, and reload nginx.
6. Check HTTPS, `/api/configs` with a same-origin Referer, rejection of foreign Referers and private-IP queries, a public-IP lookup, DNS resolution, a standalone tool route, and a browser full check. Confirm existing NodeCloak health still returns OK. After a reload, allow nginx's new workers to take over before probing the new vhost or certificate.

## Rollback and maintenance

Point `current.next` at the recorded previous release, atomically replace `current`, and restart `ipnodecloak`. Datasets remain in place. Inspect `systemctl status ipnodecloak` and `journalctl -u ipnodecloak` for failures; HTTP access logging is off. Certificate renewal uses certbot's system timer and webroot challenge; its deploy hook must reload nginx. Periodically refresh Cloudflare's official trusted-IP ranges.

The initial naming migration keeps its previous service, nginx, renewal and root-only environment configuration in `/var/backups/ipnodecloak/20261016-branding`. Reverting that migration uses the backed-up service and configuration together, including its original dataset paths; ordinary symlink rollback applies between releases under the new deployment layout. Persistent datasets are copied before promotion and again after the previous service stops.

IP/DNS/STUN/speed/geolocation providers have their own availability and policies. Failed probes remain unavailable; they are never presented as a clean privacy result. Optional paid/upstream-only integrations remain gated when their credentials are absent.

## Homepage IP details

Link previews use the solid 180×180 share thumbnail and a `summary` card,
separate from the rounded install icons. Its green background covers every pixel
so clients cannot add a white matte to transparent corners. The SVG source and
PNG share thumbnail live under `public/brand/`. Keep Open Graph dimensions consistent
with the actual PNG. Preview layout and cached messages remain controlled by
the messaging client; a site metadata change cannot force existing Telegram
messages to refresh or override a sender-selected large preview.

The expanded homepage panel queries RIPEstat for the selected IP's BGP prefix and origin ASN, and IPWhois for network/domain/location metadata. The ASN's name uses the local CAIDA table where available. Other configured geolocation sources look up that same IP; Cloudflare trace is included only when its caller IP matches, and supplies country only. Metadata is cached by queried IP; incomplete responses have a shorter TTL. IP-API's explicit hosting/mobile/proxy flags are retained without inferring residential status from missing flags.

IPinfo and IP2Location are available without credentials through their official keyless APIs. IPinfo uses its legacy `/json` endpoint with shared anonymous rate limits (https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite); IP2Location permits 1,000 keyless queries per day, resetting at 00:00 UTC (https://www.ip2location.io/ip2location-documentation). Optional `IPINFO_API_KEY` (legacy alias `IPINFO_API_TOKEN`) and `IP2LOCATION_API_KEY` are used when configured. Upstream quota/errors remain unavailable; no substitute data is labelled as these providers. The `/api/configs` booleans indicate backend capability, not guaranteed provider uptime. MaxMind remains gated on loaded GeoLite2 City and ASN databases; `MAXMIND_ACCOUNT_ID` plus `MAXMIND_LICENSE_KEY` enable official downloads and daily updates. Its signup and license details are at https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/.

Capability config is served with `Cache-Control: no-store`, and the frontend bypasses old browser cache entries when loading it. This keeps source availability and database readiness current after a deployment or credential change; public geolocation results keep their own route caches.

Enabling MaxMind requires accepting its GeoLite license and creating a private download key. Validate both City/ASN download endpoints before installing credentials. The shared updater downloads, validates and publishes the database pair atomically at boot and checks daily at `DATASET_UPDATE_CRON`; persistent files live in `/var/lib/ipnodecloak/maxmind-db`. Verify `maxMind: true` in `/api/configs`, a successful `/api/maxmind?ip=<public-ip>` response, and the homepage location row after the first download. The footer includes MaxMind attribution when the databases are ready; all full locales carry it. Do not store database archives or credentials in Git.

Cloudflare Radar human/bot percentages require `CLOUDFLARE_API_KEY` and describe ASN-wide HTTP traffic over seven days, not individual-IP activity. With no key, the panel shows the source state and an ASN report link.

## Full IP report and first-party risk model

### Native / broadcast origin reference

The homepage independently loads `/api/ip-origin?ip=<public-ip>`, sharing the
routing/IP-API/proxycheck caches. It resolves the IP's ASN, then queries
`AS<n>.asn.cymru.com` TXT for that ASN's registration country. The returned ASN
must match; multiple-origin routes and missing/stale data stay unknown.
The country is compared with IP-API geolocation, falling back to proxycheck only
when the primary country is absent. A match yields `native`, a difference yields
`broadcast`; labels omit the parenthetical qualifier. Country/ASN details open
from the circular alert icon beside the homepage label; no explanation paragraph
appears below the cards. These are references, not physical-routing verification.
ASN registration country is distinct from IP-prefix registration country.
No geography comparison affects risk scores.

The type, proxy and origin cards share one row. Reports retain the ASN, country
pair, evidence and method. Older shared snapshots keep their original method
label. Provider caches/deadlines are reused; the frontend permits 25 seconds for
the dependent routing/ASN lookup.
See [Team Cymru's ASN registry-country documentation](https://www.team-cymru.com/ip-asn-mapping).

The public /tools/ipreport?q=<IP> route consumes /api/ip-report. The homepage /api/ip-risk endpoint extracts the same risk object; there is one scoring model, nodecloak-ip-risk-v2. Source caches are bounded to 256 keys per adapter, coalesced, successful observations cached for five minutes and failed observations for 30 seconds. Each adapter has a 10-second enforced deadline, including stalled body reads; dependent network/Radar work fits below the frontend's 25-second deadline. Underlying routing metadata can retain its established six-hour cache. Current local Tor/DROP snapshots are re-matched on every assessment and expire after 48 hours.

Overall risk weights: DROP70, max(Tor30, proxy25), hosting10, DNSBL abuse25, passive CVE labels10. Optional AbuseIPDB counts over30days add5 for any report,15 for >=5 reports from>=3reporters,30 for>=20 reports from>=5reporters. The total is capped at100; geography, PTR, ASN traffic and subnet estimates do not change it. Partial evidence still returns a numeric observed score, observed-point lower bound and potential upper bound. `scoreKind` is `complete`, `observed` or `unavailable`; `status` and coverage retain completeness independently of score presence. With no usable evidence, score remains null. Scenario fit scores disclose the same basis and their possible range. Disabled optional sources are excluded and disclosed. CVE labels are passive software-match evidence, not confirmed exploitable vulnerabilities. InternetDB404 is unknown coverage, not a clean scan.

Scenario fit is100 minus its own weighted risk. Weights and factors are in common/ip-report-model.js and visible in each card. Only email uses absent PTR; hosting is normal for email. Country policies are independently versioned, sourced from official product lists, reviewed2026-10-16 and expire after30days. Refresh common/ip-report-policy-data.js monthly from the linked official pages, using current ISO codes; preserve conditional regions and product scope (Gemini web, mainland China Workspace-only). No live platform authentication or delivery tests are implied.

Optional environment keys are listed in ipnodecloak.env.example: CLOUDFLARE_API_KEY (Radar read), PROXYCHECK_API_KEY, ABUSEIPDB_API_KEY and SPAMHAUS_DQS_KEY. Keep them only in root-owned /etc/ipnodecloak.env; never VITE_ variables. proxycheck has a small shared anonymous quota; a configured key raises provider limits. Quota errors remain limited. Spamhaus ZEN is disabled without its DQS key; local DROP remains available. PTR and three public DNSBLs use the server resolver (optional IP_REPORT_DNS_SERVERS override). Every DNSBL requires a healthy positive and negative test before accepting a target NXDOMAIN. Policy-only Spamhaus PBL codes are displayed separately, not scored as generic abuse. Resolver failures stay unknown, with no automatic weakening of DNS checks.

For DroneBL, the positive test `2.0.0.127.dnsbl.dronebl.org` can return `127.0.0.1` (TXT: `Testing class.`). Accept that exact sentinel only for the positive control; target responses still require documented listing codes, including web proxies (11) and unknown listings (255). The negative control must remain NXDOMAIN/no data. A wildcard response, resolver failure, or unknown target code keeps the source unavailable. Reference: https://dronebl.org/docs/howtouse.

Credential setup is separate from code releases. Validate a key against its official endpoint, install it in the root-only environment file atomically, restart the dedicated service, and verify the source status in `/api/ip-report` and the report UI. Never put a key in screenshots, Git, browser bundles, or command output. Spamhaus account activation, Data Feed Service Agreement acceptance, and Query key generation are separate portal steps; verify that the subscription permits the public report's use before enabling ZEN. Free DQS availability is subject to Spamhaus eligibility and usage terms, not just account registration. Leave ZEN disabled until those steps are complete; DROP remains independent.

Report URLs include the full queried IP and re-run a current assessment; JSON/TXT exports are generated in the browser from the same response, with timestamps, source states and scoped estimates. Credentials, RDAP contact details and provider-supplied risk scores are never exported. Radar statistics describe seven-day ASN-wide HTTP traffic, not individual-IP activity. Confirm the report, homepage summary, source failure states, local exports and responsive light/dark layout when releasing.

Both the homepage diagnostic share dialog and the IP assessment toolbar offer local PNG exports. Diagnostic images follow the selected sections and IP-tail masking option. Assessment images include the full current result, expanded factors, evidence and methodology, with query/action controls excluded. Image generation uses the current VI theme, requires no report-storage configuration, and does not upload report data. Verify actual downloaded images, privacy filtering and renderer error recovery when changing these paths.

Homepage diagnostic reports also include the optional `ippurity` snapshot in images, JSON, Markdown and stored share links. It contains network metadata, location comparison, ASN-wide traffic, classification and the current on-demand risk result with coverage, interval and evidence. Sharing does not run a new assessment. Pending/failed risk requests export their current state without an earlier score; changing the primary IP clears mismatched observations. Prefix and range addresses are IP-typed for tail masking. This is an additive version-2 section, preserving existing reports without purity data.
