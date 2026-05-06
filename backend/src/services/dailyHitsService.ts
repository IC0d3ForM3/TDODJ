import * as dailyHitsRepo from '../repositories/dailyHitsRepository';

export const recordHomeHit = async () => {
  return dailyHitsRepo.incrementHomeHits();
};

export const recordLoginHit = async () => {
  return dailyHitsRepo.incrementLogins();
};

export const getRecentDailyHits = async (limit = 30) => {
  return dailyHitsRepo.getRecentDailyHits(limit);
};
