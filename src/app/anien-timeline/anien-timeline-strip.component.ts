import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { Strip } from './anien-timeline.types';
import { YjsTimelineService } from './anien-timeline-store.service';

@Component({
  selector: 'app-strip',
  template: `
    <div class="strip-item" [style.width.px]="strip().length">
      <div class="strip-header">
        <span class="strip-name">{{ strip().source }}</span>
        <button class="delete-btn" (click)="deleteItem()">x</button>
      </div>
      <div class="strip-body">(Start: {{ strip().startFrame }}, Len: {{ strip().length }})</div>
    </div>
  `,
  styles: [
    `
      .strip-item {
        height: 45px;
        background: #007acc;
        border: 1px solid #009fff;
        border-radius: 4px;
        padding: 4px;
        box-sizing: border-box;
        font-size: 0.8em;
        color: white;
        overflow: hidden;
        white-space: nowrap;
      }
      .strip-header {
        display: flex;
        justify-content: space-between;
        font-weight: bold;
      }
      .delete-btn {
        background: #ff4d4d;
        border: none;
        color: white;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        line-height: 14px;
        text-align: center;
        cursor: pointer;
        font-size: 10px;
        padding: 0;
      }
      .strip-body {
        font-size: 0.9em;
        opacity: 0.8;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class StripComponent {
  /** The data for this strip. */
  public readonly strip = input.required<Strip>();

  /** The index of the track this strip belongs to. */
  public readonly trackIndex = input.required<number>();

  private readonly timelineService = inject(YjsTimelineService);

  public deleteItem(): void {
    // Stop propagation to prevent any parent drag/select handlers
    // event.stopPropagation();
    this.timelineService.deleteItemFromTrack(this.trackIndex(), this.strip().id);
  }
}
