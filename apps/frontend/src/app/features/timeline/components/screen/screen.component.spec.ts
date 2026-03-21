import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as Y from 'yjs';
import { ScreenComponent } from './screen.component';
import { TimelineStateService } from '../../services/timeline-state.service';
import { YjsDocumentService } from '../../../../core/collaboration/yjs-document.service';

class FakeYjsDocumentService {
  private readonly doc = new Y.Doc();
  private readonly _isConnected = signal(true);
  private readonly _isSynced = signal(true);
  public readonly isConnected = this._isConnected.asReadonly();
  public readonly isSynced = this._isSynced.asReadonly();

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public getMap<T>(name: string): Y.Map<T> {
    return this.doc.getMap(name) as Y.Map<T>;
  }

  public onSynced(callback: () => void): void {
    callback();
  }
}

describe('ScreenComponent', () => {
  let component: ScreenComponent;
  let fixture: ComponentFixture<ScreenComponent>;
  let stateService: TimelineStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScreenComponent],
      providers: [{ provide: YjsDocumentService, useClass: FakeYjsDocumentService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ScreenComponent);
    component = fixture.componentInstance;
    stateService = TestBed.inject(TimelineStateService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows empty state when no strip is active on current tick', () => {
    stateService.setCurrentTick(-1);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.screen-empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('img')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('video')).toBeFalsy();
  });

  it('renders an image when current strip metadata points to an image source', () => {
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 0,
      },
      {
        sourceName: 'Image Frame',
        kind: 'media',
        startTick: 10,
        durationTicks: 40,
        metadata: {
          uploadedFileUrl: 'http://localhost:14202/uploads/image.png',
          mimeType: 'image/png',
        },
      },
    );
    stateService.setCurrentTick(20);
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(image).toBeTruthy();
    expect(image?.src).toContain('/uploads/image.png');
    expect(fixture.nativeElement.querySelector('video')).toBeFalsy();
  });

  it('renders a video when current strip metadata points to a video source', () => {
    const rootFolderSourceId = stateService.rootFolderSourceId();
    expect(rootFolderSourceId).toBeTruthy();

    stateService.addStrip(
      {
        parentFolderId: rootFolderSourceId ?? undefined,
        trackIndex: 0,
      },
      {
        sourceName: 'Video Frame',
        kind: 'media',
        startTick: 100,
        durationTicks: 40,
        metadata: {
          uploadedFileUrl: 'http://localhost:14202/uploads/video.mp4',
          mimeType: 'video/mp4',
        },
      },
    );
    stateService.setCurrentTick(110);
    fixture.detectChanges();

    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement | null;
    expect(video).toBeTruthy();
    expect(video?.src).toContain('/uploads/video.mp4');
    expect(fixture.nativeElement.querySelector('img')).toBeFalsy();
  });
});
