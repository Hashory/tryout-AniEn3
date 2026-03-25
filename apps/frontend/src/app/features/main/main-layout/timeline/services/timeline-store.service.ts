import { Injectable, OnDestroy, inject } from '@angular/core';
import * as Y from 'yjs';
import { YjsDocumentService } from '#app/core/collaboration/yjs-document.service';
import {
  FolderItemSnapshot,
  StripItemSnapshot,
  StripSource,
  TimelineSnapshot,
  YFolderChildrenArray,
  YFolderChildrenMap,
  YFolderSourceMap,
  YFolderSourcesMap,
  YPlacementMap,
  YPlacementsMap,
  YStripSourceMap,
  YStripSourcesMap,
} from '#app/features/main/main-layout/timeline/models/timeline.types';
import {
  createDemoTimelineSnapshot,
  normalizeTimelineSnapshot,
} from '#app/features/main/main-layout/timeline/services/timeline-normalization';

export interface StripCreationInput {
  id?: string;
  sourceId?: string;
  sourceName: string;
  kind?: StripSource['kind'];
  availableDurationTicks?: number;
  metadata?: Record<string, unknown>;
  startTick: number;
  durationTicks: number;
  sourceOffsetTicks?: number;
  laneSpan?: number;
}

export interface FolderCreationInput {
  id?: string;
  sourceId?: string;
  name: string;
  startTick: number;
  durationTicks: number;
  bodyTrackCount?: number;
}

export interface StripUpdateInput {
  sourceId?: string;
  sourceName?: string;
  kind?: StripSource['kind'];
  availableDurationTicks?: number | null;
  metadata?: Record<string, unknown> | null;
  sourceOffsetTicks?: number;
  durationTicks?: number;
  startTick?: number;
  startRow?: number;
  laneSpan?: number;
}

export interface FolderUpdateInput {
  name?: string;
  bodyTrackCount?: number;
  durationTicks?: number;
  startTick?: number;
  startRow?: number;
}

export interface MoveTargetInput {
  parentFolderId?: string;
  trackIndex: number;
  position?: number;
  startTick?: number;
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

interface YWritableMap {
  set(key: string, value: unknown): unknown;
}

@Injectable({
  providedIn: 'root',
})
export class YjsTimelineService implements OnDestroy {
  private readonly collab = inject(YjsDocumentService);
  private readonly localTransactionOrigin = { source: 'timeline-local' };

  private readonly doc: Y.Doc;

  private readonly yRoot: Y.Map<unknown>;
  private readonly yStripSources: YStripSourcesMap;
  private readonly yFolderSources: YFolderSourcesMap;
  private readonly yFolderChildren: YFolderChildrenMap;
  private readonly yPlacements: YPlacementsMap;
  private readonly undoManager: Y.UndoManager;

  private latestSnapshot: TimelineSnapshot | null = null;
  private readonly timelineSubscribers = new Set<(snapshot: TimelineSnapshot | null) => void>();
  private localMutationDepth = 0;
  private queuedSnapshotForPublish: TimelineSnapshot | null = null;
  private hasQueuedPublish = false;
  private publishFlushFrameId: number | null = null;

  private readonly handleSnapshotUpdate = () => {
    if (this.localMutationDepth > 0) {
      return;
    }

    this.enqueuePublish(this.buildSnapshot());
  };

  constructor() {
    this.doc = this.collab.getDoc();

    this.yRoot = this.doc.getMap('timelineRoot');
    this.yStripSources = this.doc.getMap('stripSources') as YStripSourcesMap;
    this.yFolderSources = this.doc.getMap('folderSources') as YFolderSourcesMap;
    this.yFolderChildren = this.doc.getMap('folderChildren') as YFolderChildrenMap;
    this.yPlacements = this.doc.getMap('placements') as YPlacementsMap;
    this.undoManager = new Y.UndoManager(
      [this.yRoot, this.yStripSources, this.yFolderSources, this.yFolderChildren, this.yPlacements],
      {
        trackedOrigins: new Set([this.localTransactionOrigin]),
      },
    );

    this.yRoot.observe(this.handleSnapshotUpdate);
    this.yStripSources.observeDeep(this.handleSnapshotUpdate);
    this.yFolderSources.observeDeep(this.handleSnapshotUpdate);
    this.yFolderChildren.observeDeep(this.handleSnapshotUpdate);
    this.yPlacements.observeDeep(this.handleSnapshotUpdate);

    this.collab.onSynced(() => {
      this.ensureSourcePlacementSchema();
      this.publishNow(this.buildSnapshot());
    });

    this.ensureSourcePlacementSchema();
    this.publishNow(this.buildSnapshot());
  }

