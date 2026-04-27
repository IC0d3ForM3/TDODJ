"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSpellForUser = exports.createSpellForUser = exports.checkUserIsAdminByGuid = exports.fetchSpellsByUserGuid = exports.fetchSpellsByIdsForGame = void 0;
const spellRepository_1 = require("../repositories/spellRepository");
const fetchSpellsByIdsForGame = async (ids) => {
    return await (0, spellRepository_1.fetchSpellsByIds)(ids);
};
exports.fetchSpellsByIdsForGame = fetchSpellsByIdsForGame;
const fetchSpellsByUserGuid = async (userguid) => {
    return await (0, spellRepository_1.getSpellsByUserGuid)(userguid);
};
exports.fetchSpellsByUserGuid = fetchSpellsByUserGuid;
const checkUserIsAdminByGuid = async (userguid) => {
    return await (0, spellRepository_1.isAdminUserByGuid)(userguid);
};
exports.checkUserIsAdminByGuid = checkUserIsAdminByGuid;
const createSpellForUser = async (userguid, payload) => {
    return await (0, spellRepository_1.insertSpellForUser)(userguid, payload);
};
exports.createSpellForUser = createSpellForUser;
const saveSpellForUser = async (id, userguid, payload) => {
    return await (0, spellRepository_1.updateSpellForUser)(id, userguid, payload);
};
exports.saveSpellForUser = saveSpellForUser;
