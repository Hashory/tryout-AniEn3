import { Injectable, signal, untracked, computed, Signal } from '@angular/core';
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
  data: TimelineItem | null;
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

  /**
   * Private signal holding the immutable snapshot of the entire timeline state.
   * This is updated only when Y.js data changes.
   */
  private readonly rawTimeline = signal<Folder | null>(null);

  /**
   * Public computed signal exposing the tracks of the root folder.
   * Components can consume this to render the top-level tracks.
   */
  public readonly rootTracks: Signal<TimelineItem[][]> = computed(() => {
    return this.rawTimeline()?.strips ?? [];
  });

  /**
   * Public computed signal for the timeline's name.
   */
  public readonly timelineName: Signal<string> = computed(() => {
    return this.rawTimeline()?.name ?? '';
  });

  constructor() {
    this.doc = new Y.Doc();

    this.indexeddbProvider = new IndexeddbPersistence('anien-timeline-db', this.doc);
    this.broadcastChannel = new BroadcastChannel('anien-timeline-broadcast-channel');

    this.yRootFolder = this.doc.getMap('timelineRoot') as YFolder;

    // Listen for any deep changes within the root folder structure
    this.yRootFolder.observeDeep(() => {
      // On any change, re-generate the entire JS snapshot from Y.js data
      const newTimelineData = this.convertYToJs(this.yRootFolder);

      // Update the signal with the new snapshot
      untracked(() => {
        if (newTimelineData?.type === 'folder') {
          this.rawTimeline.set(newTimelineData);
        } else {
          // This might happen if data is corrupted or during initialization
          this.rawTimeline.set(null);
        }
      });
    });

    // Wait for the provider to be synced before initializing
    this.indexeddbProvider.whenSynced.then(() => {
      // Check if the timeline is empty *after* syncing with IndexedDB
      if (this.yRootFolder.size === 0) {
        this.initializeEmptyTimeline();
      }

      // Manually trigger the first snapshot conversion after sync
      // (The observeDeep might not fire if data was loaded silently)
      const initialData = this.convertYToJs(this.yRootFolder);
      if (initialData?.type === 'folder') {
        this.rawTimeline.set(initialData);
      }
    });

    // Broadcast changes to other tabs/windows
    this.doc.on('update', () => {
      // Broadcast the updated timeline state to all clients
      const updatedTimeline = this.rawTimeline();
      const message: TimelineUpdateMessage = {
        type: 'timeline-update',
        data: updatedTimeline,
      };
      this.broadcastChannel.postMessage(message);
    });

    // Listen for updates from other tabs/windows
    this.broadcastChannel.onmessage = (event: MessageEvent<TimelineUpdateMessage>) => {
      const message = event.data;
      if (message.type === 'timeline-update') {
        const incomingData = message.data;
        if (incomingData?.type === 'folder') {
          // Update the local Y.js document to reflect the incoming changes
          // This is a simplified approach; in a real app, you'd want to
          // apply only the necessary changes rather than overwriting.
          untracked(() => {
            this.rawTimeline.set(incomingData);
          });
        }
      }
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
    this.doc.transact(() => {
      this.yRootFolder.set('id', crypto.randomUUID());
      this.yRootFolder.set('type', 'folder');
      this.yRootFolder.set('name', 'Root Timeline');
      this.yRootFolder.set('startFrame', 0);
      this.yRootFolder.set('length', 240); // Default length
      this.yRootFolder.set('root', true);
      // Initialize with an empty list of tracks
      const trackList: YTrackList = new Y.Array<YTrack>();
      this.yRootFolder.set('strips', trackList);
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
}
