import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { YjsTimelineService } from './anien-timeline-store.service';
import { TrackComponent } from './anien-timline-track.component';

@Component({
  selector: 'app-anien-timeline',
  template: `
    <h2>{{ timelineName() }}</h2>
    <button (click)="addTrack()">Add Root Track</button>
    <button (click)="addTestStrip()">Add Test Strip (Track 0)</button>

    <div class="timeline-container">
      @for (track of tracks(); track track; let i = $index) {
        <app-track [trackItems]="track" [trackIndex]="i" />
      } @empty {
        <p>No tracks yet. Add one!</p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        font-family: sans-serif;
      }
      .timeline-container {
        margin-top: 1rem;
        border: 1px solid #555;
        padding: 0.5rem;
        background: #2a2a2a;
        color: white;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TrackComponent],
})
export class AnienTimelineComponent {
  private readonly timelineService = inject(YjsTimelineService);

  public readonly tracks = this.timelineService.rootTracks;
  public readonly timelineName = this.timelineService.timelineName;

  public addTrack(): void {
    this.timelineService.addTrack();
  }

  // Helper for testing
  public addTestStrip(): void {
    if (this.tracks().length === 0) {
      this.timelineService.addTrack();
    }
    this.timelineService.addStripToTrack(0, {
      source: `Image[${Math.floor(Math.random() * 100)}].tga`,
      startFrame: 0,
      length: 120,
    });
  }
}
