require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits, 
    ActivityType, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    Collection
} = require('discord.js');

// יצירת ה-Client עם כל ה-Intents הדרושים
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites 
    ],
    partials: [
        Partials.Channel, 
        Partials.Message, 
        Partials.Reaction, 
        Partials.User
    ],
});

// --- הגדרות מערכת קבועות ---
const H_CHANNEL_ID = "1500471346210275441"; 
const REACTION_CHANNEL_ID = "1501669494760931328"; 
const INVITE_WELCOME_CHANNEL_ID = "1501670019518693436"; 
const EMBED_WELCOME_CHANNEL_ID = "1501669895862227156"; 
const TICKET_CATEGORY_ID = "1501670210795601930"; 

const SUPPORT_ROLE_NAME = "Tickets Support"; 
const STAFF_ROLE_NAME = "Staff";
const MANAGERS_ROLE_NAME = "Managers";
const VERIFY_ROLE_ID = "1500471540750225670";
const HIGH_STAFF_ROLE_NAME = "High Staff";

// אחסון נתונים בזיכרון של הבוט
const invitesCache = new Collection();
const deletedChannelsHistory = []; // זיכרון עבור פקודת !return

// מילות מפתח לסנכרון חדרים חכם (!sync)
const STAFF_KEYWORDS = [
    "Owner", "Co Owner", "Management", "Staff Manager", 
    "Advisor", "Admin", "Moderator", "Guardian", "Helper"
];

// מיפוי אימוג'ים לרולים (Reaction Roles)
const ROLE_MAP = {
    "1502351780447518811": "Drops Updates",
    "1502351591838187721": "Leaks Updates",
    "1502351231077584926": "Giveaways Updates",
    "1502352308829294807": "Server Updates"
};

// --- הגדרת השאלות לבחינה לצוות ---
const STAFF_APP_QUESTIONS = `# שאלות הבחינה לצוות השרת דרים זון

**[1] מה שמך המלא?**
**[2] מה הגיל שלך?**
**[3] כמה זמן אתה בשרת דרים זון?**
**[4] האם יש לך ניסיון קודם בצוותי שרתים? (פרט באיזה שרתים ואיזה דרגות היית)**
**[5] למה בחרת להגיש מועמדות דווקא לשרת שלנו?**
**[6] למה אתה חושב שכדאי לנו לקבל אותך לצוות ולא אחרים?**
**[7] כמה שעות ביום אתה יכול להשקיע בשרת?**
**[8] מה תעשה אם שחקן יבקש ממך דברים בניגוד לחוקים (כמו רולים או כסף)?**
**[9] האם יש לך מיקרופון תקין?**
**[10] איך תגיב אם תראה חבר לצוות עובר על החוקים?**
**[11] מה היית משנה או מוסיף בשרת כדי לשפר אותו?**
**[12] יש עוד משהו שאתה רוצה להגיד שלא אמרת בבחינה?**

**בהצלחה !**`;

// --- אירוע הפעלה (Ready Event) ---
client.once('ready', async () => {
    console.log(`=========================================`);
    console.log(`DreamZone Bot is Online: ${client.user.tag}`);
    console.log(`=========================================`);

    // טעינת הזמנות מכל השרתים לזיכרון
    client.guilds.cache.forEach(async (guild) => {
        try {
            const firstInvites = await guild.invites.fetch();
            invitesCache.set(guild.id, new Collection(firstInvites.map((inv) => [inv.code, inv.uses])));
        } catch (err) {
            console.log(`Could not fetch invites for guild: ${guild.id}`);
        }
    });

    const guild = client.guilds.cache.first();
    if (guild) {
        client.user.setActivity(`DreamZone | Members ${guild.memberCount}`, { type: ActivityType.Watching });
    }
});

