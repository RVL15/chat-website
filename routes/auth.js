const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

/* REGISTER */
router.post("/register", async (req, res) => {

    try {

        const username =
            req.body.username.trim().toLowerCase();

        const password =
            req.body.password;

        console.log("Register Request:", username);

        const existingUser =
            await User.findOne({
                username: username
            });

        console.log("Existing User:", existingUser);

        if (existingUser) {

            return res.status(400).json({
                message: "User already exists"
            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const user = new User({
            username,
            password: hashedPassword
        });

        await user.save();

        console.log("User Created:", username);

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

        const username =
            req.body.username.trim().toLowerCase();

        const password =
            req.body.password;

        console.log("Login Attempt:", username);

        const user =
            await User.findOne({
                username: username
            });

        console.log("User Found:", user);

        if (!user) {

            return res.status(400).json({
                message: "User Not Found"
            });

        }

        const valid =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!valid) {

            return res.status(400).json({
                message: "Wrong Password"
            });

        }

        const token = jwt.sign(
            {
                id: user._id,
                username: user.username
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.json({
            token,
            username: user.username
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: "Server Error"
        });

    }

});
module.exports = router;