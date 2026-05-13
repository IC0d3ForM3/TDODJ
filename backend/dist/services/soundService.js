"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSoundForUser = exports.createSoundForUser = exports.checkSoundAccessibleByIdForUser = exports.checkUserIsAdminByGuid = exports.fetchSoundsByIds = exports.fetchSoundLibraryByUserGuid = exports.fetchSoundsByUserGuid = void 0;
const soundRepository_1 = require("../repositories/soundRepository");
const fetchSoundsByUserGuid = async (userguid) => {
    return await (0, soundRepository_1.getSoundsByUserGuid)(userguid);
};
exports.fetchSoundsByUserGuid = fetchSoundsByUserGuid;
const fetchSoundLibraryByUserGuid = async (userguid) => {
    return await (0, soundRepository_1.getSoundLibraryByUserGuid)(userguid);
};
exports.fetchSoundLibraryByUserGuid = fetchSoundLibraryByUserGuid;
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
