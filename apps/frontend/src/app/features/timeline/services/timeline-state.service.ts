import { DestroyRef, computed, inject, Injectable, signal } from '@angular/core';
import {
  DeleteItemOptions,
  FolderCreationInput,
  FolderUpdateInput,
  MoveTargetInput,
  StripCreationInput,
  StripUpdateInput,
  YjsTimelineService,
} from './timeline-store.service';
import { TimelineSnapshot } from '../models/timeline.types';

interface TimelineDebugStats {
  schemaVersion: number;
  normalizeVersion: number;
  timeScale: number;
  rootFolderSourceId: string;
  stripSourceCount: number;
  folderSourceCount: number;
  placementCount: number;
}

export interface StripVM {
  id: string;
  type: 'strip';
  sourceId: string;
  sourceName: string;
  sourceOffsetTicks: number;
  durationTicks: number;
  startTick: number;
  startRow: number;
  laneSpan: number;
  rowSpan: number;
  ordinal: number;
  isSelected: boolean;
  parentFolderId: string | null;
  parentStartTick: number;
  absoluteStartTick: number;
  absoluteStartRow: number;
}

export interface FolderVM {
  id: string;
  type: 'folder';
  sourceId: string;
  name: string;
  bodyTrackCount: number;
  durationTicks: number;
  startTick: number;
  startRow: number;
  rowSpan: number;
  ordinal: number;
  isSelected: boolean;
  isExpanded: boolean;
  containedIds: string[];
  parentFolderId: string | null;
  parentStartTick: number;
  absoluteStartTick: number;
  absoluteStartRow: number;
}

export type TimelineItemVM = StripVM | FolderVM;

@Injectable({
  providedIn: 'root',
})
export class TimelineStateService {
  private readonly yjsService = inject(YjsTimelineService);
  private readonly destroyRef = inject(DestroyRef);

  // Zoom tuning values are intentionally centralized for quick future adjustments.
  public readonly BASE_TICK_SIZE_PX = 2;
  public readonly MIN_ZOOM_LEVEL = 0.1;
  public readonly MAX_ZOOM_LEVEL = 10;
  public readonly WHEEL_ZOOM_SENSITIVITY = 0.001;
  public readonly DRAG_ZOOM_SENSITIVITY = 0.002;

  private readonly model = signal<TimelineSnapshot | null>(null);

  private readonly _currentTick = signal<number>(0);
  private readonly _selectedItemIds = signal<Set<string>>(new Set<string>());
  private readonly _zoomLevel = signal<number>(1);

  public readonly currentTick = this._currentTick.asReadonly();
  public readonly selectedItemIds = this._selectedItemIds.asReadonly();
  public readonly zoomLevel = this._zoomLevel.asReadonly();
  public readonly tickSizePx = computed(() => this.BASE_TICK_SIZE_PX * this.zoomLevel());
  public readonly rootFolderSourceId = computed(
    () => this.model()?.root.rootFolderSourceId ?? null,
  );
  public readonly debugSnapshot = this.model.asReadonly();
  public readonly debugSnapshotJson = computed(() => {
    const snapshot = this.model();
    return snapshot ? JSON.stringify(snapshot, null, 2) : '';
  });
  public readonly debugStats = computed<TimelineDebugStats | null>(() => {
    const snapshot = this.model();
    if (!snapshot) {
      return null;
    }

    return {
      schemaVersion: snapshot.root.schemaVersion,
      normalizeVersion: snapshot.root.normalizeVersion,
      timeScale: snapshot.root.timeScale,
      rootFolderSourceId: snapshot.root.rootFolderSourceId,
      stripSourceCount: Object.keys(snapshot.stripSources).length,
      folderSourceCount: Object.keys(snapshot.folderSources).length,
      placementCount: Object.keys(snapshot.placements).length,
    };
  });

