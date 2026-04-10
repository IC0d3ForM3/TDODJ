import { TestBed } from '@angular/core/testing';
import { Potions } from './potions';

describe('Potions', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Potions],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Potions);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });
});
