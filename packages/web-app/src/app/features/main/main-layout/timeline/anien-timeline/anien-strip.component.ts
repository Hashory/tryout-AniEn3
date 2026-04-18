import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  ScheduleStripBrand,
  StripVM,
} from '#app/features/main/main-layout/timeline/services/timeline-state.service';

const SCHEDULE_BADGE_LABELS: Record<ScheduleStripBrand, string> = {
  ae: 'Ae',
  photoshop: 'Ps',
  maya: 'Ma',
  clipstudio: 'Cs',
};

export interface TimelineItemResizeStart {
  event: MouseEvent;
  side: 'left' | 'right' | 'top' | 'bottom';
}

@Component({
  selector: 'app-anien-strip',
  standalone: true,
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
      [class.lane-span-1]="laneSpan() === 1"
      [class.lane-span-2]="laneSpan() === 2"
      [class.shedule-strip]="sheduleStrip()"
      [class.brand-ae]="sheduleStrip() && scheduleBrand() === 'ae'"
      [class.brand-photoshop]="sheduleStrip() && scheduleBrand() === 'photoshop'"
      [class.brand-maya]="sheduleStrip() && scheduleBrand() === 'maya'"
      [class.brand-clipstudio]="sheduleStrip() && scheduleBrand() === 'clipstudio'"
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
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
    >
      <div class="resize-handle top" (mousedown)="onResizeStart($event, 'top')"></div>
      <div class="resize-handle left" (mousedown)="onResizeStart($event, 'left')"></div>
      @if (sheduleStrip()) {
        <!-- sheduleStrip -->
        <div class="shedule-strip-content">
          <div
            class="shedule-icon"
            [class.clipstudio-mark]="scheduleBrand() === 'clipstudio'"
            [class.maya-mark]="scheduleBrand() === 'maya'"
          >
            @if (scheduleBrand() === 'clipstudio' || scheduleBrand() === 'maya') {
            } @else {
              <span>{{ scheduleBadgeLabel() }}</span>
            }
          </div>
          <div class="shedule-text">
            <div class="shedule-title">{{ item().sourceName }}</div>
            <div class="shedule-meta">
              <span class="worker">作業者:○○さん</span>
              <span class="deadline">~10/3</span>
            </div>
          </div>
        </div>
      } @else {
        <!-- NomalStrip -->
        <span>{{ item().sourceName }}</span>
        @if (laneSpan() === 2) {
          <span class="lane2-preview">Preview</span>
        }
      }

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

      .strip.lane-span-1 {
        /* Design for laneSpan 1 */
      }

      .strip.lane-span-2 {
        /* Design for laneSpan 2 */
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-block: 2px;
      }

      .lane2-preview {
        flex: 1;
        background-color: #1570a1ff;
        border-radius: 2px;
        width: 100%;
      }

      .shedule-strip {
        border: 2px dashed;
        opacity: 0.7;
      }

      .shedule-strip.brand-ae {
        background-color: #2b347d;
        color: #e8ebff;
        border-color: #939af6;
      }

      .shedule-strip.brand-photoshop {
        background-color: #032b52;
        color: #d4efff;
        border-color: #4dc1ff;
      }

      .shedule-strip.brand-maya {
        background-color: #1c4744;
        color: #d6f8f0;
        border-color: #64d8c2;
      }

      .shedule-strip.brand-clipstudio {
        background: #cccccd;
        color: #2f2f31;
      }

      .shedule-strip-content {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 100%;
        width: 100%;
      }

      .shedule-icon {
        background-color: rgba(255, 255, 255, 0.16);
        color: #ffffff;
        width: 42px;
        height: 42px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 1.4em;
        flex-shrink: 0;
      }

      .shedule-strip.brand-ae .shedule-icon {
        background-color: #120f34;
        color: #c4bcff;
      }

      .shedule-strip.brand-photoshop .shedule-icon {
        background-color: #001e36;
        color: #41cbff;
      }

      .shedule-strip.brand-maya .shedule-icon {
        background-color: #0e2f2b;
        color: #8df0db;
      }

      .shedule-strip.brand-clipstudio .shedule-icon {
        background: linear-gradient(180deg, #fdfdfd 0%, #e9e9eb 100%);
        color: #343436;
        border: 1px solid rgba(77, 77, 82, 0.1);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.85),
          0 1px 1px rgba(0, 0, 0, 0.06);
      }

      .shedule-strip.brand-clipstudio .clipstudio-mark {
        background: url('https://upload.wikimedia.org/wikipedia/commons/1/14/Clipstudiopaint_app_logo.png')
          center center / contain no-repeat;
      }

      .shedule-strip.brand-maya .maya-mark {
        background: url('https://images.seeklogo.com/logo-png/48/1/autodesk-maya-logo-png_seeklogo-482401.png')
          center center / contain no-repeat;
      }

      .shedule-text {
        display: flex;
        flex-direction: column;
        justify-content: center;
        overflow: hidden;
      }

      .shedule-title {
        font-weight: 700;
        font-size: 1.1em;
        line-height: 1.2;
      }

      .shedule-meta {
        display: flex;
        gap: 12px;
        font-size: 0.9em;
        font-weight: 600;
      }

      .shedule-meta span {
        text-decoration: underline;
      }

      .strip.ui-focused {
        box-shadow: 0 0 0 3px rgba(26, 159, 231, 0.8) inset;
      }

      .strip.selected {
        box-shadow: 0 0 0 3px rgb(26, 159, 231) inset;
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
  public readonly sheduleStrip = input(false);
  public readonly scheduleBrand = input<ScheduleStripBrand>('ae');

  public readonly itemMouseDown = output<MouseEvent>();
  public readonly itemKeydown = output<KeyboardEvent>();
  public readonly resizeStart = output<TimelineItemResizeStart>();
  public readonly externalDrop = output<DragEvent>();

  public readonly isHovered = signal(false);
  public readonly isFocused = signal(false);
  public readonly isPressed = signal(false);

  public readonly laneSpan = computed(() => this.item().laneSpan);
  public readonly scheduleBadgeLabel = computed(() => SCHEDULE_BADGE_LABELS[this.scheduleBrand()]);

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

  public onDragOver(event: DragEvent): void {
    if (!this.sheduleStrip()) {
      return;
    }

    event.preventDefault();
  }

  public onDrop(event: DragEvent): void {
    if (!this.sheduleStrip()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.externalDrop.emit(event);
  }
}