  public readonly timelineItems = computed<TimelineItemVM[]>(() => {
    const snapshot = this.model();
    if (!snapshot) {
      return [];
    }

    const rootFolder = snapshot.folderSources[snapshot.root.rootFolderSourceId];
    if (!rootFolder) {
      return [];
    }

    const selectedIds = this._selectedItemIds();
    const items: TimelineItemVM[] = [];

    const visitFolder = (
      folderSourceId: string,
      contentStartTick: number,
      contentStartRow: number,
      parentFolderId: string | null,
    ): void => {
      const folderSource = snapshot.folderSources[folderSourceId];
      if (!folderSource) {
        return;
      }

      for (const placementId of folderSource.childPlacementIds) {
        const placement = snapshot.placements[placementId];
        if (!placement) {
          continue;
        }

        if (placement.type === 'strip-placement') {
          const stripSource = snapshot.stripSources[placement.sourceId];
          if (!stripSource) {
            continue;
          }

          items.push({
            id: placement.id,
            type: 'strip',
            sourceId: stripSource.id,
            sourceName: stripSource.name,
            sourceOffsetTicks: placement.sourceOffsetTicks,
            durationTicks: placement.durationTicks,
            startTick: placement.startTick,
            startRow: placement.startRow,
            laneSpan: placement.laneSpan,
            rowSpan: placement.laneSpan,
            ordinal: placement.ordinal,
            isSelected: selectedIds.has(placement.id),
            parentFolderId,
            parentStartTick: contentStartTick,
            absoluteStartTick: contentStartTick + placement.startTick,
            absoluteStartRow: contentStartRow + placement.startRow,
          });
          continue;
        }

        const childFolderSource = snapshot.folderSources[placement.sourceId];
        if (!childFolderSource) {
          continue;
        }

        const absoluteStartTick = contentStartTick + placement.startTick;
        const absoluteStartRow = contentStartRow + placement.startRow;
        items.push({
          id: placement.id,
          type: 'folder',
          sourceId: childFolderSource.id,
          name: childFolderSource.name,
          bodyTrackCount: childFolderSource.bodyTrackCount,
          durationTicks: placement.durationTicks,
          startTick: placement.startTick,
          startRow: placement.startRow,
          rowSpan: 1 + childFolderSource.bodyTrackCount,
          ordinal: placement.ordinal,
          isSelected: selectedIds.has(placement.id),
          isExpanded: true,
          containedIds: this.collectContainedIds(snapshot, childFolderSource.id),
          parentFolderId,
          parentStartTick: contentStartTick,
          absoluteStartTick,
          absoluteStartRow,
        });

        visitFolder(
          childFolderSource.id,
          absoluteStartTick,
          absoluteStartRow + 1,
          childFolderSource.id,
        );
      }
    };

    visitFolder(snapshot.root.rootFolderSourceId, 0, 0, snapshot.root.rootFolderSourceId);
    return items;
  });

  public readonly timelineRows = computed(() => {
    const snapshot = this.model();
    if (!snapshot) {
      return 1;
    }

    const rootFolder = snapshot.folderSources[snapshot.root.rootFolderSourceId];
    const occupiedRows = this.timelineItems().reduce(
      (maxRow, item) => Math.max(maxRow, item.absoluteStartRow + item.rowSpan),
      0,
    );
    return Math.max(rootFolder?.bodyTrackCount ?? 1, occupiedRows, 1);
  });

  public readonly timelineExtentTicks = computed(() => {
    const occupiedTicks = this.timelineItems().reduce(
      (maxTick, item) => Math.max(maxTick, item.absoluteStartTick + item.durationTicks),
      0,
    );
    return Math.max(occupiedTicks + 120, this.currentTick() + 120, 1000);
  });

  public readonly timelineName = computed(() => {
    const snapshot = this.model();
    const rootFolder = snapshot?.folderSources[snapshot.root.rootFolderSourceId ?? ''];
    return rootFolder?.name ?? 'Loading...';
  });

  constructor() {
    const unsubscribe = this.yjsService.subscribeTimeline((snapshot) => {
      this.model.set(snapshot);
    });

    this.destroyRef.onDestroy(unsubscribe);
  }

  public setCurrentTick(tick: number): void {
    this._currentTick.set(tick);
  }

  public setZoomLevel(level: number): number {
    const nextLevel = this.clampZoomLevel(level);
    this._zoomLevel.set(nextLevel);
    return nextLevel;
  }

  public adjustZoomByRatio(ratio: number): number {
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return this._zoomLevel();
    }

