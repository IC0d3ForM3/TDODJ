import {
  ItemRecord,
  UpsertItemPayload,
  isAdminUserByGuid,
  getItemsByUserGuid,
  getItemsByIds,
  insertItemForUser,
  updateItemForUser,
} from '../repositories/itemRepository';

export const fetchItemsByUserGuid = (userguid: string): Promise<ItemRecord[]> =>
  getItemsByUserGuid(userguid);

export const fetchItemsByIds = (ids: number[]): Promise<ItemRecord[]> =>
  getItemsByIds(ids);

export const checkUserIsAdminByGuid = (userguid: string): Promise<boolean> =>
  isAdminUserByGuid(userguid);

export const createItemForUser = (
  userguid: string,
  payload: UpsertItemPayload
): Promise<ItemRecord> => insertItemForUser(userguid, payload);

export const saveItemForUser = (
  id: number,
  userguid: string,
  payload: UpsertItemPayload
): Promise<ItemRecord | null> => updateItemForUser(id, userguid, payload);
