import { Injectable, signal, computed, inject, Signal, DestroyRef } from '@angular/core';
import {
  YjsTimelineService,
  StripCreationInput,
  FolderCreationInput,
  StripUpdateInput,
  FolderUpdateInput,
  MoveTargetInput,
  DeleteItemOptions,
} from './anien-timeline-store.service';
import { Strip, Folder } from './anien-timeline.types';

// ViewModel types augment the domain model with UI-specific state.

export interface StripVM extends Strip {
  isSelected: boolean;
  trackOrder: number;
  isParentFolderVisible: boolean;
}

export interface FolderVM extends Omit<Folder, 'strips'> {
  isSelected: boolean;
  isExpanded: boolean;
  trackOrder: number;
  trackLength: number;
  isParentFolderVisible: boolean;
  containedIds: string[];
}

type TimelineItemVM = StripVM | FolderVM;

interface MapContext {
  readonly selectedIds: ReadonlySet<string>;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineStateService {
  // Inject model service
  private readonly yjsService = inject(YjsTimelineService);
  private readonly destroyRef = inject(DestroyRef);

  // Subscribe to model changes (plain JS snapshot provided by the Yjs store)
  private readonly model = signal<Folder | null>(null);

  // UI State Signals
  private readonly _currentFrame = signal<number>(0);
  private readonly _selectedItemIds = signal<Set<string>>(new Set<string>());
  private readonly _zoomLevel = signal<number>(1);

  // Expose read-only signals
  public readonly currentFrame = this._currentFrame.asReadonly();
  public readonly selectedItemIds = this._selectedItemIds.asReadonly();
  public readonly zoomLevel = this._zoomLevel.asReadonly();

  // Derived timeline items exposed to consuming components.

  public readonly timelineItems: Signal<TimelineItemVM[]> = computed(() => {
    const rootModel = this.model();
    if (!rootModel) {
      return [];
    }

    const context: MapContext = {
      selectedIds: this._selectedItemIds(),
    };

    const items: TimelineItemVM[] = [];
    let nextTrackOrder = 0;

    const processTrack = (
      trackItems: (Strip | Folder)[],
      parentVisible: boolean,
      frameOffset: number,
    ): void => {
      const currentTrackOrder = nextTrackOrder++;

      for (const item of trackItems) {
        if (item.type === 'strip') {
          const absoluteStartFrame = item.startFrame + frameOffset;
          items.push(
            this.mapStrip(
              item,
              currentTrackOrder,
              parentVisible,
              context.selectedIds,
              absoluteStartFrame,
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
        );
        items.push(folderVM);

        const childVisibility = parentVisible;
        for (const nestedTrack of item.strips) {
          processTrack(nestedTrack, childVisibility, absoluteStartFrame);
        }
      }
    };

    for (const track of rootModel.strips) {
      processTrack(track, true, rootModel.startFrame);
    }

    return items;
  });

  // Expose the root folder name via a read-only signal.
  public readonly timelineName = computed(() => this.model()?.name ?? 'Loading...');

  // View intents update local UI state and delegate to the store as needed.
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
        // trigger signal update so bindings refresh when the name changes while selected
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
      const nestedIds = this.collectContainedIds(snapshotBeforeDelete.strips);
      for (const nestedId of nestedIds) {
        idsToClear.add(nestedId);
      }
    }

    this.removeSelectionAndExpansion(idsToClear);
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
  ): StripVM {
    return {
      ...strip,
      isSelected: selectedIds.has(strip.id),
      trackOrder,
      isParentFolderVisible,
      startFrame: absoluteStartFrame,
    };
  }

  private mapFolder(
    folder: Folder,
    trackOrder: number,
    isParentFolderVisible: boolean,
    context: MapContext,
    absoluteStartFrame: number,
  ): FolderVM {
    const { selectedIds } = context;
    const isExpanded = true;
    const { strips, ...rest } = folder;

    return {
      ...rest,
      isSelected: selectedIds.has(folder.id),
      isExpanded,
      trackOrder,
      trackLength: strips.length,
      isParentFolderVisible,
      containedIds: this.collectContainedIds(strips),
      startFrame: absoluteStartFrame,
    };
  }

  private collectContainedIds(tracks: Folder['strips']): string[] {
    const collected: string[] = [];

    for (const track of tracks) {
      for (const item of track) {
        collected.push(item.id);
        if (item.type === 'folder') {
          collected.push(...this.collectContainedIds(item.strips));
        }
      }
    }

    return collected;
  }

  private removeSelectionAndExpansion(ids: Iterable<string>): void {
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
    const rootModel = this.model();
    const parentFolderId = rootModel?.id;

    if (!rootModel) {
      const createdTrackIndex = this.yjsService.addTrack();
      return {
        parentFolderId: undefined,
        trackIndex: createdTrackIndex ?? 0,
        position: 0,
        startFrame: 0,
      };
    }

    const rootTracks = rootModel.strips;
    if (rootTracks.length === 0) {
      const createdTrackIndex = this.yjsService.addTrack(parentFolderId);
      return {
        parentFolderId: parentFolderId ?? undefined,
        trackIndex: createdTrackIndex ?? 0,
        position: 0,
        startFrame: rootModel.startFrame,
      };
    }

    const trackIndex = 0;
    const position = rootTracks[trackIndex]?.length ?? 0;

    return {
      parentFolderId: parentFolderId ?? undefined,
      trackIndex,
      position,
      startFrame: rootModel.startFrame,
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
