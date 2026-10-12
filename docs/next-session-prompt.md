# Concord: handoff for the next session

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.7 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

## How to work

- Planning is layered and reviewed. Don't start application code until Jaakko has signed off `docs/dev-environment.md` and `docs/client.md`.
- Use Sonnet subagents (`model: "sonnet"`) for research and review. Keep synthesis and final writing in the main session. Run research agents read-only, and never run scripts or build tools inside downloaded clones.
- Don't commit unless asked. Nothing is committed yet.
- Never install system software on Jaakko's WSL machine. The VPS may be managed freely, with sudo.
- Jaakko's admin account email is private. It must never appear in the repo, docs, fixtures or commit messages.
- Keep documents short, plain and reviewable. Recommend rather than list options.

## Read first

1. `docs/product-brief.md`, `docs/architecture.md` and `docs/milestones.md`: layers 1 and 2, signed off on 2026-10-11. They received small consistency edits on 2026-10-12 for VPS-backed development, which are awaiting Jaakko's confirmation.
2. `docs/dev-environment.md` (M0) and `docs/client.md` (M1 and M2): complete drafts awaiting Jaakko's review. `client.md` section 15 lists 7 open questions, each with a recommendation.
3. `docs/m0-results.md`: everything verified so far on the VPS.
4. `docs/vps-runbook.md`: M3, with what M0 already did listed at the top.
5. `deploy/`: compose additions, Caddyfile, wrapper and account scripts, and the `Revolt.toml` change log.

## State of the VPS

- **Access**: `ssh jaakko@2.29.49.35`, with passwordless sudo. The docs use an SSH alias `concord-vps`, which Jaakko may still need to add to `~/.ssh/config`.
- **Stack**: running and healthy. Stoat images `v0.15.7` and MongoDB `7.0.43`, pinned because MongoDB 8 refuses to start on kernel 7.0. Always run compose through `~/stoat/concord/dc`.
- **Bootstrap**: done.
  - Jaakko's account `jaakko#0485` is the only ID in `restrict_server_creation`.
  - The server "Concord" exists, with `InviteOthers` cleared from its default permissions and an Admin role that has it.
- **Private files**: `~/concord-private/` (mode 700) holds the admin's initial password, a bootstrap session token, and the `test-b` test account's credentials.
- **Seeding**: the first `pnpm seed --reset` wipes Jaakko's account and the server. That was recommended and is awaiting Jaakko's agreement.

## Next steps, in order

1. Apply Jaakko's review of `dev-environment.md`, `client.md` and the layer 1 and 2 edits.
2. Write the M0 milestone plan, then implement M0 as `dev-environment.md` describes:
   - the memory limits,
   - `reset-data.sh`,
   - the seed script,
   - the fixture recorder,
   - the screen-share test page and its `/spike/` route,
   - the encoder runs.
3. During M0, verify these, and record the results in `m0-results.md`:
   - presence for Idle and Focus, and for DM partners who are not friends,
   - the `Ready` size on the seeded dataset,
   - whether `/api/swagger` and `/api/metrics` are publicly reachable,
   - the invite response's server icon once the server has one.
