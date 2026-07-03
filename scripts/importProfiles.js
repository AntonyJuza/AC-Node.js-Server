require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const AcProfile = require('../models/AcProfile');
const connectDB = require('../mongoClient');

const importProfiles = async () => {
    try {
        await connectDB();
        
        const profilesDir = path.join(__dirname, '../profiles');
        if (!fs.existsSync(profilesDir)) {
            console.error(`Profiles directory not found at: ${profilesDir}`);
            process.exit(1);
        }

        const folders = fs.readdirSync(profilesDir);
        let importedCount = 0;

        for (const folder of folders) {
            const folderPath = path.join(profilesDir, folder);
            if (fs.statSync(folderPath).isDirectory() && folder.startsWith('profile_')) {
                const jsonPath = path.join(folderPath, 'profile.json');
                if (fs.existsSync(jsonPath)) {
                    try {
                        const fileData = fs.readFileSync(jsonPath, 'utf8');
                        const data = JSON.parse(fileData);

                        const profileId = parseInt(data.profile);
                        const brand = data.brand;
                        const buttons = data.buttons;

                        if (isNaN(profileId) || !brand || !buttons) {
                            console.warn(`[WARN] Skipping invalid profile schema in: ${jsonPath}`);
                            continue;
                        }

                        // Upsert profile in DB
                        await AcProfile.findOneAndUpdate(
                            { profileId },
                            { profileId, brand, buttons },
                            { upsert: true, new: true }
                        );
                        importedCount++;
                        console.log(`[OK] Imported profile ${profileId} for brand ${brand}`);
                    } catch (err) {
                        console.error(`[ERROR] Failed to import ${jsonPath}:`, err.message);
                    }
                }
            }
        }

        console.log(`\n[SUCCESS] Successfully imported/updated ${importedCount} profiles.`);
        process.exit(0);
    } catch (err) {
        console.error('Import failed:', err);
        process.exit(1);
    }
};

importProfiles();
