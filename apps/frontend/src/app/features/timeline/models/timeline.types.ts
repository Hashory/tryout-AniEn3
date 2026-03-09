import type * as Y from 'yjs';
import type { TypedMap } from 'yjs-types';

export interface Strip {
  id: string;
  source: string;
  startFrame: number;
  length: number;
  type: 'strip';
}

export interface Folder {
  id: string;
  name: string;
  startFrame: number;
  length: number;
  root?: boolean;
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
