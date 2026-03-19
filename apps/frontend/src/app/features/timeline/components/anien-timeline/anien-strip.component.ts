import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { StripVM } from '../../services/timeline-state.service';

export interface TimelineItemResizeStart {
  event: MouseEvent;
  side: 'left' | 'right' | 'top' | 'bottom';
}

@Component({
  selector: 'app-anien-strip',
  host: {
    '[class.focused]': 'isFocused()',
  },
  template: `
    <div
      class="strip"
      tabindex="0"
      [style.width]="'calc(var(--timeline-tick-size) * ' + item().durationTicks + ')'"
      [style.height]="'calc(var(--timeline-track-height) * ' + item().rowSpan + ' - 8px)'"
      [style.top]="
        'calc(' +
        item().absoluteStartRow +
        ' * var(--timeline-track-height) + var(--timeline-strip-offset))'
      "
      [style.left]="'calc(var(--timeline-tick-size) * ' + item().absoluteStartTick + ')'"
      [style.clip-path]="clipPath()"
      [class.selected]="item().isSelected"
      [class.ui-hovered]="isHovered()"
      [class.ui-focused]="isFocused()"
      [class.ui-pressed]="isPressed()"
      (mousedown)="onItemMouseDown($event)"
      (keydown.enter)="onItemKeydown($event)"
      (keydown.space)="onItemKeydown($event)"
      (mouseenter)="isHovered.set(true)"
      (mouseleave)="onMouseLeave()"
      (focus)="isFocused.set(true)"
      (blur)="onBlur()"
    >
      <div class="resize-handle top" (mousedown)="onResizeStart($event, 'top')"></div>
      <div class="resize-handle left" (mousedown)="onResizeStart($event, 'left')"></div>
      {{ item().sourceName }}
      <div class="resize-handle right" (mousedown)="onResizeStart($event, 'right')"></div>
      <div class="resize-handle bottom" (mousedown)="onResizeStart($event, 'bottom')"></div>
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
        padding: 0 var(--timeline-strip-padding-x);
        border-radius: 5px;
        position: absolute;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition:
          filter 120ms ease,
          box-shadow 120ms ease;
      }

      .strip.ui-hovered {
        filter: brightness(1.06);
      }

      .strip.ui-focused {
        box-shadow: 0 0 0 2px rgba(141, 215, 255, 0.7) inset;
      }

      .strip.ui-pressed {
        filter: brightness(0.92);
      }

      .strip.selected {
        box-shadow: 0 0 0 2px #8dd7ff inset;
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnienStripComponent {
  public readonly item = input.required<StripVM>();
  public readonly clipPath = input<string | null>(null);

  public readonly itemMouseDown = output<MouseEvent>();
  public readonly itemKeydown = output<KeyboardEvent>();
  public readonly resizeStart = output<TimelineItemResizeStart>();

  public readonly isHovered = signal(false);
  public readonly isFocused = signal(false);
  public readonly isPressed = signal(false);

  public onItemMouseDown(event: MouseEvent): void {
    this.isPressed.set(true);
    this.itemMouseDown.emit(event);
  }

  public onItemKeydown(event: KeyboardEvent | Event): void {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    this.itemKeydown.emit(event);
  }

  public onResizeStart(event: MouseEvent, side: TimelineItemResizeStart['side']): void {
    this.isPressed.set(true);
    this.resizeStart.emit({ event, side });
  }

  public onMouseLeave(): void {
    this.isHovered.set(false);
    this.isPressed.set(false);
  }

  public onBlur(): void {
    this.isFocused.set(false);
    this.isPressed.set(false);
  }
}
