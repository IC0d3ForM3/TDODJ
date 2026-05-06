import { Request, Response } from 'express';
import * as dailyHitsService from '../services/dailyHitsService';

export const recordHomeHit = async (_req: Request, res: Response) => {
  try {
    const row = await dailyHitsService.recordHomeHit();
    res.json({ result: 1, row });
  } catch (error) {
    console.error('Failed to record home hit:', error);
    res.status(500).json({ error: 'Failed to record home hit' });
  }
};

export const getDailyHits = async (req: Request, res: Response) => {
  const parsed = parseInt((req.query['limit'] as string) ?? '30', 10);
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;

  try {
    const rows = await dailyHitsService.getRecentDailyHits(limit);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch daily hits:', error);
    res.status(500).json({ error: 'Failed to fetch daily hits' });
  }
};
