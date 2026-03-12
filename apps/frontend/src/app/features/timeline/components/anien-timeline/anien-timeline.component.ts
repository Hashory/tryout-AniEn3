import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroChevronUpDownMicro, heroFolderMicro } from '@ng-icons/heroicons/micro';
import { FolderVM, StripVM, TimelineStateService } from '../../services/timeline-state.service';

@Component({
  selector: 'app-anien-timeline',
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

    <div
      class="timeline-sidebar"
      tabindex="0"
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
        (click)="onBackgroundClick($event)"
        (keydown.enter)="onBackgroundKeydown($event)"
        (keydown.space)="onBackgroundKeydown($event)"
      >
        <div
          class="playhead-line"
          [style.left]="'calc(var(--timeline-tick-size) * ' + currentTick() + ')'"
        ></div>

        @for (item of timelineItems(); track item.id) {
          @if (item.type === 'strip') {
            <div
              class="strip"
              tabindex="0"
              [style.width]="'calc(var(--timeline-tick-size) * ' + item.durationTicks + ')'"
              [style.height]="'calc(var(--timeline-track-height) * ' + item.rowSpan + ' - 8px)'"
              [style.top]="
                'calc(' +
                item.absoluteStartRow +
                ' * var(--timeline-track-height) + var(--timeline-strip-offset))'
              "
              [style.left]="'calc(var(--timeline-tick-size) * ' + item.absoluteStartTick + ')'"
              [class.selected]="item.isSelected"
              (mousedown)="onItemMouseDown($event, item)"
              (keydown.enter)="onItemKeydown($event, item.id)"
              (keydown.space)="onItemKeydown($event, item.id)"
            >
              <div
                class="resize-handle left"
                (mousedown)="onResizeHandleMouseDown($event, item, 'left')"
              ></div>
              {{ item.sourceName }}
              <div
                class="resize-handle right"
                (mousedown)="onResizeHandleMouseDown($event, item, 'right')"
              ></div>
            </div>
          } @else {
            <div
              class="folder"
              tabindex="0"
              [style.width]="'calc(var(--timeline-tick-size) * ' + item.durationTicks + ')'"
              [style.height]="'calc(var(--timeline-track-height) * ' + item.rowSpan + ')'"
              [style.top]="
                'calc(' +
                item.absoluteStartRow +
                ' * var(--timeline-track-height) + var(--timeline-folder-offset))'
              "
              [style.left]="'calc(var(--timeline-tick-size) * ' + item.absoluteStartTick + ')'"
              [class.selected]="item.isSelected"
              (mousedown)="onItemMouseDown($event, item)"
              (keydown.enter)="onItemKeydown($event, item.id)"
              (keydown.space)="onItemKeydown($event, item.id)"
            >
              <div
                class="resize-handle top"
                (mousedown)="onVerticalResizeMouseDown($event, item, 'top')"
              ></div>
              <div
                class="resize-handle left"
                (mousedown)="onResizeHandleMouseDown($event, item, 'left')"
              ></div>
              <div class="folder-header" [class.expanded]="item.isExpanded">
                <div type="button">
                  <ng-icon name="heroFolderMicro" />
                </div>
                <div>{{ item.name }}</div>
                <button>
                  <ng-icon name="heroChevronUpDownMicro" [style.rotate]="'90deg'" />
                </button>
              </div>
              <div
                class="folder-content-holder"
                [style.display]="item.isExpanded ? 'block' : 'none'"
                [style.height]="'calc(' + item.bodyTrackCount + ' * var(--timeline-track-height))'"
              ></div>
              <div
                class="resize-handle right"
                (mousedown)="onResizeHandleMouseDown($event, item, 'right')"
              ></div>
              <div
                class="resize-handle bottom"
                (mousedown)="onVerticalResizeMouseDown($event, item, 'bottom')"
              ></div>
            </div>
          }
        } @empty {
          <div class="empty-state">No timeline items yet.</div>
        }
      </div>
    </div>

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

      .timeline-sidebar {
        grid-column: 1 / 2;
        grid-row: 2 / span 1;
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

      .timeline-main .strip {
        z-index: 20000;
        background-color: #024b71;
        color: #cbe6ff;
        align-content: center;
        padding: 0 var(--timeline-strip-padding-x);
        border-radius: 5px;
        position: absolute;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .timeline-main .strip .resize-handle,
      .timeline-main .folder .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 10px;
        cursor: col-resize;
        z-index: 20001;
      }

      .timeline-main .strip .resize-handle.left,
      .timeline-main .folder .resize-handle.left {
        left: 0;
      }

      .timeline-main .strip .resize-handle.right,
      .timeline-main .folder .resize-handle.right {
        right: 0;
      }

      .timeline-main .folder .resize-handle.top,
      .timeline-main .folder .resize-handle.bottom {
        left: 0;
        right: 0;
        width: auto;
        height: 10px;
        cursor: row-resize;
      }

      .timeline-main .folder .resize-handle.top {
        top: 0;
        bottom: auto;
      }

      .timeline-main .folder .resize-handle.bottom {
        top: auto;
        bottom: 0;
      }

      .timeline-main .folder {
        z-index: 10000;
        position: absolute;
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }

      .timeline-main .folder .folder-header {
        min-height: calc(var(--timeline-track-height) - 8px);
        background-color: #437836;
        color: #e0e3e8;
        align-content: center;
        padding: 0 var(--timeline-strip-padding-x);
        border-radius: 10px 10px var(--timeline-folder-offset) var(--timeline-folder-offset);
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr) 40px;
        gap: 3px;
      }

      .timeline-main .folder .folder-header div:nth-child(2) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .timeline-main .folder .folder-header.expanded {
        border-radius: 10px 10px 0 0;
      }

      .timeline-main .folder .folder-header button {
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: inherit;
      }

      .timeline-main .folder .folder-content-holder {
        background-color: #2e6b2e;
        background-image: repeating-linear-gradient(
          to bottom,
          #32562a,
          #32562a var(--timeline-folder-content-stripe-height),
          #264c14 var(--timeline-folder-content-stripe-height),
          #264c14 var(--timeline-track-height)
        );
        color: white;
        border-radius: 0 0 var(--timeline-folder-offset) var(--timeline-folder-offset);
      }

      .timeline-main .empty-state {
        color: white;
        height: 100%;
        display: grid;
        justify-content: center;
        align-items: center;
      }

      .timeline-main .strip.selected,
      .timeline-main .folder.selected .folder-header {
        box-shadow: 0 0 0 2px #8dd7ff inset;
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
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroFolderMicro, heroChevronUpDownMicro })],
})
export class AnienTimelineComponent {
  private readonly stateService = inject(TimelineStateService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  public readonly timelineItems = this.stateService.timelineItems;
  public readonly timelineRows = this.stateService.timelineRows;
  public readonly timelineExtentTicks = this.stateService.timelineExtentTicks;
  public readonly timelineName = this.stateService.timelineName;
  public readonly rootFolderSourceId = this.stateService.rootFolderSourceId;
  public readonly selectedItemIds = this.stateService.selectedItemIds;
  public readonly hasSelection = computed(() => this.selectedItemIds().size > 0);
  public readonly currentTick = this.stateService.currentTick;
  public readonly debugStats = this.stateService.debugStats;
  public readonly debugSnapshotJson = this.stateService.debugSnapshotJson;
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

  @ViewChild('mainWrapper') mainWrapperRef?: ElementRef<HTMLDivElement>;
  @ViewChild('rulerWrapper') rulerWrapperRef?: ElementRef<HTMLDivElement>;

  private readonly TICK_SIZE = 2;
  private readonly TRACK_HEIGHT = 34;

  public readonly debugPanelVisible = signal(false);
  public readonly snapshotCopyLabel = signal('Copy Snapshot JSON');

  private dragState: {
    type: 'move' | 'resize-left' | 'resize-right' | 'resize-top' | 'resize-bottom';
    itemId: string;
    itemType: 'strip' | 'folder';
    startX: number;
    startY: number;
    initialStartTick: number;
    initialStartRow: number;
    initialDurationTicks: number;
    initialBodyTrackCount: number;
    appliedDeltaTicks: number;
    appliedDeltaRows: number;
  } | null = null;

  private mouseDownState: {
    startX: number;
    startY: number;
    item: StripVM | FolderVM;
    event: MouseEvent;
  } | null = null;

  private rulerDragState: { isDragging: boolean; startX: number } | null = null;
  private renderFrameId: number | null = null;
  private detachRenderId: number | null = null;
  private snapshotCopyResetTimeoutId: number | null = null;

  public addTrack(): void {
    this.stateService.addTrack();
  }

  public createStrip(): void {
    this.stateService.createStrip();
  }

  public createFolder(): void {
    this.stateService.createFolder();
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
    this.mouseDownState = {
      startX: event.clientX,
      startY: event.clientY,
      item,
      event,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
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
      initialStartTick: item.startTick,
      initialStartRow: item.startRow,
      initialDurationTicks: item.durationTicks,
      initialBodyTrackCount: item.type === 'folder' ? item.bodyTrackCount : 0,
      appliedDeltaTicks: 0,
      appliedDeltaRows: 0,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  public onVerticalResizeMouseDown(
    event: MouseEvent,
    item: FolderVM,
    side: 'top' | 'bottom',
  ): void {
    event.stopPropagation();
    event.preventDefault();

    this.stateService.selectItem(item.id, false);
    this.dragState = {
      type: side === 'top' ? 'resize-top' : 'resize-bottom',
      itemId: item.id,
      itemType: 'folder',
      startX: event.clientX,
      startY: event.clientY,
      initialStartTick: item.startTick,
      initialStartRow: item.startRow,
      initialDurationTicks: item.durationTicks,
      initialBodyTrackCount: item.bodyTrackCount,
      appliedDeltaTicks: 0,
      appliedDeltaRows: 0,
    };

    this.startZoneLessDragLoop();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  private onWindowMouseMove = (event: MouseEvent) => {
    if (this.dragState) {
      this.handleDrag(event);
      return;
    }

    if (!this.mouseDownState) {
      return;
    }

    const deltaX = Math.abs(event.clientX - this.mouseDownState.startX);
    const deltaY = Math.abs(event.clientY - this.mouseDownState.startY);
    if (deltaX > 3 || deltaY > 3) {
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
      initialStartTick: item.startTick,
      initialStartRow: item.startRow,
      initialDurationTicks: item.durationTicks,
      initialBodyTrackCount: item.type === 'folder' ? item.bodyTrackCount : 0,
      appliedDeltaTicks: 0,
      appliedDeltaRows: 0,
    };
    this.mouseDownState = null;
  }

  private handleDrag(event: MouseEvent): void {
    if (!this.dragState) {
      return;
    }

    const deltaPixels = event.clientX - this.dragState.startX;
    const currentDeltaTicks = Math.round(deltaPixels / this.TICK_SIZE);
    const diffTicks = currentDeltaTicks - this.dragState.appliedDeltaTicks;
    const deltaRowsPixels = event.clientY - this.dragState.startY;
    const currentDeltaRows = Math.round(deltaRowsPixels / this.TRACK_HEIGHT);
    const diffRows = currentDeltaRows - this.dragState.appliedDeltaRows;

    if (this.dragState.type === 'move') {
      if (diffTicks === 0 && diffRows === 0) {
        return;
      }

      const targetStartTick = Math.max(0, this.dragState.initialStartTick + currentDeltaTicks);
      const targetStartRow = Math.max(0, this.dragState.initialStartRow + currentDeltaRows);
      if (this.dragState.itemType === 'strip') {
        this.stateService.updateStrip(this.dragState.itemId, {
          startTick: targetStartTick,
          startRow: targetStartRow,
        });
      } else {
        this.stateService.updateFolder(this.dragState.itemId, {
          startTick: targetStartTick,
          startRow: targetStartRow,
        });
      }
      this.dragState.appliedDeltaTicks = currentDeltaTicks;
      this.dragState.appliedDeltaRows = currentDeltaRows;
      this.requestRender();
      return;
    }

    if (this.dragState.type === 'resize-left') {
      if (diffTicks === 0) {
        return;
      }

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

      if (this.dragState.itemType === 'strip') {
        this.stateService.updateStrip(this.dragState.itemId, {
          startTick: nextStartTick,
          durationTicks: nextDurationTicks,
        });
      } else {
        this.stateService.updateFolder(this.dragState.itemId, {
          startTick: nextStartTick,
          durationTicks: nextDurationTicks,
        });
      }

      this.dragState.appliedDeltaTicks = currentDeltaTicks;
      this.requestRender();
      return;
    }

    if (this.dragState.type === 'resize-right') {
      if (diffTicks === 0) {
        return;
      }

      const nextDurationTicks = Math.max(
        1,
        this.dragState.initialDurationTicks + currentDeltaTicks,
      );
      if (this.dragState.itemType === 'strip') {
        this.stateService.updateStrip(this.dragState.itemId, { durationTicks: nextDurationTicks });
      } else {
        this.stateService.updateFolder(this.dragState.itemId, { durationTicks: nextDurationTicks });
      }
      this.dragState.appliedDeltaTicks = currentDeltaTicks;
      this.requestRender();
      return;
    }

    if (diffRows === 0) {
      return;
    }

    if (this.dragState.type === 'resize-bottom') {
      const nextBodyTrackCount = Math.max(
        1,
        this.dragState.initialBodyTrackCount + currentDeltaRows,
      );
      this.stateService.updateFolder(this.dragState.itemId, {
        bodyTrackCount: nextBodyTrackCount,
      });
      this.dragState.appliedDeltaRows = currentDeltaRows;
      this.requestRender();
      return;
    }

    const nextBodyTrackCount = Math.max(1, this.dragState.initialBodyTrackCount - currentDeltaRows);
    const nextStartRow = Math.max(0, this.dragState.initialStartRow + currentDeltaRows);
    this.stateService.updateFolder(this.dragState.itemId, {
      bodyTrackCount: nextBodyTrackCount,
      startRow: nextStartRow,
    });
    this.dragState.appliedDeltaRows = currentDeltaRows;
    this.requestRender();
  }

  private onWindowMouseUp = () => {
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
    this.stopZoneLessDragLoop();

    if (this.dragState) {
      const completedDrag = this.dragState;
      this.dragState = null;

      if (completedDrag.type === 'move') {
        this.finalizeMove(completedDrag.itemId);
      }

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

    const rulerRect = this.rulerWrapperRef.nativeElement.getBoundingClientRect();
    const scrollLeft = this.rulerWrapperRef.nativeElement.scrollLeft;
    const offsetX = event.clientX - rulerRect.left + scrollLeft;
    let tick = Math.round(offsetX / this.TICK_SIZE);
    tick = Math.max(0, Math.min(tick, this.timelineExtentTicks()));
    this.stateService.setCurrentTick(tick);
  }

  private requestRender(): void {
    if (this.renderFrameId !== null) {
      return;
    }

    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      this.changeDetectorRef.detectChanges();
    });
  }

  private startZoneLessDragLoop(): void {
    if (this.detachRenderId !== null) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const tick = () => {
        this.changeDetectorRef.detectChanges();
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

  private finalizeMove(itemId: string): void {
    const draggedItem = this.timelineItems().find((item) => item.id === itemId);
    if (!draggedItem) {
      this.requestRender();
      return;
    }

    const target = this.resolveDropTarget(draggedItem);
    if (!target || target.parentFolderId === draggedItem.parentFolderId) {
      this.requestRender();
      return;
    }

    this.stateService.moveItem(itemId, target);
    this.requestRender();
  }

  private resolveDropTarget(
    draggedItem: StripVM | FolderVM,
  ):
    | (Required<
        Pick<import('../../services/timeline-store.service').MoveTargetInput, 'parentFolderId'>
      > &
        Pick<
          import('../../services/timeline-store.service').MoveTargetInput,
          'trackIndex' | 'startTick'
        >)
    | null {
    const rootFolderSourceId = this.rootFolderSourceId();
    if (!rootFolderSourceId) {
      return null;
    }

    const candidateFolders = this.timelineItems()
      .filter((item): item is FolderVM => item.type === 'folder')
      .filter((item) => this.isValidDropTargetFolder(draggedItem, item))
      .filter((item) =>
        this.isInsideFolderBody(draggedItem.absoluteStartTick, draggedItem.absoluteStartRow, item),
      )
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
    absoluteStartTick: number,
    absoluteStartRow: number,
    folder: FolderVM,
  ): boolean {
    const bodyStartRow = folder.absoluteStartRow + 1;
    const bodyEndRow = bodyStartRow + folder.bodyTrackCount;
    const folderEndTick = folder.absoluteStartTick + folder.durationTicks;

    return (
      absoluteStartTick >= folder.absoluteStartTick &&
      absoluteStartTick < folderEndTick &&
      absoluteStartRow >= bodyStartRow &&
      absoluteStartRow < bodyEndRow
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
}
