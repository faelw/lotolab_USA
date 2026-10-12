const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// 1. AS 8 LOTERIAS COM OS IDs REAIS E ATUALIZADOS DO GOVERNO
const lotteries = [
    { id: 'mega_millions', name: 'Mega Millions', url: 'https://data.ny.gov/resource/5xaw-6ayf.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'powerball', name: 'Powerball', url: 'https://data.ny.gov/resource/d6yy-54nr.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'millionaire_for_life', name: 'Millionaire for Life', url: 'https://data.ny.gov/resource/kwxv-fwze.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'take5', name: 'Take 5', url: 'https://data.ny.gov/resource/dg63-4siq.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'ny_lotto', name: 'NY Lotto', url: 'https://data.ny.gov/resource/6nbc-h7bj.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'pick_10', name: 'Pick 10', url: 'https://data.ny.gov/resource/bycu-cw7c.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'numbers', name: 'Numbers', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'win_4', name: 'Win 4', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=100&$order=draw_date%20DESC' }
];

const delay = ms => new Promise(res => setTimeout(res, ms));

const scrapHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/json,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache'
};

// --- ROTAÇÃO DE PROXIES PARA FURAR O CLOUDFLARE ---
async function fetchWithRetry(url, isJson = false) {
    const routes = [
        { name: "Direto", url: url },
        { name: "Codetabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
        { name: "AllOrigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` }
    ];

    for (const route of routes) {
        try {
            console.log(`      ↳ Tentando via ${route.name}...`);
            const { data } = await axios.get(route.url, { headers: scrapHeaders, timeout: 10000 });
            
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            
            if (dataStr.includes('Just a moment...') || dataStr.includes('cf-browser-verification')) {
                throw new Error("Bloqueio Cloudflare detectado");
            }
            
            return (typeof data === 'string' && isJson) ? JSON.parse(data) : data;
        } catch (e) {
            console.log(`      ⚠️ Falha na rota ${route.name}.`);
        }
    }
    throw new Error("Todas as rotas de acesso falharam.");
}

// 2. MOTOR DE JACKPOTS BLINDADO
async function fetchJackpot(id) {
    try {
        if (id === 'millionaire_for_life') return '$1M/Year for Life';
        if (id === 'pick_10') return '$500,000';
        if (id === 'numbers') return '$500 Max';
        if (id === 'win_4') return '$5,000 Max';
        if (id === 'take5') return 'Pari-Mutuel';

        if (id === 'mega_millions') {
            const html = await fetchWithRetry('https://www.megamillions.com/', false);
            const $ = cheerio.load(html);
            let val = $('.home-next-drawing-est-jackpot').text().trim() \vert{}\vert{}$('.est-jackpot').text().trim();
            
            if (!val) {
                const match = html.match(/\$([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(Million|Billion)/i);
                if (match) val = `$${match[1]} ${match[2]}`;
            }
            return val || 'TBA';
        }
        
        if (id === 'powerball') {
            try {
                const data = await fetchWithRetry('https://powerball.com/api/v1/estimates/powerball?_format=json', true);
                if (Array.isArray(data) && data.length > 0 && data[0].annuity_expected) return data[0].annuity_expected;
                if (data && !Array.isArray(data) && data.annuity_expected) return data.annuity_expected;
            } catch (e) {
                console.log(`      ↳ API falhou, raspando HTML da Powerball...`);
                const html = await fetchWithRetry('https://powerball.com/', false);
                const $ = cheerio.load(html);
                const val = $('.game-jackpot-number').text().trim() \vert{}\vert{}$('.jackpot-amount').text().trim();
                if (val) return val;
            }
            return 'TBA';
        }

        if (id === 'ny_lotto') {
            const html = await fetchWithRetry('https://nylottery.ny.gov/draw-games/new-york-lotto', false);
            const $ = cheerio.load(html);
            let val = $('.game-top-prize').text().trim() \vert{}\vert{}$('.prize-amount').text().trim();
            return val || 'TBA'; 
        }

        return 'N/A';
    } catch (e) {
        console.log(`[!] Esgotadas todas as tentativas para ${id}.`);
        return 'TBA';
    }
}

// 3. O TRADUTOR UNIVERSAL
function parseDraw(draw, id) {
    let nums = [];
    let extra = null;

    if (id === 'numbers') {
        nums = (draw.evening_daily || "").toString().trim().split('');
    } 
    else if (id === 'win_4') {
        nums = (draw.evening_win_4 || "").toString().trim().split('');
    } 
    else if (id === 'take5') {
        nums = (draw.evening_winning_numbers || draw.winning_numbers || "").toString().trim().split(/\s+/);
    } 
    else if (id === 'powerball') {
        let raw = (draw.winning_numbers || "").toString().trim().split(/\s+/);
        if (raw.length === 6) {
            extra = raw.pop(); 
        }
        nums = raw;
    } 
    else {
        nums = (draw.winning_numbers || "").toString().trim().split(/\s+/);
        if (id === 'mega_millions') extra = draw.mega_ball || null;
        else if (id === 'millionaire_for_life') extra = draw.cash_ball || null;
        else if (id === 'ny_lotto') extra = draw.bonus_num || null;
    }

    return { nums, extra };
}

// 4. EXECUÇÃO PRINCIPAL
async function main() {
    console.log("🚀 LIGANDO MOTOR LOTOLAB EUA (VERSÃO BLINDADA/MULTI-PROXY)...");
    const dataDir = path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    let oldData = {};
    const latestAllPath = path.join(dataDir, 'latest_all.json');
    try {
        const oldFile = await fs.readFile(latestAllPath, 'utf8');
        const parsed = JSON.parse(oldFile);
        if (parsed && parsed.games) {
            parsed.games.forEach(game => {
                oldData[game.id] = game.jackpot;
            });
        }
    } catch (e) {}

    const latestAll = [];

    const isInvalidJackpot = (val) => {
        if (!val || val.trim() === '') return true;
        const lower = val.toLowerCase();
        return lower.includes('tba') || lower.includes('tbd') || lower.includes('pending') || lower.includes('rolling') || lower.includes('check');
    };

    for (const lotto of lotteries) {
        try {
            console.log(`\n📡 Processando: ${lotto.name}...`);
            const res = await axios.get(lotto.url, { timeout: 15000 });
            const history = res.data;

            if (history && history.length > 0) {
                const lottoDir = path.join(dataDir, lotto.id);
                await fs.mkdir(lottoDir, { recursive: true });
                await fs.writeFile(path.join(lottoDir, 'history.json'), JSON.stringify(history, null, 2));

                const last = history[0];
                let jackpot = await fetchJackpot(lotto.id);
                
                if (isInvalidJackpot(jackpot) && oldData[lotto.id] && !isInvalidJackpot(oldData[lotto.id])) {
                    console.log(`🛡️  Usando jackpot do backup: ${oldData[lotto.id]}`);
                    jackpot = oldData[lotto.id]; 
                }
                
                const { nums, extra } = parseDraw(last, lotto.id);

                latestAll.push({
                    id: lotto.id,
                    name: lotto.name,
                    date: last.draw_date,
                    numbers: nums,
                    extra: extra,
                    jackpot: jackpot
                });
                
                console.log(`✅ ${lotto.name} concluído! (Jackpot: ${jackpot})`);
            }
            
            await delay(2000);
            
        } catch (err) { 
            console.error(`❌ Erro em ${lotto.name}: ${err.message}`); 
        }
    }

    await fs.writeFile(latestAllPath, JSON.stringify({
        updated_at: new Date().toISOString(),
        games: latestAll
    }, null, 2));

    console.log("\n🏁 ARQUIVOS GERADOS E ATUALIZADOS!");
}

main();
