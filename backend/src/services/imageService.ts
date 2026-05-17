import {
  CreateImagePayload,
  ImageRecord,
  UpdateImagePayload,
  checkImageInUse,
  deleteImageForUser,
  getImageLibraryByUserGuid,
  getImagesByUserGuid,
  getAllImagesWithUsername,
  getImagesByIds,
  getPublicImagesByIds,
  insertImageForUser,
  isImageAccessibleByIdForUser,
  isAdminUserByGuid,
  updateImageForUser,
} from '../repositories/imageRepository';

export const fetchImagesByUserGuid = async (userguid: string): Promise<ImageRecord[]> => {
  return await getImagesByUserGuid(userguid);
};

export const fetchImageLibraryByUserGuid = async (userguid: string): Promise<ImageRecord[]> => {
  return await getImageLibraryByUserGuid(userguid);
};

export const fetchAllImagesWithUsername = async (): Promise<ImageRecord[]> => {
  return await getAllImagesWithUsername();
};

export const checkUserIsAdminByGuid = async (userguid: string): Promise<boolean> => {
  return await isAdminUserByGuid(userguid);
};

export const checkImageAccessibleByIdForUser = async (
  imageId: number,
  userguid: string
): Promise<boolean> => {
  return await isImageAccessibleByIdForUser(imageId, userguid);
};

export const createImageForUser = async (
  userguid: string,
  payload: CreateImagePayload
): Promise<ImageRecord> => {
  return await insertImageForUser(userguid, payload);
};

export const saveImageForUser = async (
  id: number,
  userguid: string,
  payload: UpdateImagePayload
): Promise<ImageRecord | null> => {
  return await updateImageForUser(id, userguid, payload);
};

export const fetchPublicImagesByIds = async (ids: number[]): Promise<ImageRecord[]> => {
  return await getPublicImagesByIds(ids);
};

export const fetchImagesByIds = async (ids: number[]): Promise<ImageRecord[]> => {
  return await getImagesByIds(ids);
};

export const isImageInUse = async (id: number): Promise<boolean> => {
  return await checkImageInUse(id);
};

export const removeImageForUser = async (id: number, userguid: string): Promise<boolean> => {
  return await deleteImageForUser(id, userguid);
};
