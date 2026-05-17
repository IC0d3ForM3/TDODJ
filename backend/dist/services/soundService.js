"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeSoundForUser = exports.isSoundInUse = exports.saveSoundForUser = exports.createSoundForUser = exports.checkSoundAccessibleByIdForUser = exports.checkUserIsAdminByGuid = exports.fetchSoundsByIds = exports.fetchAllSoundsWithUsername = exports.fetchSoundLibraryByUserGuid = exports.fetchSoundsByUserGuid = void 0;
const soundRepository_1 = require("../repositories/soundRepository");
const fetchSoundsByUserGuid = async (userguid) => {
    return await (0, soundRepository_1.getSoundsByUserGuid)(userguid);
};
exports.fetchSoundsByUserGuid = fetchSoundsByUserGuid;
const fetchSoundLibraryByUserGuid = async (userguid) => {
    return await (0, soundRepository_1.getSoundLibraryByUserGuid)(userguid);
};
exports.fetchSoundLibraryByUserGuid = fetchSoundLibraryByUserGuid;
const fetchAllSoundsWithUsername = async () => {
    return await (0, soundRepository_1.getAllSoundsWithUsername)();
};
exports.fetchAllSoundsWithUsername = fetchAllSoundsWithUsername;
const fetchSoundsByIds = async (ids) => {
    return await (0, soundRepository_1.getSoundsByIds)(ids);
};
exports.fetchSoundsByIds = fetchSoundsByIds;
const checkUserIsAdminByGuid = async (userguid) => {
    return await (0, soundRepository_1.isAdminUserByGuid)(userguid);
};
exports.checkUserIsAdminByGuid = checkUserIsAdminByGuid;
const checkSoundAccessibleByIdForUser = async (soundId, userguid) => {
    return await (0, soundRepository_1.isSoundAccessibleByIdForUser)(soundId, userguid);
};
exports.checkSoundAccessibleByIdForUser = checkSoundAccessibleByIdForUser;
const createSoundForUser = async (userguid, payload) => {
    return await (0, soundRepository_1.insertSoundForUser)(userguid, payload);
};
exports.createSoundForUser = createSoundForUser;
const saveSoundForUser = async (id, userguid, payload) => {
    return await (0, soundRepository_1.updateSoundForUser)(id, userguid, payload);
};
exports.saveSoundForUser = saveSoundForUser;
const isSoundInUse = async (id) => {
    return await (0, soundRepository_1.checkSoundInUse)(id);
};
exports.isSoundInUse = isSoundInUse;
const removeSoundForUser = async (id, userguid) => {
    return await (0, soundRepository_1.deleteSoundForUser)(id, userguid);
};
exports.removeSoundForUser = removeSoundForUser;
