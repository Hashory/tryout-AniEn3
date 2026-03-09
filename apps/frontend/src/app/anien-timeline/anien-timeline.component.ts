import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { TimelineStateService, StripVM, FolderVM } from './anien-timeline-state.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroFolderMicro, heroChevronUpDownMicro } from '@ng-icons/heroicons/micro';

@Component({
  selector: 'app-anien-timeline',
  template: `
    <div class="timeline-header">
      <button (click)="addTrack()">+</button>
      <div class="timeline-ruller" style="color:white;">Ruller Here</div>
    </div>
    <div
      class="timeline-sidebar"
      tabindex="0"
      (click)="onBackgroundClick($event)"
      (keydown.enter)="onBackgroundKeydown($event)"
      (keydown.space)="onBackgroundKeydown($event)"
    ></div>

    <div class="timeline-main-wrapper">
      <div
        class="timeline-main"
        [style.width]="'calc(var(--timeline-frame-size) * 1000)'"
        [style.height]="'calc(var(--timeline-track-height) * ' + 100 + ')'"
        tabindex="0"
        (click)="onBackgroundClick($event)"
        (keydown.enter)="onBackgroundKeydown($event)"
        (keydown.space)="onBackgroundKeydown($event)"
      >
        @for (item of timelineItems(); track item.id; let i = $index) {
          @if (item.type === 'strip') {
            <div
              class="strip"
              tabindex="0"
              [style.display]="item.isParentFolderVisible ? 'block' : 'none'"
              [style.width]="'calc(var(--timeline-frame-size) * ' + item.length + ')'"
              [style.top]="
                'calc(' +
                item.trackOrder +
                ' * var(--timeline-track-height) + var(--timeline-strip-offset))'
              "
              [style.left]="'calc(var(--timeline-frame-size) * ' + item.absoluteStartFrame + ')'"
              [class.selected]="item.isSelected"
              (mousedown)="onItemMouseDown($event, item)"
              (keydown.enter)="onItemKeydown($event, item.id)"
              (keydown.space)="onItemKeydown($event, item.id)"
            >
              <div
                class="resize-handle left"
                (mousedown)="onResizeHandleMouseDown($event, item, 'left')"
              ></div>
              {{ item.source }}
              <div
                class="resize-handle right"
                (mousedown)="onResizeHandleMouseDown($event, item, 'right')"
              ></div>
            </div>
          } @else {
            <div
              class="folder"
              tabindex="0"
              [style.width]="'calc(var(--timeline-frame-size) * ' + item.length + ')'"
              [style.top]="
                'calc(' +
                item.trackOrder +
                ' * var(--timeline-track-height) + var(--timeline-folder-offset))'
              "
              [style.left]="'calc(var(--timeline-frame-size) * ' + item.absoluteStartFrame + ')'"
              [class.selected]="item.isSelected"
              (mousedown)="onItemMouseDown($event, item)"
              (keydown.enter)="onItemKeydown($event, item.id)"
              (keydown.space)="onItemKeydown($event, item.id)"
            >
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
                [style.display]="item.isExpanded && item.isParentFolderVisible ? 'block' : 'none'"
                [style.height]="
                  'calc(' +
                  item.trackLength +
                  ' * var(--timeline-track-height) + var(--timeline-folder-offset))'
                "
              ></div>
              <div
                class="resize-handle right"
                (mousedown)="onResizeHandleMouseDown($event, item, 'right')"
              ></div>
            </div>
          }
        } @empty {
          <div class="empty-state">No tracks yet.</div>
        }
      </div>
    </div>

    <div class="timeline-actions">
      <div class="actions-label">Create</div>
      <div class="actions-group">
        <button type="button" (click)="createStrip()">Add Strip</button>
        <button type="button" (click)="createFolder()">Add Folder</button>
      </div>
      <div class="actions-label">Selection Actions</div>
      <div class="actions-group">
        <button type="button" (click)="shiftSelection(-1)" [disabled]="!hasSelection()">
          Move -1 frame
        </button>
        <button type="button" (click)="shiftSelection(1)" [disabled]="!hasSelection()">
          Move +1 frame
        </button>
        <button type="button" (click)="shiftSelection(-10)" [disabled]="!hasSelection()">
          Move -10 frames
        </button>
        <button type="button" (click)="shiftSelection(10)" [disabled]="!hasSelection()">
          Move +10 frames
        </button>
        <button type="button" (click)="adjustSelectionLength(-1)" [disabled]="!hasSelection()">
          Shorten -1 frame
        </button>
        <button type="button" (click)="adjustSelectionLength(1)" [disabled]="!hasSelection()">
          Extend +1 frame
        </button>
        <button type="button" (click)="deleteSelected()" [disabled]="!hasSelection()">
          Delete Selected
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      * {
        outline: none;
      }

      :host {
        /* variables */
        --timeline-frame-size: 2px;
        --timeline-track-height: 34px;
        --timeline-sidebar-width: 33px;
        --timeline-grid-gap: 3px;
        --timeline-strip-height: 26px;
        --timeline-strip-padding-x: 9px;
        --timeline-strip-offset: 2px;
        --timeline-background-stripe-height: 30px;
        --timeline-folder-offset: 4px;
        --timeline-folder-content-stripe-height: 4px;

        /* layout */
        display: block;
        background: #101417;
        width: 100%;
        height: 100%;
        border-radius: 8px 8px 0px 0px;
        display: grid;
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
        background-color: #0b0f12;
        background-image: repeating-linear-gradient(
          to bottom,
          #262a2e,
          #262a2e var(--timeline-background-stripe-height),
          #0b0f12 var(--timeline-background-stripe-height),
          #0b0f12 var(--timeline-track-height)
        );

        position: relative;
      }

      .timeline-main .strip {
        z-index: 20000;
        height: var(--timeline-strip-height);
        background-color: #024b71;
        color: #cbe6ff;
        align-content: center;
        padding: 0 var(--timeline-strip-padding-x);
        border-radius: 5px;
        position: absolute;
        cursor: pointer;

        /* prevent text overflow */
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

      .timeline-main .folder {
        z-index: 10000;
        position: absolute;
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }

      .timeline-main .folder .folder-header {
        height: var(--timeline-strip-height);
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroFolderMicro, heroChevronUpDownMicro })],
})
export class AnienTimelineComponent {
  private readonly stateService = inject(TimelineStateService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  public readonly timelineItems = this.stateService.timelineItems;
  public readonly timelineName = this.stateService.timelineName;
  public readonly selectedItemIds = this.stateService.selectedItemIds;
  public readonly hasSelection = computed(() => this.selectedItemIds().size > 0);

  private readonly FRAME_SIZE = 2; // Must match CSS --timeline-frame-size

  private dragState: {
    type: 'move' | 'resize-left' | 'resize-right';
    itemId: string;
    itemType: 'strip' | 'folder';
    startX: number;
    initialStartFrame: number;
    initialLength: number;
    appliedDeltaFrames: number;
  } | null = null;

  private mouseDownState: {
    startX: number;
    item: StripVM | FolderVM;
    event: MouseEvent;
  } | null = null;

  private renderFrameId: number | null = null;
  private detachRenderId: number | null = null;

  public addTrack(): void {
    this.stateService.addTrack();
  }

  public createStrip(): void {
    this.stateService.createStrip();
  }

  public createFolder(): void {
    this.stateService.createFolder();
  }

  public onItemClick(event: MouseEvent, itemId: string): void {
    // Handled by mousedown/mouseup logic for strips, but kept for folders
    const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.shiftKey) {
      this.stateService.selectItem(itemId, true);
      return;
    }

    this.stateService.selectItem(itemId, isMultiSelect);
  }

  public onItemMouseDown(event: MouseEvent, item: StripVM | FolderVM): void {
    this.mouseDownState = {
      startX: event.clientX,
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
      initialStartFrame: item.startFrame,
      initialLength: item.length,
      appliedDeltaFrames: 0,
    };

    this.startZoneLessDragLoop();

    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  private onWindowMouseMove = (event: MouseEvent) => {
    if (this.dragState) {
      this.handleDrag(event);
    } else if (this.mouseDownState) {
      const deltaX = Math.abs(event.clientX - this.mouseDownState.startX);
      if (deltaX > 3) {
        this.startMoveDrag();
      }
    }
  };

  private startMoveDrag() {
    if (!this.mouseDownState) return;

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
      initialStartFrame: item.startFrame,
      initialLength: item.length,
      appliedDeltaFrames: 0,
    };

    this.mouseDownState = null;
  }

  private handleDrag(event: MouseEvent) {
    if (!this.dragState) return;

    const deltaPixels = event.clientX - this.dragState.startX;
    const currentDeltaFrames = Math.round(deltaPixels / this.FRAME_SIZE);
    const diffFrames = currentDeltaFrames - this.dragState.appliedDeltaFrames;

    if (diffFrames === 0) return;

    if (this.dragState.type === 'move') {
      const nextStartFrame = this.dragState.initialStartFrame + currentDeltaFrames;
      const targetStart = Math.max(0, nextStartFrame);
      if (this.dragState.itemType === 'strip') {
        this.stateService.updateStrip(this.dragState.itemId, { startFrame: targetStart });
      } else {
        this.stateService.updateFolder(this.dragState.itemId, { startFrame: targetStart });
      }
      this.dragState.appliedDeltaFrames = currentDeltaFrames;
      this.requestRender();
    } else if (this.dragState.type === 'resize-left') {
      let newStart = this.dragState.initialStartFrame + currentDeltaFrames;
      let newLength = this.dragState.initialLength - currentDeltaFrames;

      if (newLength < 1) {
        newLength = 1;
        newStart = this.dragState.initialStartFrame + this.dragState.initialLength - 1;
      }
      if (newStart < 0) {
        newStart = 0;
        newLength = this.dragState.initialStartFrame + this.dragState.initialLength;
      }

      if (this.dragState.itemType === 'strip') {
        this.stateService.updateStrip(this.dragState.itemId, {
          startFrame: newStart,
          length: newLength,
        });
      } else {
        this.stateService.updateFolder(this.dragState.itemId, {
          startFrame: newStart,
          length: newLength,
        });
      }
      this.dragState.appliedDeltaFrames = currentDeltaFrames;
      this.requestRender();
    } else if (this.dragState.type === 'resize-right') {
      const newLength = Math.max(1, this.dragState.initialLength + currentDeltaFrames);
      if (this.dragState.itemType === 'strip') {
        this.stateService.updateStrip(this.dragState.itemId, { length: newLength });
      } else {
        this.stateService.updateFolder(this.dragState.itemId, { length: newLength });
      }
      this.dragState.appliedDeltaFrames = currentDeltaFrames;
      this.requestRender();
    }
  }

  private onWindowMouseUp = () => {
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);

    this.stopZoneLessDragLoop();

    if (this.dragState) {
      this.dragState = null;
    } else if (this.mouseDownState) {
      const { item, event: downEvent } = this.mouseDownState;

      const isMultiSelect = downEvent.ctrlKey || downEvent.metaKey || downEvent.shiftKey;
      if (downEvent.shiftKey) {
        this.stateService.selectItem(item.id, true);
      } else {
        this.stateService.selectItem(item.id, isMultiSelect);
      }

      this.mouseDownState = null;
      this.requestRender();
    }
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
    this.stateService.shiftSelectedByFrames(delta);
  }

  public adjustSelectionLength(delta: number): void {
    this.stateService.adjustSelectedLength(delta);
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

  // Helper for testing
  public addTestStrip(): void {
    if (this.timelineItems().length === 0) {
      this.stateService.addTrack();
    }
    this.stateService.addTrack();
  }
}