// --- מעקב אחרי מחיקת חדרים עבור !return (רק קטגוריות וחדרים) ---
client.on('channelDelete', (channel) => {
    if (!channel.guild) return;

    // שמירת כל נתוני החדר/קטגוריה בזיכרון
    deletedChannelsHistory.push({
        guildId: channel.guild.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        rawPosition: channel.rawPosition,
        permissionOverwrites: channel.permissionOverwrites.cache.map(overwrite => ({
            id: overwrite.id,
            allow: overwrite.allow.toArray(),
            deny: overwrite.deny.toArray(),
            type: overwrite.type
        })),
        deletedAt: Date.now()
    });

    // ניקוי חדרים שנמחקו לפני יותר מ-24 שעות
    const limit = Date.now() - (24 * 60 * 60 * 1000);
    while (deletedChannelsHistory.length > 0 && deletedChannelsHistory[0].deletedAt < limit) {
        deletedChannelsHistory.shift();
    }
});

// עדכון ה-Cache כשנוצרת הזמנה
client.on('inviteCreate', (invite) => {
    const guildInvites = invitesCache.get(invite.guild.id);
    if (guildInvites) guildInvites.set(invite.code, invite.uses);
});

// עדכון ה-Cache כשהזמנה נמחקת
client.on('inviteDelete', (invite) => {
    const guildInvites = invitesCache.get(invite.guild.id);
    if (guildInvites) guildInvites.delete(invite.code);
});

// --- אירוע כניסת משתמש (Welcome System) ---
client.on('guildMemberAdd', async (member) => {
    const inviteChannel = member.guild.channels.cache.get(INVITE_WELCOME_CHANNEL_ID);
    const embedChannel = member.guild.channels.cache.get(EMBED_WELCOME_CHANNEL_ID);
    
    // 1. מעקב הזמנות
    try {
        const newInvites = await member.guild.invites.fetch();
        const oldInvites = invitesCache.get(member.guild.id);
        const inviteUsed = newInvites.find(inv => inv.uses > (oldInvites ? (oldInvites.get(inv.code) || 0) : 0));
        invitesCache.set(member.guild.id, new Collection(newInvites.map((inv) => [inv.code, inv.uses])));

        if (inviteChannel) {
            if (inviteUsed) {
                const inviter = inviteUsed.inviter;
                const uses = inviteUsed.uses;
                await inviteChannel.send({ content: `**${member} נכנס על ידי ${inviter} ועכשיו יש לו ${uses} הזמנות לשרת**` });
            } else {
                await inviteChannel.send({ content: `**${member} נכנס לשרת !**` });
            }
        }
    } catch (err) { console.error(err); }

    // 2. הודעת ברוכים הבאים עם תמונה בפינה
    if (embedChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('ברוכים הבאים ל-DreamZone!')
            .setDescription(`אהלן ${member}, שמחים שהצטרפת אלינו לקהילה!\nתהנה מהשהות שלך בשרת.`)
            .setThumbnail(member.guild.iconURL()) 
            .setColor('#2F3136')
            .setTimestamp();

        await embedChannel.send({ embeds: [welcomeEmbed] });
    }

    client.user.setActivity(`DreamZone | Members ${member.guild.memberCount}`, { type: ActivityType.Watching });
});

