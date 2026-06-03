const mongoose = require("mongoose");

const ChatRequestSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Prevent duplicate pending requests between the same users
ChatRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model("ChatRequest", ChatRequestSchema);
