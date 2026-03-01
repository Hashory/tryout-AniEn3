import type * as Y from 'yjs';
import type { TypedMap } from 'yjs-types';

/**
 * Represents a single media strip on the timeline.
 */
export interface Strip {
  /** A unique identifier for the strip. */
  id: string;
  /** The media source path or identifier. */
  source: string;
  /** The frame number where this strip begins within its track. */
  startFrame: number;
  /** The length of the strip in frames. */
  length: number;
  /** The type identifier for this object. */
  type: 'strip';
}

/**
 * Represents a folder or a track container in the timeline.
 * Folders can be nested.
 */
export interface Folder {
  /** A unique identifier for the folder. */
  id: string;
  /** The display name of the folder. */
  name: string;
  /** The frame number where this folder begins in its parent context. */
  startFrame: number;
  /** The total length of the folder in frames. */
  length: number;
  /** Indicates if this is the root folder. */
  root?: boolean;
  /** The type identifier for this object. */
  type: 'folder';
}

export type TimelineEntity = Strip | Folder;

export interface FlatTimelineSnapshot {
  rootId: string;
  entities: Record<string, TimelineEntity>;
  folderTracks: Record<string, string[][]>;
}

export type YEntityFields = TimelineEntity & Record<string, unknown>;

export type YEntity = TypedMap<YEntityFields>;

export type YEntitiesMap = Y.Map<YEntity>;

export type YTrackIdList = Y.Array<string>;

export type YTrackList = Y.Array<YTrackIdList>;

export type YFolderTracksMap = Y.Map<YTrackList>;
