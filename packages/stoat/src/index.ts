/** Browser entry for the Stoat adapter. Fixtures and the recorder live under ./fixtures and never ship. */
export { StoatBackend } from './backend.ts';
export { LiveTransport } from './live.ts';
export { StoatError } from './rest.ts';
export { capabilitiesFor } from './capabilities.ts';
export { fileUrl } from './map/file.ts';
export type { Transport } from './transport.ts';
