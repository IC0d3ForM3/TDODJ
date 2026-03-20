"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePcForUser = exports.createPcForUser = exports.fetchPcByIdForUser = exports.fetchPcsByUserGuid = void 0;
const pcRepository_1 = require("../repositories/pcRepository");
const fetchPcsByUserGuid = async (userguid) => {
    return await (0, pcRepository_1.getPcsByUserGuid)(userguid);
};
exports.fetchPcsByUserGuid = fetchPcsByUserGuid;
const fetchPcByIdForUser = async (id, userguid) => {
    return await (0, pcRepository_1.getPcByIdForUser)(id, userguid);
};
exports.fetchPcByIdForUser = fetchPcByIdForUser;
const createPcForUser = async (userguid, payload) => {
    return await (0, pcRepository_1.insertPcForUser)(userguid, payload);
};
exports.createPcForUser = createPcForUser;
const savePcForUser = async (id, userguid, payload) => {
    return await (0, pcRepository_1.updatePcForUser)(id, userguid, payload);
};
exports.savePcForUser = savePcForUser;
