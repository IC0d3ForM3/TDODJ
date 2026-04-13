import { Request, Response } from 'express';
import * as friendService from '../services/friendService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export const createFriendInvite = async (req: Request, res: Response) => {
  const body = req.body as { userkey?: unknown; email?: unknown };
  const userkey = body.userkey;
  const email = body.email;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ result: -1, error: 'Friend email is required' });
  }

  const normalizedUserKey = userkey.trim();
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const inviteeUser = await friendService.fetchUserByEmail(normalizedEmail);
    if (!inviteeUser) {
      return res.status(404).json({ result: -1, error: 'No user found with that email.' });
    }

    if (inviteeUser.key === normalizedUserKey) {
      return res.status(400).json({ result: -1, error: 'You cannot invite yourself.' });
    }

    const invite = await friendService.createInvite(normalizedUserKey, inviteeUser.key);

    return res.status(201).json({
      result: 1,
      code: invite.code,
      inviteeEmail: inviteeUser.email,
    });
  } catch (error) {
    console.error('Error creating friend invite:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create invite' });
  }
};

export const acceptFriendInvite = async (req: Request, res: Response) => {
  const body = req.body as { userkey?: unknown; code?: unknown };
  const userkey = body.userkey;
  const code = body.code;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ result: -1, error: 'Invite code is required' });
  }

  const normalizedUserKey = userkey.trim();
  const normalizedCode = code.trim().toUpperCase();

  try {
    const invite = await friendService.fetchInviteByCode(normalizedCode);
    if (!invite) {
      return res.status(404).json({ result: -1, error: 'Invite code not found or already used.' });
    }

    if (invite.inviterkey === normalizedUserKey) {
      return res.status(400).json({ result: -1, error: 'You cannot accept your own invite.' });
    }

    if (invite.inviteekey !== normalizedUserKey) {
      return res
        .status(403)
        .json({ result: -1, error: 'This invite code was not generated for your account.' });
    }

    // Create friendship both directions
    await friendService.createOrActivateFriend(invite.inviterkey, invite.inviteekey);
    await friendService.createOrActivateFriend(invite.inviteekey, invite.inviterkey);

    // Mark invite as used
    await friendService.useInvite(invite.id);

    return res.json({ result: 1 });
  } catch (error) {
    console.error('Error accepting friend invite:', error);
    return res.status(500).json({ result: -1, error: 'Failed to accept invite' });
  }
};
