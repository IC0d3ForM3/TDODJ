import { Request, Response } from 'express';
import * as friendService from '../services/friendService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface FriendCreateRequestBody {
  userkey?: unknown;
  email?: unknown;
}

export const getFriends = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const friends = await friendService.fetchActiveFriendsByUserKey(userkey.trim());
    return res.json(friends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    return res.status(500).json({ error: 'Failed to fetch friends' });
  }
};

export const createFriend = async (req: Request, res: Response) => {
  const { userkey, email } = req.body as FriendCreateRequestBody;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ result: -1, error: 'Friend email is required' });
  }

  const normalizedUserKey = userkey.trim();
  const normalizedEmail = email.trim();

  try {
    const friendUser = await friendService.fetchUserByEmail(normalizedEmail);
    if (!friendUser) {
      return res.status(404).json({ result: -1, error: 'No user found with that email.' });
    }

    if (friendUser.key === normalizedUserKey) {
      return res
        .status(400)
        .json({ result: -1, error: 'You cannot add yourself as a friend.' });
    }

    const friend = await friendService.createOrActivateFriend(
      normalizedUserKey,
      friendUser.key
    );

    return res.status(201).json({ result: 1, friend });
  } catch (error) {
    console.error('Error creating friend:', error);
    return res.status(500).json({ result: -1, error: 'Failed to save friend' });
  }
};
