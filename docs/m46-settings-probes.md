# M4.6 task 0: settings probe

Probe date: 2026-10-16. All app observations used the local stack only.

## Setup and limits

The checkout at `f83864b` was placed in the throwaway worktree `/tmp/concord-m46-settings-probe` on branch `codex/m46-settings-probe`. An independent Vite server ran at `http://localhost:5174`; its existing dev proxy forwarded app requests to the local backend. I signed into the local stack as seeded `dev`. No production address or deployment was used.

I exercised the current app in Chromium through the local Vite server. A disposable SvelteKit route used `pushState`, `page.state`, `goto`, and Back to isolate router behavior; it was not a full Concord modal implementation. The app route source was isolated, but the probe reused the main checkout’s UI/domain dependency links. Voice shortcuts were source-audited, not functionally tested during a real call. Firefox, closing the tab with unsaved changes, and actual settings reload fallback were not tested.

## Observed results

- **Current settings navigation:** From a channel, the User settings gear navigates to `/app/settings/profile`. The rendered page contains the settings frame but no channel shell, conversation, or call view. Browser Back returns to the channel route. Focus lands on the page root after return, not on the gear. This matches the present route structure: the shell is hosted by `(app)/app/channels/+layout.svelte`, while settings routes are siblings under `(app)/app/settings/[section]`.
- **Shallow modal state:** In the temporary SvelteKit route, `pushState('/app/settings/voice', {...page.state, settingsProbe: true})` changed the address bar to the real settings-shaped URL while rendering from `page.state` over the same shell component. A 250 ms shell counter kept advancing while the modal was present, confirming the shell remained mounted. Back returned to the shell route and the prototype restored focus to its opener.
- **Navigation hooks:** A temporary `beforeNavigate`/`afterNavigate` counter remained at 0/1 for a direct shallow open and Back; only `popstate` incremented. For the opener sequence `await goto('/probe/settings', {replaceState: true}); pushState('/app/settings/voice', state)`, the counters became 1/2 for the real `goto`; Back again changed only `popstate`. A shallow pop does not invoke `beforeNavigate`, so editor guards need a modal-owned dirty-change registration.
- **Dirty Back:** The prototype marked settings dirty, pressed Back, then observed the modal state re-pushed and an unsaved-changes prompt shown. The prompt display was verified; its discard action and tab-close behavior were not.
- **Settings URL reload:** Reloading `/app/settings/voice` opened the current standalone Voice and video settings page. The channel shell did not appear. The app already remembers the last channel in `concord:last-channel` through `rememberChannel()`/`recalled()`; `/app` uses that to reopen a channel. Current settings routes do not use that fallback. The proposed reload opener remains to be implemented in task 16a.
- **Escape:** In the temporary modal, one Escape closed an open mock menu and left settings open. Source inspection shows the real `Menu` and `Popover` install capture-phase window listeners and call `stopPropagation()`; the native `Dialog` prevents its `cancel` event and asks its owner to close. The current settings page has no shell-hosted menu to test this combination end to end.
- **Phone width:** At 390 x 844 CSS pixels, current settings fills the viewport. Navigation becomes a horizontal row at the top and content scrolls below it. The temporary modal did not represent Concord styling; the app's actual mobile layout was the measured evidence.

## Keyboard audit for a mounted shell

Source paths below are relative to `apps/web/src/lib`.

| Handler | Registration and observed source behavior | Task 16a implication |
|---|---|---|
| Shortcut registry and type-to-focus | `shell/Shell.svelte` has one window capture handler: registry first, then `typeToFocus`. `somethingOpen()` recognizes dialog, menu, and listbox surfaces; type-to-focus also checks open surfaces and recording state. Navigation shortcuts already require no open surface. | Keep settings in the accessibility tree as a dialog and make every registry entry modal-aware. The shortcut-list entry currently has no `when` guard and can open over settings; add a settings-open gate. The quick switcher already checks `somethingOpen()` before opening. |
| Ctrl+Shift+M / Ctrl+Shift+D | `shell/UserDock.svelte` listens on window bubble and toggles voice state whenever a call is active and the configured key matches. | Gate both keys while settings is open. |
| Ctrl+E | `shell/Composer.svelte` listens on window bubble and opens the emoji picker. | Gate it while settings is open. |
| Context-menu key | `view/contextmenu.svelte.ts` listens on window capture only to remember that ContextMenu/Shift+F10 was pressed; a later contextmenu event opens an attached menu. | Keep the channel shell inert so its menu targets cannot receive the resulting contextmenu event. The capture listener itself has no settings action. |
| Voice key recording | `settings/VoiceSection.svelte` dynamically listens on window capture while recording, calls `preventDefault()` and `stopPropagation()`, and sets the registry's `recording` flag. The registry then stays silent; type-to-focus also checks that flag. Escape cancels recording, and Tab ends it. | Preserve the recorder's capture priority. While recording, its key must not reach the dock or composer bubble handlers. The current code uses `stopPropagation()`, not `stopImmediatePropagation()`. |
| Push-to-talk | Voice settings can attach a capture listener while a mic test is active in push-to-talk mode (`voice/audio/ptt.ts`, called from `settings/VoiceSection.svelte`). | Decide explicitly whether the mic-test PTT key remains active over settings; it is local to the mic test rather than a shell shortcut. |

The key handlers above were inspected in source; their side effects under a real call were not exercised. The probe's mock counters only verified that prototype window listeners receive key events.

## Routing, guards, Escape, and focus recommendation

- For an in-app open, push the settings URL with SvelteKit `pushState` and store the selected settings section in `page.state`. The channel layout can render the modal from that state while retaining its shell, call view, and conversation scroll position. The URL and normal browser Back behavior remain available.
- For a settings URL opened directly or reloaded, let the settings route read the remembered channel, `goto(channelUrl, {replaceState: true})`, then push the requested settings URL and modal state. The channel layout then owns the visible shell and modal. For server or channel settings, resolve a valid channel in the requested scope before falling back to the last channel.
- Keep `beforeNavigate` for real route changes and tab-close warnings. Have dirty editors register blockers with the modal. When a shallow Back would close dirty settings, re-push the settings entry and ask whether to discard. On discard, go Back from that re-pushed entry; on keep editing, leave the modal entry current.
- Let existing menu and popover capture listeners handle Escape first. The shell capture registry should see an open surface and decline its own shortcut. Close settings from a later bubble handler only when the event remains unhandled and no menu, popover, or dialog is open. The modal handler should not use capture because it would run ahead of overlay listeners.
- Mark the shell inert while the modal is open and constrain keyboard focus to the modal. On close, focus the original opener if it remains connected. When settings opened from a menu item that is removed, let the menu's existing focus restoration return to its anchor. The current route-based Back test lost focus to the page root; the disposable modal returned it to the opener.
- At widths up to 800 px, retain the current full-screen settings layout. The measured 390 x 844 layout already follows that rule.

## Probe outcome

The router mechanism is viable for task 16a: shallow `page.state` keeps a mounted page while the URL reflects settings, Back restores the prior state, and a dirty guard can restore the modal entry and ask. The current settings route still needs the reload opener, shell modal host, editor blocker integration, key gates, inert/focus handling, and the direct live checks listed in `docs/m4.6-plan.md`.
