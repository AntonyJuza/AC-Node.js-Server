require('dotenv').config();
const mongoose = require('mongoose');
const AcProfile = require('../models/AcProfile');
const Brand = require('../models/Brand');
const Profile = require('../models/Profile');
const ProfileCommand = require('../models/ProfileCommand');
const connectDB = require('../mongoClient');

async function migrate() {
    try {
        await connectDB();
        console.log('Connected to Database. Starting migration...');

        const oldProfiles = await AcProfile.find({});
        console.log(`Found ${oldProfiles.length} old profiles to migrate.`);
        
        for (const old of oldProfiles) {
            const brandId = old.brand.toLowerCase().trim();
            
            // 1. Ensure Brand exists
            await Brand.findByIdAndUpdate(
                brandId,
                { name: old.brand, isActive: true },
                { upsert: true }
            );

            // 2. Generate unique Profile ID
            const profileIdStr = `${brandId.substring(0, 2).toUpperCase()}${String(old.profileId).padStart(3, '0')}`; // e.g. DK001

            // Determine if raw or encoded
            let method = 'raw';
            if (old.buttons && old.buttons.size > 0) {
                const firstButton = Array.from(old.buttons.values())[0];
                method = firstButton.method || 'raw';
            }

            // 3. Create Profile
            await Profile.findByIdAndUpdate(
                profileIdStr,
                {
                    brandId,
                    profileName: `Profile ${old.profileId}`,
                    method,
                    frequency: 38000,
                    isVerified: true
                },
                { upsert: true }
            );

            // 4. Create Profile Commands
            if (old.buttons) {
                for (const [btnKey, btnVal] of old.buttons.entries()) {
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
            }
            console.log(`Migrated old profile brand:${old.brand} id:${old.profileId} -> ${profileIdStr}`);
        }
        console.log('Migration Completed Successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
