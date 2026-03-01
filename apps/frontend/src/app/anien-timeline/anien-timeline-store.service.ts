import { Injectable } from '@angular/core';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  FlatTimelineSnapshot,
  Folder,
  Strip,
  TimelineEntity,
  YEntitiesMap,
  YEntity,
  YEntityFields,
  YFolderTracksMap,
  YTrackIdList,
  YTrackList,
} from './anien-timeline.types';

interface TimelineUpdateMessage {
  type: 'timeline-update';
  data: FlatTimelineSnapshot | null;
}

const DEMO_SEED_VERSION = 3;
const FLAT_SCHEMA_VERSION = 1;

export interface StripCreationInput {
  id?: string;
  source: string;
  startFrame: number;
  length: number;
}

export interface FolderCreationInput {
  id?: string;
  name: string;
  startFrame: number;
  length: number;
  root?: boolean;
  trackCount?: number;
}

export type StripUpdateInput = Partial<Omit<Strip, 'id' | 'type'>>;

export type FolderUpdateInput = Partial<Omit<Folder, 'id' | 'type'>>;

export interface MoveTargetInput {
  parentFolderId?: string;
  trackIndex: number;
  position?: number;
}

export interface DeleteItemOptions {
  parentFolderId?: string;
  expectedTrackIndex?: number;
}

export interface ItemLocationDetails {
  parentFolderId: string | null;
  trackIndex: number;
  entryIndex: number;
  trackLength: number;
  totalTracks: number;
}

interface ItemLocation {
  parentFolderId: string;
  trackIndex: number;
  entryIndex: number;
}

@Injectable({
  providedIn: 'root',
})
export class YjsTimelineService {
  private readonly doc: Y.Doc;
  private readonly indexeddbProvider: IndexeddbPersistence;
  private readonly broadcastChannel: BroadcastChannel;

  private readonly yRoot: Y.Map<unknown>;
  private readonly yEntities: YEntitiesMap;
  private readonly yFolderTracks: YFolderTracksMap;

  private latestSnapshot: FlatTimelineSnapshot | null = null;
  private readonly timelineSubscribers = new Set<(snapshot: FlatTimelineSnapshot | null) => void>();

  constructor() {
    this.doc = new Y.Doc();

    this.indexeddbProvider = new IndexeddbPersistence('anien-timeline-db', this.doc);
    this.broadcastChannel = new BroadcastChannel('anien-timeline-broadcast-channel');

    this.yRoot = this.doc.getMap('timelineRoot');
    this.yEntities = this.doc.getMap('timelineEntities') as YEntitiesMap;
    this.yFolderTracks = this.doc.getMap('timelineFolderTracks') as YFolderTracksMap;

    const handleSnapshotUpdate = () => {
      this.publishSnapshot(this.buildSnapshot());
    };

    this.yEntities.observeDeep(handleSnapshotUpdate);
    this.yFolderTracks.observeDeep(handleSnapshotUpdate);
    this.yRoot.observe(handleSnapshotUpdate);

    this.indexeddbProvider.whenSynced.then(() => {
      this.ensureFlatSchema();
      this.publishSnapshot(this.buildSnapshot());
    });

    this.doc.on('update', () => {
      const message: TimelineUpdateMessage = {
        type: 'timeline-update',
        data: this.latestSnapshot,
      };
      this.broadcastChannel.postMessage(message);
    });

    this.broadcastChannel.onmessage = (event: MessageEvent<TimelineUpdateMessage>) => {
      const message = event.data;
      if (message.type === 'timeline-update') {
        this.publishSnapshot(message.data ?? null);
      }
    };
  }

  public subscribeTimeline(listener: (snapshot: FlatTimelineSnapshot | null) => void): () => void {
    this.timelineSubscribers.add(listener);
    listener(this.latestSnapshot);
    return () => {
      this.timelineSubscribers.delete(listener);
    };
  }

  public getSnapshot(): FlatTimelineSnapshot | null {
    return this.latestSnapshot;
  }

  public getItemById(itemId: string): TimelineEntity | null {
    const entity = this.yEntities.get(itemId);
    if (!entity) {
      return null;
    }
    return this.convertEntityToJs(entity);
  }