// --- טיפול בהודעות ופקודות ---
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    // ריאקשנים אוטומטיים בחדר עדכונים
    if (message.channel.id === REACTION_CHANNEL_ID) {
        for (const emojiId of Object.keys(ROLE_MAP)) {
            try { await message.react(emojiId); } catch (e) {}
        }
    }

    // פקודת !return (שחזור קטגוריות וחדרים)
    if (message.content === '!return') {
        const managersRole = message.guild.roles.cache.find(r => r.name === MANAGERS_ROLE_NAME);
        if (!message.member.roles.cache.has(managersRole?.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

        const limit = Date.now() - (24 * 60 * 60 * 1000);
        const toRestore = deletedChannelsHistory.filter(c => c.guildId === message.guild.id && c.deletedAt > limit);

        if (toRestore.length === 0) return message.reply("לא מצאתי חדרים שנמחקו ב-24 השעות האחרונות.");

        const msg = await message.channel.send(`משחזר ${toRestore.length} פריטים (קטגוריות וחדרים)...`);

        // מיון: קטגוריות קודם כדי שנוכל להצמיד אליהן חדרים
        toRestore.sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : 1));

        const categoryMap = new Map(); // מפה לשמירת האיידי החדש של הקטגוריה

        for (const channelData of toRestore) {
            try {
                // אם החדר היה בתוך קטגוריה שנמחקה, נמצא את האיידי החדש שלה
                let finalParent = channelData.parentId;
                if (categoryMap.has(channelData.parentId)) {
                    finalParent = categoryMap.get(channelData.parentId);
                }

                const newChannel = await message.guild.channels.create({
                    name: channelData.name,
                    type: channelData.type,
                    parent: channelData.type === ChannelType.GuildCategory ? null : finalParent,
                    position: channelData.rawPosition,
                    permissionOverwrites: channelData.permissionOverwrites
                });

                // אם זו קטגוריה, נשמור את המיפוי שלה
                if (channelData.type === ChannelType.GuildCategory) {
                    categoryMap.set(channelData.parentId, newChannel.id);
                }

            } catch (err) {
                console.error(`Failed to restore ${channelData.name}`);
            }
        }

        // ניקוי הרשימה
        deletedChannelsHistory.length = 0;
        return msg.edit(`✅ שחזור הושלם בהצלחה.`);
    }

    // פקודת !clear
    if (message.content.startsWith('!clear')) {
        const staffRole = message.guild.roles.cache.find(r => r.name === STAFF_ROLE_NAME);
        if (!message.member.roles.cache.has(staffRole?.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("זה לצוות בלבד.").then(m => setTimeout(() => m.delete(), 3000));
        }
        const amount = parseInt(message.content.split(' ')[1]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("בחר 1-100.");
        await message.channel.bulkDelete(amount, true);
        message.channel.send(`✅ מחקתי **${amount}** הודעות.`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // פקודת !verify
    if (message.content === '!verify') {
        const managersRole = message.guild.roles.cache.find(r => r.name === MANAGERS_ROLE_NAME);
        if (!message.member.roles.cache.has(managersRole?.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_btn').setLabel('אימות').setStyle(ButtonStyle.Success));
        await message.channel.send({ content: "ברוכים הבאים ! לחצו על כפתור האימות כדי לאמת את עצמכם", components: [row] });
        await message.delete().catch(() => {});
    }

    // פקודת !staffapp
    if (message.content === '!staffapp') {
        const managersRole = message.guild.roles.cache.find(r => r.name === MANAGERS_ROLE_NAME);
        if (!message.member.roles.cache.has(managersRole?.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const staffAppEmbed = new EmbedBuilder().setTitle('בחינה לצוות השרת - DreamZone').setDescription("**כמה דגשים לפני פתיחת הבחינה:**\n\n• ענו ברצינות.\n• אין להציק לצוות בפרטי.").setColor('#2F3136');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_staffapp').setLabel('פתח בחינה לצוות').setStyle(ButtonStyle.Primary));
        await message.channel.send({ embeds: [staffAppEmbed], components: [row] });
        await message.delete().catch(() => {});
    }

    // פקודת !h
    if (message.content.startsWith('!h') && message.channel.id === H_CHANNEL_ID) {
        const reason = message.content.split(' ').slice(1).join(' ') || "לא צוינה סיבה";
        const voiceChannel = message.member.voice.channel;
        const staffRole = message.guild.roles.cache.find(r => r.name === STAFF_ROLE_NAME);
        const content = `**${staffRole ? `<@&${staffRole.id}>` : "@Staff"} | ${message.author} צריך עזרה מכם !\n${voiceChannel ? `המשתמש נמצא בשיחה <#${voiceChannel.id}>` : "המשתמש אינו נמצא בשיחה"}\nסיבה: \`${reason}\`**`;
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('handle_h_request').setLabel('טפל').setStyle(ButtonStyle.Success));
        await message.channel.send({ content: content, components: [row] });
        await message.delete().catch(() => {});
    }

    // פקודת !sync
    if (message.content === '!sync') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const voiceChannels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
        for (const [id, channel] of voiceChannels) {
            const keyword = STAFF_KEYWORDS.find(k => channel.name.toLowerCase().includes(k.toLowerCase()));
            if (keyword) {
                const overwrites = [{ id: message.guild.id, deny: [PermissionFlagsBits.Connect] }];
                message.guild.roles.cache.forEach(role => {
                    if (role.name.toLowerCase().includes(keyword.toLowerCase())) overwrites.push({ id: role.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] });
                    else if (STAFF_KEYWORDS.some(k => role.name.toLowerCase().includes(k.toLowerCase()))) overwrites.push({ id: role.id, deny: [PermissionFlagsBits.Connect] });
                });
                await channel.permissionOverwrites.set(overwrites).catch(() => {});
            }
        }
        message.channel.send(`✅ סנכרון הושלם.`);
    }
});

// --- טיפול באינטראקציות ---
client.on('interactionCreate', async (interaction) => {
    const { guild, user, member, channel, customId, values, message } = interaction;

    if (interaction.isButton()) {
        if (customId === 'verify_btn') {
            const role = guild.roles.cache.get(VERIFY_ROLE_ID);
            if (role) await member.roles.add(role);
            return interaction.reply({ content: "אומתת בהצלחה!", ephemeral: true });
        }

        if (customId === 'handle_h_request') {
            const supportRole = guild.roles.cache.find(r => r.name === SUPPORT_ROLE_NAME);
            if (!member.roles.cache.has(supportRole?.id) && !member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "רק לצוות!", ephemeral: true });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('h_c').setLabel(`Claimed By ${user.username}`).setStyle(ButtonStyle.Success).setDisabled(true));
            await interaction.update({ components: [row] });
            return;
        }

        if (customId === 'start_ticket' || customId === 'start_staffapp') {
            const prefix = customId === 'start_ticket' ? 'ticket-' : 'staffapp-';
            if (guild.channels.cache.find(c => c.name === `${prefix}${user.username.toLowerCase()}`)) return interaction.reply({ content: "כבר פתוח אצלך ערוץ!", ephemeral: true });

            await interaction.deferUpdate();
            const managersRole = guild.roles.cache.find(r => r.name === MANAGERS_ROLE_NAME);
            const appChannel = await guild.channels.create({
                name: `${prefix}${user.username}`,
                type: ChannelType.GuildText,
                parent: TICKET_CATEGORY_ID, 
                permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }],
            });
            const btns = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('staff_options').setLabel('Staff Options').setStyle(ButtonStyle.Secondary));
            await appChannel.send({ content: `${user} | הצוות יתפנה אליך בהקדם`, components: [btns] });
            if (customId === 'start_staffapp') await appChannel.send(STAFF_APP_QUESTIONS);
            await interaction.followUp({ content: `ערוץ נפתח: ${appChannel}`, ephemeral: true });
        }

        if (customId === 'claim_ticket') {
            const supportRole = guild.roles.cache.find(r => r.name === SUPPORT_ROLE_NAME);
            const managersRole = guild.roles.cache.find(r => r.name === MANAGERS_ROLE_NAME);
            if (!member.roles.cache.has(supportRole?.id) && !member.roles.cache.has(managersRole?.id) && !member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "רק לצוות.", ephemeral: true });
            
            const row = ActionRowBuilder.from(message.components[0]);
            row.components[0].setDisabled(true).setLabel(`Claimed By ${user.username}`);
            await interaction.update({ components: [row] });
            await channel.send({ content: `**הבחינה נתפסה לטיפול על ידי ${user}**` });
        }

        if (customId === 'close_ticket') {
            await interaction.reply("הערוץ ייסגר עוד 5 שניות...");
            setTimeout(() => channel.delete(), 5000);
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (customId === 'staff_roles_select') {
            const role = guild.roles.cache.find(r => r.name === values[0]);
            if (role) member.roles.cache.has(role.id) ? await member.roles.remove(role) : await member.roles.add(role);
            return interaction.deferUpdate();
        }
    }
});

// --- Reaction Roles ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot || reaction.message.channel.id !== REACTION_CHANNEL_ID) return;
    if (reaction.partial) await reaction.fetch();
    const roleName = ROLE_MAP[reaction.emoji.id];
    if (roleName) {
        const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);
        const member = await reaction.message.guild.members.fetch(user.id);
        if (role) await member.roles.add(role).catch(() => {});
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot || reaction.message.channel.id !== REACTION_CHANNEL_ID) return;
    if (reaction.partial) await reaction.fetch();
    const roleName = ROLE_MAP[reaction.emoji.id];
    if (roleName) {
        const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);
        const member = await reaction.message.guild.members.fetch(user.id);
        if (role) await member.roles.remove(role).catch(() => {});
    }
});

client.login(process.env.TOKEN);