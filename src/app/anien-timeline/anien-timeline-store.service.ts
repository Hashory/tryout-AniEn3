import { Injectable } from '@angular/core';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  Folder,
  Strip,
  YFolder,
  YStrip,
  YStripFields,
  YTimelineEntry,
  YTrack,
  YTrackList,
} from './anien-timeline.types';

type TimelineItem = Strip | Folder;

interface TimelineUpdateMessage {
  type: 'timeline-update';
  data: Folder | null;
}

const DEMO_SEED_VERSION = 2;

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

export type FolderUpdateInput = Partial<Omit<Folder, 'id' | 'type' | 'strips'>>;

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
  parentFolder: YFolder;
  parentTrackList: YTrackList;
  track: YTrack;
  trackIndex: number;
  entryIndex: number;
  item: YTimelineEntry;
}

@Injectable({
  providedIn: 'root',
})
export class YjsTimelineService {
  private readonly doc: Y.Doc;
  private readonly indexeddbProvider: IndexeddbPersistence;
  private readonly broadcastChannel: BroadcastChannel;

  /** The Y.js data structure representing the root folder. */
  private readonly yRootFolder: YFolder;

  private latestSnapshot: Folder | null = null;
  private readonly timelineSubscribers = new Set<(snapshot: Folder | null) => void>();

  constructor() {
    this.doc = new Y.Doc();

    this.indexeddbProvider = new IndexeddbPersistence('anien-timeline-db', this.doc);
    this.broadcastChannel = new BroadcastChannel('anien-timeline-broadcast-channel');

    this.yRootFolder = this.doc.getMap('timelineRoot') as YFolder;

    // Listen for any deep changes within the root folder structure
    this.yRootFolder.observeDeep(() => {
      const newTimelineData = this.convertYToJs(this.yRootFolder);
      if (newTimelineData?.type === 'folder') {
        this.publishSnapshot(newTimelineData);
      } else {
        this.publishSnapshot(null);
      }
    });

    // Wait for the provider to be synced before initializing
    this.indexeddbProvider.whenSynced.then(() => {
      // Check if the timeline is empty *after* syncing with IndexedDB
      if (this.yRootFolder.size === 0) {
        this.initializeEmptyTimeline();
      } else {
        this.ensureDemoSeed();
      }

      // Manually trigger the first snapshot conversion after sync
      // (The observeDeep might not fire if data was loaded silently)
      const initialData = this.convertYToJs(this.yRootFolder);
      if (initialData?.type === 'folder') {
        this.publishSnapshot(initialData);
      } else {
        this.publishSnapshot(null);
      }
    });

    // Broadcast changes to other tabs/windows
    this.doc.on('update', () => {
      // Broadcast the updated timeline state to all clients
      const message: TimelineUpdateMessage = {
        type: 'timeline-update',
        data: this.latestSnapshot,
      };
      this.broadcastChannel.postMessage(message);
    });

    // Listen for updates from other tabs/windows
    this.broadcastChannel.onmessage = (event: MessageEvent<TimelineUpdateMessage>) => {
      const message = event.data;
      if (message.type === 'timeline-update') {
        const incomingData = message.data;
        if (incomingData?.type === 'folder') {
          this.publishSnapshot(incomingData);
        } else {
          this.publishSnapshot(null);
        }
      }
    };
  }

  public subscribeTimeline(listener: (snapshot: Folder | null) => void): () => void {
    this.timelineSubscribers.add(listener);
    listener(this.latestSnapshot);
    return () => {
      this.timelineSubscribers.delete(listener);
    };
  }

