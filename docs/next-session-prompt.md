# Concord: handoff for the next session (M2a, messaging)

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**This session's job is M2a, messaging.** Start by writing `docs/m2a-plan.md`, then stop for Jaakko's sign-off before writing code. M2 is split into M2a, M2b and M2c, each in its own chat. The scopes are in `docs/milestones.md`.

## How to work

- **Plan first.** Write the plan: ordered tasks, each with a done-check on the live client, then Jaakko's tasks and the decisions needed. Stop for sign-off. Recommend rather than list options. Keep documents short and plain.
- **Testing stays light**, by Jaakko's choice. Unit tests cover the risky core: logic such as the composer's serialisation, optimistic reconciliation and permissions. Add no new fixture scenarios unless a bug needs one. Every task ends deployed at `https://concord.jaalip.com/app`, and that is where review happens.
- **Commit and push at the end of each finished task**, after `pnpm verify`. CI runs it on GitHub (`JaakkoLipp/concord`, private).
- Use Sonnet subagents (`model: "sonnet"`) for research and review. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- Never install system software on Jaakko's WSL machine. The VPS may be managed freely, with sudo.
- Jaakko's admin email is private. It must never appear in file contents or commit messages. Commit author metadata is fine, by Jaakko's choice.

## Read first

1. `docs/milestones.md`, the M2a section, and `docs/client.md` sections 4 (data flow, optimistic updates, rate limits), 6 (conversation, composer, emoji picker, search) and 13 (CSP).
2. `docs/m1-plan.md` and `docs/m1-results.md`: what exists and how it was checked.
3. `docs/m0-results.md`: verified Stoat behaviour. Note especially the message limit of 2000 UTF-8 bytes, the MFA details, presence and `Subscribe`.

## Commands (WSL, from the repo root)

| Task | Command |
|---|---|
| Everything CI checks | `pnpm verify` |
| Deploy the client to `/app` | `pnpm deploy:web`. It waits until the server answers. |
| Dev server with proxy to the VPS | `pnpm dev`, then open `http://localhost:5173/app` |
| A persona's login | `pnpm seed password dev`. `totp` also prints its current code. |
| Reseed from scratch | `pnpm seed --reset`, about 5 minutes |
| Live screenshot | `node tools/live/src/shot.ts dev out.png <channel>` |
| Live checks from M1 | `tools/live/src/{presence,reconnect,perf,review}.ts` |

## What M2a builds on

- **Stoat adapter** (`packages/stoat`): `rest.ts` waits out exhausted rate-limit buckets and retries a 429 once. `socket.ts` handles the gateway, and `events.ts` maps frames to domain events. Add the write calls to `StoatBackend` and the `Backend` interface in `packages/domain/src/backend.ts`.
- **Store** (`packages/domain/src/store/store.svelte.ts`): idempotent handlers. `messageCreate` already carries `nonce`, so optimistic messages reconcile when Stoat echoes the `Idempotency-Key` back as `nonce` (client.md section 4.3). `unreads`, `isUnread`, `mentionCount` and the `ack` event exist. Acks are new in M2a.
- **UI**: `apps/web/src/lib/shell/Composer.svelte` is the disabled placeholder, and `conversation/MessageItem.svelte` has no hover action bar yet. The markdown parser is in `lib/markdown/parse.ts`. The permission calculator is `channelPermissions` in `@concord/domain`; use it to show or hide send, react, upload and manage actions.
- **Stoat facts that matter here**:
  - Messages are limited to 2000 UTF-8 bytes and 5 attachments.
  - Rate limits: 10 messages per 10 seconds per channel. Typing at most every 2.5 seconds, sent as the `BeginTyping` and `EndTyping` socket frames.
  - Reactions take a unicode emoji from Stoat's allowlist of 3968, or a custom emoji's ULID.
  - Pins use `POST` and `DELETE /channels/{c}/messages/{m}/pin` and post system messages.
  - Mentioning a role needs `MentionRoles`.
  - Search is `POST /channels/{c}/search`.
  - Uploads go to `POST /autumn/attachments`, multipart, 20 MB at most.

## Open with Jaakko

1. **M0 encoder runs**: one partial Firefox run is recorded in m0-results section 3, with tips. Chrome on Windows is next. The runs matter before M3.

M1 is done, its device tests passed, and decision gate part A is signed off: go.
