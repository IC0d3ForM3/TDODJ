import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { API_BASE_URL } from '../../api-config';
import { Account } from '../../services/account';

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

interface AdminDungon {
  id: number;
  name: string;
  issample: boolean;
}

interface AdminPc {
  id: number;
  name: string;
  species: string;
  type: string;
  issample: boolean;
}

interface ContactRequest {
  id: number;
  name: string;
  email: string;
  problem: string;
  username: string | null;
  message: string;
  createdat: string;
  isread: boolean;
  isresponded: boolean;
}

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly account = inject(Account);

  readonly users = signal<AdminUser[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal<string | null>(null);

  // Dungon sample management
  readonly dungons = signal<AdminDungon[]>([]);
  readonly isDungonsLoading = signal(false);
  readonly dungonError = signal<string | null>(null);
  readonly dungonSaving = signal<number | null>(null);
  readonly dungonSaveSuccess = signal<string | null>(null);

  // PC sample management
  readonly allPcs = signal<AdminPc[]>([]);
  readonly isPcsLoading = signal(false);
  readonly pcError = signal<string | null>(null);
  readonly pcSaving = signal<number | null>(null);
  readonly pcSaveSuccess = signal<string | null>(null);

  // Contact requests
  readonly contactRequests = signal<ContactRequest[]>([]);
  readonly isContactsLoading = signal(false);
  readonly contactError = signal<string | null>(null);
  readonly contactSortDir = signal<'desc' | 'asc'>('desc');
  readonly contactSortedRequests = computed(() => {
    const dir = this.contactSortDir();
    return [...this.contactRequests()].sort((a, b) => {
      const diff = new Date(a.createdat).getTime() - new Date(b.createdat).getTime();
      return dir === 'desc' ? -diff : diff;
    });
  });

  private readonly originalFlagsById = signal<Record<number, EditableFlags>>({});
  private readonly pendingEditsById = signal<Record<number, EditableFlags>>({});

  readonly hasPendingChanges = computed(
    () => Object.keys(this.pendingEditsById()).length > 0
  );

  ngOnInit(): void {
    this.loadUsers();
    this.loadDungons();
    this.loadAllPcs();
    this.loadContactRequests();
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

  private loadDungons(): void {
    const key = this.account.getKey();
    if (!key) return;
    this.isDungonsLoading.set(true);
    this.dungonError.set(null);
    this.http.get<AdminDungon[]>(`${API_BASE_URL}/dungons/admin-published?userkey=${key}`).subscribe({
      next: (dungons) => {
        this.dungons.set(dungons);
        this.isDungonsLoading.set(false);
      },
      error: () => {
        this.dungonError.set('Failed to load dungons.');
        this.isDungonsLoading.set(false);
      },
    });
  }

  setSampleDungon(id: number): void {
    const key = this.account.getKey();
    if (!key || this.dungonSaving() !== null) return;
    this.dungonSaving.set(id);
    this.dungonSaveSuccess.set(null);
    this.dungonError.set(null);
    this.http.put<{ result: number }>(`${API_BASE_URL}/dungons/${id}/set-sample`, { userkey: key }).subscribe({
      next: () => {
        this.dungons.update((list) =>
          list.map((d) => ({ ...d, issample: d.id === id }))
        );
        this.dungonSaving.set(null);
        this.dungonSaveSuccess.set('Sample dungon updated.');
      },
      error: () => {
        this.dungonError.set('Failed to set sample dungon.');
        this.dungonSaving.set(null);
      },
    });
  }

  private loadAllPcs(): void {
    const key = this.account.getKey();
    if (!key) return;
    this.isPcsLoading.set(true);
    this.pcError.set(null);
    this.http.get<AdminPc[]>(`${API_BASE_URL}/pcs/admin-all?userkey=${key}`).subscribe({
      next: (pcs) => {
        this.allPcs.set(pcs);
        this.isPcsLoading.set(false);
      },
      error: () => {
        this.pcError.set('Failed to load pcs.');
        this.isPcsLoading.set(false);
      },
    });
  }

  toggleSamplePc(pc: AdminPc): void {
    const key = this.account.getKey();
    if (!key || this.pcSaving() !== null) return;
    const newValue = !pc.issample;
    this.pcSaving.set(pc.id);
    this.pcSaveSuccess.set(null);
    this.pcError.set(null);
    this.http.put<{ result: number }>(`${API_BASE_URL}/pcs/${pc.id}/set-sample`, { userkey: key, issample: newValue }).subscribe({
      next: () => {
        this.allPcs.update((list) =>
          list.map((p) => p.id === pc.id ? { ...p, issample: newValue } : p)
        );
        this.pcSaving.set(null);
        this.pcSaveSuccess.set(`${pc.name} ${newValue ? 'added to' : 'removed from'} sample list.`);
      },
      error: () => {
        this.pcError.set('Failed to update sample pc.');
        this.pcSaving.set(null);
      },
    });
  }

  private loadContactRequests(): void {
    this.isContactsLoading.set(true);
    this.contactError.set(null);
    this.http.get<ContactRequest[]>(`${API_BASE_URL}/contact`).subscribe({
      next: (contacts) => {
        this.contactRequests.set(contacts);
        this.isContactsLoading.set(false);
      },
      error: () => {
        this.contactError.set('Failed to load contact requests.');
        this.isContactsLoading.set(false);
      },
    });
  }

  toggleContactSortDir(): void {
    this.contactSortDir.update((d) => (d === 'desc' ? 'asc' : 'desc'));
  }

  updateContactFlags(request: ContactRequest, isread: boolean, isresponded: boolean): void {
    this.http
      .put<ContactRequest>(`${API_BASE_URL}/contact/${request.id}`, { isread, isresponded })
      .subscribe({
        next: (updated) => {
          this.contactRequests.update((list) =>
            list.map((c) => (c.id === updated.id ? updated : c))
          );
        },
        error: () => {
          this.contactError.set('Failed to update contact request.');
        },
      });
  }
}