  /**
   * Recursively converts a Y.js Map (YFolder or YStrip) into its
   * corresponding plain JavaScript object (Folder or Strip).
   * @param yData The Y.js Map to convert.
   * @returns A plain JS object (Folder, Strip), or null if invalid.
   */
  private convertYToJs(yData: YTimelineEntry): TimelineItem | null {
    const id = yData.get('id');
    const type = yData.get('type');

    if (!id || !type) {
      return null;
    }

    if (type === 'strip' && this.isYStrip(yData)) {
      const source = yData.get('source');
      const startFrame = yData.get('startFrame');
      const length = yData.get('length');

      if (source === undefined || startFrame === undefined || length === undefined) {
        return null;
      }

      const strip: Strip = {
        id,
        type: 'strip',
        source,
        startFrame,
        length,
      };
      return strip;
    }

    if (type === 'folder' && this.isYFolder(yData)) {
      const name = yData.get('name');
      const startFrame = yData.get('startFrame');
      const length = yData.get('length');
      const yTracks: YTrackList | undefined = yData.get('strips');

      if (name === undefined || startFrame === undefined || length === undefined) {
        return null;
      }

      const jsStrips: TimelineItem[][] = yTracks
        ? yTracks.map((yTrack) =>
          yTrack
            .map((yItem) => this.convertYToJs(yItem))
            .filter((item): item is TimelineItem => item !== null),
        )
        : [];

      const folder: Folder = {
        id,
        type: 'folder',
        name,
        startFrame,
        length,
        root: yData.get('root') ?? false,
        strips: jsStrips,
      };
      return folder;
    }

    return null;
  }

  /**
   * Sets up the initial empty structure for the root folder in Y.js.
   */
  private initializeEmptyTimeline(): void {
    this.seedDemoTimeline();
  }

  private ensureDemoSeed(): void {
    const recordedSeedVersion = this.yRootFolder.get('demoSeedVersion') as number | undefined;
    if (typeof recordedSeedVersion === 'number' && recordedSeedVersion >= DEMO_SEED_VERSION) {
      return;
    }
    const rootName = this.yRootFolder.get('name');
    const strips = this.yRootFolder.get('strips') as YTrackList | undefined;
    const trackCount = strips?.length ?? 0;
    if (rootName !== 'Root Timeline' || trackCount > 1) {
      return;
    }
    this.seedDemoTimeline();
  }

  private seedDemoTimeline(): void {
    this.doc.transact(() => {
      const existingId = this.yRootFolder.get('id');
      this.yRootFolder.set('id', existingId ?? crypto.randomUUID());
      this.yRootFolder.set('type', 'folder');
      this.yRootFolder.set('name', 'Root Timeline');
      this.yRootFolder.set('startFrame', 0);
      this.yRootFolder.set('length', 240);
      this.yRootFolder.set('root', true);

      const trackList: YTrackList = new Y.Array<YTrack>();

      const introTrack: YTrack = new Y.Array<YTimelineEntry>();
      const introStrip = new Y.Map<YStripFields>() as YStrip;
      introStrip.set('id', crypto.randomUUID());
      introStrip.set('type', 'strip');
      introStrip.set('source', 'Intro Clip');
      introStrip.set('startFrame', 0);
      introStrip.set('length', 120);
      introTrack.push([introStrip]);

      const montageTrack: YTrack = new Y.Array<YTimelineEntry>();
      const montageStrip = new Y.Map<YStripFields>() as YStrip;
      montageStrip.set('id', crypto.randomUUID());
      montageStrip.set('type', 'strip');
      montageStrip.set('source', 'Montage Sequence');
      montageStrip.set('startFrame', 60);
      montageStrip.set('length', 180);
      montageTrack.push([montageStrip]);

      const nestedFolderTrack: YTrack = new Y.Array<YTimelineEntry>();
      const nestedFolder = new Y.Map() as YFolder;
      nestedFolder.set('id', crypto.randomUUID());
      nestedFolder.set('type', 'folder');
      nestedFolder.set('name', 'B-Roll Folder');
      nestedFolder.set('startFrame', 180);
      nestedFolder.set('length', 220);
      nestedFolder.set('root', false);

      const nestedFolderTracks: YTrackList = new Y.Array<YTrack>();
      const bRollTrack: YTrack = new Y.Array<YTimelineEntry>();
      const bRollStrip = new Y.Map<YStripFields>() as YStrip;
      bRollStrip.set('id', crypto.randomUUID());
      bRollStrip.set('type', 'strip');
      bRollStrip.set('source', 'B-Roll Shot 1');
      bRollStrip.set('startFrame', 0);
      bRollStrip.set('length', 80);
      bRollTrack.push([bRollStrip]);

      const bRollStripAlt = new Y.Map<YStripFields>() as YStrip;
      bRollStripAlt.set('id', crypto.randomUUID());
      bRollStripAlt.set('type', 'strip');
      bRollStripAlt.set('source', 'B-Roll Shot 2');
      bRollStripAlt.set('startFrame', 90);
      bRollStripAlt.set('length', 60);
      bRollTrack.push([bRollStripAlt]);

      const cutawayTrack: YTrack = new Y.Array<YTimelineEntry>();
      const cutawayStrip = new Y.Map<YStripFields>() as YStrip;
      cutawayStrip.set('id', crypto.randomUUID());
      cutawayStrip.set('type', 'strip');
      cutawayStrip.set('source', 'Cutaway Clip');
      cutawayStrip.set('startFrame', 30);
      cutawayStrip.set('length', 50);
      cutawayTrack.push([cutawayStrip]);

      nestedFolderTracks.push([bRollTrack]);
      nestedFolderTracks.push([cutawayTrack]);
      nestedFolder.set('strips', nestedFolderTracks);

      nestedFolderTrack.push([nestedFolder]);

      trackList.push([introTrack, montageTrack, nestedFolderTrack]);

      this.yRootFolder.set('strips', trackList);
      this.yRootFolder.set('demoSeedVersion', DEMO_SEED_VERSION);
    });
  }

