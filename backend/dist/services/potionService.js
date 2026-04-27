"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePotionForUser = exports.createPotionForUser = exports.checkUserIsAdminByGuid = exports.fetchPotionsByIds = exports.fetchPotionsByUserGuid = void 0;
const potionRepository_1 = require("../repositories/potionRepository");
const fetchPotionsByUserGuid = async (userguid) => {
    return await (0, potionRepository_1.getPotionsByUserGuid)(userguid);
};
exports.fetchPotionsByUserGuid = fetchPotionsByUserGuid;
const fetchPotionsByIds = async (ids) => {
    return await (0, potionRepository_1.getPotionsByIds)(ids);
};
exports.fetchPotionsByIds = fetchPotionsByIds;
const checkUserIsAdminByGuid = async (userguid) => {
    return await (0, potionRepository_1.isAdminUserByGuid)(userguid);
};
exports.checkUserIsAdminByGuid = checkUserIsAdminByGuid;
const createPotionForUser = async (userguid, payload) => {
    return await (0, potionRepository_1.insertPotionForUser)(userguid, payload);
};
exports.createPotionForUser = createPotionForUser;
const savePotionForUser = async (id, userguid, payload) => {
    return await (0, potionRepository_1.updatePotionForUser)(id, userguid, payload);
};
exports.savePotionForUser = savePotionForUser;
