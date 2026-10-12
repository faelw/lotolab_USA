const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// 1. AS 8 LOTERIAS COM OS IDs REAIS E ATUALIZADOS DO GOVERNO
const lotteries = [
    { id: 'mega_millions', name: 'Mega Millions', url: 'https://data.ny.gov/resource/5xaw-6ayf.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'powerball', name: 'Powerball', url: 'https://data.ny.gov/resource/d6yy-54nr.json?$limit=100&$order=draw_date%20DESC' },
    // ATUALIZADO: Cash4Life substituído por Millionaire for Life
    { id: 'millionaire_for_life', name: 'Millionaire for Life', url: 'https://data.ny.gov/resource/kwxv-fwze.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'take5', name: 'Take 5', url: 'https://data.ny.gov/resource/dg63-4siq.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'ny_lotto', name: 'NY Lotto', url: 'https://data.ny.gov/resource/6nbc-h7bj.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'pick_10', name: 'Pick 10', url: 'https://data.ny.gov/resource/bycu-cw7c.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'numbers', name: 'Numbers', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'win_4', name: 'Win 4', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=100&$order=draw_date%20DESC' }
];

const delay = ms => new Promise(res => setTimeout(res, ms));

// HEADERS REFORÇADOS
const scrapHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

// 2. MOTOR DE JACKPOTS CORRIGIDO
async function fetchJackpot(id) {
    try {
        // ATUALIZADO: Novo prémio fixo para Millionaire for Life
        if (id === 'millionaire_for_life') return '$1M/Year for Life';
        
        if (id === 'pick_10') return '$500,000';
        if (id === 'numbers') return '$500 Max';
        if (id === 'win_4') return '$5,000 Max';
        if (id === 'take5') return 'Pari-Mutuel';

        if (id === 'mega_millions') {
            const { data } = await axios.get('https://www.megamillions.com/', { headers: scrapHeaders, timeout: 10000 });
            return cheerio.load(data)('.home-next-drawing-est-jackpot').text().trim() || 'TBA';
        }
        
        if (id === 'powerball') {
            const { data } = await axios.get('https://powerball.com/api/v1/estimates/powerball?_format=json', { headers: scrapHeaders, timeout: 10000 });
            
            if (Array.isArray(data) && data.length > 0 && data[0].annuity_expected) {
                return data[0].annuity_expected;
            } else if (data && !Array.isArray(data) && data.annuity_expected) {
                return data.annuity_expected;
            }
            return 'TBA';
        }

        if (id === 'ny_lotto') {
            const { data } = await axios.get('https://nylottery.ny.gov/draw-games/new-york-lotto', { headers: scrapHeaders, timeout: 10000 });
            return cheerio.load(data)('.game-top-prize').text().trim() || 'TBA'; 
        }

        return 'N/A';
    } catch (e) {
        console.log(`[!] Aviso: Falha na extração de ${id} (Erro de rede ou Cloudflare). Retornando TBA.`);
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
        // ATUALIZADO: Extração da bola extra mapeada para o novo ID
        else if (id === 'millionaire_for_life') extra = draw.cash_ball || null;
        else if (id === 'ny_lotto') extra = draw.bonus_num || null;
    }

    return { nums, extra };
}

// 4. EXECUÇÃO PRINCIPAL
async function main() {
    console.log("🚀 LIGANDO MOTOR LOTOLAB EUA (8 LOTERIAS)...");
    const dataDir = path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    // --- LER ARQUIVO ANTIGO COMO BACKUP ---
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
        console.log("💾 Histórico anterior carregado para backup de segurança.");
    } catch (e) {
        console.log("📝 Nenhum histórico anterior encontrado (ou arquivo vazio).");
    }

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
                
                // --- A MÁGICA DE RECUPERAÇÃO CORRIGIDA ---
                if (isInvalidJackpot(jackpot) && oldData[lotto.id] && !isInvalidJackpot(oldData[lotto.id])) {
                    console.log(`🛡️ Scrap falhou ou retornou '${jackpot}'. Restaurando jackpot anterior: ${oldData[lotto.id]}`);
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
                
                console.log(`✅ ${lotto.name} Salvo! (Sorteio: ${nums.join('-')} | Jackpot Final: ${jackpot})`);
            } else {
                console.log(`⚠️ ${lotto.name} não retornou dados.`);
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

    console.log("\n🏁 ARQUIVOS GERADOS! TODAS AS 8 LOTERIAS CARREGADAS E PROTEGIDAS.");
}

main();
