import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroChevronUpDownMicro, heroFolderMicro } from '@ng-icons/heroicons/micro';
import { FolderVM } from '../../services/timeline-state.service';
import {
  HorizontalResizeStartEvent,
  VerticalResizeStartEvent,
} from '../anien-timeline-strip/anien-timeline-strip.component';

@Component({
  selector: 'app-anien-timeline-folder',
  template: `
    <div
      class="folder"
      tabindex="0"
      [style.width]="'calc(var(--timeline-tick-size, 2px) * ' + item().durationTicks + ')'"
      [style.height]="'calc(var(--timeline-track-height, 34px) * ' + item().rowSpan + ')'"
      [style.top]="
        'calc(' +
        item().absoluteStartRow +
        ' * var(--timeline-track-height, 34px) + var(--timeline-folder-offset, 4px))'
      "
      [style.left]="'calc(var(--timeline-tick-size, 2px) * ' + item().absoluteStartTick + ')'"
      [style.clip-path]="clipPath()"
      [class.selected]="item().isSelected"
      (mousedown)="itemMouseDown.emit($event)"
      (keydown.enter)="itemKeydown.emit($event)"
      (keydown.space)="itemKeydown.emit($event)"
    >
      <div
        class="resize-handle top"
        (mousedown)="verticalResizeStart.emit({ event: $event, side: 'top' })"
      ></div>
      <div
        class="resize-handle left"
        (mousedown)="horizontalResizeStart.emit({ event: $event, side: 'left' })"
      ></div>
      <div class="folder-header" [class.expanded]="item().isExpanded">
        <div>
          <ng-icon name="heroFolderMicro" />
        </div>
        <div>{{ item().name }}</div>
        <button type="button" tabindex="-1" aria-label="Toggle folder expansion">
          <ng-icon name="heroChevronUpDownMicro" [style.rotate]="'90deg'" />
        </button>
      </div>
      <div
        class="folder-content-holder"
        [style.display]="item().isExpanded ? 'block' : 'none'"
        [style.height]="'calc(' + item().bodyTrackCount + ' * var(--timeline-track-height, 34px))'"
      ></div>
      <div
        class="resize-handle right"
        (mousedown)="horizontalResizeStart.emit({ event: $event, side: 'right' })"
      ></div>
      <div
        class="resize-handle bottom"
        (mousedown)="verticalResizeStart.emit({ event: $event, side: 'bottom' })"
      ></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .folder {
        z-index: 10000;
        position: absolute;
        display: flex;
        flex-direction: column;
        cursor: pointer;
        user-select: none;
      }

      .folder .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 10px;
        cursor: col-resize;
        z-index: 20001;
      }

      .folder .resize-handle.left {
        left: 0;
      }

      .folder .resize-handle.right {
        right: 0;
      }

      .folder .resize-handle.top,
      .folder .resize-handle.bottom {
        left: 0;
        right: 0;
        width: auto;
        height: 10px;
        cursor: row-resize;
      }

      .folder .resize-handle.top {
        top: 0;
        bottom: auto;
      }

      .folder .resize-handle.bottom {
        top: auto;
        bottom: 0;
      }

      .folder .folder-header {
        min-height: calc(var(--timeline-track-height, 34px) - 8px);
        background-color: #437836;
        color: #e0e3e8;
        align-content: center;
        padding: 0 var(--timeline-strip-padding-x, 9px);
        border-radius: 10px 10px var(--timeline-folder-offset, 4px)
          var(--timeline-folder-offset, 4px);
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr) 40px;
        gap: 3px;
      }

      .folder .folder-header div:nth-child(2) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .folder .folder-header.expanded {
        border-radius: 10px 10px 0 0;
      }

      .folder .folder-header button {
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

      .folder .folder-content-holder {
        background-color: #2e6b2e;
        background-image: repeating-linear-gradient(
          to bottom,
          #32562a,
          #32562a var(--timeline-folder-content-stripe-height, 4px),
          #264c14 var(--timeline-folder-content-stripe-height, 4px),
          #264c14 var(--timeline-track-height, 34px)
        );
        color: white;
        border-radius: 0 0 var(--timeline-folder-offset, 4px) var(--timeline-folder-offset, 4px);
      }

      .folder.selected .folder-header {
        box-shadow: 0 0 0 2px #8dd7ff inset;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroFolderMicro, heroChevronUpDownMicro })],
})
export class AnienTimelineFolderComponent {
  public readonly item = input.required<FolderVM>();
  public readonly clipPath = input<string | null>(null);

  public readonly itemMouseDown = output<MouseEvent>();
  public readonly itemKeydown = output<Event>();
  public readonly horizontalResizeStart = output<HorizontalResizeStartEvent>();
  public readonly verticalResizeStart = output<VerticalResizeStartEvent>();
}