  // --- Model (Y.js) Manipulation Methods ---

  /**
   * Returns the latest timeline snapshot that was broadcast to subscribers.
   */
  public getSnapshot(): Folder | null {
    return this.latestSnapshot;
  }

  /**
   * Looks up a timeline item by ID and returns a plain JS clone if it exists.
   */
  public getItemById(itemId: string): TimelineItem | null {
    const location = this.findItemLocationById(itemId);
    if (!location) {
      return null;
    }
    return this.convertYToJs(location.item);
  }

  /**
   * Returns positional metadata for a timeline item, useful for UI placement logic.
   */
  public getItemLocation(itemId: string): ItemLocationDetails | null {
    const location = this.findItemLocationById(itemId);
    if (!location) {
      return null;
    }

    const parentId = (location.parentFolder.get('id') as string | undefined) ?? null;

    return {
      parentFolderId: parentId,
      trackIndex: location.trackIndex,
      entryIndex: location.entryIndex,
      trackLength: location.track.length,
      totalTracks: location.parentTrackList.length,
    };
  }

  /**
   * Adds a track to the specified folder (root folder when omitted).
   * @returns The index at which the track was inserted, or null when the folder was not found.
   */
  public addTrack(folderId?: string, options?: { position?: number }): number | null {
    let createdIndex: number | null = null;
    this.doc.transact(() => {
      const targetFolder = this.getTargetFolder(folderId);
      if (!targetFolder) {
        console.error(`Folder ${folderId ?? 'root'} not found while adding track.`);
        return;
      }

      const trackList = this.ensureTrackList(targetFolder);
      const insertIndex = this.normalizeInsertIndex(options?.position, trackList.length);
      const newTrack: YTrack = new Y.Array<YTimelineEntry>();
      trackList.insert(insertIndex, [newTrack]);
      createdIndex = insertIndex;
    });
    return createdIndex;
  }

  /**
   * Adds a strip to a track, optionally under a nested folder.
   * @returns The created strip ID or null when the target track does not exist.
   */
  public addStripToTrack(
    trackIndex: number,
    stripData: StripCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    let createdId: string | null = null;
    this.doc.transact(() => {
      const targetFolder = this.getTargetFolder(options?.parentFolderId);
      if (!targetFolder) {
        console.error(`Folder ${options?.parentFolderId ?? 'root'} not found while adding strip.`);
        return;
      }

      const trackList = this.ensureTrackList(targetFolder);
      const targetTrack = trackList.get(trackIndex);

      if (!targetTrack) {
        console.error(
          `Track index ${trackIndex} not found in folder ${options?.parentFolderId ?? 'root'}.`,
        );
        return;
      }

      const insertIndex = this.normalizeInsertIndex(options?.position, targetTrack.length);
      const stripId = stripData.id ?? crypto.randomUUID();
      const newYStrip = new Y.Map<YStripFields>() as YStrip;
      newYStrip.set('id', stripId);
      newYStrip.set('type', 'strip');
      newYStrip.set('source', stripData.source);
      newYStrip.set('startFrame', stripData.startFrame);
      newYStrip.set('length', stripData.length);

      targetTrack.insert(insertIndex, [newYStrip]);
      createdId = stripId;
    });
    return createdId;
  }

