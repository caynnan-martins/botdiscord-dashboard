require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const path = require('path');

const app = express();

// Armazenamento em cache (in-memory cache)
const cache = {}; // Armazenamento em memória para guilds
const CACHE_EXPIRY_TIME = 60 * 60 * 1000; // 1 hora

// Configuração do Passport para Discord OAuth
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds'] // Adicionando o escopo guilds
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken; // Salvar o accessToken para usar nas requisições
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Middleware
app.use(session({ secret: 'secret', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Configuração do Handlebars
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Função para buscar guilds com retry e Exponential Backoff
async function fetchGuildsWithRetry(accessToken, retries = 5, delay = 1000) {
    try {
        const guildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return guildsResponse.data;
    } catch (error) {
        if (error.response && error.response.status === 429) {
            const retryAfter = error.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
            console.log(`Rate limit atingido. Esperando ${waitTime / 1000} segundos...`);

            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime)); // Espera o tempo indicado
                return fetchGuildsWithRetry(accessToken, retries - 1, waitTime * 2); // Tenta novamente com backoff exponencial
            } else {
                console.log("Número máximo de tentativas atingido.");
                throw new Error("Rate limit persistente.");
            }
        } else {
            console.error('Erro na requisição:', error);
            throw error;
        }
    }
}

// Função para obter guilds com cache
async function getGuilds(accessToken) {
    const cacheKey = `guilds-${accessToken}`;
    const cached = cache[cacheKey];

    if (cached && (Date.now() - cached.timestamp < CACHE_EXPIRY_TIME)) {
        console.log("Usando cache de guilds");
        return cached.data; // Retorna guilds do cache
    }

    console.log("Obtendo guilds da API");
    const guilds = await fetchGuildsWithRetry(accessToken); // Chama a função de retry
    cache[cacheKey] = {
        data: guilds,
        timestamp: Date.now()
    };
    return guilds;
}

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.render('index', {
            user: {
                username: req.user.username,
                avatarUrl: req.user.avatar && req.user.avatar.startsWith('a_')
                    ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.gif`
                    : `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
            }
        });
    } else {
        res.render('index');
    }
});

app.get('/server/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login'); // Redireciona para login se o usuário não estiver autenticado
    }

    const guildId = req.params.id; // ID da guilda passada na URL
    const accessToken = req.user.accessToken; // Token de acesso do usuário
    const ADMINISTRATOR = 0x00000008; // Permissão de administrador

    try {
        // Obtém as informações da guilda diretamente da API do Discord
        const guildResponse = await axios.get(`https://discord.com/api/v10/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Verifica se o usuário é administrador da guilda
        const guild = guildResponse.data.find(g => g.id === guildId);

        if (!guild || (guild.permissions & ADMINISTRATOR) !== ADMINISTRATOR) {
            return res.status(403).render('server.hbs', {
                guild: null,
                errorMessage: 'Você não possui permissões administrativas nesta guilda ou a guilda não existe.'
            });
        }

        // Renderiza a página do servidor com o ID e nome da guilda
        res.render('server.hbs', {
            guild: {
                id: guild.id,
                name: guild.name,
                iconUrl: guild.icon
                ? guild.icon.startsWith('a_') 
                    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.gif` 
                    : `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
                : null
            
            }
        });
    } catch (error) {
        console.error('Erro ao verificar permissões do usuário:', error);
        res.status(500).render('server.hbs', { guild: null, errorMessage: 'Erro ao verificar suas permissões. Tente novamente.' });
    }
});



// Rota de login com Discord
app.get('/login', (req, res) => {
    res.redirect(`https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_CALLBACK_URL)}&response_type=code&scope=identify guilds`);
});

// Rota de callback após autenticação
app.get(
    '/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    async (req, res) => {
        try {
            const accessToken = req.user.accessToken;

            // Obtém guilds diretamente da API do Discord
            const guildResponse = await axios.get(
                'https://discord.com/api/v10/users/@me/guilds',
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );

            const guilds = guildResponse.data;

            const ADMINISTRATOR = 0x00000008;

            // Filtra guilds onde o usuário tem permissão de administrador
            const adminGuilds = guilds.filter(
                (guild) => (guild.permissions & ADMINISTRATOR) === ADMINISTRATOR
            );

            // Salva as guilds no objeto `req.session` para exibir no dashboard
            req.session.adminGuilds = adminGuilds;

            // Redireciona para o dashboard
            res.redirect('/');
        } catch (error) {
            console.error('Erro ao obter as guilds no callback:', error);
            res.redirect('/'); // Redireciona para a página inicial em caso de erro
        }
    }
);


// Página de dashboard do usuário (exibe nome, avatar e guilds administradas)
app.get('/dashboard', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }

    const accessToken = req.user.accessToken;
    const ADMINISTRATOR = 0x00000008;

    try {
        // Obtém guilds do usuário diretamente da API
        const guildResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Filtra as guilds onde o usuário é administrador
        const adminGuilds = guildResponse.data.filter(guild => (guild.permissions & ADMINISTRATOR) === ADMINISTRATOR);

        // Renderiza o dashboard com guilds atualizadas
        res.render('dashboard', {
            user: req.user,
            avatarUrl: req.user.avatar && req.user.avatar.startsWith('a_')
                    ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.gif`
                    : `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`,
            adminGuilds
        });
    } catch (error) {
        console.error('Erro ao atualizar guilds:', error);
        res.status(500).render('dashboard', {
            user: req.user,
            adminGuilds: [],
            errorMessage: 'Erro ao carregar as guilds. Tente novamente mais tarde.'
        });
    }
});


// Inicia o servidor
app.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
