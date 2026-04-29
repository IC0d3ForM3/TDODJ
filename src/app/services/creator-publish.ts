import { Injectable, signal } from '@angular/core';

export type PublishVisibility = 'public' | 'friends' | 'private';

export interface CreatorFriendListItem {
  id: number;
  userurid: string;
  friendurid: string;
  isActiveFriend: boolean;
  friendEmail: string;
}

@Injectable({ providedIn: 'root' })
export class CreatorPublishService {

  readonly isPublishingDungon = signal(false);
  readonly isPublishDialogVisible = signal(false);
  readonly savedPublishUpdatesByDungon = signal<Record<number, boolean>>({});
  readonly publishVisibility = signal<PublishVisibility>('public');
  readonly publishFriendUserKeys = signal<string[]>([]);
  readonly isLoadingPublishFriends = signal(false);
  readonly publishFriendsError = signal<string | null>(null);
  readonly publishFriends = signal<CreatorFriendListItem[]>([]);
  readonly publishDungonError = signal<string | null>(null);
}
