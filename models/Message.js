const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chat",
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    message: {
        type: String,
        trim: true,
        default: ""
    },
    file: {
        data: String,       // base64 data url
        name: String,       // original filename
        mimeType: String,   // mime type string
        size: Number,       // file size in bytes
        isVoiceNote: { type: Boolean, default: false }
    },
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: String,
        emoji: String
    }],
    replyTo: {
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        senderName: String,
        text: String
    },
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    isEdited: {
        type: Boolean,
        default: false
    },
    isForwarded: {
        type: Boolean,
        default: false
    },
    isDeletedEveryone: {
        type: Boolean,
        default: false
    },
    callInfo: {
        callType: { type: String }, // "audio" or "video"
        duration: { type: Number }, // in seconds
        status: { type: String }    // "missed", "completed", "declined"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

MessageSchema.index({ chat: 1, createdAt: -1 });
MessageSchema.index({ sender: 1 });

module.exports = mongoose.model("Message", MessageSchema);
