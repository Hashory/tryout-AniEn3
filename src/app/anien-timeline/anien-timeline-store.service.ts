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
   * Adds a new, empty track to the root folder.
   */
  public addTrack(): void {
    this.doc.transact(() => {
      const yTracks: YTrackList | undefined = this.yRootFolder.get('strips');

      if (!yTracks) {
        console.error('Root tracks collection not initialized.');
        return;
      }
      // A new track is an empty Y.Array
      const newTrack: YTrack = new Y.Array<YTimelineEntry>();
      yTracks.push([newTrack]);
    });
  }

  /**
   * Adds a new strip to a specific track in the root folder.
   * @param trackIndex The index of the track to add to.
   * @param stripData Basic data for the new strip.
   */
  public addStripToTrack(
    trackIndex: number,
    stripData: {
      source: string;
      startFrame: number;
      length: number;
    },
  ): void {
    this.doc.transact(() => {
      const yTracks: YTrackList | undefined = this.yRootFolder.get('strips');

      if (!yTracks) {
        console.error('Root tracks collection not initialized.');
        return;
      }
      const targetTrack = yTracks.get(trackIndex); // This is a YTrack (Y.Array)

      if (!targetTrack) {
        console.error(`Track index ${trackIndex} not found.`);
        return;
      }

      const newYStrip = new Y.Map<YStripFields>() as YStrip;
      newYStrip.set('id', crypto.randomUUID());
      newYStrip.set('type', 'strip');
      newYStrip.set('source', stripData.source);
      newYStrip.set('startFrame', stripData.startFrame);
      newYStrip.set('length', stripData.length);

      // Add the new Y.Map to the Y.Array representing the track
      targetTrack.push([newYStrip]);
    });
  }

  /**
   * Deletes an item (Strip or Folder) from a track.
   * @param trackIndex The index of the track containing the item.
   * @param itemId The unique ID of the item to delete.
   */
  public deleteItemFromTrack(trackIndex: number, itemId: string): void {
    this.doc.transact(() => {
      const yTracks: YTrackList | undefined = this.yRootFolder.get('strips');

      if (!yTracks) {
        console.error('Root tracks collection not initialized.');
        return;
      }
      const targetTrack = yTracks.get(trackIndex); // YTrack

      if (!targetTrack) {
        console.error(`Track index ${trackIndex} not found.`);
        return;
      }

      // Find the index of the item with the matching ID
      let itemIndex = -1;
      for (let i = 0; i < targetTrack.length; i++) {
        const item = targetTrack.get(i);
        if (!item) {
          continue;
        }
        if (item.get('id') === itemId) {
          itemIndex = i;
          break;
        }
      }

      if (itemIndex > -1) {
        targetTrack.delete(itemIndex, 1);
      } else {
        console.warn(`Item with id ${itemId} not found in track ${trackIndex}.`);
      }
    });
  }

  // ... Other CRUD methods (moveItem, updateItem, createNestedFolder, etc.)
  // would be implemented here, all manipulating the Y.js data directly.

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
