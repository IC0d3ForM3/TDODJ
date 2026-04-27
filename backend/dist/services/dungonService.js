"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDungonSpReward = exports.fetchAllPublishedDungonsForAdmin = exports.setSampleGame = exports.fetchSampleDungonFull = exports.fetchSampleDungon = exports.approvePendingDungon = exports.removeDungonForUser = exports.removeGameForUser = exports.saveGameDungenJson = exports.fetchGameByIdForUser = exports.fetchGamesForUser = exports.startGameForUserFromPublishedDungon = exports.publishDungonForUserKey = exports.updateDungonMetadata = exports.saveDungonJsonForUser = exports.createDungon = exports.fetchDungonByIdForUser = exports.fetchDungonsByUserKey = exports.fetchPublishedDungons = exports.fetchDungonIsMainGameStatus = exports.fetchMainGameDungons = void 0;
const dungonRepository_1 = require("../repositories/dungonRepository");
const fetchMainGameDungons = async () => {
    const { rows } = await (await Promise.resolve().then(() => __importStar(require('../db')))).default.query('SELECT id, name, description, intro FROM dungons WHERE ismaingame = TRUE AND status = $1 ORDER BY id ASC', ['published']);
    return rows;
};
exports.fetchMainGameDungons = fetchMainGameDungons;
const fetchDungonIsMainGameStatus = async (id) => {
    return await (0, dungonRepository_1.getDungonIsMainGameStatusById)(id);
};
exports.fetchDungonIsMainGameStatus = fetchDungonIsMainGameStatus;
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
const removeDungonForUser = async (id, userkey) => {
    return await (0, dungonRepository_1.deleteDungonForUser)(id, userkey);
};
exports.removeDungonForUser = removeDungonForUser;
const approvePendingDungon = async (id, adminKey) => {
    return await (0, dungonRepository_1.approveDungon)(id, adminKey);
};
exports.approvePendingDungon = approvePendingDungon;
const fetchSampleDungon = async () => {
    return await (0, dungonRepository_1.getSampleDungonFromDb)();
};
exports.fetchSampleDungon = fetchSampleDungon;
const fetchSampleDungonFull = async () => {
    return await (0, dungonRepository_1.getSampleDungonFullFromDb)();
};
exports.fetchSampleDungonFull = fetchSampleDungonFull;
const setSampleGame = async (id) => {
    return await (0, dungonRepository_1.setSampleDungonInDb)(id);
};
exports.setSampleGame = setSampleGame;
const fetchAllPublishedDungonsForAdmin = async () => {
    return await (0, dungonRepository_1.getAllPublishedDungonsForAdmin)();
};
exports.fetchAllPublishedDungonsForAdmin = fetchAllPublishedDungonsForAdmin;
const fetchDungonSpReward = (dungonId) => (0, dungonRepository_1.getDungonSpRewardById)(dungonId);
exports.fetchDungonSpReward = fetchDungonSpReward;
