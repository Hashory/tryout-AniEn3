import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { Folder } from './anien-timeline.types';
import { YjsTimelineService } from './anien-timeline-store.service';
import { TrackComponent } from './anien-timline-track.component'; // Recursive import

@Component({
  selector: 'app-folder',
  template: `
    <div class="folder-item" [style.width.px]="folder().length">
      <div class="folder-header">
        <span class="folder-name">[Folder] {{ folder().name }}</span>
        <button class="delete-btn" (click)="deleteItem()">x</button>
      </div>

      <div class="folder-content">
        @for (track of folder().strips; track track; let i = $index) {
          <app-track [trackItems]="track" [trackIndex]="i" />
        }
      </div>
    </div>
  `,
  styles: [
    `
      .folder-item {
        height: auto;
        background: #3a8c3a;
        border: 1px solid #4caf50;
        border-radius: 4px;
        padding: 4px;
        box-sizing: border-box;
        font-size: 0.9em;
        color: white;
      }
      .folder-header {
        display: flex;
        justify-content: space-between;
        font-weight: bold;
        padding: 4px;
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
      .folder-content {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
        margin-top: 5px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TrackComponent], // Imports TrackComponent to render nested tracks
})
export class FolderComponent {
  /** The data for this folder. */
  public readonly folder = input.required<Folder>();

  /** The index of the track this folder belongs to. */
  public readonly trackIndex = input.required<number>();

  private readonly timelineService = inject(YjsTimelineService);

  public deleteItem(): void {
    // This call only works if the folder is in the root (trackIndex relates to root)
    this.timelineService.deleteItemFromTrack(this.trackIndex(), this.folder().id);
  }

  // Note: Editing items *inside* this folder would require
  // more complex service methods that accept a folderId or item path.
}