  public getItemLocation(itemId: string): ItemLocationDetails | null {
    const location = this.findItemLocationById(itemId);
    if (!location) {
      return null;
    }

    const trackList = this.yFolderTracks.get(location.parentFolderId);
    const trackLength = trackList?.get(location.trackIndex)?.length ?? 0;
    const totalTracks = trackList?.length ?? 0;

    return {
      parentFolderId: location.parentFolderId ?? null,
      trackIndex: location.trackIndex,
      entryIndex: location.entryIndex,
      trackLength,
      totalTracks,
    };
  }

  public addTrack(folderId?: string, options?: { position?: number }): number | null {
    let createdIndex: number | null = null;
    this.doc.transact(() => {
      const targetFolderId = this.resolveFolderId(folderId);
      if (!targetFolderId) {
        console.error(`Folder ${folderId ?? 'root'} not found while adding track.`);
        return;
      }

      const trackList = this.ensureTrackList(targetFolderId);
      const insertIndex = this.normalizeInsertIndex(options?.position, trackList.length);
      const newTrack: YTrackIdList = new Y.Array<string>();
      trackList.insert(insertIndex, [newTrack]);
      createdIndex = insertIndex;
    });
    return createdIndex;
  }

  public addStripToTrack(
    trackIndex: number,
    stripData: StripCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    let createdId: string | null = null;
    this.doc.transact(() => {
      const targetFolderId = this.resolveFolderId(options?.parentFolderId);
      if (!targetFolderId) {
        console.error(`Folder ${options?.parentFolderId ?? 'root'} not found while adding strip.`);
        return;
      }

      const trackList = this.ensureTrackList(targetFolderId);
      const targetTrack = trackList.get(trackIndex);

      if (!targetTrack) {
        console.error(
          `Track index ${trackIndex} not found in folder ${options?.parentFolderId ?? 'root'}.`,
        );
        return;
      }

      const insertIndex = this.normalizeInsertIndex(options?.position, targetTrack.length);
      const stripId = stripData.id ?? crypto.randomUUID();
      const newStrip = new Y.Map<YEntityFields>() as YEntity;
      newStrip.set('id', stripId);
      newStrip.set('type', 'strip');
      newStrip.set('source', stripData.source);
      newStrip.set('startFrame', stripData.startFrame);
      newStrip.set('length', stripData.length);

      this.yEntities.set(stripId, newStrip);
      targetTrack.insert(insertIndex, [stripId]);
      createdId = stripId;
    });
    return createdId;
  }

  public addFolderToTrack(
    trackIndex: number,
    folderData: FolderCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    let createdId: string | null = null;
    this.doc.transact(() => {
      const targetFolderId = this.resolveFolderId(options?.parentFolderId);
      if (!targetFolderId) {
        console.error(`Folder ${options?.parentFolderId ?? 'root'} not found while adding folder.`);
        return;
      }

      const trackList = this.ensureTrackList(targetFolderId);
      const targetTrack = trackList.get(trackIndex);

      if (!targetTrack) {
        console.error(
          `Track index ${trackIndex} not found in folder ${options?.parentFolderId ?? 'root'}.`,
        );
        return;
      }

      const insertIndex = this.normalizeInsertIndex(options?.position, targetTrack.length);
      const folderId = folderData.id ?? crypto.randomUUID();
      const newFolder = new Y.Map<YEntityFields>() as YEntity;
      newFolder.set('id', folderId);
      newFolder.set('type', 'folder');
      newFolder.set('name', folderData.name);
      newFolder.set('startFrame', folderData.startFrame);
      newFolder.set('length', folderData.length);
      newFolder.set('root', folderData.root ?? false);

      this.yEntities.set(folderId, newFolder);

      const nestedTracks = new Y.Array<YTrackIdList>();
      const trackCount = folderData.trackCount ?? 0;
      for (let i = 0; i < trackCount; i++) {
        nestedTracks.push([new Y.Array<string>()]);
      }
      this.yFolderTracks.set(folderId, nestedTracks);

      targetTrack.insert(insertIndex, [folderId]);
      createdId = folderId;
    });
    return createdId;
  }

  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    if (!updates || Object.keys(updates).length === 0) {
      return false;
    }

    let updated = false;
    this.doc.transact(() => {
      const entity = this.yEntities.get(itemId);
      if (!entity || entity.get('type') !== 'strip') {
        console.warn(`Strip ${itemId} was not found for update.`);
        return;
      }

      if (updates.source !== undefined) {
        entity.set('source', updates.source);
        updated = true;
      }
      if (updates.startFrame !== undefined) {
        entity.set('startFrame', updates.startFrame);
        updated = true;
      }
      if (updates.length !== undefined) {
        entity.set('length', updates.length);
        updated = true;
      }
    });

