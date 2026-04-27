"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawFromStash = exports.depositToStash = exports.getStash = void 0;
const tavernStashRepository_1 = require("../repositories/tavernStashRepository");
const getStash = async (userguid) => {
    return await (0, tavernStashRepository_1.getStash)(userguid);
};
exports.getStash = getStash;
const depositToStash = async (userguid, items) => {
    return await (0, tavernStashRepository_1.depositToStash)(userguid, items);
};
exports.depositToStash = depositToStash;
const withdrawFromStash = async (userguid, itemIndexes) => {
    return await (0, tavernStashRepository_1.withdrawFromStash)(userguid, itemIndexes);
};
exports.withdrawFromStash = withdrawFromStash;
