const tableBody = document.querySelector('#crypto-table tbody');
let previousPrices = {};
let binanceSymbols = [];
let allCryptos = [];
let nonBinanceCryptos = [];

const COINGECKO_BATCH_SIZE = 50; // batch per aggiornamento CoinGecko
const COINGECKO_UPDATE_INTERVAL = 3000; // 3 secondi

// Lista stablecoin e meme coin da escludere
const excludedCoins = [
    "tether","usd coin","binance usd","dai","terrausd","frax","usdd",
    "dogecoin","shiba inu","pepecoin","floki inu","dogelon","safemoon"
];

// Fetch multipagina prime 1000 crypto da CoinGecko
async function fetchAllCryptos() {
    let results = [];
    try {
        for(let page=1; page<=2; page++){ // 500 crypto per pagina
            const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=500&page=${page}&sparkline=false`);
            const data = await res.json();
            results = results.concat(data);
        }
        // Filtra stablecoin e memecoin
        results = results.filter(coin => !excludedCoins.includes(coin.id));
        return results;
    } catch(err){
        console.error("Errore fetch CoinGecko:", err);
        return [];
    }
}

// Recupera simboli Binance USDT
async function fetchBinanceSymbols() {
    try {
        const exchangeInfo = await fetch('https://api.binance.com/api/v3/exchangeInfo').then(r=>r.json());
        return exchangeInfo.symbols.map(s=>s.symbol);
    } catch(err){
        console.error("Errore Binance exchangeInfo:", err);
        return [];
    }
}

// Crea la tabella
async function createCryptoTable() {
    allCryptos = await fetchAllCryptos();
    const validBinanceSymbols = await fetchBinanceSymbols();

    tableBody.innerHTML = '';
    binanceSymbols = [];
    nonBinanceCryptos = [];

    allCryptos.forEach(coin => {
        const row = document.createElement('tr');
        row.dataset.symbol = coin.symbol.toLowerCase();
        row.dataset.name = coin.name.toLowerCase();

        row.innerHTML = `
            <td class="logo-name-cell">
                <img src="${coin.image}" alt="${coin.name}" width="24">
                <span><strong>${coin.symbol.toUpperCase()}</strong> - ${coin.name}</span>
            </td>
            <td class="price-cell">$${coin.current_price.toLocaleString()}</td>
            <td class="change-cell">
                <span class="arrow">${coin.price_change_percentage_24h >= 0 ? '▲' : '▼'}</span>
                ${coin.price_change_percentage_24h?.toFixed(2) ?? 0}%
            </td>
        `;

        tableBody.appendChild(row);
        previousPrices[coin.symbol.toUpperCase()+'USDT'] = coin.current_price;

        const binSymbol = coin.symbol.toUpperCase()+'USDT';
        if(validBinanceSymbols.includes(binSymbol)){
            binanceSymbols.push(binSymbol);
        } else {
            nonBinanceCryptos.push(coin);
        }
    });

    if(binanceSymbols.length) connectWebSocket(binanceSymbols);
    startNonBinanceUpdates();
}

// WebSocket Binance
function connectWebSocket(symbols) {
    if(symbols.length === 0) return;
    const chunkSize = 100;

    for (let i = 0; i < symbols.length; i += chunkSize) {
        const chunk = symbols.slice(i, i + chunkSize);
        const streams = chunk.map(s => s.toLowerCase() + '@ticker').join('/');
        const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            const data = message.data;
            const symbol = data.s;

            const row = [...tableBody.querySelectorAll('tr')]
                .find(r => r.dataset.symbol === symbol.replace('USDT','').toLowerCase());
            if(!row) return;

            const priceCell = row.querySelector('.price-cell');
            const changeCell = row.querySelector('.change-cell');

            const prevPrice = previousPrices[symbol] || 0;
            const newPrice = parseFloat(data.c);
            const changePercent = parseFloat(data.P);

            updateRow(priceCell, changeCell, prevPrice, newPrice, changePercent);

            previousPrices[symbol] = newPrice;
        };
    }
}

// Aggiorna riga (freccia + prezzo)
function updateRow(priceCell, changeCell, prevPrice, newPrice, changePercent){
    priceCell.textContent = `$${newPrice.toLocaleString()}`;
    priceCell.classList.remove('price-up','price-down');
    if(prevPrice){
        if(newPrice > prevPrice) priceCell.classList.add('price-up');
        else if(newPrice < prevPrice) priceCell.classList.add('price-down');
    }

    let arrow = changeCell.querySelector('.arrow');
    if(!arrow){
        arrow = document.createElement('span');
        arrow.classList.add('arrow');
        changeCell.prepend(arrow);
    }

    arrow.classList.remove('up','down','animate');
    if(changePercent >= 0){
        arrow.textContent = '▲';
        arrow.classList.add('up','animate');
    } else {
        arrow.textContent = '▼';
        arrow.classList.add('down','animate');
    }

    changeCell.innerHTML = `${changePercent.toFixed(2)}%`;
    changeCell.prepend(arrow);

    setTimeout(() => arrow.classList.remove('animate'), 300);
}

// Aggiornamento ottimizzato batch per crypto NON Binance
function startNonBinanceUpdates(){
    let batchIndex = 0;
    const totalBatches = Math.ceil(nonBinanceCryptos.length / COINGECKO_BATCH_SIZE);

    setInterval(async () => {
        if(nonBinanceCryptos.length === 0) return;

        const batch = nonBinanceCryptos.slice(batchIndex * COINGECKO_BATCH_SIZE, (batchIndex+1) * COINGECKO_BATCH_SIZE);
        const ids = batch.map(c => c.id).join(',');

        try {
            const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`);
            const data = await res.json();

            data.forEach(coin => {
                const row = [...tableBody.querySelectorAll('tr')]
                    .find(r => r.dataset.symbol === coin.symbol.toLowerCase());
                if(!row) return;

                const priceCell = row.querySelector('.price-cell');
                const changeCell = row.querySelector('.change-cell');
                const prevPrice = previousPrices[coin.symbol.toUpperCase()+'USDT'] || coin.current_price;

                updateRow(priceCell, changeCell, prevPrice, coin.current_price, coin.price_change_percentage_24h);
                previousPrices[coin.symbol.toUpperCase()+'USDT'] = coin.current_price;
            });
        } catch(err){
            console.error("Errore update batch non Binance:", err);
        }

        batchIndex = (batchIndex + 1) % totalBatches;
    }, COINGECKO_UPDATE_INTERVAL);
}

// Avvio tabella
createCryptoTable();

// SEARCH BAR
const searchInput = document.getElementById('crypto-search');
searchInput.addEventListener('input', () => {
    const filter = searchInput.value.toLowerCase();
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const symbol = row.dataset.symbol;
        const name = row.dataset.name;
        row.style.display = (symbol.includes(filter) || name.includes(filter)) ? '' : 'none';
    });
});
