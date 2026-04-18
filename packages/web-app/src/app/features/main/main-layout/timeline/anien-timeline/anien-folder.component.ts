import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroChevronUpDownMicro, heroFolderMicro } from '@ng-icons/heroicons/micro';
import { FolderVM } from '#app/features/main/main-layout/timeline/services/timeline-state.service';
import type { TimelineItemResizeStart } from '#app/features/main/main-layout/timeline/anien-timeline/anien-strip.component';

@Component({
  selector: 'app-anien-folder',
  standalone: true,
  host: {
    '[class.focused]': 'isFocused()',
  },
  template: `
    <div
      class="folder"
      tabindex="0"
      [style.width]="'calc(var(--timeline-tick-size) * ' + item().durationTicks + ')'"
      [style.height]="'calc(var(--timeline-track-height) * ' + item().rowSpan + ')'"
      [style.top]="
        'calc(' +
        item().absoluteStartRow +
        ' * var(--timeline-track-height) + var(--timeline-folder-offset))'
      "
      [style.left]="'calc(var(--timeline-tick-size) * ' + item().absoluteStartTick + ')'"
      [style.clip-path]="clipPath()"
      [class.brand-ae]="item().scheduleBrand === 'ae'"
      [class.brand-photoshop]="item().scheduleBrand === 'photoshop'"
      [class.brand-maya]="item().scheduleBrand === 'maya'"
      [class.brand-clipstudio]="item().scheduleBrand === 'clipstudio'"
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
      <div class="folder-header" [class.expanded]="item().isExpanded">
        <div type="button">
          <ng-icon name="heroFolderMicro" />
        </div>
        <div>{{ item().name }}</div>
        <button type="button">
          <ng-icon name="heroChevronUpDownMicro" [style.rotate]="'90deg'" />
        </button>
      </div>
      <div
        class="folder-content-holder"
        [style.display]="item().isExpanded ? 'block' : 'none'"
        [style.height]="'calc(' + item().bodyTrackCount + ' * var(--timeline-track-height))'"
      ></div>
      <div class="resize-handle right" (mousedown)="onResizeStart($event, 'right')"></div>
      <div class="resize-handle bottom" (mousedown)="onResizeStart($event, 'bottom')"></div>
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
        transition: filter 120ms ease;
      }

      .folder.ui-hovered {
        filter: brightness(1.04);
      }

      .folder.ui-pressed {
        filter: brightness(0.95);
      }

      .folder .folder-header {
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
          #32562a var(--timeline-folder-content-stripe-height),
          #264c14 var(--timeline-folder-content-stripe-height),
          #264c14 var(--timeline-track-height)
        );
        color: white;
        border-radius: 0 0 var(--timeline-folder-offset) var(--timeline-folder-offset);
      }

      .folder.brand-ae .folder-header {
        background-color: #2b347d;
        color: #e8ebff;
      }

      .folder.brand-ae .folder-content-holder {
        background-color: #1f255d;
        background-image: repeating-linear-gradient(
          to bottom,
          #252d70,
          #252d70 var(--timeline-folder-content-stripe-height),
          #1b2050 var(--timeline-folder-content-stripe-height),
          #1b2050 var(--timeline-track-height)
        );
      }

      .folder.brand-photoshop .folder-header {
        background-color: #032b52;
        color: #d4efff;
      }

      .folder.brand-photoshop .folder-content-holder {
        background-color: #042645;
        background-image: repeating-linear-gradient(
          to bottom,
          #063663,
          #063663 var(--timeline-folder-content-stripe-height),
          #04233f var(--timeline-folder-content-stripe-height),
          #04233f var(--timeline-track-height)
        );
      }

      .folder.brand-maya .folder-header {
        background-color: #1c4744;
        color: #d6f8f0;
      }

      .folder.brand-maya .folder-content-holder {
        background-color: #1a3d3a;
        background-image: repeating-linear-gradient(
          to bottom,
          #24514d,
          #24514d var(--timeline-folder-content-stripe-height),
          #173531 var(--timeline-folder-content-stripe-height),
          #173531 var(--timeline-track-height)
        );
      }

      .folder.brand-clipstudio .folder-header {
        background-color: #bfc0c4;
        color: #2f2f31;
      }

      .folder.brand-clipstudio .folder-content-holder {
        background-color: #a8aab2;
        background-image: repeating-linear-gradient(
          to bottom,
          #b5b7be,
          #b5b7be var(--timeline-folder-content-stripe-height),
          #9da0a9 var(--timeline-folder-content-stripe-height),
          #9da0a9 var(--timeline-track-height)
        );
        color: #232326;
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

      .folder.selected .folder-header,
      .folder.ui-focused .folder-header {
        box-shadow: 0 0 0 2px #8dd7ff inset;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroFolderMicro, heroChevronUpDownMicro })],
})
export class AnienFolderComponent {
  public readonly item = input.required<FolderVM>();
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
