import { TestBed } from '@angular/core/testing';
import { TimelineStateService } from './anien-timeline-state.service';
import {
  YjsTimelineService,
  StripCreationInput,
  FolderCreationInput,
  StripUpdateInput,
  FolderUpdateInput,
  MoveTargetInput,
  DeleteItemOptions,
  ItemLocationDetails,
} from './anien-timeline-store.service';
import type { FlatTimelineSnapshot, Folder, Strip, TimelineEntity } from './anien-timeline.types';

class TimelineServiceStub {
  private snapshot: FlatTimelineSnapshot | null = null;
  private readonly listeners = new Set<(snapshot: FlatTimelineSnapshot | null) => void>();
  private idCounter = 0;

  public subscribeTimeline(listener: (snapshot: FlatTimelineSnapshot | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot ? this.clone(this.snapshot) : null);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setSnapshot(snapshot: FlatTimelineSnapshot | null): void {
    this.snapshot = snapshot ? this.clone(snapshot) : null;
    this.emitSnapshot();
  }

  public getSnapshot(): FlatTimelineSnapshot | null {
    return this.snapshot ? this.clone(this.snapshot) : null;
  }

  public getItemById(itemId: string): TimelineEntity | null {
    if (!this.snapshot) {
      return null;
    }
    const entity = this.snapshot.entities[itemId];
    if (!entity) {
      return null;
    }
    return this.clone(entity);
  }

  public getItemLocation(itemId: string): ItemLocationDetails | null {
    const located = this.findItem(itemId);
    if (!located) {
      return null;
    }

    const parentTrack = this.snapshot?.folderTracks[located.parentId]?.[located.trackIndex] ?? [];
    return {
      parentFolderId: located.parentId ?? null,
      trackIndex: located.trackIndex,
      entryIndex: located.entryIndex,
      trackLength: parentTrack.length,
      totalTracks: this.snapshot?.folderTracks[located.parentId]?.length ?? 0,
    };
  }

  public addTrack(folderId?: string, options?: { position?: number }): number | null {
    const parentId = this.resolveFolderId(folderId);
    if (!parentId || !this.snapshot) {
      return null;
    }
    const tracks = this.snapshot.folderTracks[parentId] ?? [];
    const insertIndex = this.normalizeInsertIndex(options?.position, tracks.length);
    tracks.splice(insertIndex, 0, []);
    this.snapshot.folderTracks[parentId] = tracks;
    this.emitSnapshot();
    return insertIndex;
  }

  public addStripToTrack(
    trackIndex: number,
    stripData: StripCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    const parentId = this.resolveFolderId(options?.parentFolderId);
    if (!parentId || !this.snapshot) {
      return null;
    }
    const tracks = this.snapshot.folderTracks[parentId] ?? [];
    const track = tracks[trackIndex];
    if (!track) {
      return null;
    }
    const insertIndex = this.normalizeInsertIndex(options?.position, track.length);
    const id = stripData.id ?? this.generateId('strip');
    const newStrip: Strip = {
      id,
      type: 'strip',
      source: stripData.source,
      startFrame: stripData.startFrame,
      length: stripData.length,
    };
    this.snapshot.entities[id] = newStrip;
    track.splice(insertIndex, 0, id);
    this.snapshot.folderTracks[parentId] = tracks;
    this.emitSnapshot();
    return id;
  }

  public addFolderToTrack(
    trackIndex: number,
    folderData: FolderCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    const parentId = this.resolveFolderId(options?.parentFolderId);
    if (!parentId || !this.snapshot) {
      return null;
    }
    const tracks = this.snapshot.folderTracks[parentId] ?? [];
    const track = tracks[trackIndex];
    if (!track) {
      return null;
    }
    const insertIndex = this.normalizeInsertIndex(options?.position, track.length);
    const id = folderData.id ?? this.generateId('folder');
    const trackCount = folderData.trackCount ?? 0;
    const newFolder: Folder = {
      id,
      type: 'folder',
      name: folderData.name,
      startFrame: folderData.startFrame,
      length: folderData.length,
      root: folderData.root ?? false,
    };
    const nestedTracks: string[][] = Array.from({ length: trackCount }, () => []);
    this.snapshot.entities[id] = newFolder;
    this.snapshot.folderTracks[id] = nestedTracks;
    track.splice(insertIndex, 0, id);
    this.snapshot.folderTracks[parentId] = tracks;
    this.emitSnapshot();
    return id;
  }

  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    const entity = this.snapshot?.entities[itemId];
    if (!entity || entity.type !== 'strip') {
      return false;
    }
    if (updates.source !== undefined) {
      entity.source = updates.source;
    }
    if (updates.startFrame !== undefined) {
      entity.startFrame = updates.startFrame;
    }
    if (updates.length !== undefined) {
      entity.length = updates.length;
    }
    this.emitSnapshot();
    return true;
  }

  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    const entity = this.snapshot?.entities[itemId];
    if (!entity || entity.type !== 'folder') {
      return false;
    }
    if (updates.name !== undefined) {
      entity.name = updates.name;
    }
    if (updates.startFrame !== undefined) {
      entity.startFrame = updates.startFrame;
    }
    if (updates.length !== undefined) {
      entity.length = updates.length;
    }
    if (updates.root !== undefined) {
      entity.root = updates.root;
    }
    this.emitSnapshot();
    return true;
  }

  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    const located = this.findItem(itemId);
    if (!located || !this.snapshot) {
      return false;
    }

    const destinationFolderId = this.resolveFolderId(target.parentFolderId);
    if (!destinationFolderId) {
      return false;
    }
    const destinationTracks = this.snapshot.folderTracks[destinationFolderId] ?? [];
    const destinationTrack = destinationTracks[target.trackIndex];
    if (!destinationTrack) {
      return false;
    }

    const sourceTracks = this.snapshot.folderTracks[located.parentId] ?? [];
    const sourceTrack = sourceTracks[located.trackIndex];
    const [itemIdFromTrack] = sourceTrack.splice(located.entryIndex, 1);
    if (!itemIdFromTrack) {
      return false;
    }

    const insertIndex = this.normalizeInsertIndex(target.position, destinationTrack.length);
    destinationTrack.splice(insertIndex, 0, itemIdFromTrack);
    this.snapshot.folderTracks[located.parentId] = sourceTracks;
    this.snapshot.folderTracks[destinationFolderId] = destinationTracks;
    this.emitSnapshot();
    return true;
  }

  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    const located = this.findItem(itemId);
    if (!located || !this.snapshot) {
      return false;
    }
    if (options?.parentFolderId && located.parentId !== options.parentFolderId) {
      return false;
    }
    if (
      options?.expectedTrackIndex !== undefined &&
      located.trackIndex !== options.expectedTrackIndex
    ) {
      return false;
    }

    const sourceTracks = this.snapshot.folderTracks[located.parentId] ?? [];
    sourceTracks[located.trackIndex].splice(located.entryIndex, 1);
    this.deleteEntityAndDescendants(itemId);
    this.snapshot.folderTracks[located.parentId] = sourceTracks;
    this.emitSnapshot();
    return true;
  }

  private emitSnapshot(): void {
    const clone = this.snapshot ? this.clone(this.snapshot) : null;
    for (const listener of this.listeners) {
      listener(clone);
    }
  }

  private resolveFolderId(folderId?: string): string | null {
    if (!this.snapshot) {
      return null;
    }
    if (!folderId || this.snapshot.rootId === folderId) {
      return this.snapshot.rootId;
    }
    const entity = this.snapshot.entities[folderId];
    return entity?.type === 'folder' ? folderId : null;
  }

  private findItem(
    itemId: string,
  ): { parentId: string; trackIndex: number; entryIndex: number } | null {
    if (!this.snapshot) {
      return null;
    }

    for (const [folderId, tracks] of Object.entries(this.snapshot.folderTracks)) {
      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const track = tracks[trackIndex];
        for (let entryIndex = 0; entryIndex < track.length; entryIndex++) {
          const entryId = track[entryIndex];
          if (entryId === itemId) {
            return { parentId: folderId, trackIndex, entryIndex };
          }
        }
      }
    }

    return null;
  }

  private deleteEntityAndDescendants(itemId: string): void {
    if (!this.snapshot) {
      return;
    }

    const entity = this.snapshot.entities[itemId];
    if (!entity) {
      return;
    }

    if (entity.type === 'folder') {
      const tracks = this.snapshot.folderTracks[itemId] ?? [];
      for (const track of tracks) {
        for (const childId of track) {
          this.deleteEntityAndDescendants(childId);
        }
      }
      delete this.snapshot.folderTracks[itemId];
    }

    delete this.snapshot.entities[itemId];
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

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  private clone<T extends FlatTimelineSnapshot | TimelineEntity>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

describe('TimelineStateService', () => {
  let timelineServiceStub: TimelineServiceStub;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TimelineStateService,
        { provide: YjsTimelineService, useClass: TimelineServiceStub },
      ],
    });

    timelineServiceStub = TestBed.inject(YjsTimelineService) as unknown as TimelineServiceStub;

    const nestedStrip: Strip = {
      id: 'strip-child',
      type: 'strip',
      source: 'Child Clip',
      startFrame: 40,
      length: 10,
    };

    const nestedFolder: Folder = {
      id: 'folder-nested',
      type: 'folder',
      name: 'Nested Folder',
      startFrame: 100,
      length: 200,
      root: false,
    };

    const topStrip: Strip = {
      id: 'strip-root',
      type: 'strip',
      source: 'Root Clip',
      startFrame: 10,
      length: 50,
    };

    const rootFolder: Folder = {
      id: 'folder-root',
      type: 'folder',
      name: 'Root Folder',
      startFrame: 30,
      length: 400,
      root: true,
    };

    const snapshot: FlatTimelineSnapshot = {
      rootId: rootFolder.id,
      entities: {
        [rootFolder.id]: rootFolder,
        [topStrip.id]: topStrip,
        [nestedFolder.id]: nestedFolder,
        [nestedStrip.id]: nestedStrip,
      },
      folderTracks: {
        [rootFolder.id]: [[topStrip.id], [nestedFolder.id]],
        [nestedFolder.id]: [[nestedStrip.id]],
      },
    };

    timelineServiceStub.setSnapshot(snapshot);
  });
});
