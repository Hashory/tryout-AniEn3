import { Injectable, signal, computed, inject, Signal, DestroyRef } from '@angular/core';
import { YjsTimelineService } from './anien-timeline-store.service';
import { Strip, Folder } from './anien-timeline.types';

// --- ViewModelの型定義 ---
// View（コンポーネント）が使いやすいように、Modelの型にUI状態を追加します。

// TODO: Write a test for the ViewModel

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

  // --- 5. ViewModel (加工済みデータ) を computed で作成・公開 ---

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

    const processTrack = (trackItems: (Strip | Folder)[], parentVisible: boolean): void => {
      const currentTrackOrder = nextTrackOrder++;

      for (const item of trackItems) {
        if (item.type === 'strip') {
          items.push(this.mapStrip(item, currentTrackOrder, parentVisible, context.selectedIds));
          continue;
        }

        const folderVM = this.mapFolder(item, currentTrackOrder, parentVisible, context);
        items.push(folderVM);

        if (!folderVM.isExpanded) {
          continue;
        }

        const childVisibility = parentVisible && folderVM.isExpanded;
        for (const nestedTrack of item.strips) {
          processTrack(nestedTrack, childVisibility);
        }
      }
    };

    for (const track of rootModel.strips) {
      processTrack(track, true);
    }

    return items;
  });

  /**
   * Model(生データ) と UI状態(選択状態など) をマージして、
   * Viewが消費するためのViewModelを生成する Signal。
   * * これが「作るのが大変になります」という問題を解決します。
   */
  // public readonly timelineItemsLegacy: Signal<TrackVM[]> = computed(() => {
  //   const rootModel = this.model();
  //   if (!rootModel) {
  //     return []; // Modelがロード中なら空を返す
  //   }

  //   // UI状態を取得
  //   const selectedIds = this._selectedItemIds();
  //   const expandedIds = this._expandedFolderIds();

  //   // Modelの 'strips' を再帰的に 'stripsVM' に変換する
  //   const convertToVM = (item: Strip | Folder): StripVM | FolderVM => {
  //     const isSelected = selectedIds.has(item.id);

  //     if (item.type === 'strip') {
  //       const stripVM: StripVM = { ...item, isSelected };
  //       return stripVM;
  //     }

  //     if (item.type === 'folder') {
  //       const isExpanded = expandedIds.has(item.id);

  //       // フォルダ内のトラックも再帰的に変換
  //       const nestedTracksVM = item.strips.map(
  //         (track) => track.map(convertToVM), // ★再帰呼び出し
  //       );

  //       const folderVM: FolderVM = {
  //         ...item,
  //         isSelected,
  //         isExpanded,
  //         strips: nestedTracksVM,
  //       };
  //       return folderVM;
  //     }

  //     // 型エラーを防ぐ (起こらないはず)
  //     throw new Error('Unknown item type');
  //   };

  //   // ルートフォルダの全トラックをVMに変換
  //   return rootModel.strips.map((track) => track.map(convertToVM));
  // });

  // ルートフォルダ名もここで公開
  public readonly timelineName = computed(() => this.model()?.name ?? 'Loading...');

  // --- 6. Viewからの操作 (Intent) ---

  // UI状態の更新
  public setFrame(frame: number): void {
    this._currentFrame.set(frame);
  }

  public selectItem(id: string, multiSelect = false): void {
    this._selectedItemIds.update((currentSet) => {
      if (multiSelect) {
        currentSet.add(id);
        return new Set(currentSet);
      }
      return new Set([id]); // 単一選択
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

  // Model操作の委譲
  public addTrack(): void {
    this.yjsService.addTrack();
  }

  public deleteSelectedItem(): void {
    // 複雑なロジックの例:
    // 選択中のIDを取得し、YjsServiceのdeleteItem...を呼ぶ
    // (このロジックはここにカプセル化される)
    // const selectedIds = this._selectedItemIds();
    // ... (削除ロジック) ...
    // this.yjsService.deleteItemFromTrack(trackIndex, id);

    // 削除したら選択を解除
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
  ): StripVM {
    return {
      ...strip,
      isSelected: selectedIds.has(strip.id),
      trackOrder,
      isParentFolderVisible,
    };
  }

  private mapFolder(
    folder: Folder,
    trackOrder: number,
    isParentFolderVisible: boolean,
    context: MapContext,
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
