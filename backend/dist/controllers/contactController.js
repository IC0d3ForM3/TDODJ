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
exports.updateContactFlags = exports.getContacts = exports.submitContact = void 0;
const contactService = __importStar(require("../services/contactService"));
const submitContact = async (req, res) => {
    const { name, email, problem, username, message } = req.body;
    if (!name || !email || !problem || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const ok = await contactService.submitContactRequest({ name, email, problem, username, message });
    if (!ok)
        return res.status(500).json({ error: 'Failed to submit contact request' });
    res.json({ result: 1 });
};
exports.submitContact = submitContact;
const getContacts = async (_req, res) => {
    const contacts = await contactService.getAllContactRequests();
    res.json(contacts);
};
exports.getContacts = getContacts;
const updateContactFlags = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id))
        return res.status(400).json({ error: 'Invalid id' });
    const { isread, isresponded } = req.body;
    if (typeof isread !== 'boolean' || typeof isresponded !== 'boolean') {
        return res.status(400).json({ error: 'isread and isresponded must be booleans' });
    }
    const updated = await contactService.updateContactFlags(id, isread, isresponded);
    if (!updated)
        return res.status(404).json({ error: 'Contact request not found' });
    res.json(updated);
};
exports.updateContactFlags = updateContactFlags;
