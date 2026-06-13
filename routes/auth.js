const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

/* REGISTER */
router.post("/register", async (req, res) => {
    try {
        const password = req.body.password;
        const name = req.body.name ? req.body.name.trim() : "";
        const mobileNumber = req.body.mobileNumber ? req.body.mobileNumber.trim() : "";
        const profilePicture = req.body.profilePicture || "";

        console.log("Register Request - Name:", name, "Mobile:", mobileNumber);

        if (!password || !name || !mobileNumber) {
            return res.status(400).json({
                message: "Name, mobile number, and password are required"
            });
        }

        const existingMobile = await User.findOne({ mobileNumber });
        if (existingMobile) {
            return res.status(400).json({
                message: "Mobile number is already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            password: hashedPassword,
            name,
            mobileNumber,
            profilePicture
        });

        await user.save();

        console.log("User Created:", mobileNumber);

        res.json({
            message: "Account Created"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Server Error"
        });
    }
});

/* LOGIN */
router.post("/login", async (req, res) => {
    try {
        const mobileNumber = req.body.mobileNumber ? req.body.mobileNumber.trim() : "";
        const password = req.body.password;

        console.log("Login Attempt:", mobileNumber);

        if (!mobileNumber || !password) {
            return res.status(400).json({
                message: "Mobile number and password are required"
            });
        }

        const user = await User.findOne({ mobileNumber });

        console.log("User Found:", user ? user.name : "None");

        if (!user) {
            return res.status(400).json({
                message: "User Not Found"
            });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({
                message: "Wrong Password"
            });
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        const isAdmin = (user.mobileNumber === "0000000000");

        const token = jwt.sign(
            {
                id: user._id,
                mobileNumber: user.mobileNumber,
                name: user.name,
                isAdmin: isAdmin
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.json({
            token,
            mobileNumber: user.mobileNumber,
            name: user.name,
            isAdmin: isAdmin
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Server Error"
        });
    }
});

// Reset Password (Mock OTP flow)
router.post("/reset-password", async (req, res) => {
    try {
        const { mobileNumber, newPassword } = req.body;
        
        if (!mobileNumber || !newPassword) {
            return res.status(400).json({ message: "Mobile number and new password required" });
        }

        const user = await User.findOne({ mobileNumber });
        if (!user) {
            return res.status(404).json({ message: "No account found with this mobile number" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        user.password = hashedPassword;
        await user.save();

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;