import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnienTimeline } from './anien-timeline';

describe('AnienTimeline', () => {
  let component: AnienTimeline;
  let fixture: ComponentFixture<AnienTimeline>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnienTimeline],
    }).compileComponents();

    fixture = TestBed.createComponent(AnienTimeline);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
