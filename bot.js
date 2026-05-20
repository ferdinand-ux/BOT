const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const { createReadStream } = require('fs');
const { join } = require('path');

// ─── CONFIGURACIÓN ────────────────────────────────────────────────
const TOKEN      = process.env.DISCORD_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
// ──────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let connection = null;

// ── Función principal: conectar al canal de voz ──────────────────
async function connectToVoice() {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error('❌ No se encontró el servidor. Verifica GUILD_ID.');
    return;
  }

  const channel = guild.channels.cache.get(CHANNEL_ID);
  if (!channel) {
    console.error('❌ No se encontró el canal de voz. Verifica CHANNEL_ID.');
    return;
  }

  console.log(`🎙️  Conectando a: ${channel.name}...`);

  connection = joinVoiceChannel({
    channelId:     CHANNEL_ID,
    guildId:       GUILD_ID,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf:      true,   // bot con auriculares (no oye a nadie)
    selfMute:      true,   // bot silenciado (no emite audio)
  });

  // ── Reconexión automática si se cae ─────────────────────────────
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn('⚠️  Desconectado. Intentando reconectar...');
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling,   5_000),
        entersState(connection, VoiceConnectionStatus.Connecting,   5_000),
      ]);
      // La conexión se está recuperando sola
    } catch {
      // Forzar destrucción y reconectar desde cero
      connection.destroy();
      setTimeout(connectToVoice, 5_000);
    }
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log(`✅ Conectado y en el canal "${channel.name}" — permanecerá aquí.`);
  });

  connection.on('error', (err) => {
    console.error('❌ Error en la conexión de voz:', err.message);
  });
}

// ── Comandos de texto (prefijo !) ────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // !join  → entra al canal configurado
  if (message.content === '!join') {
    await connectToVoice();
    message.reply('✅ Conectado al canal de voz.');
  }

  // !leave → sale del canal
  if (message.content === '!leave') {
    const conn = getVoiceConnection(GUILD_ID);
    if (conn) {
      conn.destroy();
      connection = null;
      message.reply('👋 Desconectado del canal de voz.');
    } else {
      message.reply('No estoy en ningún canal de voz.');
    }
  }

  // !status → muestra el estado
  if (message.content === '!status') {
    const conn = getVoiceConnection(GUILD_ID);
    const estado = conn ? `🟢 Conectado (estado: ${conn.state.status})` : '🔴 Desconectado';
    message.reply(`Estado actual: ${estado}`);
  }
});

// ── Al iniciar el bot ─────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`🤖 Bot iniciado como: ${client.user.tag}`);
  await connectToVoice();

  // Ping cada 30 s para mantener la conexión viva
  setInterval(() => {
    const conn = getVoiceConnection(GUILD_ID);
    if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) {
      console.log('🔄 Sin conexión activa. Reconectando...');
      connectToVoice();
    }
  }, 30_000);
});

client.login(TOKEN);
