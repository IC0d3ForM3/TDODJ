import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Treshers } from './treshers';

describe('Treshers', () => {
  let component: Treshers;
  let fixture: ComponentFixture<Treshers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Treshers],
    }).compileComponents();

    fixture = TestBed.createComponent(Treshers);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
