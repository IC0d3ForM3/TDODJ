import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User } from '../interfaces/user';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../api-config';

interface RawLoginResponse {
  username: string;
  key: string;
  isadmin?: boolean;
  iscreator?: boolean;
  isAdmin?: boolean;
  isCreator?: boolean;
}

export interface LoginResponse {
  username: string;
  key: string;
  isAdmin: boolean;
  isCreator: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Account {
  private _userKey = signal<string | null>(null);
  private _isAdmin = signal<boolean>(false);
  private _isCreator = signal<boolean>(false);

  constructor(private http: HttpClient) {}

  signup(user: User): Observable<{ result: number }> {
    return this.http.post<{ result: number }>(`${API_BASE_URL}/users`, user);
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<RawLoginResponse>(`${API_BASE_URL}/login`, { username, password }).pipe(
      map((res) => ({
        username: res.username,
        key: res.key,
        isAdmin: res.isadmin ?? res.isAdmin ?? false,
        isCreator: res.iscreator ?? res.isCreator ?? false,
      }))
    );
  }

  setKey(key: string | null, isAdmin: boolean = false, isCreator: boolean = false) {
    this._userKey.set(key);
    this._isAdmin.set(isAdmin);
    this._isCreator.set(isCreator);
    if (key) {
      localStorage.setItem('userKey', key);
      localStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');
      localStorage.setItem('isCreator', isCreator ? 'true' : 'false');
    } else {
      localStorage.removeItem('userKey');
      localStorage.removeItem('isAdmin');
      localStorage.removeItem('isCreator');
    }
  }

  getKey(): string | null {
    return this._userKey();
  }

  isLoggedIn(): boolean {
    return !!this._userKey();
  }

  isAdmin(): boolean {
    return this._isAdmin();
  }
  
  isCreator(): boolean {
    return this._isCreator();
  }

  restoreKey() {
    const key = localStorage.getItem('userKey');
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const isCreator = localStorage.getItem('isCreator') === 'true';
    this._userKey.set(key);
    this._isAdmin.set(isAdmin);
    this._isCreator.set(isCreator);
  }
  logout() {
    this.setKey(null);
  }
}
