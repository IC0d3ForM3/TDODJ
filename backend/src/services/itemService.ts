import {
  ItemRecord,
  UpsertItemPayload,
  isAdminUserByGuid,
  getItemsByUserGuid,
  getItemsLibraryByUserGuid,
  getItemsByIds,
  getAllItemsWithUsername,
  insertItemForUser,
  updateItemForUser,
  deleteItemForUser,
} from '../repositories/itemRepository';

export const fetchItemsByUserGuid = (userguid: string): Promise<ItemRecord[]> =>
  getItemsByUserGuid(userguid);

export const fetchItemsLibraryByUserGuid = (userguid: string): Promise<ItemRecord[]> =>
  getItemsLibraryByUserGuid(userguid);

export const fetchAllItemsWithUsername = (): Promise<ItemRecord[]> =>
  getAllItemsWithUsername();

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

export const removeItemForUser = (
  id: number,
  userguid: string
): Promise<boolean> => deleteItemForUser(id, userguid);
