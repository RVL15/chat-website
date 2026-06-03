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
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Message", MessageSchema);
