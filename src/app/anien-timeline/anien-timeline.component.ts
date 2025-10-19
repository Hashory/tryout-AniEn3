import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TimelineStateService } from './anien-timeline-state.service';
import { TrackComponent } from './anien-timeline-track.component';

@Component({
  selector: 'app-anien-timeline',
  template: `
    <div class="timeline-header">
      <button (click)="addTrack()">+</button>
      <div class="timeline-ruller" style="color:white;">Ruller Here</div>
    </div>
    <div class="timeline-sidebar"></div>

    <div class="timeline-main">
      <!-- @for (track of tracks(); track track; let i = $index) {
        <app-track [trackItems]="track" [trackIndex]="i">
          @for(item of track.strips; item item; let j = $index) {
            @if (item.type === 'strip') {
              <app-strip [strip]="item" />
            } @else if (item.type === 'folder') {
              <app-folder-header [folder]="item" />
            }
          }
        </app-track>
      } @empty {
        <p>No tracks yet.</p>
      } -->
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        background: #101417;
        width: 100%;
        height: 100%;
        border-radius: 8px 8px 0px 0px;
        display: grid;
        grid-template-rows: 25px auto;
        grid-template-columns: 33px auto;
        column-gap: 3px;
      }

      .timeline-header {
        grid-column: 1 / span 2;
        grid-row: 1 / 2;

        display: grid;
        grid-template-columns: 33px auto;
      }

      .timeline-sidebar {
        grid-column: 1 / 2;
        grid-row: 2 / span 1;
      }

      .timeline-main {
        grid-column: 2 / span 1;
        grid-row: 2 / span 1;
        scrollbar-width: none;

        background-color: #0b0f12;
        background-image: repeating-linear-gradient(
          to bottom,
          #262a2e,
          #262a2e 30px,
          #0b0f12 30px,
          #0b0f12 34px
        );
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TrackComponent],
})
export class AnienTimelineComponent {
  private readonly stateService = inject(TimelineStateService);

  public readonly tracks = this.stateService.rootTracksVM;
  public readonly timelineName = this.stateService.timelineName;

  public addTrack(): void {
    this.stateService.addTrack();
  }

  // Helper for testing
  public addTestStrip(): void {
    if (this.tracks().length === 0) {
      this.stateService.addTrack();
    }
    this.stateService.addTrack();
  }
}
