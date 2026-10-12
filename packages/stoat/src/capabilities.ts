/** Behaviour switches by Stoat version (architecture section 4.3). */
import type { Capabilities } from '@concord/domain';

export function capabilitiesFor(version: string): Capabilities {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  // Subscribe delivers member status changes up to 0.15.5. Later versions ignore it, and Stoat's
  // Elixir gateway closes a socket that sends it.
  const serverSubscribe = major === 0 && (minor < 15 || (minor === 15 && patch <= 5));
  return { serverSubscribe };
}
