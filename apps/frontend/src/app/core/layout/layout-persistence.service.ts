import { Injectable } from '@angular/core';

interface TimelineVisibilityState {
  script: boolean;
  video: boolean;
  audio: boolean;
  keyframe: boolean;
}

export interface TimelineLayoutState {
  visibility?: TimelineVisibilityState;
  mainVertical?: [number, number];
  topHorizontal?: [number, number];
}

const STORAGE_KEY = 'anien.layout.v1';

@Injectable({
  providedIn: 'root',
})
export class LayoutPersistenceService {
  private cachedState: TimelineLayoutState | null = null;

  private get hasBrowserStorage(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.localStorage;
    } catch {
      return false;
    }
  }

  loadState(): TimelineLayoutState | null {
    if (!this.hasBrowserStorage) {
      return null;
    }

    if (this.cachedState) {
      return this.cachedState;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as TimelineLayoutState;
      this.cachedState = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  saveState(partial: Partial<TimelineLayoutState>): void {
    if (!this.hasBrowserStorage) {
      return;
    }

    const current = this.loadState() ?? {};

    const merged: TimelineLayoutState = {
      ...current,
      ...partial,
      visibility: {
        script: partial.visibility?.script ?? current.visibility?.script ?? true,
        video: partial.visibility?.video ?? current.visibility?.video ?? true,
        audio: partial.visibility?.audio ?? current.visibility?.audio ?? true,
        keyframe: partial.visibility?.keyframe ?? current.visibility?.keyframe ?? true,
      },
    };

    this.cachedState = merged;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore errors when saving to localStorage
    }
  }
}
