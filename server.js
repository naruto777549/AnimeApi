const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public')); // Frontend files

let animeDB = { trending: [], popular: [], newReleases: [] };

// Auto update every 6 hours
setInterval(autoUpdate, 6 * 60 * 60 * 1000);
autoUpdate();

async function autoUpdate() {
    try {
        const [trending, popular, seasonal] = await Promise.all([
            axios.get('https://api.jikan.moe/v4/top/anime?limit=25'),
            axios.get('https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=25'),
            axios.get('https://api.jikan.moe/v4/seasons/now?limit=25')
        ]);
        
        const format = a => ({
            id: a.mal_id,
            title: a.title,
            image: a.images.jpg.large_image_url,
            score: a.score,
            episodes: a.episodes
        });
        
        animeDB.trending = trending.data.data.map(format);
        animeDB.popular = popular.data.data.map(format);
        animeDB.newReleases = seasonal.data.data.map(format);
        
        console.log('✅ Updated:', animeDB.trending.length, 'anime');
    } catch (e) {
        console.error('Update failed:', e.message);
    }
}

// ============ ROUTES ============

// Home page
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// Auto home data
app.get('/api/home', (req, res) => {
    res.json(animeDB);
});

// Auto search
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const response = await axios.get(
            `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=30`
        );
        const results = response.data.data.map(a => ({
            id: a.mal_id,
            title: a.title,
            image: a.images.jpg.large_image_url,
            score: a.score,
            episodes: a.episodes,
            synopsis: a.synopsis?.substring(0, 200)
        }));
        res.json({ success: true, results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Auto episodes
app.get('/api/episodes/:animeId', async (req, res) => {
    try {
        const { animeId } = req.params;
        const searchUrl = `https://anitaku.pe/search.html?keyword=${animeId}`;
        const response = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const $ = cheerio.load(response.data);
        let animeLink = $('.items li .name a').first().attr('href');
        
        if (!animeLink) return res.status(404).json({ error: 'Not found' });
        
        const epResponse = await axios.get(`https://anitaku.pe${animeLink}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const $$ = cheerio.load(epResponse.data);
        const episodes = [];
        
        $$('#episode_page li a').each((i, el) => {
            episodes.push({
                number: parseInt($$(el).text()),
                id: $$(el).attr('href')
            });
        });
        
        res.json({ success: true, episodes: episodes.reverse() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Auto stream
app.get('/api/stream/:episodeId', async (req, res) => {
    try {
        const { episodeId } = req.params;
        const response = await axios.get(`https://anitaku.pe/${episodeId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const $ = cheerio.load(response.data);
        const servers = [];
        
        $('.anime_muti_link ul li a').each((i, el) => {
            const url = $(el).attr('data-video');
            if (url) servers.push({ name: $(el).text().trim(), url });
        });
        
        res.json({ success: true, servers });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
