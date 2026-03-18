import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { StripVM } from '../../services/timeline-state.service';

export interface HorizontalResizeStartEvent {
  event: MouseEvent;
  side: 'left' | 'right';
}

export interface VerticalResizeStartEvent {
  event: MouseEvent;
  side: 'top' | 'bottom';
}

@Component({
  selector: 'app-anien-timeline-strip',
  template: `
    <div
      class="strip"
      tabindex="0"
      [style.width]="'calc(var(--timeline-tick-size, 2px) * ' + item().durationTicks + ')'"
      [style.height]="'calc(var(--timeline-track-height, 34px) * ' + item().rowSpan + ' - 8px)'"
      [style.top]="
        'calc(' +
        item().absoluteStartRow +
        ' * var(--timeline-track-height, 34px) + var(--timeline-strip-offset, 2px))'
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
      {{ item().sourceName }}
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

      .strip {
        z-index: 20000;
        background-color: #024b71;
        color: #cbe6ff;
        align-content: center;
        box-sizing: border-box;
        padding: 0 var(--timeline-strip-padding-x, 9px);
        border-radius: 5px;
        position: absolute;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        user-select: none;
      }

      .strip .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 10px;
        cursor: col-resize;
        z-index: 20001;
      }

      .strip .resize-handle.left {
        left: 0;
      }

      .strip .resize-handle.right {
        right: 0;
      }

      .strip .resize-handle.top,
      .strip .resize-handle.bottom {
        left: 0;
        right: 0;
        width: auto;
        height: 10px;
        cursor: row-resize;
      }

      .strip .resize-handle.top {
        top: 0;
        bottom: auto;
      }

      .strip .resize-handle.bottom {
        top: auto;
        bottom: 0;
      }

      .strip.selected {
        box-shadow: 0 0 0 2px #8dd7ff inset;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class AnienTimelineStripComponent {
  public readonly item = input.required<StripVM>();
  public readonly clipPath = input<string | null>(null);

  public readonly itemMouseDown = output<MouseEvent>();
  public readonly itemKeydown = output<Event>();
  public readonly horizontalResizeStart = output<HorizontalResizeStartEvent>();
  public readonly verticalResizeStart = output<VerticalResizeStartEvent>();
}
