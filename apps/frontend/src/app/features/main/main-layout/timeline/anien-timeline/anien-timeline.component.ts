import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { YjsDocumentService } from '#app/core/collaboration/yjs-document.service';
import {
  FolderVM,
  StripVM,
  TimelineStateService,
} from '#app/features/main/main-layout/timeline/services/timeline-state.service';
import type { MoveTargetInput } from '#app/features/main/main-layout/timeline/services/timeline-store.service';
import { TimelineUploadService } from '#app/features/main/main-layout/timeline/services/timeline-upload.service';
import { AnienFolderComponent } from '#app/features/main/main-layout/timeline/anien-timeline/anien-folder.component';
import { AnienStripComponent } from '#app/features/main/main-layout/timeline/anien-timeline/anien-strip.component';

interface SnapGuideState {
  tick: number | null;
  row: number | null;
}

interface TimelineBounds {
  startTick: number;
  endTick: number;
  startRow: number;
  endRow: number;
}

interface TimelineRect {
  leftTick: number;
  rightTick: number;
  topRow: number;
  bottomRow: number;
}

interface DropProbePoint {
  absoluteTick: number;
  absoluteRow: number;
}

interface ExternalDropStripInput {
  sourceName: string;
  kind: 'media' | 'generated';
  durationTicks: number;
  file?: File;
}

interface ItemDragState {
  type: 'move' | 'resize-left' | 'resize-right' | 'resize-top' | 'resize-bottom';
  itemId: string;
  itemType: 'strip' | 'folder';
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  initialStartTick: number;
  initialStartRow: number;
  initialDurationTicks: number;
  initialBodyTrackCount: number;
  initialRowSpan: number;
  parentAbsoluteStartTick: number;
  parentAbsoluteStartRow: number;
  excludedCollisionIds: Set<string>;
  appliedDeltaTicks: number;
  appliedDeltaRows: number;
}

