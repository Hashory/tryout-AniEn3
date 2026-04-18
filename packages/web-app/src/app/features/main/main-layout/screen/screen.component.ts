import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  StripVM,
  TimelineStateService,
} from '#app/features/main/main-layout/timeline/services/timeline-state.service';

type ScreenMediaType = 'image' | 'video';

interface ScreenMediaViewModel {
  type: ScreenMediaType;
  sourceName: string;
  mimeType: string;
  url: string;
}

@Component({
  selector: 'app-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="screen-root" aria-label="Preview screen">
      @if (activeMedia(); as media) {
        @if (media.type === 'image') {
          <img
            class="screen-image"
            [src]="media.url"
            [alt]="media.sourceName"
            decoding="async"
            loading="lazy"
          />
        } @else {
          <video
            class="screen-video"
            [src]="media.url"
            [attr.aria-label]="media.sourceName"
            controls
          >
            Your browser does not support video playback.
          </video>
        }
      } @else {
        <div class="screen-empty" role="status" aria-live="polite">
          <p class="screen-empty-title">No media on current tick</p>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .screen-root {
        height: 100%;
        width: 100%;
        background-color: #000000;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 0 8px 8px 8px;
      }

      .screen-image,
      .screen-video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background-color: #020406;
      }

      .screen-empty {
        display: flex;
        flex-direction: column;
        gap: 8px;
        text-align: center;
        color: #d5d9dc;
        padding: 16px;
      }

      .screen-empty-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
    `,
  ],
})
export class ScreenComponent {
  private readonly stateService = inject(TimelineStateService);

  private readonly activeStrip = computed<StripVM | null>(() => {
    const currentTick = this.stateService.currentTick();
    return (
      this.stateService
        .timelineItems()
        .filter((item): item is StripVM => item.type === 'strip')
        .find(
          (item) =>
            item.absoluteStartTick <= currentTick &&
            currentTick < item.absoluteStartTick + item.durationTicks,
        ) ?? null
    );
  });

  public readonly activeMedia = computed<ScreenMediaViewModel | null>(() => {
    const strip = this.activeStrip();
    if (!strip) {
      return null;
    }

    const sourceMetadata =
      this.stateService.debugSnapshot()?.stripSources[strip.sourceId]?.metadata;
    if (!sourceMetadata || typeof sourceMetadata !== 'object') {
      return null;
    }

    const metadata = sourceMetadata as Record<string, unknown>;
    const url = this.resolveMediaUrl(metadata);
    const mimeType = typeof metadata['mimeType'] === 'string' ? metadata['mimeType'] : '';
    if (!url || !mimeType) {
      return null;
    }

    if (mimeType.startsWith('image/')) {
      return {
        type: 'image',
        sourceName: strip.sourceName,
        mimeType,
        url,
      };
    }

    if (mimeType.startsWith('video/')) {
      return {
        type: 'video',
        sourceName: strip.sourceName,
        mimeType,
        url,
      };
    }

    return null;
  });

  private resolveMediaUrl(metadata: Record<string, unknown>): string | null {
    if (typeof metadata['uploadedFileUrl'] === 'string' && metadata['uploadedFileUrl'].length > 0) {
      const normalizedUrl = this.normalizeUploadedFileUrl(metadata['uploadedFileUrl']);
      return normalizedUrl ?? metadata['uploadedFileUrl'];
    }

    if (
      typeof metadata['uploadedFilePath'] === 'string' &&
      metadata['uploadedFilePath'].length > 0
    ) {
      return `${window.location.origin}/ws${metadata['uploadedFilePath']}`;
    }

    return null;
  }

  private normalizeUploadedFileUrl(uploadedFileUrl: string): string | null {
    if (uploadedFileUrl.startsWith('/ws/')) {
      return `${window.location.origin}${uploadedFileUrl}`;
    }

    if (uploadedFileUrl.startsWith('/uploads/')) {
      return `${window.location.origin}/ws${uploadedFileUrl}`;
    }

    try {
      const parsedUrl = new URL(uploadedFileUrl, window.location.origin);
      const pathWithQuery = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;

      if (parsedUrl.pathname.startsWith('/ws/')) {
        return `${window.location.origin}${pathWithQuery}`;
      }

      if (parsedUrl.pathname.startsWith('/uploads/')) {
        return `${window.location.origin}/ws${pathWithQuery}`;
      }

      if (parsedUrl.port === '14202') {
        return `${window.location.origin}/ws${pathWithQuery}`;
      }
    } catch {
      return null;
    }

    return null;
  }
}
