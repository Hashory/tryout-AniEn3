import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnienTimelineComponent } from './anien-timeline.component';

describe('AnienTimelineComponent', () => {
  let component: AnienTimelineComponent;
  let fixture: ComponentFixture<AnienTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnienTimelineComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnienTimelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
