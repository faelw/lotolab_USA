const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// 1. Array com TODAS as loterias (Insira as que você fez no braço aqui)
const lotteries = [
    { id: 'mega_millions', name: 'Mega Millions', url: 'https://data.ny.gov/resource/5xaw-6ayf.json?$limit=100&$order=draw_date%20DESC', hasExtra: true },
    { id: 'powerball', name: 'Powerball', url: 'https://data.ny.gov/resource/d6yy-54nc.json?$limit=100&$order=draw_date%20DESC', hasExtra: true },
    { id: 'cash4life', name: 'Cash4Life', url: 'https://data.ny.gov/resource/kwxv-fwze.json?$limit=100&$order=draw_date%20DESC', hasExtra: true },
    { id: 'take5', name: 'Take 5', url: 'https://data.ny.gov/resource/dg63-4pii.json?$limit=100&$order=draw_date%20DESC', hasExtra: false },
    { id: 'ny_lotto', name: 'NY Lotto', url: 'https://data.ny.gov/resource/hw7w-k72r.json?$limit=100&$order=draw_date%20DESC', hasExtra: true },
    { id: 'pick_10', name: 'Pick 10', url: 'https://data.ny.gov/resource/bycu-cwia.json?$limit=100&$order=draw_date%20DESC', hasExtra: false },
    { id: 'numbers', name: 'Numbers', url: 'https://data.ny.gov/resource/bkwf-t8pd.json?$limit=100&$order=draw_date%20DESC', hasExtra: false },
    { id: 'win_4', name: 'Win 4', url: 'https://data.ny.gov/resource/hsyz-q6bt.json?$limit=100&$order=draw_date%20DESC', hasExtra: false }
    // Exemplo para colar as suas: { id: 'lotto_america', name: 'Lotto America', url: 'SUA_URL_AQUI', hasExtra: true }
];

// 2. Delay para não tomar bloqueio dos servidores do governo
const delay = ms => new Promise(res => setTimeout(res, ms));

// 3. Raspador de Jackpots (Scraping + Fixos)
async function fetchJackpot(id) {
    try {
        if (id === 'mega_millions') {
            const { data } = await axios.get('https://www.megamillions.com/', { timeout: 8000 });
            const $ = cheerio.load(data);
            return $('.home-next-drawing-est-jackpot').text().trim() || 'TBA';
        }
        if (id === 'powerball') {
            const { data } = await axios.get('https://www.powerball.com/', { timeout: 8000 });
            const $ = cheerio.load(data);
            return $('.jackpot-amount').first().text().trim() || 'TBA';
        }
        if (id === 'ny_lotto') {
            const { data } = await axios.get('https://nylottery.ny.gov/draw-games/new-york-lotto', { timeout: 8000 });
            const $ = cheerio.load(data);
            return $('.game-top-prize').text().trim() || 'Rolling'; 
        }

        // Prêmios Fixos ou Dinâmicos
        if (id === 'cash4life') return '$1,000/Day';
        if (id === 'pick_10') return '$500,000';
        if (id === 'numbers') return '$500 Max';
        if (id === 'win_4') return '$5,000 Max';
        if (id === 'take5') return 'Pari-Mutuel';
        if (id === 'lucky_for_life') return '$1,000/Day';

        return 'N/A';
    } catch (e) { 
        return 'Check App'; 
    }
}

// 4. Limpeza de Números
function parseNumbers(raw) {
    if (!raw) return [];
    return raw.toString().trim().split(/\s+/);
}

// 5. Motor de Extração
async function main() {
    console.log("🚀 LIGANDO MOTOR LOTOLAB EUA...");
    const dataDir = path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const latestAll = [];

    for (const lotto of lotteries) {
        try {
            console.log(`📡 Processando: ${lotto.name}...`);
            const res = await axios.get(lotto.url, { timeout: 10000 });
            const history = res.data;

            if (history && history.length > 0) {
                // Pasta do Jogo
                const lottoDir = path.join(dataDir, lotto.id);
                await fs.mkdir(lottoDir, { recursive: true });
                await fs.writeFile(path.join(lottoDir, 'history.json'), JSON.stringify(history, null, 2));

                // Montando o Card Principal
                const last = history[0];
                const jackpot = await fetchJackpot(lotto.id);

                latestAll.push({
                    id: lotto.id,
                    name: lotto.name,
                    date: last.draw_date,
                    numbers: parseNumbers(last.winning_numbers),
                    extra: lotto.hasExtra ? (last.mega_ball || last.multiplier || last.cash_ball || last.bonus_num || null) : null,
                    jackpot: jackpot
                });
                
                console.log(`✅ ${lotto.name} Salvo! (Jackpot: ${jackpot})`);
            }
            
            // Pausa de 1.5 segundos antes de puxar a próxima loteria
            await delay(1500); 

        } catch (err) { 
            console.error(`❌ Erro em ${lotto.name}: Pulo automático. Motivo: ${err.message}`); 
        }
    }

    // Gerando o arquivo para o app em Dart ler
    await fs.writeFile(path.join(dataDir, 'latest_all.json'), JSON.stringify({
        updated_at: new Date().toISOString(),
        games: latestAll
    }, null, 2));

    console.log("🏁 TODOS OS ARQUIVOS GERADOS! LOTOLAB PRONTO PARA PLUGAR.");
}

main();
