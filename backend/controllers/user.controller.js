const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const sendEmail = require("../utils/mailer");

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.registerUser = async (req, res) => {
    try {
        const { Pseudo, Email, MotDePasse } = req.body;

        // console.log("Inscription reçue:", req.body);

        // Vérifier si l'utilisateur existe déjà
        const userExists = await User.findOne({ where: { Email } });
        if (userExists) {
            return res
                .status(400)
                .json({ message: "Un utilisateur avec cet email existe déjà." });
        }

        // Création de l'utilisateur
        const newUser = await User.create({ Pseudo, Email, MotDePasse });

        // Générer un token JWT
        const token = jwt.sign({ id: newUser.UserID }, process.env.JWT_SECRET, {
            expiresIn: 86400, // 24 heures
        });

        // res.status(200).json({ auth: true, token, user: { pseudo: user.Pseudo } });
        res.status(201).send({ auth: true, token });
    } catch (error) {
        console.error("Erreur lors de l'inscription:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { login, MotDePasse } = req.body; // login peut être soit l'email, soit le pseudo

        // Log les valeurs spécifiques extraites de la requête
        // console.log("Login: ", login);
        // console.log("MotDePasse: ", MotDePasse);

        // Trouvez l'utilisateur par email ou pseudo
        const user = await User.findOne({
            where: {
                [Op.or]: [{ Email: login }, { Pseudo: login }],
            },
        });

        if (!user) {
            return res.status(404).json({ message: "Utilisateur non trouvé." });
        }

        // Vérifiez le mot de passe
        const passwordIsValid = bcrypt.compareSync(MotDePasse, user.MotDePasse);
        if (!passwordIsValid) {
            return res.status(401).json({
                auth: false,
                token: null,
                message: "Mot de passe invalide.",
            });
        }

        // Log le résultat de la comparaison du mot de passe
        // console.log("Mot de passe valide: ", passwordIsValid);

        // Si le mot de passe est correct, générez un token
        const token = jwt.sign({ id: user.UserID }, process.env.JWT_SECRET, {
            expiresIn: 86400, // expire en 24 heures
        });

        // Répondez avec un token
        res.status(200).json({ auth: true, token, user: { pseudo: user.Pseudo } });
        // res.status(200).json({ auth: true, token });
    } catch (error) {
        res.status(500).json({ message: "Il y a eu un problème à se connecter." });
    }
};

exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.userId);
        if (!user) return res.status(404).send({ message: "Utilisateur non trouvé." });

        // Sélectionner les informations spécifiques à renvoyer
        const userProfile = {
            id: user.UserID,
            pseudo: user.Pseudo,
            email: user.Email,
            role: user.RoleID,
        };

        res.status(200).send(userProfile);
    } catch (error) {
        res.status(500).send({
            message: "Erreur lors de la récupération du profil de l'utilisateur.",
        });
    }
};

exports.updateUserProfile = async (req, res) => {
    try {
        const { Pseudo, Email } = req.body;
        const user = await User.findByPk(req.userId);
        if (!user) return res.status(404).send({ message: "Utilisateur non trouvé." });

        user.Pseudo = Pseudo || user.Pseudo;
        user.Email = Email || user.Email;

        await user.save();
        res.status(200).send({ message: "Profil mis à jour avec succès." });
    } catch (error) {
        res.status(500).send({
            message: "Erreur lors de la mise à jour du profil de l'utilisateur.",
        });
    }
};

exports.requestPasswordReset = async (req, res) => {
    try {
        const { Email } = req.body;
        const user = await User.findOne({ where: { Email } });

        if (!user) {
            return res.status(404).json({ message: "Email non trouvé." });
        }
        // console.log("ici la bas");
        // Générer un token de réinitialisation de mot de passe
        const resetToken = jwt.sign({ id: user.UserID }, process.env.JWT_SECRET, {
            expiresIn: "1h", // le token expire en 1 heure
        });
        // console.log("ici la");
        // Enregistrer le token de réinitialisation dans la base de données avec une expiration
        // Ici vous devez ajouter un champ à votre modèle User pour stocker le token et sa date d'expiration
        user.ResetPasswordToken = resetToken;
        user.ResetPasswordExpires = Date.now() + 3600000; // 1 heure
        // console.log("ici");
        await user.save();
        console.log("ici en bas");
        // Envoyer l'email avec le lien de réinitialisation
        sendEmail(
            user.Email,
            "Demande de réinitialisation de mot de passe",
            `<p>Pour réinitialiser votre mot de passe, veuillez cliquer sur le lien suivant: <a href="http://localhost:5173/reset-password?token=${resetToken}">Réinitialiser le mot de passe</a></p>`,
        );
        // ...
        // console.log("ici en bas email");
        res.status(200).json({ message: "Email de réinitialisation envoyé." });
    } catch (error) {
        console.error(
            "Erreur lors de la demande de réinitialisation du mot de passe:",
            error,
        );
        res.status(500).json({
            message: "Erreur lors de la demande de réinitialisation du mot de passe.",
            error: error.message,
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, MotDePasse } = req.body;

        // Étape 1 : Recherche de l'utilisateur par le token de réinitialisation
        const user = await User.findOne({
            where: {
                ResetPasswordToken: token,
                ResetPasswordExpires: { [Op.gt]: Date.now() }, // Vérifie si le token n'a pas expiré
            },
        });

        // Étape 2 : Vérification si l'utilisateur a été trouvé
        if (!user) {
            console.log("Token de réinitialisation invalide ou expiré.");
            return res
                .status(400)
                .json({ message: "Token de réinitialisation invalide ou expiré." });
        }

        // Étape 3 : Réinitialisation du mot de passe
        console.log("Utilisateur trouvé, réinitialisation du mot de passe...");

        user.MotDePasse = MotDePasse; // Utilisation du mot de passe fourni

        user.ResetPasswordToken = null;
        user.ResetPasswordExpires = null;

        // Sauvegarde de l'utilisateur mis à jour
        await user.save();

        console.log("Mot de passe réinitialisé avec succès.");

        // Étape 4 : Répondez avec un message de succès
        res.status(200).json({ message: "Mot de passe réinitialisé avec succès." });
    } catch (error) {
        console.error("Erreur lors de la réinitialisation du mot de passe:", error);
        res.status(500).json({
            message: "Erreur lors de la réinitialisation du mot de passe.",
            error: error.message,
        });
    }
};