  public ngOnDestroy(): void {
    this.yRoot.unobserve(this.handleSnapshotUpdate);
    this.yStripSources.unobserveDeep(this.handleSnapshotUpdate);
    this.yFolderSources.unobserveDeep(this.handleSnapshotUpdate);
    this.yFolderChildren.unobserveDeep(this.handleSnapshotUpdate);
    this.yPlacements.unobserveDeep(this.handleSnapshotUpdate);

    if (this.publishFlushFrameId !== null) {
      window.cancelAnimationFrame(this.publishFlushFrameId);
      this.publishFlushFrameId = null;
    }

    this.queuedSnapshotForPublish = null;
    this.hasQueuedPublish = false;
  }

  public subscribeTimeline(listener: (snapshot: TimelineSnapshot | null) => void): () => void {
    this.timelineSubscribers.add(listener);
    listener(this.latestSnapshot);
    return () => {
      this.timelineSubscribers.delete(listener);
    };
  }

  public getSnapshot(): TimelineSnapshot | null {
    return this.latestSnapshot;
  }

  public resetToDemoTimeline(): void {
    this.doc.transact(() => {
      const seededSnapshot = createDemoTimelineSnapshot();
      this.writeSnapshotToYjs(seededSnapshot);
    }, this.localTransactionOrigin);

    this.publishNow(this.buildSnapshot());
  }

  public undo(): boolean {
    if (!this.undoManager.canUndo()) {
      return false;
    }

    this.undoManager.stopCapturing();
    this.undoManager.undo();
    this.publishNow(this.buildSnapshot());
    return true;
  }

  public canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  public getDebugSnapshot(): TimelineSnapshot | null {
    return this.latestSnapshot ?? this.buildSnapshot();
  }

  public getItemById(itemId: string): StripItemSnapshot | FolderItemSnapshot | null {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return null;
    }

    const placement = snapshot.placements[itemId];
    if (!placement) {
      return null;
    }

    const parentFolderSourceId = this.findParentFolderSourceId(itemId, snapshot);
    if (placement.type === 'strip-placement') {
      const source = snapshot.stripSources[placement.sourceId];
      if (!source) {
        return null;
      }

      return {
        id: placement.id,
        type: 'strip',
        sourceId: source.id,
        sourceName: source.name,
        sourceKind: source.kind,
        availableDurationTicks: source.availableDurationTicks,
        sourceOffsetTicks: placement.sourceOffsetTicks,
        durationTicks: placement.durationTicks,
        startTick: placement.startTick,
        startRow: placement.startRow,
        laneSpan: placement.laneSpan,
        ordinal: placement.ordinal,
        parentFolderSourceId,
      };
    }

    const source = snapshot.folderSources[placement.sourceId];
    if (!source) {
      return null;
    }

    return {
      id: placement.id,
      type: 'folder',
      sourceId: source.id,
      name: source.name,
      bodyTrackCount: source.bodyTrackCount,
      durationTicks: placement.durationTicks,
      startTick: placement.startTick,
      startRow: placement.startRow,
      ordinal: placement.ordinal,
      parentFolderSourceId,
    };
  }

  public getItemLocation(itemId: string): ItemLocationDetails | null {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return null;
    }

    const location = this.findItemLocationById(itemId, snapshot);
    if (!location) {
      return null;
    }

    const parentFolder = snapshot.folderSources[location.parentFolderId];
    const trackLength = parentFolder.childPlacementIds.filter((placementId) => {
      const placement = snapshot.placements[placementId];
      return placement?.startRow === location.trackIndex;
    }).length;

