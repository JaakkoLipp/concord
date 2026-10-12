# M2a results: messaging

Results for [m2a-plan.md](m2a-plan.md), recorded against the seeded Stoat 0.15.5 stack at `https://concord.jaalip.com/app`.

## Task 1: editor spike, 2026-10-12

**What is deployed**:
- The composer runs on CodeMirror 6 (`@codemirror/state` 6.7.6, `view` 6.43.14 and `commands` 6.11.1), loaded lazily.
- Sending is off. Send shows the serialised text and its byte count in a box above the composer.
- The composer opens with a sample draft containing a user mention, a custom emoji, a role mention, a channel link and Finnish text. "Reset sample" restores it.

**Bundle cost**: the editor chunk is **87 KB gzipped** (271 KB raw), loaded only by the composer's dynamic import. The initial JavaScript is unchanged.

**Scripted check**: `node tools/live/src/composer.ts out.png [desktop|phone]`, in headless Chromium against the live client. Both modes passed:

| Check | Desktop, 1600 px | Phone, 390 px with touch |
|---|---|---|
| Tokens drawn as pills and an emoji image, with names from the store | Yes | Yes |
| Typing Finnish text, then undo | Yes | Yes |
| The caret steps over a token in one key press, and Backspace deletes it whole | Yes | Yes |
| Serialised text is Stoat syntax, `<@ID>` etc., and the byte count matches | Yes, 171 bytes | Same |
| Enter | Sends | Adds a line. The send button sends and keeps the editor focused. |
| Console errors or failed requests | None | None |

Headless Chromium can't test IMEs, Android keyboards or Firefox. Those checks are Jaakko's, in the plan's checklist.
