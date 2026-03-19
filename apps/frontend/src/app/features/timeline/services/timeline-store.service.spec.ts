import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { vi } from 'vitest';
import { YjsDocumentService } from '../../../core/collaboration/yjs-document.service';
import { YjsTimelineService } from './timeline-store.service';
import { TimelineSnapshot } from '../models/timeline.types';

interface TimelineUpdateMessage {
  type: 'timeline-update';
  data: TimelineSnapshot | null;
  senderId: string;
  updateId: string;
  sentAt: number;
}

class FakeBroadcastChannel {
  public onmessage: ((event: MessageEvent<TimelineUpdateMessage>) => void) | null = null;

  public postedMessages: TimelineUpdateMessage[] = [];

  public postMessage(message: TimelineUpdateMessage): void {
    this.postedMessages.push(message);
  }

  public emit(message: TimelineUpdateMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<TimelineUpdateMessage>);
  }

  public close(): void {
    this.onmessage = null;
  }
}

class FakeYjsDocumentService {
  private readonly doc = new Y.Doc();
  private readonly channels = new Map<string, FakeBroadcastChannel>();

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public onSynced(callback: () => void): void {
    callback();
  }

  public getBroadcastChannel(name: string): BroadcastChannel {
    let channel = this.channels.get(name);
    if (!channel) {
      channel = new FakeBroadcastChannel();
      this.channels.set(name, channel);
    }

    return channel as unknown as BroadcastChannel;
  }

  public getFakeChannel(name: string): FakeBroadcastChannel {
    const channel = this.channels.get(name);
    if (!channel) {
      throw new Error(`Missing channel: ${name}`);
    }

    return channel;
  }
}

describe('YjsTimelineService', () => {
  const timelineChannelName = 'anien-timeline-broadcast-channel';

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

  it('coalesces repeated remote broadcasts into a single publish frame', () => {
    let subscriberNotifications = 0;
    service.subscribeTimeline(() => {
      subscriberNotifications += 1;
    });
    flushRafQueue();

    subscriberNotifications = 0;
    const channel = fakeCollab.getFakeChannel(timelineChannelName);
    const snapshot = service.getSnapshot();

    channel.emit({
      type: 'timeline-update',
      data: snapshot,
      senderId: 'remote-tab',
      updateId: 'remote-1',
      sentAt: Date.now(),
    });
    channel.emit({
      type: 'timeline-update',
      data: snapshot,
      senderId: 'remote-tab',
      updateId: 'remote-2',
      sentAt: Date.now(),
    });

    expect(rafQueue.length).toBeGreaterThan(0);
    flushRafQueue();

    expect(subscriberNotifications).toBe(1);
  });

  it('ignores duplicate broadcast updates with the same updateId', () => {
    let subscriberNotifications = 0;
    service.subscribeTimeline(() => {
      subscriberNotifications += 1;
    });

    flushRafQueue();
    subscriberNotifications = 0;

    const channel = fakeCollab.getFakeChannel(timelineChannelName);
    const snapshot = service.getSnapshot();
    const updateId = 'dupe-update-id';
    const incomingMessage: TimelineUpdateMessage = {
      type: 'timeline-update',
      data: snapshot,
      senderId: 'another-tab',
      updateId,
      sentAt: Date.now(),
    };

    channel.emit(incomingMessage);
    channel.emit(incomingMessage);
    flushRafQueue();

    expect(subscriberNotifications).toBe(1);
  });
});
