"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMonsterForUser = exports.createMonsterForUser = exports.checkUserIsAdminByGuid = exports.fetchMonsterLibraryByUserGuid = exports.fetchMonstersByUserGuid = void 0;
const monsterRepository_1 = require("../repositories/monsterRepository");
const fetchMonstersByUserGuid = async (userguid) => {
    return await (0, monsterRepository_1.getMonstersByUserGuid)(userguid);
};
exports.fetchMonstersByUserGuid = fetchMonstersByUserGuid;
const fetchMonsterLibraryByUserGuid = async (userguid) => {
    return await (0, monsterRepository_1.getMonsterLibraryByUserGuid)(userguid);
};
exports.fetchMonsterLibraryByUserGuid = fetchMonsterLibraryByUserGuid;
const checkUserIsAdminByGuid = async (userguid) => {
    return await (0, monsterRepository_1.isAdminUserByGuid)(userguid);
};
exports.checkUserIsAdminByGuid = checkUserIsAdminByGuid;
const createMonsterForUser = async (userguid, payload) => {
    return await (0, monsterRepository_1.insertMonsterForUser)(userguid, payload);
};
exports.createMonsterForUser = createMonsterForUser;
const saveMonsterForUser = async (id, userguid, payload) => {
    return await (0, monsterRepository_1.updateMonsterForUser)(id, userguid, payload);
};
exports.saveMonsterForUser = saveMonsterForUser;
