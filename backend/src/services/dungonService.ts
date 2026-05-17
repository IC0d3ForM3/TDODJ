import {
  ActiveGameListItemRecord,
  GameRecord,
  getGameByIdForUser,
  getGamesForUser,
  getDungonByIdForUser,
  getPublishedDungons,
  getDungonsByUserKey,
  getDungonSpRewardById,
  getDungonImageIdById,
  getDungonIsMainGameStatusById,
  insertDungon,
  NewDungon,
  PublishDungonOptions,
  publishDungonForUser,
  startGameFromPublishedDungon,
  updateDungonJsonForUser,
  updateDungonMetadataForUser,
  updateGameDungenJson,
  deleteGameForUser,
  deleteDungonForUser,
  approveDungon as approveDungonInRepo,
  getSampleDungonFromDb,
  getSampleDungonFullFromDb,
  setSampleDungonInDb,
  getAllPublishedDungonsForAdmin,
} from '../repositories/dungonRepository';

export const fetchMainGameDungons = async () => {
  const { rows } = await (await import('../db')).default.query(
    'SELECT id, name, description, intro FROM dungons WHERE ismaingame = TRUE AND status = $1 ORDER BY id ASC',
    ['published']
  );
  return rows;
};

export const fetchDungonIsMainGameStatus = async (
  id: number
): Promise<{ ismaingame: boolean; resettable_per_pc: boolean } | null> => {
  return await getDungonIsMainGameStatusById(id);
};

export const fetchPublishedDungons = async (userkey: string | null = null) => {
  return await getPublishedDungons(userkey);
};

export const fetchDungonsByUserKey = async (userkey: string) => {
  return await getDungonsByUserKey(userkey);
};

export const fetchDungonByIdForUser = async (id: number, userkey: string) => {
  return await getDungonByIdForUser(id, userkey);
};

export const createDungon = async (payload: NewDungon) => {
  return await insertDungon(payload);
};

export const saveDungonJsonForUser = async (
  id: number,
  userkey: string,
  dungonJson: unknown
) => {
  return await updateDungonJsonForUser(id, userkey, dungonJson);
};

export const updateDungonMetadata = async (
  id: number,
  userkey: string,
  metadata: Parameters<typeof updateDungonMetadataForUser>[2]
) => {
  return await updateDungonMetadataForUser(id, userkey, metadata);
};

export const publishDungonForUserKey = async (
  id: number,
  userkey: string,
  options: PublishDungonOptions
) => {
  return await publishDungonForUser(id, userkey, options);
};

export const startGameForUserFromPublishedDungon = async (
  id: number,
  userkey: string,
  pcId: number
): Promise<GameRecord | null> => {
  return await startGameFromPublishedDungon(id, userkey, pcId);
};

export const fetchGamesForUser = async (
  userkey: string
): Promise<ActiveGameListItemRecord[]> => {
  return await getGamesForUser(userkey);
};

export const fetchGameByIdForUser = async (
  id: number,
  userkey: string
): Promise<GameRecord | null> => {
  return await getGameByIdForUser(id, userkey);
};

export const saveGameDungenJson = async (
  id: number,
  userkey: string,
  dungenJson: unknown
): Promise<GameRecord | null> => {
  return await updateGameDungenJson(id, userkey, dungenJson);
};

export const removeGameForUser = async (
  id: number,
  userkey: string
): Promise<boolean> => {
  return await deleteGameForUser(id, userkey);
};

export const removeDungonForUser = async (
  id: number,
  userkey: string
): Promise<boolean> => {
  return await deleteDungonForUser(id, userkey);
};

export const approvePendingDungon = async (
  id: number,
  adminKey: string
): Promise<boolean> => {
  return await approveDungonInRepo(id, adminKey);
};

export const fetchSampleDungon = async () => {
  return await getSampleDungonFromDb();
};

export const fetchSampleDungonFull = async () => {
  return await getSampleDungonFullFromDb();
};

export const setSampleGame = async (id: number) => {
  return await setSampleDungonInDb(id);
};

export const fetchAllPublishedDungonsForAdmin = async () => {
  return await getAllPublishedDungonsForAdmin();
};

export const fetchDungonSpReward = (dungonId: number): Promise<number> =>
  getDungonSpRewardById(dungonId);

export const fetchDungonImageId = (dungonId: number): Promise<number | null> =>
  getDungonImageIdById(dungonId);