    return this.setZoomLevel(this._zoomLevel() * ratio);
  }

  public resetToDemoTimeline(): void {
    this.yjsService.resetToDemoTimeline();
    this._currentTick.set(0);
    this._selectedItemIds.set(new Set());
  }

  public selectItem(id: string, multiSelect = false): void {
    this._selectedItemIds.update((currentSet) => {
      if (multiSelect) {
        if (currentSet.has(id)) {
          const nextSelection = new Set(currentSet);
          nextSelection.delete(id);
          return nextSelection;
        }

        const nextSelection = new Set(currentSet);
        nextSelection.add(id);
        return nextSelection;
      }

      return new Set([id]);
    });
  }

  public clearSelection(): void {
    this._selectedItemIds.set(new Set());
  }

  public addTrack(options?: { parentFolderId?: string; position?: number }): number | null {
    return this.yjsService.addTrack(options?.parentFolderId, {
      position: options?.position,
    });
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

    if (createdId) {
      this.selectItem(createdId);
    }

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

    if (createdId) {
      this.selectItem(createdId);
    }

    return createdId;
  }

  public createStrip(): string | null {
    const context = this.resolveInsertionContext();
    if (!context) {
      return null;
    }

    return this.addStrip(
      {
        parentFolderId: context.parentFolderId,
        trackIndex: context.trackIndex,
        position: context.position,
      },
      {
        sourceName: this.createDefaultStripName(),
        kind: 'generated',
        startTick: context.startTick,
        durationTicks: 60,
      },
    );
  }

  public createFolder(): string | null {
    const context = this.resolveInsertionContext();
    if (!context) {
      return null;
    }

    return this.addFolder(
      {
        parentFolderId: context.parentFolderId,
        trackIndex: context.trackIndex,
        position: context.position,
      },
      {
        name: this.createDefaultFolderName(),
        startTick: context.startTick,
        durationTicks: 120,
        bodyTrackCount: 1,
      },
    );
  }

  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    return this.yjsService.updateStrip(itemId, updates);
  }

  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    return this.yjsService.updateFolder(itemId, updates);
  }

  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    return this.yjsService.moveItem(itemId, target);
  }

  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    const deleted = this.yjsService.deleteItem(itemId, options);
    if (!deleted) {
      return false;
    }

    this.removeSelection([itemId]);
    return true;
  }

  public shiftSelectedByTicks(delta: number): void {
    if (!delta) {
      return;
    }

    for (const id of this._selectedItemIds()) {
      const item = this.yjsService.getItemById(id);
      if (!item) {
        continue;
      }

      const targetStartTick = Math.max(0, item.startTick + delta);
      if (item.type === 'strip') {
        this.yjsService.updateStrip(id, { startTick: targetStartTick });
      } else {
        this.yjsService.updateFolder(id, { startTick: targetStartTick });
      }
    }
  }

  public shiftSelectedByRows(delta: number): void {
    if (!delta) {
      return;
    }

    for (const id of this._selectedItemIds()) {
      const item = this.yjsService.getItemById(id);
      if (!item) {
        continue;
      }

      const targetStartRow = Math.max(0, item.startRow + delta);
      if (item.type === 'strip') {
        this.yjsService.updateStrip(id, { startRow: targetStartRow });
      } else {
        this.yjsService.updateFolder(id, { startRow: targetStartRow });
      }
    }
  }

  public adjustSelectedDuration(delta: number): void {
    if (!delta) {
      return;
    }

    for (const id of this._selectedItemIds()) {
      const item = this.yjsService.getItemById(id);
      if (!item) {
        continue;
      }

      const targetDurationTicks = Math.max(1, item.durationTicks + delta);
      if (item.type === 'strip') {
        this.yjsService.updateStrip(id, { durationTicks: targetDurationTicks });
      } else {
        this.yjsService.updateFolder(id, { durationTicks: targetDurationTicks });
      }
    }
  }

  public deleteSelectedItem(): void {
    const selectedIds = Array.from(this._selectedItemIds());
    for (const id of selectedIds) {
      this.deleteItem(id);
    }
  }

  private collectContainedIds(snapshot: TimelineSnapshot, folderSourceId: string): string[] {
    const collected: string[] = [];
    const queue: string[] = [folderSourceId];

    while (queue.length > 0) {
      const currentFolderSourceId = queue.shift();
      if (!currentFolderSourceId) {
        continue;
      }

      const folderSource = snapshot.folderSources[currentFolderSourceId];
      if (!folderSource) {
        continue;
      }

      for (const placementId of folderSource.childPlacementIds) {
        collected.push(placementId);
        const placement = snapshot.placements[placementId];
        if (placement?.type === 'folder-placement') {
          queue.push(placement.sourceId);
        }
      }
    }

    return collected;
  }

  private removeSelection(ids: Iterable<string>): void {
    const nextSelection = new Set(this._selectedItemIds());
    let changed = false;

    for (const id of ids) {
      if (nextSelection.delete(id)) {
        changed = true;
      }
    }

    if (changed) {
      this._selectedItemIds.set(nextSelection);
    }
  }

  private resolveInsertionContext(): {
    parentFolderId?: string;
    trackIndex: number;
    position: number;
    startTick: number;
  } | null {
    const selectedId = this.getPrimarySelection();
    if (selectedId) {
      const location = this.yjsService.getItemLocation(selectedId);
      const item = this.yjsService.getItemById(selectedId);
      if (location && item) {
        return {
          parentFolderId: location.parentFolderId ?? undefined,
          trackIndex: location.trackIndex,
          position: location.entryIndex + 1,
          startTick: item.startTick + item.durationTicks,
        };
      }
    }

    return this.resolveDefaultInsertionContext();
  }

  private resolveDefaultInsertionContext(): {
    parentFolderId?: string;
    trackIndex: number;
    position: number;
    startTick: number;
  } | null {
    const snapshot = this.model();
    if (!snapshot) {
      const createdTrackIndex = this.yjsService.addTrack();
      return {
        parentFolderId: undefined,
        trackIndex: createdTrackIndex ?? 0,
        position: 0,
        startTick: 0,
      };
    }

    const rootFolder = snapshot.folderSources[snapshot.root.rootFolderSourceId];
    if (!rootFolder) {
      return null;
    }

    const trackIndex = 0;
    const position = rootFolder.childPlacementIds.length;
    const startTick = rootFolder.childPlacementIds.reduce((maxTick, placementId) => {
      const placement = snapshot.placements[placementId];
      if (!placement || placement.startRow !== trackIndex) {
        return maxTick;
      }

      return Math.max(maxTick, placement.startTick + placement.durationTicks);
    }, 0);

    return {
      parentFolderId: rootFolder.id,
      trackIndex,
      position,
      startTick,
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

  private clampZoomLevel(level: number): number {
    if (!Number.isFinite(level)) {
      return this._zoomLevel();
    }

    return Math.min(this.MAX_ZOOM_LEVEL, Math.max(this.MIN_ZOOM_LEVEL, level));
  }
}
