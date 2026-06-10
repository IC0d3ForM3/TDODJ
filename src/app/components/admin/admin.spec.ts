import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Admin } from './admin';

describe('Admin', () => {
  let component: Admin;
  let fixture: ComponentFixture<Admin>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Admin],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Admin);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.match(() => true).forEach((request) => request.flush([]));
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requests only the last 5 daily stats records', () => {
    component.ngOnInit();

    const dailyHitsRequest = httpMock.expectOne((request) =>
      request.method === 'GET' && request.urlWithParams.includes('/stats/daily-hits?limit=5')
    );

    dailyHitsRequest.flush([]);

    httpMock.match(() => true).forEach((request) => request.flush([]));
  });
});
