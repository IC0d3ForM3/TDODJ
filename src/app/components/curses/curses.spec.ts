import { TestBed } from '@angular/core/testing';
import { Curses } from './curses';

describe('Curses', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Curses],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Curses);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });
});
