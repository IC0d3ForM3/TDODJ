"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeGameForUser = exports.saveGameDungenJson = exports.fetchGameByIdForUser = exports.fetchGamesForUser = exports.startGameForUserFromPublishedDungon = exports.publishDungonForUserKey = exports.updateDungonMetadata = exports.saveDungonJsonForUser = exports.createDungon = exports.fetchDungonByIdForUser = exports.fetchDungonsByUserKey = exports.fetchPublishedDungons = void 0;
const dungonRepository_1 = require("../repositories/dungonRepository");
const fetchPublishedDungons = async (userkey = null) => {
    return await (0, dungonRepository_1.getPublishedDungons)(userkey);
};
exports.fetchPublishedDungons = fetchPublishedDungons;
const fetchDungonsByUserKey = async (userkey) => {
    return await (0, dungonRepository_1.getDungonsByUserKey)(userkey);
};
exports.fetchDungonsByUserKey = fetchDungonsByUserKey;
const fetchDungonByIdForUser = async (id, userkey) => {
    return await (0, dungonRepository_1.getDungonByIdForUser)(id, userkey);
};
exports.fetchDungonByIdForUser = fetchDungonByIdForUser;
const createDungon = async (payload) => {
    return await (0, dungonRepository_1.insertDungon)(payload);
};
exports.createDungon = createDungon;
const saveDungonJsonForUser = async (id, userkey, dungonJson) => {
    return await (0, dungonRepository_1.updateDungonJsonForUser)(id, userkey, dungonJson);
};
exports.saveDungonJsonForUser = saveDungonJsonForUser;
const updateDungonMetadata = async (id, userkey, metadata) => {
    return await (0, dungonRepository_1.updateDungonMetadataForUser)(id, userkey, metadata);
};
exports.updateDungonMetadata = updateDungonMetadata;
const publishDungonForUserKey = async (id, userkey, options) => {
    return await (0, dungonRepository_1.publishDungonForUser)(id, userkey, options);
};
exports.publishDungonForUserKey = publishDungonForUserKey;
const startGameForUserFromPublishedDungon = async (id, userkey, pcId) => {
    return await (0, dungonRepository_1.startGameFromPublishedDungon)(id, userkey, pcId);
};
exports.startGameForUserFromPublishedDungon = startGameForUserFromPublishedDungon;
const fetchGamesForUser = async (userkey) => {
    return await (0, dungonRepository_1.getGamesForUser)(userkey);
};
exports.fetchGamesForUser = fetchGamesForUser;
const fetchGameByIdForUser = async (id, userkey) => {
    return await (0, dungonRepository_1.getGameByIdForUser)(id, userkey);
};
exports.fetchGameByIdForUser = fetchGameByIdForUser;
const saveGameDungenJson = async (id, userkey, dungenJson) => {
    return await (0, dungonRepository_1.updateGameDungenJson)(id, userkey, dungenJson);
};
exports.saveGameDungenJson = saveGameDungenJson;
const removeGameForUser = async (id, userkey) => {
    return await (0, dungonRepository_1.deleteGameForUser)(id, userkey);
};
exports.removeGameForUser = removeGameForUser;
