import { Injectable, signal } from '@angular/core';

type TimelineKind = 'script' | 'video' | 'audio' | 'keyframe';

@Injectable({
  providedIn: 'root',
})
export class TimelineViewService {
  private readonly _scriptTimelineVisible = signal<boolean>(true);
  private readonly _videoTimelineVisible = signal<boolean>(true);
  private readonly _audioTimelineVisible = signal<boolean>(true);
  private readonly _keyframeTimelineVisible = signal<boolean>(true);

  readonly scriptTimelineVisible = this._scriptTimelineVisible.asReadonly();
  readonly videoTimelineVisible = this._videoTimelineVisible.asReadonly();
  readonly audioTimelineVisible = this._audioTimelineVisible.asReadonly();
  readonly keyframeTimelineVisible = this._keyframeTimelineVisible.asReadonly();

  toggleScriptTimeline(): void {
    this.toggle('script');
  }

  toggleVideoTimeline(): void {
    this.toggle('video');
  }

  toggleAudioTimeline(): void {
    this.toggle('audio');
  }

  toggleKeyframeTimeline(): void {
    this.toggle('keyframe');
  }

  private toggle(kind: TimelineKind): void {
    switch (kind) {
      case 'script':
        this._scriptTimelineVisible.update((current) => !current);
        break;
      case 'video':
        this._videoTimelineVisible.update((current) => !current);
        break;
      case 'audio':
        this._audioTimelineVisible.update((current) => !current);
        break;
      case 'keyframe':
        this._keyframeTimelineVisible.update((current) => !current);
        break;
    }
  }
}