    return updated;
  }

  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    if (!updates || Object.keys(updates).length === 0) {
      return false;
    }

    let updated = false;
    this.doc.transact(() => {
      const entity = this.yEntities.get(itemId);
      if (!entity || entity.get('type') !== 'folder') {
        console.warn(`Folder ${itemId} was not found for update.`);
        return;
      }

      if (updates.name !== undefined) {
        entity.set('name', updates.name);
        updated = true;
      }
      if (updates.startFrame !== undefined) {
        entity.set('startFrame', updates.startFrame);
        updated = true;
      }
      if (updates.length !== undefined) {
        entity.set('length', updates.length);
        updated = true;
      }
      if (updates.root !== undefined) {
        entity.set('root', updates.root);
        updated = true;
      }
    });

    return updated;
  }

  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    let moved = false;
    this.doc.transact(() => {
      const location = this.findItemLocationById(itemId);
      if (!location) {
        console.warn(`Item ${itemId} was not found for move.`);
        return;
      }

      const destinationFolderId = this.resolveFolderId(target.parentFolderId);
      if (!destinationFolderId) {
        console.error(`Folder ${target.parentFolderId ?? 'root'} not found while moving item.`);
        return;
      }

      const destinationTrackList = this.ensureTrackList(destinationFolderId);
      const destinationTrack = destinationTrackList.get(target.trackIndex);
      if (!destinationTrack) {
        console.error(
          `Track index ${target.trackIndex} not found in folder ${target.parentFolderId ?? 'root'}.`,
        );
        return;
      }

      const initialLength = destinationTrack.length;
      const desiredIndex = this.normalizeInsertIndex(target.position, initialLength);
      const isSameFolder = destinationFolderId === location.parentFolderId;
      const isSameTrack = isSameFolder && target.trackIndex === location.trackIndex;

      const sourceTracks = this.yFolderTracks.get(location.parentFolderId);
      const sourceTrack = sourceTracks?.get(location.trackIndex);
      if (!sourceTrack) {
        console.error('Source track was not found during move.');
        return;
      }

      sourceTrack.delete(location.entryIndex, 1);

      const refreshedDestinationTrack = destinationTrackList.get(target.trackIndex);
      if (!refreshedDestinationTrack) {
        console.error('Destination track became unavailable after removal.');
        return;
      }

      let insertIndex = desiredIndex;
      if (isSameTrack && insertIndex > location.entryIndex) {
        insertIndex -= 1;
      }
      insertIndex = this.clampInsertIndex(insertIndex, refreshedDestinationTrack.length);

      refreshedDestinationTrack.insert(insertIndex, [itemId]);
      moved = true;
    });

    return moved;
  }

  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    let deleted = false;
    this.doc.transact(() => {
      const location = this.findItemLocationById(itemId);
      if (!location) {
        console.warn(`Item ${itemId} was not found for deletion.`);
        return;
      }

      if (options?.parentFolderId && location.parentFolderId !== options.parentFolderId) {
        console.warn(
          `Item ${itemId} was found in a different folder (${location.parentFolderId ?? 'unknown'}) than expected ${options.parentFolderId}.`,
        );
        return;
      }

      if (
        options?.expectedTrackIndex !== undefined &&
        location.trackIndex !== options.expectedTrackIndex
      ) {
        console.warn(
          `Item ${itemId} was found in track ${location.trackIndex} but expected track ${options.expectedTrackIndex}.`,
        );
        return;
      }

      const parentTracks = this.yFolderTracks.get(location.parentFolderId);
      const parentTrack = parentTracks?.get(location.trackIndex);
      if (!parentTrack) {
        console.warn(`Parent track missing while deleting item ${itemId}.`);
        return;
      }

      parentTrack.delete(location.entryIndex, 1);
      this.deleteEntityAndDescendants(itemId);
      deleted = true;
    });

    return deleted;
  }

  public deleteItemFromTrack(
    trackIndex: number,
    itemId: string,
    options?: { parentFolderId?: string },
  ): boolean {
    return this.deleteItem(itemId, {
      expectedTrackIndex: trackIndex,
      parentFolderId: options?.parentFolderId,
    });
  }

  private ensureFlatSchema(): void {
    const schemaVersion = this.yRoot.get('schemaVersion');
    const rootId = this.yRoot.get('rootId');
    if (schemaVersion === FLAT_SCHEMA_VERSION && typeof rootId === 'string') {
      return;
    }

    this.doc.transact(() => {
      this.yEntities.clear();
      this.yFolderTracks.clear();
      this.yRoot.clear();
      this.seedDemoTimeline();
      this.yRoot.set('schemaVersion', FLAT_SCHEMA_VERSION);
    });
  }

  private seedDemoTimeline(): void {
    const rootId = crypto.randomUUID();
    const rootEntity = new Y.Map<YEntityFields>() as YEntity;
    rootEntity.set('id', rootId);
    rootEntity.set('type', 'folder');
    rootEntity.set('name', 'Root Timeline');
    rootEntity.set('startFrame', 0);
    rootEntity.set('length', 240);
    rootEntity.set('root', true);

    const introStripId = crypto.randomUUID();
    const introStrip = new Y.Map<YEntityFields>() as YEntity;
    introStrip.set('id', introStripId);
    introStrip.set('type', 'strip');
    introStrip.set('source', 'Intro Clip');
    introStrip.set('startFrame', 0);
    introStrip.set('length', 120);

    const montageStripId = crypto.randomUUID();
    const montageStrip = new Y.Map<YEntityFields>() as YEntity;
    montageStrip.set('id', montageStripId);
    montageStrip.set('type', 'strip');
    montageStrip.set('source', 'Montage Sequence');
    montageStrip.set('startFrame', 60);
    montageStrip.set('length', 180);

    const nestedFolderId = crypto.randomUUID();
    const nestedFolder = new Y.Map<YEntityFields>() as YEntity;
    nestedFolder.set('id', nestedFolderId);
    nestedFolder.set('type', 'folder');
    nestedFolder.set('name', 'B-Roll Folder');
    nestedFolder.set('startFrame', 180);
    nestedFolder.set('length', 220);
    nestedFolder.set('root', false);

    const bRollStripId = crypto.randomUUID();
    const bRollStrip = new Y.Map<YEntityFields>() as YEntity;
    bRollStrip.set('id', bRollStripId);
    bRollStrip.set('type', 'strip');
    bRollStrip.set('source', 'B-Roll Shot 1');
    bRollStrip.set('startFrame', 0);
    bRollStrip.set('length', 80);

    const bRollStripAltId = crypto.randomUUID();
    const bRollStripAlt = new Y.Map<YEntityFields>() as YEntity;
    bRollStripAlt.set('id', bRollStripAltId);
    bRollStripAlt.set('type', 'strip');
    bRollStripAlt.set('source', 'B-Roll Shot 2');
    bRollStripAlt.set('startFrame', 90);
    bRollStripAlt.set('length', 60);

    const cutawayStripId = crypto.randomUUID();
    const cutawayStrip = new Y.Map<YEntityFields>() as YEntity;
    cutawayStrip.set('id', cutawayStripId);
    cutawayStrip.set('type', 'strip');
    cutawayStrip.set('source', 'Cutaway Clip');
    cutawayStrip.set('startFrame', 30);
    cutawayStrip.set('length', 50);

    const rootTracks = new Y.Array<YTrackIdList>();
    const introTrack = new Y.Array<string>();
    introTrack.push([introStripId]);
    const montageTrack = new Y.Array<string>();
    montageTrack.push([montageStripId]);
    const nestedFolderTrack = new Y.Array<string>();
    nestedFolderTrack.push([nestedFolderId]);
    rootTracks.push([introTrack, montageTrack, nestedFolderTrack]);

    const nestedTracks = new Y.Array<YTrackIdList>();
    const bRollTrack = new Y.Array<string>();
    bRollTrack.push([bRollStripId, bRollStripAltId]);
    const cutawayTrack = new Y.Array<string>();
    cutawayTrack.push([cutawayStripId]);
    nestedTracks.push([bRollTrack, cutawayTrack]);

    this.yEntities.set(rootId, rootEntity);
    this.yEntities.set(introStripId, introStrip);
    this.yEntities.set(montageStripId, montageStrip);
    this.yEntities.set(nestedFolderId, nestedFolder);
    this.yEntities.set(bRollStripId, bRollStrip);
    this.yEntities.set(bRollStripAltId, bRollStripAlt);
    this.yEntities.set(cutawayStripId, cutawayStrip);

    this.yFolderTracks.set(rootId, rootTracks);
    this.yFolderTracks.set(nestedFolderId, nestedTracks);

    this.yRoot.set('rootId', rootId);
    this.yRoot.set('demoSeedVersion', DEMO_SEED_VERSION);
  }

  private resolveFolderId(folderId?: string): string | null {
    if (!folderId) {
      const rootId = this.yRoot.get('rootId');
      return typeof rootId === 'string' ? rootId : null;
    }
    return this.yEntities.has(folderId) ? folderId : null;
  }

  private ensureTrackList(folderId: string): YTrackList {
    let trackList = this.yFolderTracks.get(folderId);
    if (!trackList) {
      trackList = new Y.Array<YTrackIdList>();
      this.yFolderTracks.set(folderId, trackList);
    }
    return trackList;
  }

  private findItemLocationById(itemId: string): ItemLocation | null {
    for (const [folderId, trackList] of this.yFolderTracks.entries()) {
      for (let trackIndex = 0; trackIndex < trackList.length; trackIndex++) {
        const track = trackList.get(trackIndex);
        if (!track) {
          continue;
        }

        for (let entryIndex = 0; entryIndex < track.length; entryIndex++) {
          const entryId = track.get(entryIndex);
          if (entryId === itemId) {
            return {
              parentFolderId: folderId,
              trackIndex,
              entryIndex,
            };
          }
        }
      }
    }

    return null;
  }

  private deleteEntityAndDescendants(itemId: string): void {
    const entity = this.yEntities.get(itemId);
    if (!entity) {
      return;
    }

    if (entity.get('type') === 'folder') {
      const trackList = this.yFolderTracks.get(itemId);
      if (trackList) {
        const childIds = new Set<string>();
        for (const track of trackList.toArray()) {
          for (const entryId of track.toArray()) {
            childIds.add(entryId);
          }
        }
        for (const childId of childIds) {
          this.deleteEntityAndDescendants(childId);
        }
      }
      this.yFolderTracks.delete(itemId);
    }

    this.yEntities.delete(itemId);
  }

  private convertEntityToJs(entity: YEntity): TimelineEntity | null {
    const id = entity.get('id');
    const type = entity.get('type');
    if (typeof id !== 'string' || !type) {
      return null;
    }

    if (type === 'strip') {
      const source = entity.get('source');
      const startFrame = entity.get('startFrame');
      const length = entity.get('length');
      if (
        typeof source !== 'string' ||
        typeof startFrame !== 'number' ||
        typeof length !== 'number'
      ) {
        return null;
      }
      return {
        id,
        type: 'strip',
        source,
        startFrame,
        length,
      };
    }

    if (type === 'folder') {
      const name = entity.get('name');
      const startFrame = entity.get('startFrame');
      const length = entity.get('length');
      if (
        typeof name !== 'string' ||
        typeof startFrame !== 'number' ||
        typeof length !== 'number'
      ) {
        return null;
      }
      const root = entity.get('root');
      const rootFlag = typeof root === 'boolean' ? root : false;
      return {
        id,
        type: 'folder',
        name,
        startFrame,
        length,
        root: rootFlag,
      };
    }

    return null;
  }

  private buildSnapshot(): FlatTimelineSnapshot | null {
    const rootId = this.yRoot.get('rootId');
    if (typeof rootId !== 'string' || !rootId) {
      return null;
    }

    const entities: Record<string, TimelineEntity> = {};
    for (const [id, entity] of this.yEntities.entries()) {
      const parsed = this.convertEntityToJs(entity);
      if (parsed) {
        entities[id] = parsed;
      }
    }

    const folderTracks: Record<string, string[][]> = {};
    for (const [folderId, trackList] of this.yFolderTracks.entries()) {
      const tracks = trackList.map((track) => track.toArray());
      folderTracks[folderId] = tracks;
    }

    return {
      rootId,
      entities,
      folderTracks,
    };
  }

  private normalizeInsertIndex(position: number | undefined, length: number): number {
    if (position === undefined || Number.isNaN(position)) {
      return length;
    }
    if (position < 0) {
      return 0;
    }
    if (position > length) {
      return length;
    }
    return Math.floor(position);
  }

  private clampInsertIndex(index: number, length: number): number {
    if (index < 0) {
      return 0;
    }
    if (index > length) {
      return length;
    }
    return index;
  }

  private publishSnapshot(snapshot: FlatTimelineSnapshot | null): void {
    this.latestSnapshot = snapshot;
    for (const listener of this.timelineSubscribers) {
      listener(snapshot);
    }
  }
}