@Component({
  selector: 'app-anien-timeline',
  standalone: true,
  host: {
    '[style.--timeline-tick-size]': 'tickSizeCss()',
    '(wheel)': 'onHostWheel($event)',
    '(window:keydown)': 'onWindowKeydown($event)',
    '(window:keyup)': 'onWindowKeyup($event)',
    '(window:blur)': 'onWindowBlur()',
  },
  template: `
    <div class="timeline-header">
      <button class="add-track-btn" (click)="addTrack()">+</button>
      <div class="ruler-wrapper" #rulerWrapper (mousedown)="onRulerMouseDown($event)">
        <div class="ruler-track" [style.width]="timelineWidthStyle()">
          @for (tick of rulerTicks(); track tick) {
            <div
              class="ruler-label"
              [style.left]="'calc(var(--timeline-tick-size) * ' + tick + ')'"
            >
              {{ tick }}
            </div>
          }
          <div
            class="playhead-handle"
            [style.left]="'calc(var(--timeline-tick-size) * ' + currentTick() + ')'"
          ></div>
        </div>
      </div>
    </div>

    @if (isTimelineLoading()) {
      <div class="timeline-loading-state" role="status" aria-live="polite">Loading Data...</div>
    } @else {
      <div
        class="timeline-sidebar"
        tabindex="0"
        (mousedown)="onTimelineMouseDown($event)"
        (click)="onBackgroundClick($event)"
        (keydown.enter)="onBackgroundKeydown($event)"
        (keydown.space)="onBackgroundKeydown($event)"
      ></div>

      <div class="timeline-main-wrapper" #mainWrapper (scroll)="onMainScroll($event)">
        <div
          class="timeline-main"
          [style.width]="timelineWidthStyle()"
          [style.height]="timelineHeightStyle()"
          tabindex="0"
          (mousedown)="onTimelineMouseDown($event)"
          (dragover)="onTimelineDragOver($event)"
          (drop)="onTimelineDrop($event)"
          (click)="onBackgroundClick($event)"
          (keydown.enter)="onBackgroundKeydown($event)"
          (keydown.space)="onBackgroundKeydown($event)"
        >
          <div
            class="playhead-line"
            [style.left]="'calc(var(--timeline-tick-size) * ' + currentTick() + ')'"
          ></div>

          @if (snapGuideState(); as snapGuide) {
            @if (snapGuide.tick !== null) {
              <div
                class="snap-guide-vertical"
                [style.left]="'calc(var(--timeline-tick-size) * ' + snapGuide.tick + ')'"
              ></div>
            }
            @if (snapGuide.row !== null) {
              <div
                class="snap-guide-horizontal"
                [style.top]="'calc(var(--timeline-track-height) * ' + snapGuide.row + ')'"
              ></div>
            }
          }

          @for (item of timelineItems(); track item.id) {
            @if (item.type === 'strip') {
              <app-anien-strip
                [item]="item"
                [clipPath]="itemClipPath(item)"
                [sheduleStrip]="item.sourceKind === 'solid'"
                [scheduleBrand]="item.scheduleBrand ?? 'ae'"
                (itemMouseDown)="onItemMouseDown($event, item)"
                (itemKeydown)="onItemKeydown($event, item.id)"
                (resizeStart)="onItemResizeStart($event, item)"
                (externalDrop)="onStripExternalDrop($event, item)"
              />
            } @else {
              <app-anien-folder
                [item]="item"
                [clipPath]="itemClipPath(item)"
                (itemMouseDown)="onItemMouseDown($event, item)"
                (itemKeydown)="onItemKeydown($event, item.id)"
                (resizeStart)="onItemResizeStart($event, item)"
              />
            }
          } @empty {
            <div class="empty-state">No timeline items yet.</div>
          }
        </div>
      </div>
    }

    <div class="timeline-actions">
      <div class="actions-label">Initialize</div>
      <div class="actions-group">
        <button type="button" class="secondary-action" (click)="resetDemoTimeline()">
          Reset Demo Timeline
        </button>
      </div>
      <div class="actions-label">Create</div>
      <div class="actions-group">
        <button type="button" (click)="createStrip()">Add Strip</button>
        <button type="button" (click)="createFolder()">Add Folder</button>
        <button type="button" (click)="createShedulePresetFolder()">Add Shedule Folder</button>
      </div>
      <div class="actions-label">Selection Actions</div>
      <div class="actions-group">
        <button type="button" (click)="shiftSelection(-1)" [disabled]="!hasSelection()">
          Move -1 tick
        </button>
        <button type="button" (click)="shiftSelection(1)" [disabled]="!hasSelection()">
          Move +1 tick
        </button>
        <button type="button" (click)="shiftSelection(-10)" [disabled]="!hasSelection()">
          Move -10 ticks
        </button>
        <button type="button" (click)="shiftSelection(10)" [disabled]="!hasSelection()">
          Move +10 ticks
        </button>
        <button type="button" (click)="shiftSelectionRows(-1)" [disabled]="!hasSelection()">
          Move -1 row
        </button>
        <button type="button" (click)="shiftSelectionRows(1)" [disabled]="!hasSelection()">
          Move +1 row
        </button>
        <button type="button" (click)="adjustSelectionDuration(-1)" [disabled]="!hasSelection()">
          Shorten -1 tick
        </button>
        <button type="button" (click)="adjustSelectionDuration(1)" [disabled]="!hasSelection()">
          Extend +1 tick
        </button>
        <button type="button" (click)="deleteSelected()" [disabled]="!hasSelection()">
          Delete Selected
        </button>
        <button type="button" class="secondary-action" (click)="undo()" [disabled]="!canUndo()">
          Undo
        </button>
      </div>
      <div class="actions-label">Debug</div>
      <div class="actions-group">
        <button type="button" class="secondary-action" (click)="toggleDebugPanel()">
          {{ debugPanelVisible() ? 'Hide' : 'Show' }} Snapshot
        </button>
        <button
          type="button"
          class="secondary-action"
          (click)="copyDebugSnapshot()"
          [disabled]="!debugSnapshotJson()"
        >
          {{ snapshotCopyLabel() }}
        </button>
      </div>
    </div>

    @if (debugPanelVisible()) {
      <aside class="timeline-debug-panel" aria-label="Timeline debug snapshot">
        <div class="debug-panel-header">
          <div>
            <div class="debug-panel-title">Timeline Snapshot</div>
            @if (debugStats(); as stats) {
              <div class="debug-panel-meta">
                Schema {{ stats.schemaVersion }} / Normalize {{ stats.normalizeVersion }} / Scale
                {{ stats.timeScale }}
              </div>
            }
          </div>
          <button type="button" class="secondary-action" (click)="toggleDebugPanel()">Close</button>
        </div>

        @if (debugStats(); as stats) {
          <dl class="debug-stats-grid">
            <div>
              <dt>Root</dt>
              <dd>{{ stats.rootFolderSourceId }}</dd>
            </div>
            <div>
              <dt>Strip Sources</dt>
              <dd>{{ stats.stripSourceCount }}</dd>
            </div>
            <div>
              <dt>Folder Sources</dt>
              <dd>{{ stats.folderSourceCount }}</dd>
            </div>
            <div>
              <dt>Placements</dt>
              <dd>{{ stats.placementCount }}</dd>
            </div>
          </dl>
        }

        <pre>{{ debugSnapshotJson() }}</pre>
      </aside>
    }
  `,
  styles: [
    `
      * {
        outline: none;
      }

      :host {
        --timeline-tick-size: 2px;
        --timeline-track-height: 34px;
        --timeline-sidebar-width: 33px;
        --timeline-grid-gap: 3px;
        --timeline-strip-padding-x: 9px;
        --timeline-strip-offset: 2px;
        --timeline-background-stripe-height: 30px;
        --timeline-folder-offset: 4px;
        --timeline-folder-content-stripe-height: 4px;

        display: grid;
        width: 100%;
        height: 100%;
        background: #101417;
        border-radius: 8px 8px 0 0;
        grid-template-rows: 25px auto;
        grid-template-columns: var(--timeline-sidebar-width) auto;
        column-gap: var(--timeline-grid-gap);
        position: relative;
      }

      .timeline-header {
        grid-column: 1 / span 2;
        grid-row: 1 / 2;
        display: grid;
        grid-template-columns: var(--timeline-sidebar-width) auto;
        background-color: #1e2226;
        border-bottom: 1px solid #101417;
      }

      .timeline-header .add-track-btn {
        background: transparent;
        border: none;
        color: #9aa3b5;
        cursor: pointer;
      }

      .timeline-header .add-track-btn:hover {
        color: white;
      }

      .ruler-wrapper {
        overflow: hidden;
        position: relative;
        cursor: text;
        user-select: none;
      }

      .ruler-track {
        height: 100%;
        position: relative;
        background-image:
          repeating-linear-gradient(
            to right,
            transparent,
            transparent calc(var(--timeline-tick-size) * 30 - 1px),
            #666 calc(var(--timeline-tick-size) * 30 - 1px),
            #666 calc(var(--timeline-tick-size) * 30)
          ),
          repeating-linear-gradient(
            to right,
            transparent,
            transparent calc(var(--timeline-tick-size) * 10 - 1px),
            #444 calc(var(--timeline-tick-size) * 10 - 1px),
            #444 calc(var(--timeline-tick-size) * 10)
          );
        background-size:
          100% 12px,
          100% 6px;
        background-position:
          bottom left,
          bottom left;
        background-repeat: repeat-x, repeat-x;
      }

      .ruler-label {
        position: absolute;
        bottom: 12px;
        font-size: 10px;
        color: #888;
        transform: translateX(-50%);
        pointer-events: none;
      }

      .playhead-handle {
        position: absolute;
        bottom: 0;
        width: 11px;
        height: 11px;
        background-color: #ff3333;
        transform: translateX(-2px);
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        z-index: 30001;
        pointer-events: none;
      }

      .timeline-main .playhead-line {
        position: absolute;
        inset: 0 auto 0 0;
        width: 1px;
        background-color: #ff3333;
        z-index: 30000;
        pointer-events: none;
      }

      .timeline-main .snap-guide-vertical,
      .timeline-main .snap-guide-horizontal {
        position: absolute;
        pointer-events: none;
        z-index: 29999;
      }

      .timeline-main .snap-guide-vertical {
        inset: 0 auto 0 0;
        width: 1px;
        background: #8dd7ff;
        box-shadow: 0 0 8px rgba(141, 215, 255, 0.75);
      }

      .timeline-main .snap-guide-horizontal {
        inset: 0 0 auto 0;
        height: 1px;
        background: #88f6a8;
        box-shadow: 0 0 8px rgba(136, 246, 168, 0.75);
      }

      .timeline-sidebar {
        grid-column: 1 / 2;
        grid-row: 2 / span 1;
      }

      .timeline-loading-state {
        grid-column: 1 / span 2;
        grid-row: 2 / span 1;
        display: grid;
        place-items: center;
        color: #cdd5e3;
        font-size: 14px;
        letter-spacing: 0.03em;
        background: linear-gradient(180deg, rgba(15, 20, 24, 0.65) 0%, rgba(11, 15, 18, 0.9) 100%);
      }

      .timeline-main-wrapper {
        grid-column: 2 / span 1;
        grid-row: 2 / span 1;
        overflow: auto;
        scrollbar-width: none;
      }

      .timeline-main {
        position: relative;
        background-color: #0b0f12;
        background-image: repeating-linear-gradient(
          to bottom,
          #262a2e,
          #262a2e var(--timeline-background-stripe-height),
          #0b0f12 var(--timeline-background-stripe-height),
          #0b0f12 var(--timeline-track-height)
        );
      }

      .timeline-main .empty-state {
        color: white;
        height: 100%;
        display: grid;
        justify-content: center;
        align-items: center;
      }

      .timeline-actions {
        position: absolute;
        right: 12px;
        bottom: 12px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      .timeline-actions button {
        padding: 6px 12px;
        border-radius: 4px;
        border: none;
        background-color: #2f6fed;
        color: #ffffff;
        cursor: pointer;
        min-width: 138px;
      }

      .timeline-actions button.secondary-action,
      .timeline-debug-panel button.secondary-action {
        background-color: #38404d;
      }

      .timeline-actions button:disabled {
        background-color: #3a3f49;
        cursor: not-allowed;
        color: #888d9a;
      }

      .timeline-actions .actions-label {
        font-size: 12px;
        text-transform: uppercase;
        color: #9aa3b5;
      }

      .timeline-actions .actions-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .timeline-debug-panel {
        position: absolute;
        right: 172px;
        bottom: 12px;
        width: min(520px, calc(100% - 196px));
        max-height: min(50vh, 420px);
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        border: 1px solid #2c3442;
        border-radius: 8px;
        background: rgba(13, 17, 22, 0.96);
        color: #dce5f2;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        z-index: 40000;
      }

      .timeline-debug-panel .debug-panel-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .timeline-debug-panel .debug-panel-title {
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .timeline-debug-panel .debug-panel-meta {
        margin-top: 4px;
        font-size: 11px;
        color: #94a3b8;
      }

      .timeline-debug-panel .debug-stats-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 12px;
        margin: 0;
      }

      .timeline-debug-panel .debug-stats-grid div {
        padding: 8px 10px;
        border-radius: 6px;
        background: rgba(56, 64, 77, 0.35);
      }

      .timeline-debug-panel dt {
        font-size: 11px;
        text-transform: uppercase;
        color: #94a3b8;
      }

      .timeline-debug-panel dd {
        margin: 4px 0 0;
        font-size: 12px;
        word-break: break-all;
      }

      .timeline-debug-panel pre {
        margin: 0;
        padding: 12px;
        border-radius: 6px;
        background: #090c10;
        color: #cbe6ff;
        overflow: auto;
        font-size: 11px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnienStripComponent, AnienFolderComponent],
})
export class AnienTimelineComponent implements OnDestroy {
  private readonly stateService = inject(TimelineStateService);
  private readonly collabService = inject(YjsDocumentService);
  private readonly uploadService = inject(TimelineUploadService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  public readonly timelineItems = this.stateService.timelineItems;
  public readonly timelineRows = this.stateService.timelineRows;
  public readonly timelineExtentTicks = this.stateService.timelineExtentTicks;
  public readonly timelineName = this.stateService.timelineName;
  public readonly rootFolderSourceId = this.stateService.rootFolderSourceId;
  public readonly selectedItemIds = this.stateService.selectedItemIds;
  public readonly hasSelection = computed(() => this.selectedItemIds().size > 0);
  public readonly canUndo = this.stateService.canUndo;
  public readonly currentTick = this.stateService.currentTick;
  public readonly zoomLevel = this.stateService.zoomLevel;
  public readonly tickSizePx = this.stateService.tickSizePx;
  public readonly tickSizeCss = computed(() => this.tickSizePx() + 'px');
  public readonly debugStats = this.stateService.debugStats;
  public readonly debugSnapshotJson = this.stateService.debugSnapshotJson;
  public readonly isTimelineLoading = computed(
    () => !this.collabService.isConnected() || !this.collabService.isSynced(),
  );
  public readonly rulerTicks = computed(() => {
    const extent = this.timelineExtentTicks();
    return Array.from({ length: Math.floor(extent / 30) + 1 }, (_, index) => index * 30);
  });
  public readonly timelineWidthStyle = computed(
    () => 'calc(var(--timeline-tick-size) * ' + this.timelineExtentTicks() + ')',
  );
  public readonly timelineHeightStyle = computed(
    () => 'calc(var(--timeline-track-height) * ' + this.timelineRows() + ')',
  );
  private readonly itemClipPathMap = computed(() => {
    const tickSizePx = this.tickSizePx();
    if (tickSizePx <= 0) {
      return new Map<string, string | null>();
    }

    const rootFolderSourceId = this.rootFolderSourceId();
    const folderBySourceId = new Map<string, FolderVM>();
    for (const item of this.timelineItems()) {
      if (item.type === 'folder') {
        folderBySourceId.set(item.sourceId, item);
      }
    }

    const clipMap = new Map<string, string | null>();
    for (const item of this.timelineItems()) {
      const itemRect: TimelineRect = {
        leftTick: item.absoluteStartTick,
        rightTick: item.absoluteStartTick + item.durationTicks,
        topRow: item.absoluteStartRow,
        bottomRow: item.absoluteStartRow + item.rowSpan,
      };

      let clippedRect: TimelineRect = { ...itemRect };
      let parentFolderSourceId = item.parentFolderId;
      let hasAncestorClip = false;

      while (parentFolderSourceId && parentFolderSourceId !== rootFolderSourceId) {
        const ancestorFolder = folderBySourceId.get(parentFolderSourceId);
        if (!ancestorFolder) {
          break;
        }

        const ancestorContentRect: TimelineRect = {
          leftTick: ancestorFolder.absoluteStartTick,
          rightTick: ancestorFolder.absoluteStartTick + ancestorFolder.durationTicks,
          topRow: ancestorFolder.absoluteStartRow + 1,
          bottomRow: ancestorFolder.absoluteStartRow + 1 + ancestorFolder.bodyTrackCount,
        };

        clippedRect = this.intersectRects(clippedRect, ancestorContentRect);
        hasAncestorClip = true;
        parentFolderSourceId = ancestorFolder.parentFolderId;
      }

      if (!hasAncestorClip) {
        clipMap.set(item.id, null);
        continue;
      }

      const visibleWidthTicks = clippedRect.rightTick - clippedRect.leftTick;
      const visibleHeightRows = clippedRect.bottomRow - clippedRect.topRow;
      if (visibleWidthTicks <= 0 || visibleHeightRows <= 0) {
        clipMap.set(item.id, 'inset(100% 0 0 0)');
        continue;
      }

      const leftInsetPx = Math.max(0, (clippedRect.leftTick - itemRect.leftTick) * tickSizePx);
      const rightInsetPx = Math.max(0, (itemRect.rightTick - clippedRect.rightTick) * tickSizePx);
      const topInsetPx = Math.max(0, (clippedRect.topRow - itemRect.topRow) * this.TRACK_HEIGHT);
      const bottomInsetPx = Math.max(
        0,
        (itemRect.bottomRow - clippedRect.bottomRow) * this.TRACK_HEIGHT,
      );

      if (leftInsetPx === 0 && rightInsetPx === 0 && topInsetPx === 0 && bottomInsetPx === 0) {
        clipMap.set(item.id, null);
        continue;
      }

      clipMap.set(
        item.id,
        `inset(${topInsetPx}px ${rightInsetPx}px ${bottomInsetPx}px ${leftInsetPx}px)`,
      );
    }

    return clipMap;
  });

  @ViewChild('mainWrapper') mainWrapperRef?: ElementRef<HTMLDivElement>;
  @ViewChild('rulerWrapper') rulerWrapperRef?: ElementRef<HTMLDivElement>;

  private readonly TRACK_HEIGHT = 34;
  private readonly HORIZONTAL_SNAP_THRESHOLD_PX = 10;
  private readonly VERTICAL_SNAP_THRESHOLD_PX = 10;
  private readonly DRAG_ACTIVATION_THRESHOLD_PX = 3;
  private readonly STRIP_MAX_LANE_SPAN = 2;

  public readonly debugPanelVisible = signal(false);
  public readonly snapshotCopyLabel = signal('Copy Snapshot JSON');
  public readonly snapGuideState = signal<SnapGuideState | null>(null);

  private dragState: ItemDragState | null = null;

  private mouseDownState: {
    startX: number;
    startY: number;
    item: StripVM | FolderVM;
    event: MouseEvent;
  } | null = null;

  private rulerDragState: { isDragging: boolean; startX: number } | null = null;
  private zoomDragState: {
    startY: number;
    initialZoom: number;
    anchorTick: number;
    viewportX: number;
  } | null = null;
  private isSpacePressed = false;
  private renderFrameId: number | null = null;
  private detachRenderId: number | null = null;
  private snapshotCopyResetTimeoutId: number | null = null;
  private dragPendingEvent: MouseEvent | null = null;
  private dragFlushFrameId: number | null = null;
  private renderRequested = false;
  private dragReferenceItems: (StripVM | FolderVM)[] | null = null;

  private scheduleDragFlush(): void {
    if (this.dragFlushFrameId !== null) {
      return;
    }

    this.dragFlushFrameId = window.requestAnimationFrame(() => {
      this.dragFlushFrameId = null;

      const pendingEvent = this.dragPendingEvent;
      this.dragPendingEvent = null;
      if (!pendingEvent || !this.dragState) {
        return;
      }

      this.handleDrag(pendingEvent);
    });
  }

  private clearDragInteractionState(): void {
    if (this.dragFlushFrameId !== null) {
      window.cancelAnimationFrame(this.dragFlushFrameId);
      this.dragFlushFrameId = null;
    }

    this.dragPendingEvent = null;
    this.dragReferenceItems = null;
  }

  private getDragReferenceItems(): (StripVM | FolderVM)[] {
    return this.dragReferenceItems ?? this.timelineItems();
  }

  private updateDragReferenceItems(): void {
    this.dragReferenceItems = [...this.timelineItems()];
  }

  public ngOnDestroy(): void {
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
    window.removeEventListener('mousemove', this.onRulerMouseMove);
    window.removeEventListener('mouseup', this.onRulerMouseUp);
    this.stopZoneLessDragLoop();

    if (this.snapshotCopyResetTimeoutId !== null) {
      window.clearTimeout(this.snapshotCopyResetTimeoutId);
      this.snapshotCopyResetTimeoutId = null;
    }

    this.clearDragInteractionState();

    this.snapGuideState.set(null);
  }

  public addTrack(): void {
    this.stateService.addTrack();
  }

  public createStrip(): void {
    this.stateService.createStrip();
  }

  public createFolder(): void {
    this.stateService.createFolder();
  }

  public createShedulePresetFolder(): void {
    this.stateService.createShedulePresetFolder();
  }

  public resetDemoTimeline(): void {
    this.stateService.resetToDemoTimeline();
    this.debugPanelVisible.set(false);
  }

  public toggleDebugPanel(): void {
    this.debugPanelVisible.update((visible) => !visible);
  }

  public async copyDebugSnapshot(): Promise<void> {
    const snapshotJson = this.debugSnapshotJson();
    if (!snapshotJson) {
      return;
    }

    try {
      await navigator.clipboard.writeText(snapshotJson);
      this.snapshotCopyLabel.set('Copied Snapshot');
    } catch {
      this.snapshotCopyLabel.set('Copy Failed');
    }

    if (this.snapshotCopyResetTimeoutId !== null) {
      window.clearTimeout(this.snapshotCopyResetTimeoutId);
    }

    this.snapshotCopyResetTimeoutId = window.setTimeout(() => {
      this.snapshotCopyLabel.set('Copy Snapshot JSON');
      this.snapshotCopyResetTimeoutId = null;
    }, 1800);
  }

  public onItemMouseDown(event: MouseEvent, item: StripVM | FolderVM): void {
    if (this.tryStartZoomDrag(event)) {
      return;
    }

    this.mouseDownState = {
      startX: event.clientX,
      startY: event.clientY,
      item,
      event,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
    this.updateDragReferenceItems();
  }

  public onResizeHandleMouseDown(
    event: MouseEvent,
    item: StripVM | FolderVM,
    side: 'left' | 'right',
  ): void {
    event.stopPropagation();
    event.preventDefault();

    this.stateService.selectItem(item.id, false);
    this.dragState = {
      type: side === 'left' ? 'resize-left' : 'resize-right',
      itemId: item.id,
      itemType: item.type,
      startX: event.clientX,
      startY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      initialStartTick: item.startTick,
      initialStartRow: item.startRow,
      initialDurationTicks: item.durationTicks,
      initialBodyTrackCount: item.type === 'folder' ? item.bodyTrackCount : 0,
      initialRowSpan: item.type === 'folder' ? item.rowSpan : item.rowSpan,
      parentAbsoluteStartTick: item.parentStartTick,
      parentAbsoluteStartRow: item.absoluteStartRow - item.startRow,
      excludedCollisionIds: this.createExcludedCollisionIds(item),
      appliedDeltaTicks: 0,
      appliedDeltaRows: 0,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
    this.updateDragReferenceItems();
  }

  public onVerticalResizeMouseDown(
    event: MouseEvent,
    item: FolderVM | StripVM,
    side: 'top' | 'bottom',
  ): void {
    event.stopPropagation();
    event.preventDefault();

    this.stateService.selectItem(item.id, false);
    this.dragState = {
      type: side === 'top' ? 'resize-top' : 'resize-bottom',
      itemId: item.id,
      itemType: item.type,
      startX: event.clientX,
      startY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      initialStartTick: item.startTick,
      initialStartRow: item.startRow,
      initialDurationTicks: item.durationTicks,
      initialBodyTrackCount: item.type === 'folder' ? item.bodyTrackCount : item.laneSpan,
      initialRowSpan: item.type === 'folder' ? item.rowSpan : item.rowSpan,
      parentAbsoluteStartTick: item.parentStartTick,
      parentAbsoluteStartRow: item.absoluteStartRow - item.startRow,
      excludedCollisionIds: this.createExcludedCollisionIds(item),
      appliedDeltaTicks: 0,
      appliedDeltaRows: 0,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
    this.updateDragReferenceItems();
  }

  public onItemResizeStart(
    resizeStart: { event: MouseEvent; side: 'left' | 'right' | 'top' | 'bottom' },
    item: StripVM | FolderVM,
  ): void {
    if (resizeStart.side === 'left' || resizeStart.side === 'right') {
      this.onResizeHandleMouseDown(resizeStart.event, item, resizeStart.side);
      return;
    }

    this.onVerticalResizeMouseDown(resizeStart.event, item, resizeStart.side);
  }

  public onStripExternalDrop(event: DragEvent, item: StripVM): void {
    event.preventDefault();
    event.stopPropagation();

    if (item.sourceKind !== 'solid') {
      return;
    }

    this.stateService.convertSheduleStripToFolder(item.id);
    this.requestRender();
  }

  public onTimelineMouseDown(event: MouseEvent): void {
    this.tryStartZoomDrag(event);
  }

  public onTimelineDragOver(event: DragEvent): void {
    if (!this.isTimelineBackgroundDrop(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  public async onTimelineDrop(event: DragEvent): Promise<void> {
    if (!this.isTimelineBackgroundDrop(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rootFolderSourceId = this.rootFolderSourceId();
    if (!rootFolderSourceId) {
      return;
    }

    const dropProbe = this.resolveDropProbePoint(event.clientX, event.clientY);
    if (!dropProbe) {
      return;
    }

    const trackIndex = Math.max(0, Math.floor(dropProbe.absoluteRow));
    if (trackIndex >= this.timelineRows()) {
      return;
    }

    const stripInput = this.resolveExternalDropStripInput(event.dataTransfer);
    if (!stripInput) {
      return;
    }

    let sourceMetadata: Record<string, unknown> | undefined;
    if (stripInput.file) {
      try {
        const uploadedFile = await this.uploadService.uploadFile(stripInput.file);
        sourceMetadata = {
          uploadedFilePath: uploadedFile.filePath,
          uploadedFileUrl: uploadedFile.fileUrl,
          originalFileName: uploadedFile.fileName,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.size,
        };
      } catch (error) {
        console.error('Failed to upload dropped file', error);
        return;
      }
    }

    this.stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId,
        trackIndex,
      },
      {
        sourceName: stripInput.sourceName,
        kind: stripInput.kind,
        metadata: sourceMetadata,
        startTick: Math.max(0, Math.floor(dropProbe.absoluteTick)),
        durationTicks: stripInput.durationTicks,
        laneSpan: 1,
      },
    );
    this.requestRender();
  }

  public onHostWheel(event: WheelEvent): void {
    if (!event.ctrlKey) {
      return;
    }

    const anchor = this.resolveZoomAnchor(event.clientX);
    if (!anchor) {
      return;
    }

    event.preventDefault();

    const ratio = Math.exp(-event.deltaY * this.stateService.WHEEL_ZOOM_SENSITIVITY);
    if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.0001) {
      return;
    }

    this.applyAnchoredZoom(this.zoomLevel() * ratio, anchor.anchorTick, anchor.viewportX);
  }

  public onWindowKeydown(event: KeyboardEvent): void {
    if (this.isUndoShortcut(event)) {
      if (!this.isEditableTarget(event.target)) {
        event.preventDefault();
        this.undo();
      }
      return;
    }

    if (event.code !== 'Space') {
      return;
    }

    this.isSpacePressed = true;
    if (event.ctrlKey) {
      event.preventDefault();
    }
  }

  public onWindowKeyup(event: KeyboardEvent): void {
    if (event.code !== 'Space') {
      return;
    }

    this.isSpacePressed = false;
  }

  public onWindowBlur(): void {
    this.isSpacePressed = false;
    this.onWindowMouseUp();
    this.rulerDragState = null;
    this.snapGuideState.set(null);
    window.removeEventListener('mousemove', this.onRulerMouseMove);
    window.removeEventListener('mouseup', this.onRulerMouseUp);
  }

  private onWindowMouseMove = (event: MouseEvent) => {
    if (this.zoomDragState) {
      this.handleZoomDrag(event);
      return;
    }

    if (this.dragState) {
      this.dragPendingEvent = event;
      this.scheduleDragFlush();
      return;
    }

    if (!this.mouseDownState) {
      return;
    }

    const deltaX = Math.abs(event.clientX - this.mouseDownState.startX);
    const deltaY = Math.abs(event.clientY - this.mouseDownState.startY);
    if (deltaX > this.DRAG_ACTIVATION_THRESHOLD_PX || deltaY > this.DRAG_ACTIVATION_THRESHOLD_PX) {
      this.startMoveDrag();
    }
  };

  private startMoveDrag(): void {
    if (!this.mouseDownState) {
      return;
    }

    const { item, event } = this.mouseDownState;
    const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
    if (!item.isSelected) {
      this.stateService.selectItem(item.id, isMultiSelect);
    }

    this.dragState = {
      type: 'move',
      itemId: item.id,
      itemType: item.type,
      startX: this.mouseDownState.startX,
      startY: this.mouseDownState.startY,
      lastClientX: this.mouseDownState.startX,
      lastClientY: this.mouseDownState.startY,
      initialStartTick: item.startTick,
      initialStartRow: item.startRow,
      initialDurationTicks: item.durationTicks,
      initialBodyTrackCount: item.type === 'folder' ? item.bodyTrackCount : 0,
      initialRowSpan: item.type === 'folder' ? item.rowSpan : item.rowSpan,
      parentAbsoluteStartTick: item.parentStartTick,
      parentAbsoluteStartRow: item.absoluteStartRow - item.startRow,
      excludedCollisionIds: this.createExcludedCollisionIds(item),
      appliedDeltaTicks: 0,
      appliedDeltaRows: 0,
    };

    this.updateDragReferenceItems();
    this.applyInitialMoveSnap();
    this.mouseDownState = null;
  }

  private applyInitialMoveSnap(): void {
    if (!this.dragState || this.dragState.type !== 'move') {
      return;
    }

    const collisionBounds = this.collectForbiddenBounds(this.dragState.excludedCollisionIds);
    const horizontalSnap = this.resolveHorizontalMoveSnap(
      this.dragState.initialStartTick,
      this.dragState.initialDurationTicks,
      this.dragState.parentAbsoluteStartTick,
      this.dragState.excludedCollisionIds,
    );

    let snappedStartTick = horizontalSnap?.startTick ?? this.dragState.initialStartTick;
    let snappedStartRow = this.dragState.initialStartRow;
    const guideTick = horizontalSnap?.guideTick ?? null;
    let guideRow: number | null = null;

    if (this.dragState.itemType === 'folder') {
      const verticalSnap = this.resolveFolderMoveVerticalSnap(
        this.dragState.initialStartRow,
        this.dragState.initialRowSpan,
        this.dragState.parentAbsoluteStartRow,
        this.dragState.excludedCollisionIds,
      );
      if (verticalSnap) {
        snappedStartRow = verticalSnap.startRow;
        guideRow = verticalSnap.guideRow;
      }
    }

    const snappedBounds = this.buildBounds(
      snappedStartTick,
      this.dragState.initialDurationTicks,
      snappedStartRow,
      this.dragState.initialRowSpan,
      this.dragState,
    );
    if (!this.isAllowedBounds(snappedBounds, collisionBounds)) {
      this.snapGuideState.set(null);
      return;
    }

    snappedStartTick = Math.max(0, snappedStartTick);
    snappedStartRow = Math.max(0, snappedStartRow);
    const didSnapPositionChange =
      snappedStartTick !== this.dragState.initialStartTick ||
      snappedStartRow !== this.dragState.initialStartRow;

    if (didSnapPositionChange) {
      const didUpdate =
        this.dragState.itemType === 'strip'
          ? this.stateService.updateStrip(this.dragState.itemId, {
              startTick: snappedStartTick,
              startRow: snappedStartRow,
            })
          : this.stateService.updateFolder(this.dragState.itemId, {
              startTick: snappedStartTick,
              startRow: snappedStartRow,
            });

      if (!didUpdate) {
        this.requestRender();
        return;
      }

      this.dragState.initialStartTick = snappedStartTick;
      this.dragState.initialStartRow = snappedStartRow;
      this.updateDragReferenceItems();
    }

    if (guideTick === null && guideRow === null) {
      this.snapGuideState.set(null);
      return;
    }

    this.snapGuideState.set({ tick: guideTick, row: guideRow });
    this.requestRender();
  }

  private handleDrag(event: MouseEvent): void {
    if (!this.dragState) {
      return;
    }

    this.dragState.lastClientX = event.clientX;
    this.dragState.lastClientY = event.clientY;

    const deltaPixels = event.clientX - this.dragState.startX;
    const tickSizePx = this.tickSizePx();
    if (tickSizePx <= 0) {
      return;
    }

    const currentDeltaTicks = Math.round(deltaPixels / tickSizePx);
    const diffTicks = currentDeltaTicks - this.dragState.appliedDeltaTicks;
    const deltaRowsPixels = event.clientY - this.dragState.startY;
    const currentDeltaRows = Math.round(deltaRowsPixels / this.TRACK_HEIGHT);
    const diffRows = currentDeltaRows - this.dragState.appliedDeltaRows;
    const collisionBounds = this.collectForbiddenBounds(this.dragState.excludedCollisionIds);

    let nextSnapTick: number | null = null;
    let nextSnapRow: number | null = null;

    if (this.dragState.type === 'move') {
      if (diffTicks === 0 && diffRows === 0) {
        return;
      }

      const targetStartTickRaw = Math.max(0, this.dragState.initialStartTick + currentDeltaTicks);
      const targetStartRowRaw = Math.max(0, this.dragState.initialStartRow + currentDeltaRows);
      const horizontalSnap = this.resolveHorizontalMoveSnap(
        targetStartTickRaw,
        this.dragState.initialDurationTicks,
        this.dragState.parentAbsoluteStartTick,
        this.dragState.excludedCollisionIds,
      );
      let targetStartTick = horizontalSnap?.startTick ?? targetStartTickRaw;
      nextSnapTick = horizontalSnap?.guideTick ?? null;

      let targetStartRow = targetStartRowRaw;
      if (this.dragState.itemType === 'folder') {
        const verticalSnap = this.resolveFolderMoveVerticalSnap(
          targetStartRowRaw,
          this.dragState.initialRowSpan,
          this.dragState.parentAbsoluteStartRow,
          this.dragState.excludedCollisionIds,
        );
        if (verticalSnap) {
          targetStartRow = verticalSnap.startRow;
          nextSnapRow = verticalSnap.guideRow;
        }
      }

      const nextBounds = this.buildBounds(
        targetStartTick,
        this.dragState.initialDurationTicks,
        targetStartRow,
        this.dragState.initialRowSpan,
        this.dragState,
      );
      if (!this.isAllowedBounds(nextBounds, collisionBounds)) {
        this.snapGuideState.set(null);
        return;
      }

      targetStartTick = Math.max(0, targetStartTick);
      targetStartRow = Math.max(0, targetStartRow);
      const appliedDeltaTicks = targetStartTick - this.dragState.initialStartTick;
      const appliedDeltaRows = targetStartRow - this.dragState.initialStartRow;

      if (
        appliedDeltaTicks === this.dragState.appliedDeltaTicks &&
        appliedDeltaRows === this.dragState.appliedDeltaRows
      ) {
        return;
      }

      if (this.dragState.itemType === 'strip') {
        const didUpdate = this.stateService.updateStrip(this.dragState.itemId, {
          startTick: targetStartTick,
          startRow: targetStartRow,
        });
        if (
          !this.tryCommitDragDelta(didUpdate, {
            startTick: targetStartTick,
            startRow: targetStartRow,
          })
        ) {
          return;
        }
      } else {
        const didUpdate = this.stateService.updateFolder(this.dragState.itemId, {
          startTick: targetStartTick,
          startRow: targetStartRow,
        });
        if (
          !this.tryCommitDragDelta(didUpdate, {
            startTick: targetStartTick,
            startRow: targetStartRow,
          })
        ) {
          return;
        }
      }
      this.dragState.appliedDeltaTicks = appliedDeltaTicks;
      this.dragState.appliedDeltaRows = appliedDeltaRows;
      this.updateDragReferenceItems();
      this.snapGuideState.set({ tick: nextSnapTick, row: nextSnapRow });
      this.requestRender();
      return;
    }

    if (this.dragState.type === 'resize-left') {
      if (diffTicks === 0) {
        return;
      }

      const initialEndTick = this.dragState.initialStartTick + this.dragState.initialDurationTicks;
      let nextStartTick = this.dragState.initialStartTick + currentDeltaTicks;
      let nextDurationTicks = this.dragState.initialDurationTicks - currentDeltaTicks;

      if (nextDurationTicks < 1) {
        nextDurationTicks = 1;
        nextStartTick = this.dragState.initialStartTick + this.dragState.initialDurationTicks - 1;
      }
      if (nextStartTick < 0) {
        nextStartTick = 0;
        nextDurationTicks = this.dragState.initialStartTick + this.dragState.initialDurationTicks;
      }

      const horizontalSnap = this.resolveHorizontalEdgeSnap(
        this.dragState.parentAbsoluteStartTick + nextStartTick,
        this.dragState.excludedCollisionIds,
      );
      if (horizontalSnap) {
        const snappedRelativeStartTick =
          horizontalSnap.tick - this.dragState.parentAbsoluteStartTick;
        nextStartTick = Math.max(0, Math.min(snappedRelativeStartTick, initialEndTick - 1));
        nextDurationTicks = initialEndTick - nextStartTick;
        nextSnapTick = horizontalSnap.guideTick;
      }

      const nextBounds = this.buildBounds(
        nextStartTick,
        nextDurationTicks,
        this.dragState.initialStartRow,
        this.dragState.initialRowSpan,
        this.dragState,
      );
      if (!this.isAllowedBounds(nextBounds, collisionBounds)) {
        this.snapGuideState.set(null);
        return;
      }

      const appliedDeltaTicks = nextStartTick - this.dragState.initialStartTick;
      if (appliedDeltaTicks === this.dragState.appliedDeltaTicks) {
        return;
      }

      if (this.dragState.itemType === 'strip') {
        const didUpdate = this.stateService.updateStrip(this.dragState.itemId, {
          startTick: nextStartTick,
          durationTicks: nextDurationTicks,
        });
        if (
          !this.tryCommitDragDelta(didUpdate, {
            startTick: nextStartTick,
            durationTicks: nextDurationTicks,
          })
        ) {
          return;
        }
      } else {
        const didUpdate = this.stateService.updateFolder(this.dragState.itemId, {
          startTick: nextStartTick,
          durationTicks: nextDurationTicks,
        });
        if (
          !this.tryCommitDragDelta(didUpdate, {
            startTick: nextStartTick,
            durationTicks: nextDurationTicks,
          })
        ) {
          return;
        }
      }

      this.dragState.appliedDeltaTicks = appliedDeltaTicks;
      this.updateDragReferenceItems();
      this.snapGuideState.set({ tick: nextSnapTick, row: null });
      this.requestRender();
      return;
    }

    if (this.dragState.type === 'resize-right') {
      if (diffTicks === 0) {
        return;
      }

      const nextDurationTicksRaw = Math.max(
        1,
        this.dragState.initialDurationTicks + currentDeltaTicks,
      );
      let nextDurationTicks = nextDurationTicksRaw;
      const nextEndTickRaw =
        this.dragState.parentAbsoluteStartTick +
        this.dragState.initialStartTick +
        nextDurationTicksRaw;
      const horizontalSnap = this.resolveHorizontalEdgeSnap(
        nextEndTickRaw,
        this.dragState.excludedCollisionIds,
      );
      if (horizontalSnap) {
        const minimumEndTick =
          this.dragState.parentAbsoluteStartTick + this.dragState.initialStartTick + 1;
        const snappedEndTick = Math.max(horizontalSnap.tick, minimumEndTick);
        nextDurationTicks =
          snappedEndTick -
          (this.dragState.parentAbsoluteStartTick + this.dragState.initialStartTick);
        nextSnapTick = horizontalSnap.guideTick;
      }

      const nextBounds = this.buildBounds(
        this.dragState.initialStartTick,
        nextDurationTicks,
        this.dragState.initialStartRow,
        this.dragState.initialRowSpan,
        this.dragState,
      );
      if (!this.isAllowedBounds(nextBounds, collisionBounds)) {
        this.snapGuideState.set(null);
        return;
      }

      const appliedDeltaTicks = nextDurationTicks - this.dragState.initialDurationTicks;
      if (appliedDeltaTicks === this.dragState.appliedDeltaTicks) {
        return;
      }

      if (this.dragState.itemType === 'strip') {
        const didUpdate = this.stateService.updateStrip(this.dragState.itemId, {
          durationTicks: nextDurationTicks,
        });
        if (!this.tryCommitDragDelta(didUpdate, { durationTicks: nextDurationTicks })) {
          return;
        }
      } else {
        const didUpdate = this.stateService.updateFolder(this.dragState.itemId, {
          durationTicks: nextDurationTicks,
        });
        if (!this.tryCommitDragDelta(didUpdate, { durationTicks: nextDurationTicks })) {
          return;
        }
      }
      this.dragState.appliedDeltaTicks = appliedDeltaTicks;
      this.updateDragReferenceItems();
      this.snapGuideState.set({ tick: nextSnapTick, row: null });
      this.requestRender();
      return;
    }

    if (diffRows === 0) {
      return;
    }

    if (this.dragState.type === 'resize-bottom') {
      const rawSpan = Math.max(1, this.dragState.initialBodyTrackCount + currentDeltaRows);
      const nextSpanRaw =
        this.dragState.itemType === 'strip' ? Math.min(this.STRIP_MAX_LANE_SPAN, rawSpan) : rawSpan;

      let nextSpan = nextSpanRaw;
      if (this.dragState.itemType === 'folder') {
        const bottomSnap = this.resolveFolderBottomSnap(
          this.dragState.initialStartRow,
          nextSpanRaw,
          this.dragState.parentAbsoluteStartRow,
          this.dragState.excludedCollisionIds,
        );
        if (bottomSnap) {
          nextSpan = bottomSnap.bodyTrackCount;
          nextSnapRow = bottomSnap.guideRow;
        }
      }

      const nextRowSpan = this.dragState.itemType === 'folder' ? 1 + nextSpan : nextSpan;
      const nextBounds = this.buildBounds(
        this.dragState.initialStartTick,
        this.dragState.initialDurationTicks,
        this.dragState.initialStartRow,
        nextRowSpan,
        this.dragState,
      );
      if (!this.isAllowedBounds(nextBounds, collisionBounds)) {
        this.snapGuideState.set(null);
        return;
      }

      const appliedDeltaRows = nextSpan - this.dragState.initialBodyTrackCount;
      if (appliedDeltaRows === this.dragState.appliedDeltaRows) {
        return;
      }

      if (this.dragState.itemType === 'strip') {
        const didUpdate = this.stateService.updateStrip(this.dragState.itemId, {
          laneSpan: nextSpan,
        });
        if (!this.tryCommitDragDelta(didUpdate, { laneSpan: nextSpan })) {
          return;
        }
      } else {
        const didUpdate = this.stateService.updateFolder(this.dragState.itemId, {
          bodyTrackCount: nextSpan,
        });
        if (!this.tryCommitDragDelta(didUpdate, { bodyTrackCount: nextSpan })) {
          return;
        }
      }
      this.dragState.appliedDeltaRows = appliedDeltaRows;
      this.updateDragReferenceItems();
      this.snapGuideState.set({ tick: null, row: nextSnapRow });
      this.requestRender();
      return;
    }

    // resize-top
    const rawSpan = Math.max(1, this.dragState.initialBodyTrackCount - currentDeltaRows);
    const nextSpanRaw =
      this.dragState.itemType === 'strip' ? Math.min(this.STRIP_MAX_LANE_SPAN, rawSpan) : rawSpan;
    let nextSpan = nextSpanRaw;
    let nextStartRow = Math.max(0, this.dragState.initialStartRow + currentDeltaRows);

    if (this.dragState.itemType === 'folder') {
      const topSnap = this.resolveFolderTopSnap(
        nextStartRow,
        this.dragState.parentAbsoluteStartRow,
        this.dragState.excludedCollisionIds,
      );
      if (topSnap) {
        const fixedBottomAbsoluteRow =
          this.dragState.parentAbsoluteStartRow +
          this.dragState.initialStartRow +
          this.dragState.initialRowSpan;
        const snappedStartAbsoluteRow = topSnap.startAbsoluteRow;
        const snappedBodyTrackCount = Math.max(
          1,
          fixedBottomAbsoluteRow - snappedStartAbsoluteRow - 1,
        );
        nextStartRow = snappedStartAbsoluteRow - this.dragState.parentAbsoluteStartRow;
        nextSpan = snappedBodyTrackCount;
        nextSnapRow = topSnap.guideRow;
      }
    }

    const nextRowSpan = this.dragState.itemType === 'folder' ? 1 + nextSpan : nextSpan;
    const nextBounds = this.buildBounds(
      this.dragState.initialStartTick,
      this.dragState.initialDurationTicks,
      nextStartRow,
      nextRowSpan,
      this.dragState,
    );
    if (!this.isAllowedBounds(nextBounds, collisionBounds)) {
      this.snapGuideState.set(null);
      return;
    }

    const appliedDeltaRows = nextStartRow - this.dragState.initialStartRow;
    if (appliedDeltaRows === this.dragState.appliedDeltaRows) {
      return;
    }

    if (this.dragState.itemType === 'strip') {
      const didUpdate = this.stateService.updateStrip(this.dragState.itemId, {
        laneSpan: nextSpan,
        startRow: nextStartRow,
      });
      if (
        !this.tryCommitDragDelta(didUpdate, {
          laneSpan: nextSpan,
          startRow: nextStartRow,
        })
      ) {
        return;
      }
    } else {
      const didUpdate = this.stateService.updateFolder(this.dragState.itemId, {
        bodyTrackCount: nextSpan,
        startRow: nextStartRow,
      });
      if (
        !this.tryCommitDragDelta(didUpdate, {
          bodyTrackCount: nextSpan,
          startRow: nextStartRow,
        })
      ) {
        return;
      }
    }
    this.dragState.appliedDeltaRows = appliedDeltaRows;
    this.updateDragReferenceItems();
    this.snapGuideState.set({ tick: null, row: nextSnapRow });
    this.requestRender();
  }

  private onWindowMouseUp = () => {
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);

    if (this.dragState && this.dragPendingEvent) {
      const pendingDragEvent = this.dragPendingEvent;
      this.dragPendingEvent = null;
      this.handleDrag(pendingDragEvent);
    }

    this.clearDragInteractionState();
    this.stopZoneLessDragLoop();

    if (this.zoomDragState) {
      this.zoomDragState = null;
      this.snapGuideState.set(null);
      return;
    }

    if (this.dragState) {
      const completedDrag = this.dragState;
      this.dragState = null;

      if (completedDrag.type === 'move') {
        this.finalizeMove(completedDrag.itemId, {
          clientX: completedDrag.lastClientX,
          clientY: completedDrag.lastClientY,
        });
      }

      this.snapGuideState.set(null);
      this.requestRender();

      return;
    }

    if (!this.mouseDownState) {
      return;
    }

    const { item, event } = this.mouseDownState;
    const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.shiftKey) {
      this.stateService.selectItem(item.id, true);
    } else {
      this.stateService.selectItem(item.id, isMultiSelect);
    }

    this.mouseDownState = null;
    this.snapGuideState.set(null);
    this.requestRender();
  };

  public onItemKeydown(event: KeyboardEvent | Event, itemId: string): void {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key !== 'enter' && key !== ' ' && key !== 'spacebar') {
      return;
    }

    event.preventDefault();
    const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.shiftKey) {
      this.stateService.selectItem(itemId, true);
      return;
    }

    this.stateService.selectItem(itemId, isMultiSelect);
  }

  public deleteSelected(): void {
    this.stateService.deleteSelectedItem();
  }

  public undo(): void {
    this.stateService.undo();
    this.requestRender();
  }

  public shiftSelection(delta: number): void {
    this.stateService.shiftSelectedByTicks(delta);
  }

  public shiftSelectionRows(delta: number): void {
    this.stateService.shiftSelectedByRows(delta);
  }

  public adjustSelectionDuration(delta: number): void {
    this.stateService.adjustSelectedDuration(delta);
  }

  public onBackgroundClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.strip, .folder')) {
      return;
    }

    this.stateService.clearSelection();
    this.requestRender();
  }

  public onBackgroundKeydown(event: KeyboardEvent | Event): void {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key !== 'enter' && key !== ' ' && key !== 'spacebar') {
      return;
    }

    event.preventDefault();
    this.stateService.clearSelection();
    this.requestRender();
  }

  public onMainScroll(event: Event): void {
    const target = event.target as HTMLDivElement;
    if (this.rulerWrapperRef) {
      this.rulerWrapperRef.nativeElement.scrollLeft = target.scrollLeft;
    }
  }

  public onRulerMouseDown(event: MouseEvent): void {
    if (this.tryStartZoomDrag(event)) {
      return;
    }

    this.rulerDragState = { isDragging: true, startX: event.clientX };
    this.updateTickFromMouse(event);
    window.addEventListener('mousemove', this.onRulerMouseMove);
    window.addEventListener('mouseup', this.onRulerMouseUp);
  }

  private onRulerMouseMove = (event: MouseEvent) => {
    if (this.rulerDragState?.isDragging) {
      this.updateTickFromMouse(event);
    }
  };

  private onRulerMouseUp = () => {
    this.rulerDragState = null;
    window.removeEventListener('mousemove', this.onRulerMouseMove);
    window.removeEventListener('mouseup', this.onRulerMouseUp);
  };

  private updateTickFromMouse(event: MouseEvent): void {
    if (!this.rulerWrapperRef) {
      return;
    }

    const tickSizePx = this.tickSizePx();
    if (tickSizePx <= 0) {
      return;
    }

    const rulerRect = this.rulerWrapperRef.nativeElement.getBoundingClientRect();
    const scrollLeft = this.rulerWrapperRef.nativeElement.scrollLeft;
    const offsetX = event.clientX - rulerRect.left + scrollLeft;
    let tick = Math.round(offsetX / tickSizePx);
    tick = Math.max(0, Math.min(tick, this.timelineExtentTicks()));
    this.stateService.setCurrentTick(tick);
  }

  private tryStartZoomDrag(event: MouseEvent): boolean {
    if (event.button !== 0 || !event.ctrlKey || !this.isSpacePressed) {
      return false;
    }

    const anchor = this.resolveZoomAnchor(event.clientX);
    if (!anchor) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    this.mouseDownState = null;
    this.dragState = null;
    this.rulerDragState = null;
    window.removeEventListener('mousemove', this.onRulerMouseMove);
    window.removeEventListener('mouseup', this.onRulerMouseUp);
    this.zoomDragState = {
      startY: event.clientY,
      initialZoom: this.zoomLevel(),
      anchorTick: anchor.anchorTick,
      viewportX: anchor.viewportX,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
    return true;
  }

  private handleZoomDrag(event: MouseEvent): void {
    if (!this.zoomDragState) {
      return;
    }

    event.preventDefault();

    const deltaY = this.zoomDragState.startY - event.clientY;
    const ratio = Math.exp(deltaY * this.stateService.DRAG_ZOOM_SENSITIVITY);
    if (!Number.isFinite(ratio)) {
      return;
    }

    this.applyAnchoredZoom(
      this.zoomDragState.initialZoom * ratio,
      this.zoomDragState.anchorTick,
      this.zoomDragState.viewportX,
    );
  }

  private applyAnchoredZoom(targetZoom: number, anchorTick: number, viewportX: number): void {
    const mainWrapper = this.mainWrapperRef?.nativeElement;
    if (!mainWrapper) {
      return;
    }

    const previousZoom = this.zoomLevel();
    const nextZoom = this.stateService.setZoomLevel(targetZoom);
    if (Math.abs(nextZoom - previousZoom) < 0.000001) {
      return;
    }

    const nextTickSizePx = this.tickSizePx();
    const nextScrollLeft = Math.max(0, anchorTick * nextTickSizePx - viewportX);
    mainWrapper.scrollLeft = nextScrollLeft;
    if (this.rulerWrapperRef) {
      this.rulerWrapperRef.nativeElement.scrollLeft = nextScrollLeft;
    }

    this.requestRender();
  }

  private tryCommitDragDelta(
    didUpdate: boolean,
    expected: {
      startTick?: number;
      startRow?: number;
      durationTicks?: number;
      laneSpan?: number;
      bodyTrackCount?: number;
    },
  ): boolean {
    if (!didUpdate) {
      this.requestRender();
      return false;
    }

    const dragState = this.dragState;
    if (!dragState) {
      this.requestRender();
      return false;
    }

    const item = this.timelineItems().find((candidate) => candidate.id === dragState.itemId);
    if (!item) {
      this.requestRender();
      return false;
    }

    const hasMismatch =
      (expected.startTick !== undefined && item.startTick !== expected.startTick) ||
      (expected.startRow !== undefined && item.startRow !== expected.startRow) ||
      (expected.durationTicks !== undefined && item.durationTicks !== expected.durationTicks) ||
      (expected.laneSpan !== undefined &&
        item.type === 'strip' &&
        item.laneSpan !== expected.laneSpan) ||
      (expected.bodyTrackCount !== undefined &&
        item.type === 'folder' &&
        item.bodyTrackCount !== expected.bodyTrackCount);

    if (hasMismatch) {
      this.requestRender();
    }

    return true;
  }

  private resolveZoomAnchor(clientX: number): { anchorTick: number; viewportX: number } | null {
    const mainWrapper = this.mainWrapperRef?.nativeElement;
    if (!mainWrapper) {
      return null;
    }

    const tickSizePx = this.tickSizePx();
    if (tickSizePx <= 0) {
      return null;
    }

    const mainRect = mainWrapper.getBoundingClientRect();
    const viewportX = Math.min(Math.max(0, clientX - mainRect.left), mainRect.width);
    const anchorTick = (mainWrapper.scrollLeft + viewportX) / tickSizePx;
    return { anchorTick, viewportX };
  }

  private requestRender(): void {
    this.renderRequested = true;
    this.scheduleRenderFrame();
  }

  private scheduleRenderFrame(): void {
    if (this.renderFrameId !== null) {
      return;
    }

    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      if (!this.renderRequested) {
        return;
      }

      this.renderRequested = false;
      this.changeDetectorRef.detectChanges();

      if (this.renderRequested) {
        this.scheduleRenderFrame();
      }
    });
  }

  private startZoneLessDragLoop(): void {
    if (this.detachRenderId !== null) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const tick = () => {
        if (!this.dragState && !this.zoomDragState) {
          this.detachRenderId = null;
          return;
        }

        this.renderRequested = true;
        this.scheduleRenderFrame();
        this.detachRenderId = window.requestAnimationFrame(tick);
      };
      this.detachRenderId = window.requestAnimationFrame(tick);
    });
  }

  private stopZoneLessDragLoop(): void {
    if (this.detachRenderId === null) {
      return;
    }

    window.cancelAnimationFrame(this.detachRenderId);
    this.detachRenderId = null;
    this.requestRender();
  }

  public itemClipPath(item: StripVM | FolderVM): string | null {
    return this.itemClipPathMap().get(item.id) ?? null;
  }

  private intersectRects(left: TimelineRect, right: TimelineRect): TimelineRect {
    return {
      leftTick: Math.max(left.leftTick, right.leftTick),
      rightTick: Math.min(left.rightTick, right.rightTick),
      topRow: Math.max(left.topRow, right.topRow),
      bottomRow: Math.min(left.bottomRow, right.bottomRow),
    };
  }

  private resolveDropProbePoint(clientX: number, clientY: number): DropProbePoint | null {
    const mainWrapper = this.mainWrapperRef?.nativeElement;
    const tickSizePx = this.tickSizePx();
    if (!mainWrapper || tickSizePx <= 0) {
      return null;
    }

    const mainRect = mainWrapper.getBoundingClientRect();
    const viewportX = Math.min(Math.max(0, clientX - mainRect.left), mainRect.width);
    const viewportY = Math.min(Math.max(0, clientY - mainRect.top), mainRect.height);

    return {
      absoluteTick: (mainWrapper.scrollLeft + viewportX) / tickSizePx,
      absoluteRow: (mainWrapper.scrollTop + viewportY) / this.TRACK_HEIGHT,
    };
  }

  private resolveExternalDropStripInput(
    dataTransfer: DataTransfer | null,
  ): ExternalDropStripInput | null {
    if (!dataTransfer) {
      return null;
    }

    const imageFile = Array.from(dataTransfer.files ?? []).find((file) =>
      file.type.startsWith('image/'),
    );
    if (imageFile) {
      return {
        sourceName: imageFile.name || 'Dropped Image',
        kind: 'media',
        durationTicks: 300,
        file: imageFile,
      };
    }

    const genericFile = Array.from(dataTransfer.files ?? [])[0];
    if (genericFile) {
      return {
        sourceName: genericFile.name || 'Dropped File',
        kind: 'media',
        durationTicks: 300,
        file: genericFile,
      };
    }

    const droppedText = dataTransfer.getData('text/plain').trim();
    if (droppedText.length > 0) {
      return {
        sourceName: 'Dropped Text',
        kind: 'generated',
        durationTicks: 120,
      };
    }

    return null;
  }

  private finalizeMove(itemId: string, pointer?: { clientX: number; clientY: number }): void {
    const draggedItem = this.timelineItems().find((item) => item.id === itemId);
    if (!draggedItem) {
      this.requestRender();
      return;
    }

    const dropProbe = pointer ? this.resolveDropProbePoint(pointer.clientX, pointer.clientY) : null;
    const target = this.resolveDropTarget(draggedItem, dropProbe);
    if (!target || target.parentFolderId === draggedItem.parentFolderId) {
      this.requestRender();
      return;
    }

    this.stateService.moveItem(itemId, target);
    this.requestRender();
  }

  private resolveDropTarget(
    draggedItem: StripVM | FolderVM,
    dropProbe: DropProbePoint | null,
  ):
    | (Required<Pick<MoveTargetInput, 'parentFolderId'>> &
        Pick<MoveTargetInput, 'trackIndex' | 'startTick'>)
    | null {
    const rootFolderSourceId = this.rootFolderSourceId();
    if (!rootFolderSourceId) {
      return null;
    }

    const candidateFolders = this.timelineItems()
      .filter((item): item is FolderVM => item.type === 'folder')
      .filter((item) => this.isValidDropTargetFolder(draggedItem, item))
      .filter((item) => this.isInsideFolderBody(draggedItem, item, dropProbe))
      .sort(
        (left, right) =>
          right.absoluteStartRow - left.absoluteStartRow || left.rowSpan - right.rowSpan,
      );

    const targetFolder = candidateFolders[0];
    if (!targetFolder) {
      return {
        parentFolderId: rootFolderSourceId,
        trackIndex: Math.max(0, draggedItem.absoluteStartRow),
        startTick: Math.max(0, draggedItem.absoluteStartTick),
      };
    }

    return {
      parentFolderId: targetFolder.sourceId,
      trackIndex: Math.max(0, draggedItem.absoluteStartRow - (targetFolder.absoluteStartRow + 1)),
      startTick: Math.max(0, draggedItem.absoluteStartTick - targetFolder.absoluteStartTick),
    };
  }

  private isInsideFolderBody(
    draggedItem: StripVM | FolderVM,
    folder: FolderVM,
    dropProbe: DropProbePoint | null,
  ): boolean {
    const bodyStartRow = folder.absoluteStartRow + 1;
    const bodyEndRow = bodyStartRow + folder.bodyTrackCount;
    const folderEndTick = folder.absoluteStartTick + folder.durationTicks;

    if (dropProbe) {
      return (
        dropProbe.absoluteTick >= folder.absoluteStartTick &&
        dropProbe.absoluteTick < folderEndTick &&
        dropProbe.absoluteRow >= bodyStartRow &&
        dropProbe.absoluteRow < bodyEndRow
      );
    }

    return (
      draggedItem.absoluteStartTick >= folder.absoluteStartTick &&
      draggedItem.absoluteStartTick < folderEndTick &&
      draggedItem.absoluteStartRow >= bodyStartRow &&
      draggedItem.absoluteStartRow < bodyEndRow
    );
  }

  private isValidDropTargetFolder(
    draggedItem: StripVM | FolderVM,
    targetFolder: FolderVM,
  ): boolean {
    if (draggedItem.id === targetFolder.id) {
      return false;
    }

    if (draggedItem.type === 'folder' && draggedItem.containedIds.includes(targetFolder.id)) {
      return false;
    }

    return true;
  }

  private createExcludedCollisionIds(item: StripVM | FolderVM): Set<string> {
    const excluded = new Set<string>([item.id]);
    if (item.type === 'folder') {
      for (const containedId of item.containedIds) {
        excluded.add(containedId);
      }
    }
    return excluded;
  }

  private collectForbiddenBounds(excludedIds: Set<string>): TimelineBounds[] {
    const bounds: TimelineBounds[] = [];
    for (const item of this.getDragReferenceItems()) {
      if (excludedIds.has(item.id)) {
        continue;
      }

      if (item.type === 'strip') {
        bounds.push({
          startTick: item.absoluteStartTick,
          endTick: item.absoluteStartTick + item.durationTicks,
          startRow: item.absoluteStartRow,
          endRow: item.absoluteStartRow + item.rowSpan,
        });
        continue;
      }

      bounds.push({
        startTick: item.absoluteStartTick,
        endTick: item.absoluteStartTick + item.durationTicks,
        startRow: item.absoluteStartRow,
        endRow: item.absoluteStartRow + 1,
      });
    }

    return bounds;
  }

  private buildBounds(
    startTick: number,
    durationTicks: number,
    startRow: number,
    rowSpan: number,
    dragState: ItemDragState,
  ): TimelineBounds {
    const absoluteStartTick = dragState.parentAbsoluteStartTick + startTick;
    const absoluteStartRow = dragState.parentAbsoluteStartRow + startRow;
    return {
      startTick: absoluteStartTick,
      endTick: absoluteStartTick + durationTicks,
      startRow: absoluteStartRow,
      endRow: absoluteStartRow + rowSpan,
    };
  }

  private isAllowedBounds(target: TimelineBounds, forbiddenBounds: TimelineBounds[]): boolean {
    for (const forbidden of forbiddenBounds) {
      const overlapsTicks =
        target.startTick < forbidden.endTick && forbidden.startTick < target.endTick;
      if (!overlapsTicks) {
        continue;
      }

      const overlapsRows = target.startRow < forbidden.endRow && forbidden.startRow < target.endRow;
      if (overlapsRows) {
        return false;
      }
    }

    return true;
  }

  private collectHorizontalSnapTicks(excludedIds: Set<string>): number[] {
    const candidates = new Set<number>([this.currentTick()]);
    for (const item of this.getDragReferenceItems()) {
      if (excludedIds.has(item.id)) {
        continue;
      }

      candidates.add(item.absoluteStartTick);
      candidates.add(item.absoluteStartTick + item.durationTicks);
    }

    return [...candidates];
  }

  private resolveHorizontalEdgeSnap(
    targetAbsoluteEdgeTick: number,
    excludedIds: Set<string>,
  ): { tick: number; guideTick: number } | null {
    const tickSizePx = this.tickSizePx();
    if (tickSizePx <= 0) {
      return null;
    }

    let nearestTick: number | null = null;
    let nearestDistancePx = Number.POSITIVE_INFINITY;

    for (const candidateTick of this.collectHorizontalSnapTicks(excludedIds)) {
      const distancePx = Math.abs(candidateTick - targetAbsoluteEdgeTick) * tickSizePx;
      if (distancePx > this.HORIZONTAL_SNAP_THRESHOLD_PX || distancePx >= nearestDistancePx) {
        continue;
      }

      nearestDistancePx = distancePx;
      nearestTick = candidateTick;
    }

    if (nearestTick === null) {
      return null;
    }

    return { tick: nearestTick, guideTick: nearestTick };
  }

  private resolveHorizontalMoveSnap(
    startTick: number,
    durationTicks: number,
    parentAbsoluteStartTick: number,
    excludedIds: Set<string>,
  ): { startTick: number; guideTick: number } | null {
    const startAbsoluteTick = parentAbsoluteStartTick + startTick;
    const endAbsoluteTick = startAbsoluteTick + durationTicks;

    const startEdgeSnap = this.resolveHorizontalEdgeSnap(startAbsoluteTick, excludedIds);
    const endEdgeSnap = this.resolveHorizontalEdgeSnap(endAbsoluteTick, excludedIds);
    if (!startEdgeSnap && !endEdgeSnap) {
      return null;
    }

    const tickSizePx = this.tickSizePx();
    if (tickSizePx <= 0) {
      return null;
    }

    let selectedStartTick = startTick;
    let selectedGuideTick: number | null = null;
    let bestDistancePx = Number.POSITIVE_INFINITY;

    if (startEdgeSnap) {
      const snappedStartTick = startEdgeSnap.tick - parentAbsoluteStartTick;
      const distancePx = Math.abs(snappedStartTick - startTick) * tickSizePx;
      if (distancePx < bestDistancePx) {
        bestDistancePx = distancePx;
        selectedStartTick = snappedStartTick;
        selectedGuideTick = startEdgeSnap.guideTick;
      }
    }

    if (endEdgeSnap) {
      const snappedStartTick = endEdgeSnap.tick - parentAbsoluteStartTick - durationTicks;
      const distancePx = Math.abs(snappedStartTick - startTick) * tickSizePx;
      if (distancePx < bestDistancePx) {
        selectedStartTick = snappedStartTick;
        selectedGuideTick = endEdgeSnap.guideTick;
      }
    }

    if (selectedGuideTick === null) {
      return null;
    }

    return {
      startTick: Math.max(0, selectedStartTick),
      guideTick: selectedGuideTick,
    };
  }

  private collectFolderVerticalSnapRows(excludedIds: Set<string>): number[] {
    const rows = new Set<number>();
    for (const item of this.getDragReferenceItems()) {
      if (excludedIds.has(item.id) || item.type !== 'folder') {
        continue;
      }

      rows.add(item.absoluteStartRow);
      rows.add(item.absoluteStartRow + 1 + item.bodyTrackCount);
    }

    return [...rows];
  }

  private resolveFolderMoveVerticalSnap(
    startRow: number,
    rowSpan: number,
    parentAbsoluteStartRow: number,
    excludedIds: Set<string>,
  ): { startRow: number; guideRow: number } | null {
    const candidates = this.collectFolderVerticalSnapRows(excludedIds);
    if (candidates.length === 0) {
      return null;
    }

    const topAbsoluteRow = parentAbsoluteStartRow + startRow;
    const bottomAbsoluteRow = topAbsoluteRow + rowSpan;
    let bestStartRow = startRow;
    let bestGuideRow: number | null = null;
    let bestDistancePx = Number.POSITIVE_INFINITY;

    for (const candidateRow of candidates) {
      const topDistancePx = Math.abs(candidateRow - topAbsoluteRow) * this.TRACK_HEIGHT;
      if (topDistancePx <= this.VERTICAL_SNAP_THRESHOLD_PX && topDistancePx < bestDistancePx) {
        bestDistancePx = topDistancePx;
        bestStartRow = candidateRow - parentAbsoluteStartRow;
        bestGuideRow = candidateRow;
      }

      const bottomDistancePx = Math.abs(candidateRow - bottomAbsoluteRow) * this.TRACK_HEIGHT;
      if (
        bottomDistancePx <= this.VERTICAL_SNAP_THRESHOLD_PX &&
        bottomDistancePx < bestDistancePx
      ) {
        bestDistancePx = bottomDistancePx;
        bestStartRow = candidateRow - rowSpan - parentAbsoluteStartRow;
        bestGuideRow = candidateRow;
      }
    }

    if (bestGuideRow === null) {
      return null;
    }

    return {
      startRow: Math.max(0, bestStartRow),
      guideRow: bestGuideRow,
    };
  }

  private resolveFolderBottomSnap(
    startRow: number,
    bodyTrackCount: number,
    parentAbsoluteStartRow: number,
    excludedIds: Set<string>,
  ): { bodyTrackCount: number; guideRow: number } | null {
    const candidates = this.collectFolderVerticalSnapRows(excludedIds);
    if (candidates.length === 0) {
      return null;
    }

    const bottomAbsoluteRow = parentAbsoluteStartRow + startRow + 1 + bodyTrackCount;
    let bestBodyTrackCount = bodyTrackCount;
    let bestGuideRow: number | null = null;
    let bestDistancePx = Number.POSITIVE_INFINITY;

    for (const candidateRow of candidates) {
      const distancePx = Math.abs(candidateRow - bottomAbsoluteRow) * this.TRACK_HEIGHT;
      if (distancePx > this.VERTICAL_SNAP_THRESHOLD_PX || distancePx >= bestDistancePx) {
        continue;
      }

      bestDistancePx = distancePx;
      bestBodyTrackCount = Math.max(1, candidateRow - parentAbsoluteStartRow - startRow - 1);
      bestGuideRow = candidateRow;
    }

    if (bestGuideRow === null) {
      return null;
    }

    return {
      bodyTrackCount: bestBodyTrackCount,
      guideRow: bestGuideRow,
    };
  }

  private resolveFolderTopSnap(
    startRow: number,
    parentAbsoluteStartRow: number,
    excludedIds: Set<string>,
  ): { startAbsoluteRow: number; guideRow: number } | null {
    const candidates = this.collectFolderVerticalSnapRows(excludedIds);
    if (candidates.length === 0) {
      return null;
    }

    const startAbsoluteRow = parentAbsoluteStartRow + startRow;
    let bestRow: number | null = null;
    let bestDistancePx = Number.POSITIVE_INFINITY;

    for (const candidateRow of candidates) {
      const distancePx = Math.abs(candidateRow - startAbsoluteRow) * this.TRACK_HEIGHT;
      if (distancePx > this.VERTICAL_SNAP_THRESHOLD_PX || distancePx >= bestDistancePx) {
        continue;
      }

      bestDistancePx = distancePx;
      bestRow = candidateRow;
    }

    if (bestRow === null) {
      return null;
    }

    return {
      startAbsoluteRow: bestRow,
      guideRow: bestRow,
    };
  }

  private isUndoShortcut(event: KeyboardEvent): boolean {
    return event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'z';
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.matches('input, textarea, [contenteditable="true"], [contenteditable=""]');
  }

  private isTimelineBackgroundDrop(event: DragEvent): boolean {
    if (!(event.target instanceof HTMLElement)) {
      return false;
    }

    return !event.target.closest('.strip, .folder');
  }
}
