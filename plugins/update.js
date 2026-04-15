const { exec } = require('child_process');

module.exports = {
    command: 'update',
    description: 'Mengupdate bot dari GitHub dan mereload sistem (Owner Only)',
    execute: async (bot, msg, args) => {
        const chatId = msg.chat.id;
        const ownerId = process.env.OWNER_ID;

        // Memastikan hanya owner yang bisa menggunakan perintah ini
        if (msg.from.id.toString() !== ownerId) {
            return bot.sendMessage(chatId, '❌ Perintah ini khusus untuk Owner bot.');
        }

        let statusMsg = await bot.sendMessage(chatId, '🔄 Sedang mengambil pembaruan dari GitHub...');

        // Menjalankan git pull untuk mengambil pembaruan
        exec('git pull origin main', async (error, stdout, stderr) => {
            if (error) {
                console.error(`Git pull error: ${error}`);
                return bot.editMessageText(`❌ Gagal mengupdate:\n\`\`\`text\n${stderr}\n\`\`\``, {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown'
                });
            }

            // Jika tidak ada update
            if (stdout.includes('Already up to date.')) {
                return bot.editMessageText('✅ Bot sudah berada di versi terbaru (Tidak ada update).', {
                    chat_id: chatId,
                    message_id: statusMsg.message_id
                });
            }

            // Jika ada update, tampilkan log dan restart bot
            await bot.editMessageText(`✅ Update berhasil ditarik!\n\`\`\`text\n${stdout}\n\`\`\`\n⏳ Mereload bot...`, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            });

            // Merestart bot melalui PM2
            exec('pm2 reload telegram-bot', (pm2Error) => {
                if (pm2Error) {
                    console.error('PM2 Reload Error, mencoba mematikan proses agar direstart otomatis oleh PM2:', pm2Error);
                    process.exit(0); // PM2 akan merestart ulang secara otomatis jika proses dimatikan
                }
            });
        });
    }
};
