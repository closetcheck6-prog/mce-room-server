# Railway deploy packet — MCE room server (stage 3, prepared 2026-11-09)

## What this is
A Railway-ready copy of the Music City Estates room server in
`../server.mjs` (byte-identical — this folder is the deploy unit).
Stage 3 design, per William's confirmed target: **100 players across
the city, split into district rooms.**

- Players join a named room (a district); a player only ever receives
  snapshots of their own room, at ~15 snapshots/sec.
- `join` accepts `{room}`; `{t:'room', room}` moves a player between
  rooms (server replies `roomok`, or `full` if the room is at cap).
- **Per-room cap: 30.** A move into a full room is refused (`full`,
  player stays put); a fresh join into a full room falls back to the
  default `city` room if it has space, else is rejected with `full`.
- Clients that never mention rooms land in `city` and behave exactly
  as the stage 1/2 protocol did (join/welcome/pos/ping/hide/show
  unchanged) — proven by the unmodified stage-1 bot rig.
- The port reads Railway's `PORT` environment variable
  (`process.env.PORT || 4190`); 4190 remains the local default.

Local proof (2026-11-09, see `../STAGE3.md`): 100 bots across 9
district rooms for 60 s — 100/100 joined, 0 drops, ~15 snapshots/sec
each, zero cross-room leakage, server RSS flat at ~78 MB.

## William's steps (his account, his tap — money/identity gate)
1. Open https://railway.com and sign up / log in.
2. Choose the Hobby plan when asked — $5/month, includes $5 of usage.
   Confirm the exact price on that screen before committing; nothing
   is charged before that screen.
3. Create a new project and deploy this folder (`railway-deploy/`) —
   Lux walks this screen by screen in chat when William says go.
4. In the service's Settings → Networking, add the custom domain
   `server.musiccityestates.com`. Railway shows a DNS target (CNAME);
   that record gets added where musiccityestates.com DNS lives
   (GoDaddy).
5. Tell Lux it's up. Lux then: verifies the wss endpoint answers,
   wires the MCE_MP block into the LIVE game, re-proves two clients
   seeing each other on the public host, and reports — phone test
   last.

## Notes
- The server holds no secrets: no keys, no passwords, no user data.
  Nothing sensitive goes into Railway variables.
- The game client (MCE_MP) currently joins the default room only;
  district-aware room switching in the client is a follow-up pass
  once hosting is live.
