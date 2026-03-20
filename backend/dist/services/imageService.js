"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveImageForUser = exports.createImageForUser = exports.checkImageAccessibleByIdForUser = exports.checkUserIsAdminByGuid = exports.fetchImageLibraryByUserGuid = exports.fetchImagesByUserGuid = void 0;
const imageRepository_1 = require("../repositories/imageRepository");
const fetchImagesByUserGuid = async (userguid) => {
    return await (0, imageRepository_1.getImagesByUserGuid)(userguid);
};
exports.fetchImagesByUserGuid = fetchImagesByUserGuid;
const fetchImageLibraryByUserGuid = async (userguid) => {
    return await (0, imageRepository_1.getImageLibraryByUserGuid)(userguid);
};
exports.fetchImageLibraryByUserGuid = fetchImageLibraryByUserGuid;
const checkUserIsAdminByGuid = async (userguid) => {
    return await (0, imageRepository_1.isAdminUserByGuid)(userguid);
};
exports.checkUserIsAdminByGuid = checkUserIsAdminByGuid;
const checkImageAccessibleByIdForUser = async (imageId, userguid) => {
    return await (0, imageRepository_1.isImageAccessibleByIdForUser)(imageId, userguid);
};
exports.checkImageAccessibleByIdForUser = checkImageAccessibleByIdForUser;
const createImageForUser = async (userguid, payload) => {
    return await (0, imageRepository_1.insertImageForUser)(userguid, payload);
};
exports.createImageForUser = createImageForUser;
const saveImageForUser = async (id, userguid, payload) => {
    return await (0, imageRepository_1.updateImageForUser)(id, userguid, payload);
};
exports.saveImageForUser = saveImageForUser;
