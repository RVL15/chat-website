const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobileNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    profilePicture: {
        type: String,
        default: ""
    },
    contacts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    isOnline: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date,
        default: null
    }
});

module.exports = mongoose.model("User", UserSchema);