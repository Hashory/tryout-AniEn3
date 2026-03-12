import type * as Y from 'yjs';
import type { TypedMap } from 'yjs-types';

export const TIMELINE_SCHEMA_VERSION = 1;
export const TIMELINE_NORMALIZE_VERSION = 1;
export const DEFAULT_TIME_SCALE = 141_120_000;

export interface TimelineRoot {
  schemaVersion: 1;
  rootFolderSourceId: string;
  timeScale: number;
  nextOrdinal: number;
  normalizeVersion: 1;
}

export interface StripSource {
  id: string;
  type: 'strip-source';
  kind: 'media' | 'generated' | 'solid' | 'unknown';
  name: string;
  availableDurationTicks?: number;
  metadata?: Record<string, unknown>;
}

export interface FolderSourceRecord {
  id: string;
  type: 'folder-source';
  name: string;
  bodyTrackCount: number;
}

export interface FolderSource extends FolderSourceRecord {
  childPlacementIds: string[];
}

export interface StripPlacement {
  id: string;
  type: 'strip-placement';
  sourceId: string;
  sourceOffsetTicks: number;
  durationTicks: number;
  startTick: number;
  startRow: number;
  laneSpan: number;
  ordinal: number;
}

export interface FolderPlacement {
  id: string;
  type: 'folder-placement';
  sourceId: string;
  durationTicks: number;
  startTick: number;
  startRow: number;
  ordinal: number;
}

export type Placement = StripPlacement | FolderPlacement;

export interface TimelineSnapshot {
  root: TimelineRoot;
  stripSources: Record<string, StripSource>;
  folderSources: Record<string, FolderSource>;
  folderChildren: Record<string, string[]>;
  placements: Record<string, Placement>;
}

export interface StripItemSnapshot {
  id: string;
  type: 'strip';
  sourceId: string;
  sourceName: string;
  sourceKind: StripSource['kind'];
  availableDurationTicks?: number;
  sourceOffsetTicks: number;
  durationTicks: number;
  startTick: number;
  startRow: number;
  laneSpan: number;
  ordinal: number;
  parentFolderSourceId: string | null;
}

export interface FolderItemSnapshot {
  id: string;
  type: 'folder';
  sourceId: string;
  name: string;
  bodyTrackCount: number;
  durationTicks: number;
  startTick: number;
  startRow: number;
  ordinal: number;
  parentFolderSourceId: string | null;
}

export type TimelineItemSnapshot = StripItemSnapshot | FolderItemSnapshot;

export type YTimelineRootFields = TimelineRoot & Record<string, unknown>;
export type YStripSourceFields = StripSource & Record<string, unknown>;
export type YFolderSourceFields = FolderSourceRecord & Record<string, unknown>;
export type YStripPlacementFields = StripPlacement & Record<string, unknown>;
export type YFolderPlacementFields = FolderPlacement & Record<string, unknown>;

export type YTimelineRoot = TypedMap<YTimelineRootFields>;
export type YStripSourceMap = TypedMap<YStripSourceFields>;
export type YFolderSourceMap = TypedMap<YFolderSourceFields>;
export type YPlacementMap = TypedMap<
  (YStripPlacementFields | YFolderPlacementFields) & Record<string, unknown>
>;

export type YStripSourcesMap = Y.Map<YStripSourceMap>;
export type YFolderSourcesMap = Y.Map<YFolderSourceMap>;
export type YFolderChildrenArray = Y.Array<string>;
export type YFolderChildrenMap = Y.Map<YFolderChildrenArray>;
export type YPlacementsMap = Y.Map<YPlacementMap>;
