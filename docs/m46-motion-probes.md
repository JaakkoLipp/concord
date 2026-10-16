# M4.6 task 0 motion probes

Run `node tools/live/src/probes/m46-motion.ts` from the repository root. The probe signs in as seeded `dev` and only uses `http://localhost` after `assertDevStack()`.

## Zero-duration dialog outro — Chromium and Firefox

The probe opens the real custom-status `Dialog.svelte`, lets its entrance settle, injects zero for the relevant duration tokens, presses Escape and checks whether the native dialog is still open. Both Chromium and Firefox reported `stillOpen: false` after 100 ms. This exercises the component's actual `onoutroend={closed}` path: its `closed()` callback closes the native dialog once `open` is false, so the zero-duration Svelte outro reaches its completion callback in both engines. No animations remained after close.

For a direct Web Animations API sample, the probe calls `element.animate(..., { duration: 0 })` and checks `document.getAnimations()` immediately and at the next animation frame. In both browsers, the returned Animation was `finished`, had computed duration 0 and was absent from `document.getAnimations()` at both samples. This establishes the behavior for a bare WAAPI animation; the real Svelte/Dialog close result independently confirms its outro callback.

## Scroller-only scrollbar hover — Chromium and Firefox

The probe uses a nested overflow fixture with `scrollbar-width: thin`, transparent default `scrollbar-color`, a colored thumb on `.probe-scroll:hover`, and a red `::-webkit-scrollbar-thumb` background. Both Chromium and Firefox computed transparent initially, transparent while the pointer hovered the parent outside the child scroller, and `rgb(102, 119, 136)` when the pointer moved over the scroller. This confirms the selector state is scoped to the scroller in both engines. Chromium reports the prefixed thumb's red `background-color` as `rgb(200, 20, 20)` in computed style while the standard property is active. This does not establish which color is painted: Playwright's headless Chromium hides scrollbars, so visual precedence remains unverified. Firefox returns no computed prefixed pseudo background, as expected for this Chromium-specific selector.

Firefox was fetched into the user-scoped Playwright browser cache with the matching local `playwright-core` CLI. No system packages were installed. The probe selects Firefox with `PROBE_BROWSER=firefox`.

## Recommendation

Keep `onoutroend` as the close signal: the real Dialog closes with a zero-duration outro in both browsers. A zero-duration WAAPI animation is already finished and absent from `document.getAnimations()` immediately. The standard scroller-hover rule produces the expected computed style in Chromium and Firefox, with the ancestor-only hover leaving the thumb color transparent; check painted visibility on a headed browser/device if that visual distinction is a release requirement.
