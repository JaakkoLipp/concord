/**
 * Concord's own layer (architecture section 11), as Backend is for Stoat: what Concord keeps that Stoat has no
 * place for. Implementations throw BackendError for every refusal, and sign out only on the layer's own 401.
 */
import type { Id } from './entities.ts';

/** Our own gates, beside Stoat's permissions. */
export interface LayerGates {
  /** On ADMIN_USER_IDS, for the admin panel. */
  admin: boolean;
  /** On Stoat's server-creator list. */
  serverCreator: boolean;
}

export interface LayerMe {
  id: Id;
  gates: LayerGates;
}

export interface Layer {
  me(): Promise<LayerMe>;
}
