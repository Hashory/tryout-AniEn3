import { Injectable, signal, untracked, computed, Signal } from '@angular/core';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Folder, Strip } from './anien-timeline.types';

// Type aliases for Y.js shared types to improve readability
type YStrip = Y.Map<unknown>;
type YFolder = Y.Map<unknown>;
type YTrack = Y.Array<YStrip | YFolder>;
type YTrackList = Y.Array<YTrack>;

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
  public readonly rootTracks: Signal<(Strip | Folder)[][]> = computed(() => {
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

    this.yRootFolder = this.doc.getMap('timelineRoot');

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
      this.broadcastChannel.postMessage({ type: 'timeline-update', data: updatedTimeline });
    });

    // Listen for updates from other tabs/windows
    this.broadcastChannel.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'timeline-update') {
        const incomingData = message.data as Folder | null;
        if (incomingData) {
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
  private convertYToJs(yData: Y.Map<unknown>): (Folder | Strip) | null {
    const type = yData.get('type');
    const id = yData.get('id');

    if (!id || !type) {
      // Not a valid data structure (e.g., still initializing)
      return null;
    }

    if (type === 'strip') {
      const strip: Strip = {
        id: id,
        type: 'strip',
        source: yData.get('source'),
        startFrame: yData.get('startFrame'),
        length: yData.get('length'),
      };
      return strip;
    }

    if (type === 'folder') {
      const yTracks = yData.get('strips') as YTrackList | undefined;
      let jsStrips: (Strip | Folder)[][] = [];

      if (yTracks) {
        // Convert Y.Array<Y.Array<Y.Map>> into (Strip | Folder)[][]
        jsStrips = yTracks.map((yTrack) => {
          // yTrack is a Y.Array (a single track)
          // Recursively convert each item (Y.Map) in the track
          return yTrack
            .map((yItem) => this.convertYToJs(yItem))
            .filter((item) => item !== null) as (Strip | Folder)[];
        });
      }

      const folder: Folder = {
        id: id,
        type: 'folder',
        name: yData.get('name'),
        startFrame: yData.get('startFrame'),
        length: yData.get('length'),
        root: yData.get('root') ?? false,
        strips: jsStrips,
      };
      return folder;
    }

    // Should not happen if data is well-formed
    console.error(`Unknown Yjs data type: ${type}`);
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
      this.yRootFolder.set('strips', new Y.Array<YTrack>());
    });
  }

  // --- Model (Y.js) Manipulation Methods ---

  /**
   * Adds a new, empty track to the root folder.
   */
  public addTrack(): void {
    this.doc.transact(() => {
      const yTracks = this.yRootFolder.get('strips') as YTrackList;
      // A new track is an empty Y.Array
      const newTrack: YTrack = new Y.Array<YFolder | YStrip>();
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
      const yTracks = this.yRootFolder.get('strips') as YTrackList;
      const targetTrack = yTracks.get(trackIndex); // This is a YTrack (Y.Array)

      if (!targetTrack) {
        console.error(`Track index ${trackIndex} not found.`);
        return;
      }

      const newYStrip: YStrip = new Y.Map();
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
      const yTracks = this.yRootFolder.get('strips') as YTrackList;
      const targetTrack = yTracks.get(trackIndex); // YTrack

      if (!targetTrack) {
        console.error(`Track index ${trackIndex} not found.`);
        return;
      }

      // Find the index of the item with the matching ID
      let itemIndex = -1;
      for (let i = 0; i < targetTrack.length; i++) {
        if (targetTrack.get(i).get('id') === itemId) {
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
}