    return {
      parentFolderId: location.parentFolderId,
      trackIndex: location.trackIndex,
      entryIndex: location.entryIndex,
      trackLength,
      totalTracks: parentFolder.bodyTrackCount,
    };
  }

  public addTrack(folderId?: string, options?: { position?: number }): number | null {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return null;
    }

    void options;

    const targetFolderId = this.resolveFolderId(folderId, snapshot);
    if (!targetFolderId) {
      console.error(`Folder ${folderId ?? 'root'} not found while adding a track.`);
      return null;
    }

    const createdIndex = snapshot.folderSources[targetFolderId].bodyTrackCount;
    this.mutateSnapshot(
      (workingSnapshot) => {
        workingSnapshot.folderSources[targetFolderId].bodyTrackCount += 1;
      },
      { preferredFolderSourceIds: [targetFolderId] },
    );
    return createdIndex;
  }

  public addStripToTrack(
    trackIndex: number,
    stripData: StripCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return null;
    }

    const targetFolderId = this.resolveFolderId(options?.parentFolderId, snapshot);
    if (!targetFolderId) {
      console.error(`Folder ${options?.parentFolderId ?? 'root'} not found while adding a strip.`);
      return null;
    }

    const placementId = stripData.id ?? crypto.randomUUID();
    this.mutateSnapshot(
      (workingSnapshot) => {
        const sourceId = stripData.sourceId ?? crypto.randomUUID();
        const existingSource = workingSnapshot.stripSources[sourceId];
        workingSnapshot.stripSources[sourceId] = {
          id: sourceId,
          type: 'strip-source',
          kind: stripData.kind ?? existingSource?.kind ?? 'unknown',
          name: stripData.sourceName,
          availableDurationTicks:
            stripData.availableDurationTicks ?? existingSource?.availableDurationTicks,
          metadata: stripData.metadata ?? existingSource?.metadata,
        };

        workingSnapshot.placements[placementId] = {
          id: placementId,
          type: 'strip-placement',
          sourceId,
          sourceOffsetTicks: stripData.sourceOffsetTicks ?? 0,
          durationTicks: stripData.durationTicks,
          startTick: stripData.startTick,
          startRow: Math.max(0, Math.floor(trackIndex)),
          laneSpan: stripData.laneSpan ?? 1,
          ordinal: workingSnapshot.root.nextOrdinal,
        };
        workingSnapshot.root.nextOrdinal += 1;
        this.insertPlacementIntoFolder(
          workingSnapshot,
          targetFolderId,
          placementId,
          options?.position,
        );
      },
      { preferredPlacementIds: [placementId] },
    );
    return placementId;
  }

  public addFolderToTrack(
    trackIndex: number,
    folderData: FolderCreationInput,
    options?: { parentFolderId?: string; position?: number },
  ): string | null {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return null;
    }

    const targetFolderId = this.resolveFolderId(options?.parentFolderId, snapshot);
    if (!targetFolderId) {
      console.error(`Folder ${options?.parentFolderId ?? 'root'} not found while adding a folder.`);
      return null;
    }

    const placementId = folderData.id ?? crypto.randomUUID();
    const sourceId = folderData.sourceId ?? crypto.randomUUID();
    this.mutateSnapshot(
      (workingSnapshot) => {
        const existingSource = workingSnapshot.folderSources[sourceId];
        workingSnapshot.folderSources[sourceId] = {
          id: sourceId,
          type: 'folder-source',
          name: folderData.name,
          bodyTrackCount: folderData.bodyTrackCount ?? existingSource?.bodyTrackCount ?? 1,
          childPlacementIds: [...(existingSource?.childPlacementIds ?? [])],
        };
        workingSnapshot.folderChildren[sourceId] = [
          ...(workingSnapshot.folderChildren[sourceId] ?? existingSource?.childPlacementIds ?? []),
        ];

        workingSnapshot.placements[placementId] = {
          id: placementId,
          type: 'folder-placement',
          sourceId,
          durationTicks: folderData.durationTicks,
          startTick: folderData.startTick,
          startRow: Math.max(0, Math.floor(trackIndex)),
          ordinal: workingSnapshot.root.nextOrdinal,
        };
        workingSnapshot.root.nextOrdinal += 1;
        this.insertPlacementIntoFolder(
          workingSnapshot,
          targetFolderId,
          placementId,
          options?.position,
        );
      },
      { preferredPlacementIds: [placementId], preferredFolderSourceIds: [sourceId] },
    );
    return placementId;
  }

  public updateStrip(itemId: string, updates: StripUpdateInput): boolean {
    if (!updates || Object.keys(updates).length === 0) {
      return false;
    }

    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    const currentPlacement = snapshot?.placements[itemId];
    if (!currentPlacement || currentPlacement.type !== 'strip-placement') {
      console.warn(`Strip placement ${itemId} was not found for update.`);
      return false;
    }

    this.mutateSnapshot(
      (workingSnapshot) => {
        const placement = workingSnapshot.placements[itemId];
        if (!placement || placement.type !== 'strip-placement') {
          return;
        }

        let sourceId = placement.sourceId;
        if (updates.sourceId !== undefined) {
          sourceId = updates.sourceId;
          const previousSource = workingSnapshot.stripSources[placement.sourceId];
          workingSnapshot.stripSources[sourceId] = workingSnapshot.stripSources[sourceId] ?? {
            id: sourceId,
            type: 'strip-source',
            kind: previousSource?.kind ?? 'unknown',
            name: previousSource?.name ?? 'Untitled Strip',
            availableDurationTicks: previousSource?.availableDurationTicks,
            metadata: previousSource?.metadata,
          };
          placement.sourceId = sourceId;
        }

        const source = workingSnapshot.stripSources[sourceId];
        if (source) {
          if (updates.sourceName !== undefined) {
            source.name = updates.sourceName;
          }
          if (updates.kind !== undefined) {
            source.kind = updates.kind;
          }
          if (updates.availableDurationTicks !== undefined) {
            source.availableDurationTicks = updates.availableDurationTicks ?? undefined;
          }
          if (updates.metadata !== undefined) {
            source.metadata = updates.metadata ?? undefined;
          }
        }

        if (updates.sourceOffsetTicks !== undefined) {
          placement.sourceOffsetTicks = updates.sourceOffsetTicks;
        }
        if (updates.durationTicks !== undefined) {
          placement.durationTicks = updates.durationTicks;
        }
        if (updates.startTick !== undefined) {
          placement.startTick = updates.startTick;
        }
        if (updates.startRow !== undefined) {
          placement.startRow = updates.startRow;
        }
        if (updates.laneSpan !== undefined) {
          placement.laneSpan = updates.laneSpan;
        }
      },
      { preferredPlacementIds: [itemId] },
    );
    return true;
  }

  public updateFolder(itemId: string, updates: FolderUpdateInput): boolean {
    if (!updates || Object.keys(updates).length === 0) {
      return false;
    }

    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    const currentPlacement = snapshot?.placements[itemId];
    if (!currentPlacement || currentPlacement.type !== 'folder-placement') {
      console.warn(`Folder placement ${itemId} was not found for update.`);
      return false;
    }

    this.mutateSnapshot(
      (workingSnapshot) => {
        const placement = workingSnapshot.placements[itemId];
        if (!placement || placement.type !== 'folder-placement') {
          return;
        }

        const source = workingSnapshot.folderSources[placement.sourceId];
        if (!source) {
          return;
        }

        if (updates.name !== undefined) {
          source.name = updates.name;
        }
        if (updates.bodyTrackCount !== undefined) {
          source.bodyTrackCount = updates.bodyTrackCount;
        }
        if (updates.durationTicks !== undefined) {
          placement.durationTicks = updates.durationTicks;
        }
        if (updates.startTick !== undefined) {
          placement.startTick = updates.startTick;
        }
        if (updates.startRow !== undefined) {
          placement.startRow = updates.startRow;
        }
      },
      { preferredPlacementIds: [itemId], preferredFolderSourceIds: [currentPlacement.sourceId] },
    );
    return true;
  }

  public moveItem(itemId: string, target: MoveTargetInput): boolean {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return false;
    }

    const location = this.findItemLocationById(itemId, snapshot);
    if (!location) {
      console.warn(`Item ${itemId} was not found for move.`);
      return false;
    }

    const targetFolderId = this.resolveFolderId(target.parentFolderId, snapshot);
    if (!targetFolderId) {
      console.error(`Folder ${target.parentFolderId ?? 'root'} not found while moving item.`);
      return false;
    }

    this.mutateSnapshot(
      (workingSnapshot) => {
        this.removePlacementFromFolder(workingSnapshot, location.parentFolderId, itemId);
        this.insertPlacementIntoFolder(workingSnapshot, targetFolderId, itemId, target.position);

        const placement = workingSnapshot.placements[itemId];
        if (!placement) {
          return;
        }

        placement.startRow = Math.max(0, Math.floor(target.trackIndex));
        if (target.startTick !== undefined) {
          placement.startTick = Math.max(0, Math.floor(target.startTick));
        }
      },
      { preferredPlacementIds: [itemId] },
    );
    return true;
  }

  public deleteItem(itemId: string, options?: DeleteItemOptions): boolean {
    const snapshot = this.latestSnapshot ?? this.buildSnapshot();
    if (!snapshot) {
      return false;
    }

    const location = this.findItemLocationById(itemId, snapshot);
    if (!location) {
      console.warn(`Item ${itemId} was not found for deletion.`);
      return false;
    }

    if (options?.parentFolderId && location.parentFolderId !== options.parentFolderId) {
      console.warn(
        `Item ${itemId} was found in folder ${location.parentFolderId} instead of ${options.parentFolderId}.`,
      );
      return false;
    }

    if (
      options?.expectedTrackIndex !== undefined &&
      location.trackIndex !== options.expectedTrackIndex
    ) {
      console.warn(
        `Item ${itemId} was found in track ${location.trackIndex} instead of ${options.expectedTrackIndex}.`,
      );
      return false;
    }

    this.mutateSnapshot((workingSnapshot) => {
      this.removePlacementFromFolder(workingSnapshot, location.parentFolderId, itemId);
      delete workingSnapshot.placements[itemId];
    });
    return true;
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

  private ensureSourcePlacementSchema(): void {
    const snapshot = this.readSnapshotFromYjs();
    if (snapshot?.root.rootFolderSourceId) {
      const normalized = normalizeTimelineSnapshot(snapshot);
      this.writeSnapshotToYjs(normalized);
      this.publishNow(normalized);
      return;
    }

    this.doc.transact(() => {
      this.clearDocument();
      const seededSnapshot = createDemoTimelineSnapshot();
      this.writeSnapshotToYjs(seededSnapshot);
    }, this.localTransactionOrigin);

    this.publishNow(this.buildSnapshot());
  }

  private mutateSnapshot(
    mutator: (snapshot: TimelineSnapshot) => void,
    normalizeOptions?: { preferredPlacementIds?: string[]; preferredFolderSourceIds?: string[] },
  ): void {
    let nextSnapshot: TimelineSnapshot | null = null;
    this.localMutationDepth += 1;
    try {
      this.doc.transact(() => {
        const workingSnapshot = this.buildSnapshot() ?? createDemoTimelineSnapshot();
        mutator(workingSnapshot);
        const normalized = normalizeTimelineSnapshot(workingSnapshot, normalizeOptions);
        this.writeSnapshotToYjs(normalized);
        nextSnapshot = normalized;
      }, this.localTransactionOrigin);
    } finally {
      this.localMutationDepth -= 1;
    }

    this.publishNow(nextSnapshot ?? this.buildSnapshot());
  }

  private publishNow(snapshot: TimelineSnapshot | null): void {
    this.publishSnapshot(snapshot);
  }

  private enqueuePublish(snapshot: TimelineSnapshot | null): void {
    this.queuedSnapshotForPublish = snapshot;
    this.hasQueuedPublish = true;

    if (this.publishFlushFrameId !== null) {
      return;
    }

    this.publishFlushFrameId = window.requestAnimationFrame(() => {
      this.publishFlushFrameId = null;
      this.flushQueuedPublish();
    });
  }

  private flushQueuedPublish(): void {
    if (!this.hasQueuedPublish) {
      return;
    }

    const snapshot = this.queuedSnapshotForPublish;
    this.hasQueuedPublish = false;
    this.queuedSnapshotForPublish = null;
    this.publishSnapshot(snapshot);
  }

  private buildSnapshot(): TimelineSnapshot | null {
    const rawSnapshot = this.readSnapshotFromYjs();
    if (!rawSnapshot) {
      return null;
    }
    return normalizeTimelineSnapshot(rawSnapshot);
  }

  private readSnapshotFromYjs(): TimelineSnapshot | null {
    const rootFolderSourceId = this.yRoot.get('rootFolderSourceId');
    if (typeof rootFolderSourceId !== 'string' || rootFolderSourceId.length === 0) {
      return null;
    }

    const timeScale = this.yRoot.get('timeScale');
    const nextOrdinal = this.yRoot.get('nextOrdinal');
    const normalizeVersion = this.yRoot.get('normalizeVersion');

    const root: TimelineSnapshot['root'] = {
      schemaVersion: 1,
      rootFolderSourceId,
      timeScale: typeof timeScale === 'number' ? timeScale : 0,
      nextOrdinal: typeof nextOrdinal === 'number' ? nextOrdinal : 0,
      normalizeVersion: typeof normalizeVersion === 'number' ? (normalizeVersion as 1) : 1,
    };

    const stripSources: TimelineSnapshot['stripSources'] = {};
    for (const [sourceId, ySource] of this.yStripSources.entries()) {
      stripSources[sourceId] = {
        id: typeof ySource.get('id') === 'string' ? (ySource.get('id') as string) : sourceId,
        type: 'strip-source',
        kind:
          typeof ySource.get('kind') === 'string'
            ? ((ySource.get('kind') as StripSource['kind']) ?? 'unknown')
            : 'unknown',
        name: typeof ySource.get('name') === 'string' ? (ySource.get('name') as string) : '',
        availableDurationTicks:
          typeof ySource.get('availableDurationTicks') === 'number'
            ? (ySource.get('availableDurationTicks') as number)
            : undefined,
        metadata: this.asRecord(ySource.get('metadata')),
      };
    }

    const folderChildren: TimelineSnapshot['folderChildren'] = {};
    for (const [folderSourceId, yChildList] of this.yFolderChildren.entries()) {
      folderChildren[folderSourceId] = yChildList.toArray();
    }

    const folderSources: TimelineSnapshot['folderSources'] = {};
    for (const [sourceId, ySource] of this.yFolderSources.entries()) {
      folderSources[sourceId] = {
        id: typeof ySource.get('id') === 'string' ? (ySource.get('id') as string) : sourceId,
        type: 'folder-source',
        name: typeof ySource.get('name') === 'string' ? (ySource.get('name') as string) : '',
        bodyTrackCount:
          typeof ySource.get('bodyTrackCount') === 'number'
            ? (ySource.get('bodyTrackCount') as number)
            : 0,
        childPlacementIds: [...(folderChildren[sourceId] ?? [])],
      };
    }

    const placements: TimelineSnapshot['placements'] = {};
    for (const [placementId, yPlacement] of this.yPlacements.entries()) {
      const type = yPlacement.get('type');
      if (type === 'strip-placement') {
        placements[placementId] = {
          id:
            typeof yPlacement.get('id') === 'string'
              ? (yPlacement.get('id') as string)
              : placementId,
          type: 'strip-placement',
          sourceId:
            typeof yPlacement.get('sourceId') === 'string'
              ? (yPlacement.get('sourceId') as string)
              : '',
          sourceOffsetTicks:
            typeof yPlacement.get('sourceOffsetTicks') === 'number'
              ? (yPlacement.get('sourceOffsetTicks') as number)
              : 0,
          durationTicks:
            typeof yPlacement.get('durationTicks') === 'number'
              ? (yPlacement.get('durationTicks') as number)
              : 0,
          startTick:
            typeof yPlacement.get('startTick') === 'number'
              ? (yPlacement.get('startTick') as number)
              : 0,
          startRow:
            typeof yPlacement.get('startRow') === 'number'
              ? (yPlacement.get('startRow') as number)
              : 0,
          laneSpan:
            typeof yPlacement.get('laneSpan') === 'number'
              ? (yPlacement.get('laneSpan') as number)
              : 1,
          ordinal:
            typeof yPlacement.get('ordinal') === 'number'
              ? (yPlacement.get('ordinal') as number)
              : 0,
        };
        continue;
      }

      if (type === 'folder-placement') {
        placements[placementId] = {
          id:
            typeof yPlacement.get('id') === 'string'
              ? (yPlacement.get('id') as string)
              : placementId,
          type: 'folder-placement',
          sourceId:
            typeof yPlacement.get('sourceId') === 'string'
              ? (yPlacement.get('sourceId') as string)
              : '',
          durationTicks:
            typeof yPlacement.get('durationTicks') === 'number'
              ? (yPlacement.get('durationTicks') as number)
              : 0,
          startTick:
            typeof yPlacement.get('startTick') === 'number'
              ? (yPlacement.get('startTick') as number)
              : 0,
          startRow:
            typeof yPlacement.get('startRow') === 'number'
              ? (yPlacement.get('startRow') as number)
              : 0,
          ordinal:
            typeof yPlacement.get('ordinal') === 'number'
              ? (yPlacement.get('ordinal') as number)
              : 0,
        };
      }
    }

    return {
      root,
      stripSources,
      folderSources,
      folderChildren,
      placements,
    };
  }

  private writeSnapshotToYjs(snapshot: TimelineSnapshot): void {
    this.clearDocument();

    for (const [key, value] of Object.entries(snapshot.root)) {
      this.yRoot.set(key, value);
    }

    for (const [sourceId, source] of Object.entries(snapshot.stripSources)) {
      const ySource = new Y.Map<unknown>() as YStripSourceMap;
      this.writeRecordToSharedMap(ySource as unknown as YWritableMap, source);
      this.yStripSources.set(sourceId, ySource);
    }

    for (const [sourceId, source] of Object.entries(snapshot.folderSources)) {
      const ySource = new Y.Map<unknown>() as YFolderSourceMap;
      this.writeRecordToSharedMap(ySource as unknown as YWritableMap, {
        id: source.id,
        type: source.type,
        name: source.name,
        bodyTrackCount: source.bodyTrackCount,
      });
      this.yFolderSources.set(sourceId, ySource);
    }

    for (const [folderSourceId, childPlacementIds] of Object.entries(snapshot.folderChildren)) {
      const yChildList = new Y.Array<string>() as YFolderChildrenArray;
      yChildList.push(childPlacementIds);
      this.yFolderChildren.set(folderSourceId, yChildList);
    }

    for (const [placementId, placement] of Object.entries(snapshot.placements)) {
      const yPlacement = new Y.Map<unknown>() as YPlacementMap;
      this.writeRecordToSharedMap(yPlacement as unknown as YWritableMap, placement);
      this.yPlacements.set(placementId, yPlacement);
    }
  }

  private clearDocument(): void {
    this.yRoot.clear();
    this.yStripSources.clear();
    this.yFolderSources.clear();
    this.yFolderChildren.clear();
    this.yPlacements.clear();
  }

  private writeRecordToSharedMap(sharedMap: YWritableMap, record: object): void {
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) {
        sharedMap.set(key, value);
      }
    }
  }

  private resolveFolderId(folderId: string | undefined, snapshot: TimelineSnapshot): string | null {
    if (!folderId) {
      return snapshot.root.rootFolderSourceId;
    }
    return folderId in snapshot.folderSources ? folderId : null;
  }

  private findParentFolderSourceId(itemId: string, snapshot: TimelineSnapshot): string | null {
    for (const folderSource of Object.values(snapshot.folderSources)) {
      if (folderSource.childPlacementIds.includes(itemId)) {
        return folderSource.id;
      }
    }
    return null;
  }

  private findItemLocationById(itemId: string, snapshot: TimelineSnapshot): ItemLocation | null {
    for (const folderSource of Object.values(snapshot.folderSources)) {
      const entryIndex = folderSource.childPlacementIds.indexOf(itemId);
      if (entryIndex === -1) {
        continue;
      }

      const placement = snapshot.placements[itemId];
      if (!placement) {
        continue;
      }

      return {
        parentFolderId: folderSource.id,
        trackIndex: placement.startRow,
        entryIndex,
      };
    }

    return null;
  }

  private insertPlacementIntoFolder(
    snapshot: TimelineSnapshot,
    folderSourceId: string,
    placementId: string,
    position?: number,
  ): void {
    const folderSource = snapshot.folderSources[folderSourceId];
    const childPlacementIds = [
      ...(snapshot.folderChildren[folderSourceId] ?? folderSource.childPlacementIds),
    ];
    const insertIndex = this.normalizeInsertIndex(position, childPlacementIds.length);
    childPlacementIds.splice(insertIndex, 0, placementId);
    folderSource.childPlacementIds = childPlacementIds;
    snapshot.folderChildren[folderSourceId] = childPlacementIds;
  }

  private removePlacementFromFolder(
    snapshot: TimelineSnapshot,
    folderSourceId: string,
    placementId: string,
  ): void {
    const folderSource = snapshot.folderSources[folderSourceId];
    if (!folderSource) {
      return;
    }

    const childPlacementIds = folderSource.childPlacementIds.filter(
      (childId) => childId !== placementId,
    );
    folderSource.childPlacementIds = childPlacementIds;
    snapshot.folderChildren[folderSourceId] = childPlacementIds;
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

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    return { ...(value as Record<string, unknown>) };
  }

  private publishSnapshot(snapshot: TimelineSnapshot | null): void {
    if (!snapshot && this.latestSnapshot) {
      return;
    }

    this.latestSnapshot = snapshot;
    for (const listener of this.timelineSubscribers) {
      listener(snapshot);
    }
  }
}
