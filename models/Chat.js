const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
    isGroup: {
        type: Boolean,
        default: false
    },
    name: {
        type: String // Used if isGroup is true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User" // Group administrator
    },
    lastRead: {
        type: Map,
        of: Date,
        default: {} // Key: UserId string, Value: Last read timestamp Date
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    onlyAdminsCanMessage: {
        type: Boolean,
        default: false
    }
});

// Indexes for fast chat loading
ChatSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Chat", ChatSchema);
