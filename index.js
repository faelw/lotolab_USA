const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// 1. AS 8 LOTERIAS COM OS IDs REAIS E ATUALIZADOS DO GOVERNO (2026)
const lotteries = [
    { id: 'mega_millions', name: 'Mega Millions', url: 'https://data.ny.gov/resource/5xaw-6ayf.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'powerball', name: 'Powerball', url: 'https://data.ny.gov/resource/d6yy-54nr.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'cash4life', name: 'Cash4Life', url: 'https://data.ny.gov/resource/kwxv-fwze.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'take5', name: 'Take 5', url: 'https://data.ny.gov/resource/dg63-4siq.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'ny_lotto', name: 'NY Lotto', url: 'https://data.ny.gov/resource/6nbc-h7bj.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'pick_10', name: 'Pick 10', url: 'https://data.ny.gov/resource/bycu-cw7c.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'numbers', name: 'Numbers', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=100&$order=draw_date%20DESC' },
    { id: 'win_4', name: 'Win 4', url: 'https://data.ny.gov/resource/hsys-3def.json?$limit=100&$order=draw_date%20DESC' }
];

const delay = ms => new Promise(res => setTimeout(res, ms));

// 2. MOTOR DE JACKPOTS
async function fetchJackpot(id) {
    try {
        if (id === 'mega_millions') {
            const { data } = await axios.get('https://www.megamillions.com/', { timeout: 8000 });
            return cheerio.load(data)('.home-next-drawing-est-jackpot').text().trim() || 'TBA';
        }
        if (id === 'powerball') {
            const { data } = await axios.get('https://www.powerball.com/', { timeout: 8000 });
            return cheerio.load(data)('.jackpot-amount').first().text().trim() || 'TBA';
        }
        if (id === 'ny_lotto') {
            const { data } = await axios.get('https://nylottery.ny.gov/draw-games/new-york-lotto', { timeout: 8000 });
            return cheerio.load(data)('.game-top-prize').text().trim() || 'Rolling'; 
        }

        if (id === 'cash4life') return '$1,000/Day';
        if (id === 'pick_10') return '$500,000';
        if (id === 'numbers') return '$500 Max';
        if (id === 'win_4') return '$5,000 Max';
        if (id === 'take5') return 'Pari-Mutuel';

        return 'N/A';
    } catch (e) { return 'TBA'; }
}

// 3. O TRADUTOR UNIVERSAL (Resolve as pegadinhas da API de Nova York)
function parseDraw(draw, id) {
    let nums = [];
    let extra = null;

    if (id === 'numbers') {
        // Numbers manda tudo colado (ex: "797")
        nums = (draw.evening_daily || "").toString().trim().split('');
    } 
    else if (id === 'win_4') {
        // Win 4 manda tudo colado (ex: "6850")
        nums = (draw.evening_win_4 || "").toString().trim().split('');
    } 
    else if (id === 'take5') {
        // Take 5 mudou o nome da coluna para evening
        nums = (draw.evening_winning_numbers || draw.winning_numbers || "").toString().trim().split(/\s+/);
    } 
    else if (id === 'powerball') {
        // Powerball esconde a bola vermelha no final da lista das bolas brancas
        let raw = (draw.winning_numbers || "").toString().trim().split(/\s+/);
        if (raw.length === 6) {
            extra = raw.pop(); // Remove a última bola e define como a bola extra
        }
        nums = raw;
    } 
    else {
        // Padrão normal para Mega, Cash4Life, Pick 10 e NY Lotto
        nums = (draw.winning_numbers || "").toString().trim().split(/\s+/);
        if (id === 'mega_millions') extra = draw.mega_ball || null;
        else if (id === 'cash4life') extra = draw.cash_ball || null;
        else if (id === 'ny_lotto') extra = draw.bonus_num || null;
    }

    return { nums, extra };
}

// 4. EXECUÇÃO PRINCIPAL
async function main() {
    console.log("🚀 LIGANDO MOTOR LOTOLAB EUA (8 LOTERIAS)...");
    const dataDir = path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const latestAll = [];

    for (const lotto of lotteries) {
        try {
            console.log(`📡 Processando: ${lotto.name}...`);
            const res = await axios.get(lotto.url, { timeout: 10000 });
            const history = res.data;

            if (history && history.length > 0) {
                const lottoDir = path.join(dataDir, lotto.id);
                await fs.mkdir(lottoDir, { recursive: true });
                await fs.writeFile(path.join(lottoDir, 'history.json'), JSON.stringify(history, null, 2));

                const last = history[0];
                const jackpot = await fetchJackpot(lotto.id);
                
                // Usa o nosso tradutor para limpar os números
                const { nums, extra } = parseDraw(last, lotto.id);

                latestAll.push({
                    id: lotto.id,
                    name: lotto.name,
                    date: last.draw_date,
                    numbers: nums,
                    extra: extra,
                    jackpot: jackpot
                });
                
                console.log(`✅ ${lotto.name} Salvo! (Sorteio: ${nums.join('-')} | Jackpot: ${jackpot})`);
            } else {
                console.log(`⚠️ ${lotto.name} não retornou dados.`);
            }
            
            await delay(1500); 
            
        } catch (err) { 
            console.error(`❌ Erro em ${lotto.name}: ${err.message}`); 
        }
    }

    await fs.writeFile(path.join(dataDir, 'latest_all.json'), JSON.stringify({
        updated_at: new Date().toISOString(),
        games: latestAll
    }, null, 2));

    console.log("🏁 ARQUIVOS GERADOS! TODAS AS 8 LOTERIAS CARREGADAS.");
}

main();
