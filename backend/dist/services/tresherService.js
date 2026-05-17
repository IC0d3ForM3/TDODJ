"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveTresherForUser = exports.createTresherForUser = exports.checkTresherAccessibleByIdForUser = exports.fetchTreshersByIds = exports.checkUserIsAdminByGuid = exports.fetchAllTreshersWithUsername = exports.fetchTresherLibraryByUserGuid = exports.fetchTreshersByUserGuid = void 0;
const tresherRepository_1 = require("../repositories/tresherRepository");
const fetchTreshersByUserGuid = async (userguid) => {
    return await (0, tresherRepository_1.getTreshersByUserGuid)(userguid);
};
exports.fetchTreshersByUserGuid = fetchTreshersByUserGuid;
const fetchTresherLibraryByUserGuid = async (userguid) => {
    return await (0, tresherRepository_1.getTresherLibraryByUserGuid)(userguid);
};
exports.fetchTresherLibraryByUserGuid = fetchTresherLibraryByUserGuid;
const fetchAllTreshersWithUsername = async () => {
    return await (0, tresherRepository_1.getAllTreshersWithUsername)();
};
exports.fetchAllTreshersWithUsername = fetchAllTreshersWithUsername;
const checkUserIsAdminByGuid = async (userguid) => {
    return await (0, tresherRepository_1.isAdminUserByGuid)(userguid);
};
exports.checkUserIsAdminByGuid = checkUserIsAdminByGuid;
const fetchTreshersByIds = async (ids) => {
    return await (0, tresherRepository_1.getTreshersByIds)(ids);
};
exports.fetchTreshersByIds = fetchTreshersByIds;
const checkTresherAccessibleByIdForUser = async (tresherId, userguid) => {
    return await (0, tresherRepository_1.isTresherAccessibleByIdForUser)(tresherId, userguid);
};
exports.checkTresherAccessibleByIdForUser = checkTresherAccessibleByIdForUser;
const createTresherForUser = async (userguid, payload) => {
    return await (0, tresherRepository_1.insertTresherForUser)(userguid, payload);
};
exports.createTresherForUser = createTresherForUser;
const saveTresherForUser = async (id, userguid, payload) => {
    return await (0, tresherRepository_1.updateTresherForUser)(id, userguid, payload);
};
exports.saveTresherForUser = saveTresherForUser;
