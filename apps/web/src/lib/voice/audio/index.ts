/** The microphone chain and output helpers, for the voice controller (client.md sections 10.4 and 10.5). */
export { createMicChain, type MicChain } from './chain.ts';
export { listDevices, maxOutputVolume, outputSelectable, playTrack, webAudioOutput, type Playback } from './output.ts';
export { listenPushToTalk } from './ptt.ts';
