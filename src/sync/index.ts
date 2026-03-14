/**
 * ANIMA 6 Sync System
 *
 * Distributed brain sync + workspace sync for multi-agent organizations.
 */

export {
  BrainSyncEngine,
  type VectorClock,
  type SyncEvent,
  type SyncEventType,
  type SyncState,
  type SyncDelta,
} from "./brain-sync.js";

export {
  WorkspaceSyncer,
  BlobStore,
  type WorkspaceSnapshot,
  type FileEntry,
  type SyncManifest,
  type WorkspaceConfig,
} from "./workspace-sync.js";
