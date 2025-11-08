import { Injectable, signal, computed, inject, Signal, DestroyRef } from '@angular/core';
import { YjsTimelineService } from './anien-timeline-store.service';
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
  readonly expandedIds: ReadonlySet<string>;
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
  private readonly _expandedFolderIds = signal<Set<string>>(new Set<string>());
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
      expandedIds: this._expandedFolderIds(),
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

        if (!folderVM.isExpanded) {
          continue;
        }

        const childVisibility = parentVisible && folderVM.isExpanded;
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
        currentSet.add(id);
        return new Set(currentSet);
      }
      return new Set([id]);
    });
  }

  public clearSelection(): void {
    this._selectedItemIds.set(new Set());
  }

  public toggleFolderExpansion(id: string): void {
    this._expandedFolderIds.update((currentSet) => {
      const updated = new Set(currentSet);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  }

  public addTrack(): void {
    this.yjsService.addTrack();
  }

  public deleteSelectedItem(): void {
    // Future deletion logic will determine the track scope and remove the item before clearing.
    this.clearSelection();
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
    const { selectedIds, expandedIds } = context;
    const isRootFolder = folder.root === true;
    const isExpanded = isRootFolder || expandedIds.has(folder.id);
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
}
