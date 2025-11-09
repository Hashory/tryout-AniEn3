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
import type { Folder, Strip } from './anien-timeline.types';

class TimelineServiceStub {
  private snapshot: Folder | null = null;
  private readonly listeners = new Set<(snapshot: Folder | null) => void>();
  private idCounter = 0;

  public subscribeTimeline(listener: (snapshot: Folder | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot ? this.clone(this.snapshot) : null);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setSnapshot(snapshot: Folder | null): void {
    this.snapshot = snapshot ? this.clone(snapshot) : null;
    this.emitSnapshot();
  }

  public getSnapshot(): Folder | null {
    return this.snapshot ? this.clone(this.snapshot) : null;
  }

  public getItemById(itemId: string): Folder | Strip | null {
    if (!this.snapshot) {
      return null;
    }
    if (this.snapshot.id === itemId) {
      return this.clone(this.snapshot);
    }
    const located = this.findItem(itemId);
    if (!located) {
      return null;
    }
    return this.clone(located.item);
  }

  public getItemLocation(itemId: string): ItemLocationDetails | null {
    const located = this.findItem(itemId);
    if (!located) {
      return null;
    }

    const parentTrack = located.parent.strips[located.trackIndex] ?? [];
    return {
      parentFolderId: located.parent.id ?? null,
      trackIndex: located.trackIndex,
      entryIndex: located.entryIndex,
      trackLength: parentTrack.length,
      totalTracks: located.parent.strips.length,
    };
  }

  public addTrack(folderId?: string, options?: { position?: number }): number | null {
    const folder = this.resolveFolder(folderId);
    if (!folder) {
      return null;
    }
    const insertIndex = this.normalizeInsertIndex(options?.position, folder.strips.length);
    folder.strips.splice(insertIndex, 0, []);
    this.emitSnapshot();
    return insertIndex;
  }

  public addStripToTrack(
    trackIndex: number,
    stripData: StripCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    const folder = this.resolveFolder(options?.parentFolderId);
    if (!folder) {
      return null;
    }
    const track = folder.strips[trackIndex];
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
    track.splice(insertIndex, 0, newStrip);
    this.emitSnapshot();
    return id;
  }

  public addFolderToTrack(
    trackIndex: number,
    folderData: FolderCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    const folder = this.resolveFolder(options?.parentFolderId);
    if (!folder) {
      return null;
    }
    const track = folder.strips[trackIndex];
    if (!track) {
      return null;
    }
    const insertIndex = this.normalizeInsertIndex(options?.position, track.length);
    const id = folderData.id ?? this.generateId('folder');
    const trackCount = folderData.trackCount ?? 0;
    const nestedTracks: Folder['strips'] = Array.from({ length: trackCount }, () => []);
    const newFolder: Folder = {
      id,
      type: 'folder',
      name: folderData.name,
      startFrame: folderData.startFrame,
      length: folderData.length,
      root: folderData.root ?? false,
      strips: nestedTracks,
    };
    track.splice(insertIndex, 0, newFolder);
    this.emitSnapshot();
    return id;
  }

  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    const located = this.findItem(itemId);
    if (!located || located.item.type !== 'strip') {
      return false;
    }
    if (updates.source !== undefined) {
      located.item.source = updates.source;
    }
    if (updates.startFrame !== undefined) {
      located.item.startFrame = updates.startFrame;
    }
    if (updates.length !== undefined) {
      located.item.length = updates.length;
    }
    this.emitSnapshot();
    return true;
  }

  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    const located = this.findItem(itemId);
    if (!located || located.item.type !== 'folder') {
      return false;
    }
    if (updates.name !== undefined) {
      located.item.name = updates.name;
    }
    if (updates.startFrame !== undefined) {
      located.item.startFrame = updates.startFrame;
    }
    if (updates.length !== undefined) {
      located.item.length = updates.length;
    }
    if (updates.root !== undefined) {
      located.item.root = updates.root;
    }
    this.emitSnapshot();
    return true;
  }

  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    const located = this.findItem(itemId);
    if (!located) {
      return false;
    }

    const destinationFolder = this.resolveFolder(target.parentFolderId);
    if (!destinationFolder) {
      return false;
    }
    const destinationTrack = destinationFolder.strips[target.trackIndex];
    if (!destinationTrack) {
      return false;
    }

    const [item] = located.parent.strips[located.trackIndex].splice(located.entryIndex, 1);
    if (!item) {
      return false;
    }

    const insertIndex = this.normalizeInsertIndex(target.position, destinationTrack.length);
    destinationTrack.splice(insertIndex, 0, item);
    this.emitSnapshot();
    return true;
  }

  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    const located = this.findItem(itemId);
    if (!located) {
      return false;
    }
    if (options?.parentFolderId && located.parent.id !== options.parentFolderId) {
      return false;
    }
    if (
      options?.expectedTrackIndex !== undefined &&
      located.trackIndex !== options.expectedTrackIndex
    ) {
      return false;
    }

    located.parent.strips[located.trackIndex].splice(located.entryIndex, 1);
    this.emitSnapshot();
    return true;
  }

  private emitSnapshot(): void {
    const clone = this.snapshot ? this.clone(this.snapshot) : null;
    for (const listener of this.listeners) {
      listener(clone);
    }
  }

  private resolveFolder(folderId?: string): Folder | null {
    if (!this.snapshot) {
      return null;
    }
    if (!folderId || this.snapshot.id === folderId) {
      return this.snapshot;
    }
    const located = this.findItem(folderId);
    if (!located || located.item.type !== 'folder') {
      return null;
    }
    return located.item;
  }

  private findItem(
    itemId: string,
  ): { parent: Folder; trackIndex: number; entryIndex: number; item: Folder | Strip } | null {
    if (!this.snapshot) {
      return null;
    }
    return this.findItemRecursive(this.snapshot, itemId);
  }

  private findItemRecursive(
    folder: Folder,
    itemId: string,
  ): { parent: Folder; trackIndex: number; entryIndex: number; item: Folder | Strip } | null {
    for (let trackIndex = 0; trackIndex < folder.strips.length; trackIndex++) {
      const track = folder.strips[trackIndex];
      for (let entryIndex = 0; entryIndex < track.length; entryIndex++) {
        const item = track[entryIndex];
        if (item.id === itemId) {
          return { parent: folder, trackIndex, entryIndex, item };
        }
        if (item.type === 'folder') {
          const nested = this.findItemRecursive(item, itemId);
          if (nested) {
            return nested;
          }
        }
      }
    }
    return null;
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

  private clone<T extends Folder | Strip>(value: T): T {
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
      strips: [[nestedStrip]],
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
      strips: [[topStrip], [nestedFolder]],
    };

    timelineServiceStub.setSnapshot(rootFolder);
  });
});