  /**
   * Creates a nested folder inside the given track.
   * @returns The created folder ID or null when the target could not be resolved.
   */
  public addFolderToTrack(
    trackIndex: number,
    folderData: FolderCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    let createdId: string | null = null;
    this.doc.transact(() => {
      const targetFolder = this.getTargetFolder(options?.parentFolderId);
      if (!targetFolder) {
        console.error(`Folder ${options?.parentFolderId ?? 'root'} not found while adding folder.`);
        return;
      }

      const trackList = this.ensureTrackList(targetFolder);
      const targetTrack = trackList.get(trackIndex);

      if (!targetTrack) {
        console.error(
          `Track index ${trackIndex} not found in folder ${options?.parentFolderId ?? 'root'}.`,
        );
        return;
      }

      const insertIndex = this.normalizeInsertIndex(options?.position, targetTrack.length);
      const folderId = folderData.id ?? crypto.randomUUID();
      const newFolder = new Y.Map() as YFolder;
      newFolder.set('id', folderId);
      newFolder.set('type', 'folder');
      newFolder.set('name', folderData.name);
      newFolder.set('startFrame', folderData.startFrame);
      newFolder.set('length', folderData.length);
      newFolder.set('root', folderData.root ?? false);

      const nestedTracks = new Y.Array<YTrack>();
      const trackCount = folderData.trackCount ?? 0;
      for (let i = 0; i < trackCount; i++) {
        nestedTracks.push([new Y.Array<YTimelineEntry>()]);
      }
      newFolder.set('strips', nestedTracks);

      targetTrack.insert(insertIndex, [newFolder]);
      createdId = folderId;
    });
    return createdId;
  }

  /**
   * Applies partial updates to an existing strip.
   */
  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    if (!updates || Object.keys(updates).length === 0) {
      return false;
    }

    let updated = false;
    this.doc.transact(() => {
      const location = this.findItemLocationById(itemId);
      if (!location) {
        console.warn(`Strip ${itemId} was not found for update.`);
        return;
      }

      if (!this.isYStrip(location.item)) {
        console.error(`Item ${itemId} is not a strip.`);
        return;
      }

      if (updates.source !== undefined) {
        location.item.set('source', updates.source);
        updated = true;
      }
      if (updates.startFrame !== undefined) {
        location.item.set('startFrame', updates.startFrame);
        updated = true;
      }
      if (updates.length !== undefined) {
        location.item.set('length', updates.length);
        updated = true;
      }
    });

