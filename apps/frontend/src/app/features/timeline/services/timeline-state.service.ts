import { Injectable, signal, computed, inject, Signal, DestroyRef } from '@angular/core';
import {
  YjsTimelineService,
  StripCreationInput,
  FolderCreationInput,
  StripUpdateInput,
  FolderUpdateInput,
  MoveTargetInput,
  DeleteItemOptions,
} from './timeline-store.service';
import { FlatTimelineSnapshot, Folder, Strip } from '../models/timeline.types';

export interface StripVM extends Strip {
  isSelected: boolean;
  trackOrder: number;
  isParentFolderVisible: boolean;
  parentFolderId: string | null;
  parentStartFrame: number;
  absoluteStartFrame: number;
}

export interface FolderVM extends Folder {
  isSelected: boolean;
  isExpanded: boolean;
  trackOrder: number;
  trackLength: number;
  isParentFolderVisible: boolean;
  containedIds: string[];
  parentFolderId: string | null;
  parentStartFrame: number;
  absoluteStartFrame: number;
}

type TimelineItemVM = StripVM | FolderVM;

interface MapContext {
  readonly selectedIds: ReadonlySet<string>;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineStateService {
  private readonly yjsService = inject(YjsTimelineService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly model = signal<FlatTimelineSnapshot | null>(null);

  private readonly _currentFrame = signal<number>(0);
  private readonly _selectedItemIds = signal<Set<string>>(new Set<string>());
  private readonly _zoomLevel = signal<number>(1);

  public readonly currentFrame = this._currentFrame.asReadonly();
  public readonly selectedItemIds = this._selectedItemIds.asReadonly();
  public readonly zoomLevel = this._zoomLevel.asReadonly();

  public readonly timelineItems: Signal<TimelineItemVM[]> = computed(() => {
    const snapshot = this.model();
    if (!snapshot) {
      return [];
    }

    const rootEntity = snapshot.entities[snapshot.rootId];
    if (!rootEntity || rootEntity.type !== 'folder') {
      return [];
    }

    const context: MapContext = {
      selectedIds: this._selectedItemIds(),
    };

    const items: TimelineItemVM[] = [];
    let nextTrackOrder = 0;

    const processTrack = (
      trackItems: string[],
      parentVisible: boolean,
      frameOffset: number,
      parentFolderId: string | null,
    ): void => {
      const currentTrackOrder = nextTrackOrder++;

      for (const itemId of trackItems) {
        const item = snapshot.entities[itemId];
        if (!item) {
          continue;
        }

        if (item.type === 'strip') {
          const absoluteStartFrame = item.startFrame + frameOffset;
          items.push(
            this.mapStrip(
              item,
              currentTrackOrder,
              parentVisible,
              context.selectedIds,
              absoluteStartFrame,
              parentFolderId,
              frameOffset,
            ),
          );
          continue;
        }

        const absoluteStartFrame = item.startFrame + frameOffset;
        const folderVM = this.mapFolder(
          item,
          currentTrackOrder,
          parentVisible,
          context,
          absoluteStartFrame,
          snapshot,
          parentFolderId,
          frameOffset,
        );
        items.push(folderVM);

        const childVisibility = parentVisible;
        const nestedTracks = snapshot.folderTracks[item.id] ?? [];
        for (const nestedTrack of nestedTracks) {
          processTrack(nestedTrack, childVisibility, absoluteStartFrame, item.id);
        }
      }
    };

    const rootTracks = snapshot.folderTracks[rootEntity.id] ?? [];
    for (const track of rootTracks) {
      processTrack(track, true, rootEntity.startFrame, rootEntity.id);
    }

    return items;
  });

  public readonly timelineName = computed(() => {
    const snapshot = this.model();
    const rootEntity = snapshot?.entities[snapshot?.rootId ?? ''];
    return rootEntity?.type === 'folder' ? rootEntity.name : 'Loading...';
  });

  public setFrame(frame: number): void {
    this._currentFrame.set(frame);
  }

  public selectItem(id: string, multiSelect = false): void {
    this._selectedItemIds.update((currentSet) => {
      if (multiSelect) {
        if (currentSet.has(id)) {
          const updated = new Set(currentSet);
          updated.delete(id);
          return updated;
        }
        currentSet.add(id);
        return new Set(currentSet);
      }
      return new Set([id]);
    });
  }

  public clearSelection(): void {
    this._selectedItemIds.set(new Set());
  }

  public addTrack(options?: { parentFolderId?: string; position?: number }): number | null {
    const index =
      this.yjsService.addTrack(options?.parentFolderId, {
        position: options?.position,
      }) ?? null;

    return index;
  }

  public addStrip(
    target: { parentFolderId?: string; trackIndex: number; position?: number },
    stripData: StripCreationInput,
  ): string | null {
    const createdId =
      this.yjsService.addStripToTrack(target.trackIndex, stripData, {
        parentFolderId: target.parentFolderId,
        position: target.position,
      }) ?? null;

    if (!createdId) {
      return null;
    }

    this.selectItem(createdId);
    return createdId;
  }

  public addFolder(
    target: { parentFolderId?: string; trackIndex: number; position?: number },
    folderData: FolderCreationInput,
  ): string | null {
    const createdId =
      this.yjsService.addFolderToTrack(target.trackIndex, folderData, {
        parentFolderId: target.parentFolderId,
        position: target.position,
      }) ?? null;

    if (!createdId) {
      return null;
    }

    this.selectItem(createdId);
    return createdId;
  }

  public createStrip(): string | null {
    const context = this.resolveInsertionContext();
    if (!context) {
      return null;
    }

    const stripData: StripCreationInput = {
      source: this.createDefaultStripName(),
      startFrame: context.startFrame,
      length: 60,
    };

    return this.addStrip(
      {
        parentFolderId: context.parentFolderId,
        trackIndex: context.trackIndex,
        position: context.position,
      },
      stripData,
    );
  }

  public createFolder(): string | null {
    const context = this.resolveInsertionContext();
    if (!context) {
      return null;
    }

    const folderData: FolderCreationInput = {
      name: this.createDefaultFolderName(),
      startFrame: context.startFrame,
      length: 120,
      root: false,
      trackCount: 1,
    };

    return this.addFolder(
      {
        parentFolderId: context.parentFolderId,
        trackIndex: context.trackIndex,
        position: context.position,
      },
      folderData,
    );
  }

  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    return this.yjsService.updateStrip(itemId, updates);
  }

  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    const updated = this.yjsService.updateFolder(itemId, updates);
    if (!updated) {
      return false;
    }

    if (updates.name !== undefined) {
      const currentSelection = this._selectedItemIds();
      if (currentSelection.has(itemId)) {
        this._selectedItemIds.set(new Set(currentSelection));
      }
    }

    return updated;
  }

  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    return this.yjsService.moveItem(itemId, target);
  }

  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    const snapshotBeforeDelete = this.yjsService.getItemById(itemId);
    const deleted = this.yjsService.deleteItem(itemId, options);

    if (!deleted) {
      return false;
    }

    const idsToClear = new Set<string>([itemId]);

    if (snapshotBeforeDelete?.type === 'folder') {
      const model = this.model();
      if (model) {
        const nestedIds = this.collectContainedIds(model, snapshotBeforeDelete.id);
        for (const nestedId of nestedIds) {
          idsToClear.add(nestedId);
        }
      }
    }

    this.removeSelection(idsToClear);
    return true;
  }

  public shiftSelectedByFrames(delta: number): void {
    if (!delta) {
      return;
    }

    for (const id of this._selectedItemIds()) {
      const snapshot = this.yjsService.getItemById(id);
      if (!snapshot) {
        continue;
      }

      const targetStart = Math.max(0, snapshot.startFrame + delta);

      if (snapshot.type === 'strip') {
        this.yjsService.updateStrip(id, { startFrame: targetStart });
        continue;
      }

      if (snapshot.type === 'folder' && snapshot.root !== true) {
        this.yjsService.updateFolder(id, { startFrame: targetStart });
      }
    }
  }

  public adjustSelectedLength(delta: number): void {
    if (!delta) {
      return;
    }

    for (const id of this._selectedItemIds()) {
      const snapshot = this.yjsService.getItemById(id);
      if (!snapshot) {
        continue;
      }

      const targetLength = Math.max(1, snapshot.length + delta);

      if (snapshot.type === 'strip') {
        this.yjsService.updateStrip(id, { length: targetLength });
        continue;
      }

      if (snapshot.type === 'folder') {
        this.yjsService.updateFolder(id, { length: targetLength });
      }
    }
  }

  public deleteSelectedItem(): void {
    const selectedIds = Array.from(this._selectedItemIds());
    if (!selectedIds.length) {
      return;
    }

    for (const id of selectedIds) {
      this.deleteItem(id);
    }
  }

  constructor() {
    const unsubscribe = this.yjsService.subscribeTimeline((snapshot) => {
      this.model.set(snapshot);
    });

    this.destroyRef.onDestroy(unsubscribe);
  }

  private mapStrip(
    strip: Strip,
    trackOrder: number,
    isParentFolderVisible: boolean,
    selectedIds: ReadonlySet<string>,
    absoluteStartFrame: number,
    parentFolderId: string | null,
    parentStartFrame: number,
  ): StripVM {
    return {
      ...strip,
      isSelected: selectedIds.has(strip.id),
      trackOrder,
      isParentFolderVisible,
      startFrame: strip.startFrame,
      parentFolderId,
      parentStartFrame,
      absoluteStartFrame,
    };
  }

  private mapFolder(
    folder: Folder,
    trackOrder: number,
    isParentFolderVisible: boolean,
    context: MapContext,
    absoluteStartFrame: number,
    snapshot: FlatTimelineSnapshot,
    parentFolderId: string | null,
    parentStartFrame: number,
  ): FolderVM {
    const { selectedIds } = context;
    const isExpanded = true;
    const { ...rest } = folder;
    const trackLength = snapshot.folderTracks[folder.id]?.length ?? 0;

    return {
      ...rest,
      isSelected: selectedIds.has(folder.id),
      isExpanded,
      trackOrder,
      trackLength,
      isParentFolderVisible,
      containedIds: this.collectContainedIds(snapshot, folder.id),
      startFrame: folder.startFrame,
      parentFolderId,
      parentStartFrame,
      absoluteStartFrame,
    };
  }

  private collectContainedIds(snapshot: FlatTimelineSnapshot, folderId: string): string[] {
    const collected: string[] = [];
    const queue: string[] = [folderId];

    while (queue.length) {
      const currentFolderId = queue.shift();
      if (!currentFolderId) {
        continue;
      }
      const tracks = snapshot.folderTracks[currentFolderId] ?? [];
      for (const track of tracks) {
        for (const itemId of track) {
          collected.push(itemId);
          const entity = snapshot.entities[itemId];
          if (entity?.type === 'folder') {
            queue.push(entity.id);
          }
        }
      }
    }

    return collected;
  }

  private removeSelection(ids: Iterable<string>): void {
    const removalIds = Array.from(ids);
    if (!removalIds.length) {
      return;
    }

    let selectionChanged = false;
    const nextSelection = new Set(this._selectedItemIds());
    for (const id of removalIds) {
      if (nextSelection.delete(id)) {
        selectionChanged = true;
      }
    }
    if (selectionChanged) {
      this._selectedItemIds.set(nextSelection);
    }
  }

  private resolveInsertionContext(): {
    parentFolderId?: string;
    trackIndex: number;
    position: number;
    startFrame: number;
  } | null {
    const selectedId = this.getPrimarySelection();
    if (selectedId) {
      const location = this.yjsService.getItemLocation(selectedId);
      if (location) {
        const snapshot = this.yjsService.getItemById(selectedId);
        const baseStart = snapshot ? snapshot.startFrame + snapshot.length : 0;

        return {
          parentFolderId: location.parentFolderId ?? undefined,
          trackIndex: location.trackIndex,
          position: location.entryIndex + 1,
          startFrame: baseStart,
        };
      }
    }

    return this.resolveDefaultInsertionContext();
  }

  private resolveDefaultInsertionContext(): {
    parentFolderId?: string;
    trackIndex: number;
    position: number;
    startFrame: number;
  } | null {
    const snapshot = this.model();
    const rootId = snapshot?.rootId;

    if (!snapshot || !rootId) {
      const createdTrackIndex = this.yjsService.addTrack();
      return {
        parentFolderId: undefined,
        trackIndex: createdTrackIndex ?? 0,
        position: 0,
        startFrame: 0,
      };
    }

    const rootEntity = snapshot.entities[rootId];
    if (!rootEntity || rootEntity.type !== 'folder') {
      return null;
    }

    const rootTracks = snapshot.folderTracks[rootId] ?? [];
    if (rootTracks.length === 0) {
      const createdTrackIndex = this.yjsService.addTrack(rootId);
      return {
        parentFolderId: rootId,
        trackIndex: createdTrackIndex ?? 0,
        position: 0,
        startFrame: rootEntity.startFrame,
      };
    }

    const trackIndex = 0;
    const position = rootTracks[trackIndex]?.length ?? 0;

    return {
      parentFolderId: rootId,
      trackIndex,
      position,
      startFrame: rootEntity.startFrame,
    };
  }

  private getPrimarySelection(): string | null {
    const iterator = this._selectedItemIds().values();
    const first = iterator.next();
    return first.done ? null : first.value;
  }

  private createDefaultStripName(): string {
    return 'New Strip';
  }

  private createDefaultFolderName(): string {
    return 'New Folder';
  }
}
