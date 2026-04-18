import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { vi } from 'vitest';
import { YjsDocumentService } from '#app/core/collaboration/yjs-document.service';
import { YjsTimelineService } from '#app/features/main/main-layout/timeline/services/timeline-store.service';

class FakeYjsDocumentService {
  private readonly doc = new Y.Doc();

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public onSynced(callback: () => void): void {
    callback();
  }
}

describe('YjsTimelineService', () => {
  let service: YjsTimelineService;
  let fakeCollab: FakeYjsDocumentService;
  let rafQueue: FrameRequestCallback[];

  const flushRafQueue = (): void => {
    while (rafQueue.length > 0) {
      const callbacks = [...rafQueue];
      rafQueue = [];
      for (const callback of callbacks) {
        callback(performance.now());
      }
    }
  };

  beforeEach(() => {
    rafQueue = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      },
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [{ provide: YjsDocumentService, useClass: FakeYjsDocumentService }],
    });

    service = TestBed.inject(YjsTimelineService);
    fakeCollab = TestBed.inject(YjsDocumentService) as unknown as FakeYjsDocumentService;
    flushRafQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('coalesces repeated Yjs observer updates into a single publish frame', () => {
    let subscriberNotifications = 0;
    service.subscribeTimeline(() => {
      subscriberNotifications += 1;
    });
    flushRafQueue();

    subscriberNotifications = 0;
    const yRoot = fakeCollab.getDoc().getMap('timelineRoot');

    yRoot.set('timeScale', 10);
    yRoot.set('timeScale', 11);

    expect(rafQueue.length).toBeGreaterThan(0);
    expect(subscriberNotifications).toBe(0);
    flushRafQueue();

    expect(subscriberNotifications).toBe(1);
  });

  it('publishes mutateSnapshot local changes immediately without RAF queueing', () => {
    let subscriberNotifications = 0;
    service.subscribeTimeline(() => {
      subscriberNotifications += 1;
    });

    flushRafQueue();
    subscriberNotifications = 0;

    const rootFolderSourceId = service.getSnapshot()?.root.rootFolderSourceId;
    expect(rootFolderSourceId).toBeTruthy();

    service.addStripToTrack(
      0,
      {
        sourceName: 'Immediate local update',
        startTick: 0,
        durationTicks: 10,
      },
      { parentFolderId: rootFolderSourceId ?? undefined },
    );

    expect(subscriberNotifications).toBe(1);
    expect(rafQueue.length).toBe(0);
  });
});
