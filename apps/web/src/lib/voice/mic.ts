/**
 * The microphone for a call (client.md section 10.4): the chain from ./audio/, built from this device's voice
 * settings, rebuilt piece by piece when they change, and opened by the push-to-talk key in that mode.
 */
import { createMicChain, listenPushToTalk, type MicChain } from './audio/index.ts';
import { loadVoiceSettings, onVoiceSettings, type VoiceSettings } from './settings.ts';

export type { MicChain };

/** A chain that follows the settings until stopped. */
export async function openMic(): Promise<MicChain> {
  const chain = await createMicChain(loadVoiceSettings());
  let stopKey = () => {};
  const keys = (s: VoiceSettings) => {
    stopKey();
    stopKey = s.inputMode === 'ptt' && s.pushToTalkKey ? listenPushToTalk(s.pushToTalkKey.code, (down) => chain.setPushToTalk(down)) : () => {};
  };
  keys(loadVoiceSettings());
  const stopSettings = onVoiceSettings((s) => {
    keys(s);
    void chain.update(s).catch(() => {});
  });
  return {
    ...chain,
    stop() {
      stopSettings();
      stopKey();
      chain.stop();
    },
  };
}
