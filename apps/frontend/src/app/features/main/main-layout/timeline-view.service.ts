import { Injectable, inject, signal } from '@angular/core';
import {
  LayoutPersistenceService,
  TimelineLayoutState,
} from '#app/features/main/main-layout/layout-persistence.service';

type TimelineKind = 'script' | 'video' | 'audio' | 'keyframe';

@Injectable({
  providedIn: 'root',
})
export class TimelineViewService {
  private readonly layoutPersistence = inject(LayoutPersistenceService);

  private readonly _scriptTimelineVisible = signal<boolean>(true);
  private readonly _videoTimelineVisible = signal<boolean>(true);
  private readonly _audioTimelineVisible = signal<boolean>(true);
  private readonly _keyframeTimelineVisible = signal<boolean>(true);

  readonly scriptTimelineVisible = this._scriptTimelineVisible.asReadonly();
  readonly videoTimelineVisible = this._videoTimelineVisible.asReadonly();
  readonly audioTimelineVisible = this._audioTimelineVisible.asReadonly();
  readonly keyframeTimelineVisible = this._keyframeTimelineVisible.asReadonly();

  constructor() {
    this.restoreVisibilityFromStorage();
  }

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

    const visibility: NonNullable<TimelineLayoutState['visibility']> = {
      script: this._scriptTimelineVisible(),
      video: this._videoTimelineVisible(),
      audio: this._audioTimelineVisible(),
      keyframe: this._keyframeTimelineVisible(),
    };

    this.layoutPersistence.saveState({ visibility });
  }

  private setVisibility(kind: TimelineKind, visible: boolean): void {
    switch (kind) {
      case 'script':
        this._scriptTimelineVisible.set(visible);
        break;
      case 'video':
        this._videoTimelineVisible.set(visible);
        break;
      case 'audio':
        this._audioTimelineVisible.set(visible);
        break;
      case 'keyframe':
        this._keyframeTimelineVisible.set(visible);
        break;
    }
  }

  private restoreVisibilityFromStorage(): void {
    const state = this.layoutPersistence.loadState();
    const visibility = state?.visibility;

    if (!visibility) {
      return;
    }

    if (typeof visibility.script === 'boolean') {
      this.setVisibility('script', visibility.script);
    }
    if (typeof visibility.video === 'boolean') {
      this.setVisibility('video', visibility.video);
    }
    if (typeof visibility.audio === 'boolean') {
      this.setVisibility('audio', visibility.audio);
    }
    if (typeof visibility.keyframe === 'boolean') {
      this.setVisibility('keyframe', visibility.keyframe);
    }
  }
}
