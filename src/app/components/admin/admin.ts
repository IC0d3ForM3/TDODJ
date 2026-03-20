import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { API_BASE_URL } from '../../api-config';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  isactive: boolean;
  isconfirmed: boolean;
  isadmin: boolean;
  ismasteradmin: boolean;
  iscreator: boolean;
}

type EditableFlags = Pick<AdminUser, 'isactive' | 'isadmin' | 'iscreator'>;
type EditableField = keyof EditableFlags;

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private readonly http = inject(HttpClient);

  readonly users = signal<AdminUser[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);

  private readonly originalFlagsById = signal<Record<number, EditableFlags>>({});
  private readonly pendingEditsById = signal<Record<number, EditableFlags>>({});

  readonly hasPendingChanges = computed(
    () => Object.keys(this.pendingEditsById()).length > 0
  );

  ngOnInit(): void {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.isLoading.set(true);
    this.http.get<AdminUser[]>(`${API_BASE_URL}/users`).subscribe({
      next: (users) => {
        this.users.set(users);
        this.originalFlagsById.set(this.buildFlagsMap(users));
        this.pendingEditsById.set({});
        this.error.set(null);
        this.saveError.set(null);
        this.saveSuccess.set(null);
        this.isLoading.set(false);
      },
      error: () => {
        this.users.set([]);
        this.originalFlagsById.set({});
        this.pendingEditsById.set({});
        this.error.set('Failed to load users.');
        this.isLoading.set(false);
      },
    });
  }

  onCheckboxChange(userId: number, field: EditableField, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }

    const checked = target.checked;
    this.users.update((users) =>
      users.map((user) => {
        if (user.id !== userId) {
          return user;
        }

        return {
          ...user,
          isactive: field === 'isactive' ? checked : user.isactive,
          isadmin: field === 'isadmin' ? checked : user.isadmin,
          iscreator: field === 'iscreator' ? checked : user.iscreator,
        };
      })
    );

    this.updatePendingEditForUser(userId);
    this.saveError.set(null);
    this.saveSuccess.set(null);
  }

  saveChanges(): void {
    if (!this.hasPendingChanges() || this.isSaving()) {
      return;
    }

    const pendingEdits = this.pendingEditsById();
    const requests = Object.entries(pendingEdits).map(([id, flags]) =>
      this.http.put<AdminUser>(`${API_BASE_URL}/users/${id}`, flags)
    );

    if (requests.length === 0) {
      return;
    }

    this.isSaving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);

    forkJoin(requests).subscribe({
      next: (updatedUsers) => {
        const updatedById = new Map(updatedUsers.map((user) => [user.id, user]));
        this.users.update((users) =>
          users.map((user) => updatedById.get(user.id) ?? user)
        );
        this.originalFlagsById.set(this.buildFlagsMap(this.users()));
        this.pendingEditsById.set({});
        this.saveSuccess.set('Changes saved.');
        this.isSaving.set(false);
      },
      error: () => {
        this.saveError.set('Failed to save changes.');
        this.isSaving.set(false);
      },
    });
  }

  private buildFlagsMap(users: AdminUser[]): Record<number, EditableFlags> {
    return users.reduce<Record<number, EditableFlags>>((acc, user) => {
      acc[user.id] = {
        isactive: user.isactive,
        isadmin: user.isadmin,
        iscreator: user.iscreator,
      };
      return acc;
    }, {});
  }

  private updatePendingEditForUser(userId: number): void {
    const user = this.users().find((entry) => entry.id === userId);
    const original = this.originalFlagsById()[userId];
    if (!user || !original) {
      return;
    }

    const currentFlags: EditableFlags = {
      isactive: user.isactive,
      isadmin: user.isadmin,
      iscreator: user.iscreator,
    };

    const hasChanged =
      currentFlags.isactive !== original.isactive ||
      currentFlags.isadmin !== original.isadmin ||
      currentFlags.iscreator !== original.iscreator;

    this.pendingEditsById.update((pending) => {
      const nextPending = { ...pending };
      if (hasChanged) {
        nextPending[userId] = currentFlags;
      } else {
        delete nextPending[userId];
      }
      return nextPending;
    });
  }
}
