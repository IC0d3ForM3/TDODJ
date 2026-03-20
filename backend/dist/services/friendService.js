"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrActivateFriend = exports.fetchUserByEmail = exports.fetchActiveFriendsByUserKey = void 0;
const friendRepository_1 = require("../repositories/friendRepository");
const fetchActiveFriendsByUserKey = async (userkey) => {
    return await (0, friendRepository_1.getActiveFriendsByUserKey)(userkey);
};
exports.fetchActiveFriendsByUserKey = fetchActiveFriendsByUserKey;
const fetchUserByEmail = async (email) => {
    return await (0, friendRepository_1.getUserByEmail)(email);
};
exports.fetchUserByEmail = fetchUserByEmail;
const createOrActivateFriend = async (userkey, friendkey) => {
    return await (0, friendRepository_1.upsertActiveFriend)(userkey, friendkey);
};
exports.createOrActivateFriend = createOrActivateFriend;