    return updated;
  }

  /**
   * Applies partial updates to an existing folder (excluding its strips collection).
   */
  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    if (!updates || Object.keys(updates).length === 0) {
      return false;
    }

    let updated = false;
    this.doc.transact(() => {
      const location = this.findItemLocationById(itemId);
      if (!location) {
        console.warn(`Folder ${itemId} was not found for update.`);
        return;
      }

      if (!this.isYFolder(location.item)) {
        console.error(`Item ${itemId} is not a folder.`);
        return;
      }

      if (updates.name !== undefined) {
        location.item.set('name', updates.name);
        updated = true;
      }
      if (updates.startFrame !== undefined) {
        location.item.set('startFrame', updates.startFrame);
        updated = true;
      }
      if (updates.length !== undefined) {
        location.item.set('length', updates.length);
        updated = true;
      }
      if (updates.root !== undefined) {
        location.item.set('root', updates.root);
        updated = true;
      }
    });

    return updated;
  }

  /**
   * Moves a strip or folder to a different track (or position within the same track).
   */
  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    let moved = false;
    this.doc.transact(() => {
      const location = this.findItemLocationById(itemId);
      if (!location) {
        console.warn(`Item ${itemId} was not found for move.`);
        return;
      }

      const destinationFolder = this.getTargetFolder(target.parentFolderId);
      if (!destinationFolder) {
        console.error(`Folder ${target.parentFolderId ?? 'root'} not found while moving item.`);
        return;
      }

      const destinationTrackList = this.ensureTrackList(destinationFolder);
      const destinationTrack = destinationTrackList.get(target.trackIndex);
      if (!destinationTrack) {
        console.error(
          `Track index ${target.trackIndex} not found in folder ${target.parentFolderId ?? 'root'}.`,
        );
        return;
      }

      const initialLength = destinationTrack.length;
      const desiredIndex = this.normalizeInsertIndex(target.position, initialLength);
      const isSameTrack = destinationTrack === location.track;
      const item = location.item;

      location.track.delete(location.entryIndex, 1);

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

      refreshedDestinationTrack.insert(insertIndex, [item]);
      moved = true;
    });

    return moved;
  }

  /**
   * Removes an item by ID regardless of its parent folder/track.
   */
  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    let deleted = false;
    this.doc.transact(() => {
      const location = this.findItemLocationById(itemId);
      if (!location) {
        console.warn(`Item ${itemId} was not found for deletion.`);
        return;
      }

      if (options?.parentFolderId) {
        const parentId = location.parentFolder.get('id');
        if (parentId !== options.parentFolderId) {
          console.warn(
            `Item ${itemId} was found in a different folder (${parentId ?? 'unknown'}) than expected ${options.parentFolderId}.`,
          );
          return;
        }
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

      location.track.delete(location.entryIndex, 1);
      deleted = true;
    });

    return deleted;
  }

  /**
   * @deprecated Prefer using deleteItem and specifying parentFolderId/expectedTrackIndex if needed.
   */
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

  private getTargetFolder(folderId?: string): YFolder | null {
    if (!folderId) {
      return this.yRootFolder;
    }

    const rootId = this.yRootFolder.get('id');
    if (rootId === folderId) {
      return this.yRootFolder;
    }

    const rootTracks = this.yRootFolder.get('strips') as YTrackList | undefined;
    if (!rootTracks) {
      return null;
    }

    return this.findFolderInTracks(rootTracks, folderId);
  }

  private ensureTrackList(folder: YFolder): YTrackList {
    let trackList = folder.get('strips') as YTrackList | undefined;
    if (!trackList) {
      trackList = new Y.Array<YTrack>();
      folder.set('strips', trackList);
    }
    return trackList;
  }

  private findFolderInTracks(trackList: YTrackList, folderId: string): YFolder | null {
    for (let trackIndex = 0; trackIndex < trackList.length; trackIndex++) {
      const track = trackList.get(trackIndex);
      if (!track) {
        continue;
      }

      for (let entryIndex = 0; entryIndex < track.length; entryIndex++) {
        const entry = track.get(entryIndex);
        if (!entry || !this.isYFolder(entry)) {
          continue;
        }

        const entryId = entry.get('id');
        if (entryId === folderId) {
          return entry;
        }

        const nestedTracks = entry.get('strips') as YTrackList | undefined;
        if (!nestedTracks) {
          continue;
        }

        const nestedMatch = this.findFolderInTracks(nestedTracks, folderId);
        if (nestedMatch) {
          return nestedMatch;
        }
      }
    }

    return null;
  }

  private findItemLocationById(
    itemId: string,
    trackList: YTrackList | undefined = this.yRootFolder.get('strips') as YTrackList | undefined,
    parentFolder: YFolder = this.yRootFolder,
  ): ItemLocation | null {
    if (!trackList) {
      return null;
    }

    for (let trackIndex = 0; trackIndex < trackList.length; trackIndex++) {
      const track = trackList.get(trackIndex);
      if (!track) {
        continue;
      }

      for (let entryIndex = 0; entryIndex < track.length; entryIndex++) {
        const entry = track.get(entryIndex);
        if (!entry) {
          continue;
        }

        const entryId = entry.get('id');
        if (typeof entryId === 'string' && entryId === itemId) {
          return {
            parentFolder,
            parentTrackList: trackList,
            track,
            trackIndex,
            entryIndex,
            item: entry,
          };
        }

        if (this.isYFolder(entry)) {
          const nestedTracks = entry.get('strips') as YTrackList | undefined;
          const nestedLocation = this.findItemLocationById(itemId, nestedTracks, entry);
          if (nestedLocation) {
            return nestedLocation;
          }
        }
      }
    }

    return null;
  }

  private normalizeInsertIndex(position: number | undefined, length: number): number {
    if (position === undefined) {
      return length;
    }
    if (Number.isNaN(position)) {
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

  private isYStrip(value: YTimelineEntry | undefined): value is YStrip {
    return value?.get('type') === 'strip';
  }

  private isYFolder(value: YTimelineEntry | undefined): value is YFolder {
    return value?.get('type') === 'folder';
  }

  private publishSnapshot(snapshot: Folder | null): void {
    this.latestSnapshot = snapshot;
    for (const listener of this.timelineSubscribers) {
      listener(snapshot);
    }
  }
}
