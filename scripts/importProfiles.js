require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Brand = require('../models/Brand');
const Profile = require('../models/Profile');
const ProfileCommand = require('../models/ProfileCommand');
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
                        const brandName = data.brand;
                        const buttons = data.buttons;

                        if (isNaN(profileId) || !brandName || !buttons) {
                            console.warn(`[WARN] Skipping invalid profile schema in: ${jsonPath}`);
                            continue;
                        }

                        const brandId = brandName.toLowerCase().trim();

                        // 1. Ensure Brand exists
                        await Brand.findByIdAndUpdate(
                            brandId,
                            { name: brandName, isActive: true },
                            { upsert: true }
                        );

                        // 2. Generate unique Profile ID
                        const profileIdStr = `${brandId.substring(0, 2).toUpperCase()}${String(profileId).padStart(3, '0')}`;

                        // Determine if raw or encoded
                        let method = 'raw';
                        const buttonsKeys = Object.keys(buttons);
                        if (buttonsKeys.length > 0) {
                            method = buttons[buttonsKeys[0]].method || 'raw';
                        }

                        // 3. Create/Update Profile
                        await Profile.findByIdAndUpdate(
                            profileIdStr,
                            {
                                brandId,
                                profileName: `Profile ${profileId}`,
                                method,
                                frequency: 38000,
                                isVerified: true
                            },
                            { upsert: true }
                        );

                        // 4. Create/Update Commands
                        for (const btnKey of buttonsKeys) {
                            const btnVal = buttons[btnKey];
                            const commandName = btnKey.toLowerCase().replace(/\s+/g, '_');
                            const commandId = `${profileIdStr}_${commandName.toUpperCase()}`;

                            await ProfileCommand.findByIdAndUpdate(
                                commandId,
                                {
                                    profileId: profileIdStr,
                                    command: commandName,
                                    method: btnVal.method || method,
                                    frequency: btnVal.frequency || 38000,
                                    pattern: btnVal.pattern,
                                    headerMark: btnVal.hdrMark,
                                    headerSpace: btnVal.hdrSpace,
                                    bitMark: btnVal.bitMark,
                                    oneSpace: btnVal.oneSpace,
                                    zeroSpace: btnVal.zeroSpace,
                                    bits: btnVal.bits,
                                    data: btnVal.hexData
                                },
                                { upsert: true }
                            );
                        }

                        importedCount++;
                        console.log(`[OK] Imported profile ${profileIdStr} for brand ${brandName}`);
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
