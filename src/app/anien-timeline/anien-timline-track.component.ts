import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { Strip, Folder } from './anien-timeline.types';
import { StripComponent } from './anien-timeline-strip.component';
import { FolderComponent } from './anien-timeline-folder.component';

@Component({
  selector: 'app-track',
  template: `
    <div class="track">
      <span class="track-label">Track {{ trackIndex() }}</span>
      <div class="track-items">
        @for (item of trackItems(); track item.id) {
          @switch (item.type) {
            @case ('strip') {
              <app-strip [strip]="item" [trackIndex]="trackIndex()" />
            }
            @case ('folder') {
              <app-folder [folder]="item" [trackIndex]="trackIndex()" />
            }
          }
        } @empty {
          <span class="empty-track">Track is empty</span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .track {
        display: flex;
        align-items: center;
        min-height: 50px;
        border-bottom: 1px dashed #444;
        padding: 4px;
      }
      .track-label {
        font-size: 0.8em;
        margin-right: 10px;
        width: 60px;
        color: #999;
      }
      .track-items {
        display: flex;
        flex-wrap: nowrap;
        gap: 5px;
      }
      .empty-track {
        font-style: italic;
        color: #666;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [StripComponent, FolderComponent],
})
export class TrackComponent {
  /** The list of items (Strips or Folders) in this track. */
  public readonly trackItems = input.required<(Strip | Folder)[]>();

  /** The index of this track (used for service calls). */
  public readonly trackIndex = input.required<number>();
}
