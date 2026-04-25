import {
  TavernStashItem,
  getStash as getStashFromDb,
  depositToStash as depositToStashInDb,
  withdrawFromStash as withdrawFromStashInDb,
} from '../repositories/tavernStashRepository';

export { TavernStashItem };

export const getStash = async (userguid: string): Promise<TavernStashItem[]> => {
  return await getStashFromDb(userguid);
};

export const depositToStash = async (
  userguid: string,
  items: TavernStashItem[]
): Promise<TavernStashItem[]> => {
  return await depositToStashInDb(userguid, items);
};

export const withdrawFromStash = async (
  userguid: string,
  itemIndexes: number[]
): Promise<{ remaining: TavernStashItem[]; withdrawn: TavernStashItem[] }> => {
  return await withdrawFromStashInDb(userguid, itemIndexes);
};
