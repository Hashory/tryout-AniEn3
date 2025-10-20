import { Injectable, signal, computed, inject } from '@angular/core';
import { YjsTimelineService } from './anien-timeline-store.service';
import { Strip, Folder } from './anien-timeline.types';

// --- ViewModelの型定義 ---
// View（コンポーネント）が使いやすいように、Modelの型にUI状態を追加します。

export interface StripVM extends Strip {
  isSelected: boolean;
  trackOrder: number;
}

export interface FolderVM extends Omit<Folder, 'strips'> {
  isSelected: boolean;
  isExpanded: boolean;
  trackOrder: number;
  trackLength: number;
}

type TimelineItemVM = StripVM | FolderVM;
type TrackVM = TimelineItemVM[];

@Injectable({
  providedIn: 'root',
})
export class TimelineStateService {
  // Inject model service
  private readonly yjsService = inject(YjsTimelineService);

  // Subscribe to model changes
  private readonly model = this.yjsService.timelineSnapshot;

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

  public readonly rootTracksVM = signal<TrackVM>([
    {
      type: 'strip',
      id: 'strip-1',
      source: 'Video Clip 1',
      startFrame: 0,
      length: 150,
      isSelected: false,
      trackOrder: 0,
    },
    {
      type: 'strip',
      id: 'strip-2',
      source: 'Video Clip 2',
      startFrame: 20,
      length: 150,
      isSelected: false,
      trackOrder: 2,
    },
    {
      type: 'folder',
      id: 'folder-1',
      name: 'Folder 1',
      startFrame: 20,
      length: 200,
      isSelected: false,
      isExpanded: true,
      trackOrder: 1,
      trackLength: 2,
    },
    {
      type: 'folder',
      id: 'folder-2',
      name: 'Folder 2',
      startFrame: 20,
      length: 200,
      isSelected: false,
      isExpanded: false,
      trackOrder: 5,
      trackLength: 2,
    },
  ]);

  /**
   * Model(生データ) と UI状態(選択状態など) をマージして、
   * Viewが消費するためのViewModelを生成する Signal。
   * * これが「作るのが大変になります」という問題を解決します。
   */
  // public readonly rootTracksVM: Signal<TrackVM[]> = computed(() => {
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
    let nextExpandedState = false;

    this._expandedFolderIds.update((currentSet) => {
      const updated = new Set(currentSet);
      if (updated.has(id)) {
        updated.delete(id);
        nextExpandedState = false;
      } else {
        updated.add(id);
        nextExpandedState = true;
      }
      return updated;
    });

    this.rootTracksVM.update((tracks) =>
      tracks.map((track) =>
        track.type === 'folder' && track.id === id
          ? { ...track, isExpanded: nextExpandedState }
          : track,
      ),
    );
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
}
