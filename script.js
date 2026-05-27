const TYPE_COLORS = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c',
    grass: '#7ac74c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1',
    ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746',
    steel: '#b7b7ce', fairy: '#d685ad', unknown: '#787878'
};

const CURRENT_LANGUAGE = 'en';

const API_GENDER = 'https://pokeapi.co/api/v2/gender/'

// Local caching layer to reduce API requests, optimized to store only necessary fields
const PokeCache = {
    basePrefix: 'pokeapi_cache_',
    version: 'v2.4',
    timeToStale: 24 * 60 * 60 * 1000, // 24 hours

    get prefix() {
        return this.basePrefix + this.version + '_';
    },

    get(url) {
        try {
            const key = this.prefix + url;
            const cached = localStorage.getItem(key);
            if (cached) {
                const { data, cachedAt } = JSON.parse(cached);
                if (Date.now() - cachedAt > this.timeToStale) {
                    localStorage.removeItem(key);
                    return null;
                } else {
                    return data;
                }
            }
        } catch (e) {
            console.warn('Cache read error', e);
        }

        return null;
    },
    set(url, data) {
        const item = { data, cachedAt: Date.now() };

        try {
            localStorage.setItem(this.prefix + url, JSON.stringify(item));
        } catch (e) {
            console.warn('Cache full or quota exceeded');
            this.clearOld();
            try {
                localStorage.setItem(this.prefix + url, JSON.stringify(item));
            }
            catch (e2) {
                console.error('Cache still full after clearing');
            }
        }
    },
    clearOld() {
        console.log("[CACHE] Clearing old cache data.")

        // Remove every cache entry from older versions
        Object.keys(localStorage).forEach(key => {
            if (
                key.startsWith(this.basePrefix) &&
                !key.startsWith(this.prefix)
            ) {
                localStorage.removeItem(key);
            }
        });

        const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
        // Remove half of oldest caches if quota hit
        keys.sort((a, b) => {
            const ta = JSON.parse(localStorage.getItem(a)).cachedAt;
            const tb = JSON.parse(localStorage.getItem(b)).cachedAt;
            return ta - tb;
        });
        const toRemove = keys.slice(0, Math.ceil(keys.length / 2));
        toRemove.forEach(k => localStorage.removeItem(k));
    },
    clear() {
        console.log("[CACHE] Clearing all cache data.")
        Object.keys(localStorage).filter(k => k.startsWith(this.prefix)).forEach(k => localStorage.removeItem(k));
    }
};

// Cached fetch wrapper
async function cachedFetch(url, stripFn) {
    const cached = PokeCache.get(url);

    if (cached) {
        console.log("Successfully retrieved cached object for " + url + " - " + getJsonSize(cached) + " KB");
        return cached;
    } else {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const toCache = stripFn ? stripFn(data) : data;
        PokeCache.set(url, toCache);
        console.log("Found no cache for " + url + " - Sucessfully updated the cache data for it. - " + getJsonSize(toCache) + " KB");
        return toCache;
    }
}

async function cachedFetchNameInCurrentLanguage(url) {
    return getCurrentLanguageName(await cachedFetch(url, stripToOnlyNames))
}

// Strip functions to minimize localStorage footprint
const stripPokemonList = (data) => data.results.map(r => ({ name: r.name, url: r.url }));

const stripSpecies = (data) => ({
    evolution_chain: data.evolution_chain,
    evolves_from_species: data.evolves_from_species,
    id: data.id,
    name: data.name,
    names: data.names,
    varieties: data.varieties
});

const stripPokemon = (data) => ({
    forms: data.forms,
    id: data.id,
    name: data.name,
    sprite: data.sprites.other['official-artwork']?.front_default || data.sprites.front_default,
    types: data.types,
    species: data.species
});

const stripForm = (data) => ({
    form_name: data.form_name,
    form_names: data.form_names,
    id: data.id,
    is_battle_only: data.is_battle_only,
    is_default: data.is_default,
    is_mega: data.is_mega,
    name: data.name,
    names: data.names,
    pokemon: data.pokemon,
    types: data.types
})

function stripEvolutionTrigger(data) {
    return {
        id: data.id,
        name: data.name,
        names: data.names
    }
}

function stripLocation(data) {
    return {
        id: data.id,
        name: data.name,
        names: data.names,
        region: data.region
    }
}

function stripRegion(data) {
    return {
        id: data.id,
        name: data.name,
        names: data.names,
        main_generation: data.main_generation
    }
}

function stripToOnlyNames(data) {
    return {
        id: data.id,
        name: data.name,
        names: data.names
    }
}

let allPokemonNames = [];
let searchTimeout = null;
let activeSuggestionIndex = -1;
let autocompleteEnabled = localStorage.getItem('pokechain_autocomplete') === 'true';

const searchInput = document.getElementById('searchInput');
const searchSpinner = document.getElementById('searchSpinner');
const suggestionsDiv = document.getElementById('suggestions');
const errorMsg = document.getElementById('errorMsg');
const resultsDiv = document.getElementById('results');
const autocompleteToggle = document.getElementById('autocompleteToggle');

autocompleteToggle.checked = autocompleteEnabled;
autocompleteToggle.addEventListener('change', () => {
    autocompleteEnabled = autocompleteToggle.checked;
    localStorage.setItem('pokechain_autocomplete', autocompleteEnabled);
    if (!autocompleteEnabled) {
        suggestionsDiv.classList.remove('visible');
        activeSuggestionIndex = -1;
    }
});

// Routing Helper (Hash-based for static servers)
function navigateTo(name) {
    const cleanName = name ? name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';

    window.location.hash = cleanName;
}

// Handle Route Change
function handleRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        searchInput.value = hash;
        searchPokemon(hash);
    } else {
        clearResults();
    }
}

// Listen for hash changes (Back/Forward buttons)
window.addEventListener('hashchange', handleRoute);

// Handle initial load
window.addEventListener('DOMContentLoaded', handleRoute);

function clearResults() {
    searchInput.value = '';
    resultsDiv.innerHTML = '';
    errorMsg.classList.remove('visible');
}

// Fetch all pokemon list for autocomplete
async function loadPokemonList() {
    try {
        const data = await cachedFetch('https://pokeapi.co/api/v2/pokemon?limit=1025', stripPokemonList);
        allPokemonNames = data.map(p => {
            const idMatch = p.url.match(/\/(\d+)\//);
            return {
                name: p.name,
                url: p.url,
                id: idMatch ? parseInt(idMatch[1]) : 0
            };
        });
    } catch (e) {
        console.warn('Failed to load pokemon list for autocomplete', e);
    }
}

loadPokemonList();

//PokeCache.clear();

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    clearTimeout(searchTimeout);
    if (val.length < 2 || allPokemonNames.length === 0 || !autocompleteEnabled) {
        suggestionsDiv.classList.remove('visible');
        return;
    }
    searchTimeout = setTimeout(() => {
        showSuggestions(val);
    }, 150);
});

searchInput.addEventListener('keydown', (e) => {
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!suggestionsDiv.classList.contains('visible')) return;
        activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
        updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!suggestionsDiv.classList.contains('visible')) return;
        activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
        updateActiveSuggestion(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const val = searchInput.value.trim().toLowerCase();
        if (val.length > 0) {
            suggestionsDiv.classList.remove('visible');
            if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
                navigateTo(items[activeSuggestionIndex].dataset.name);
            } else {
                navigateTo(val);
            }
            activeSuggestionIndex = -1;
        }
    } else if (e.key === 'Escape') {
        suggestionsDiv.classList.remove('visible');
        activeSuggestionIndex = -1;
    }
});

function updateActiveSuggestion(items) {
    items.forEach((item, i) => {
        item.classList.toggle('active', i === activeSuggestionIndex);
    });
}

function showSuggestions(query) {
    const matches = allPokemonNames
        .filter(p => p.name.includes(query))
        .slice(0, 8);

    if (matches.length === 0) {
        suggestionsDiv.classList.remove('visible');
        return;
    }

    suggestionsDiv.innerHTML = matches.map(p => `
                <div class="suggestion-item" data-name="${p.name}">
                    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="" loading="lazy">
                    <span class="suggestion-name">${p.name}</span>
                    <span class="suggestion-id">#${String(p.id).padStart(3, '0')}</span>
                </div>
            `).join('');

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            navigateTo(item.dataset.name);
            suggestionsDiv.classList.remove('visible');
        });
    });

    suggestionsDiv.classList.add('visible');
    activeSuggestionIndex = -1;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
        suggestionsDiv.classList.remove('visible');
        activeSuggestionIndex = -1;
    }

    if (e.target.classList.contains('pokemon-link')) {
        e.preventDefault();
        searchPokemon(e.target.dataset.name);
    }
});

async function searchPokemon(name) {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanName) return;

    if (searchInput.value !== cleanName) {
        searchInput.value = cleanName;
    }

    suggestionsDiv.classList.remove('visible');
    activeSuggestionIndex = -1;
    errorMsg.classList.remove('visible');
    resultsDiv.innerHTML = '';
    searchSpinner.classList.add('active');

    try {
        // Primary flow: form name -> pokemon -> species via URL
        let pokemonData = await cachedFetch(
            `https://pokeapi.co/api/v2/pokemon/${cleanName}`,
            stripPokemon
        );

        let speciesData = await cachedFetch(
            pokemonData.species.url,
            stripSpecies
        );

        const evoChainData = await cachedFetch(
            speciesData.evolution_chain.url
        );

        await renderResults(speciesData, pokemonData, evoChainData);

    } catch (err) {
        // If pokemon fetch failed, try species endpoint (for base species names)
        if (err.message.includes('404') || err.message.includes('400')) {
            try {
                // Fetch species to find default form
                const speciesData = await cachedFetch(
                    `https://pokeapi.co/api/v2/pokemon-species/${cleanName}`,
                    stripSpecies
                );

                // Find and redirect to default form
                const defaultVariety = speciesData.varieties.find(v => v.is_default);
                if (defaultVariety) {
                    console.log(`[Redirect] "${cleanName}" → "${defaultVariety.pokemon.name}"`);
                    navigateTo(defaultVariety.pokemon.name);  // Triggers new search with form name
                    return;  // Exit early to avoid showing error
                }

                // No default form found
                showError(`Pokémon "${cleanName}" not found. Please check the spelling.`);

            } catch (speciesErr) {
                // Species also doesn't exist
                showError(`Pokémon "${cleanName}" not found. Please check the spelling.`);
            }
        } else {
            showError('An error occurred. Please try again.');
        }
    } finally {
        searchSpinner.classList.remove('active');
    }
}
function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('visible');
}

async function renderResults(speciesData, pokemonData, evoChainData) {
    const pName = getCurrentLanguageName(speciesData);
    const pId = pokemonData.id;
    const pSprite = pokemonData.sprite;
    const pTypes = await Promise.all(pokemonData.types.map(slot => cachedFetchNameInCurrentLanguage(slot.type.url)));
    let html = '';

    if (evoChainData) {
        html += '<div class="breadcrumb">';

        let currentNode = speciesData;

        path = [{ name: currentNode.name }]

        // 1. Find root
        while (currentNode.evolves_from_species) {
            currentNode = await cachedFetch(currentNode.evolves_from_species.url, stripSpecies);
            path = [{ name: currentNode.name }, ...path];
        }

        path.forEach((pNode, idx) => {
            if (idx > 0) html += '<span class="sep">→</span>';
            if (idx === path.length - 1) {
                // Current Pokémon (capitalized)
                html += `<span class="current">${pNode.name}</span>`;
            } else {
                // Parent Pokémon (clickable)
                html += `<a onclick="navigateTo('${pNode.name}')">${pNode.name}</a>`;
            }
        });

        const myEvos = await findMyEvos(evoChainData.chain, speciesData, pokemonData, true);

        // If single evolution branch, append clickable "?" preview
        if (myEvos.length === 1) {
            const nextEvo = myEvos[0];
            html += `<span class="sep">→</span><a class="evo-preview" onclick="navigateTo('${nextEvo.species.name}')">?</a>`;
        }

        html += '</div>';
    }

    let results = await Promise.all(
        speciesData.varieties.map(async (variety, idx) => {

            const pkmnData = await cachedFetch(variety.pokemon.url, stripPokemon);
            const mainForm = await cachedFetch(pkmnData.forms[0].url, stripForm);

            if (mainForm.is_mega || mainForm.form_name === 'gmax' || mainForm.form_name === 'starter') {
                return '';
            }

            const pName = pkmnData.name;
            const pId = pkmnData.id;
            const pSprite = pkmnData.sprite;
            const pTypes = await Promise.all(pkmnData.types.map(slot => cachedFetchNameInCurrentLanguage(slot.type.url)));

            const myEvos = await findMyEvos(evoChainData.chain, speciesData, pkmnData);        

            return await renderMainCard(pName, pId, pSprite, pTypes, myEvos, idx < 1);
        })
    );

    results = results.filter(res => res !== "")

    results.forEach((res, idx) => {
        html += res;
    });

    if (results.length > 1) {
        html += `
            <div class="reveal-forms-wrapper" id="revealFormsWrapper">
                <button class="btn-reveal-forms" onclick="showAlternativeForms()">
                    🔍 Reveal other forms
                </button>
                <div id="otherFormsContainer" style="display: none;"></div>
            </div>
        `;
    }
    

    resultsDiv.innerHTML = html;
}

function showAlternativeForms() {
    const alternativeForms = document.getElementsByClassName(`result-card`);
    
    for (const element of alternativeForms) {
        element.removeAttribute("style");
    }

    const revealBtn = document.getElementById(`revealFormsWrapper`);
    revealBtn.style.display = 'none';
}

async function renderBreadcrumbs(speciesData) {

    html = '<div class="breadcrumb">';

    let currentNode = speciesData;

    path = [{ name: currentNode.name }]

    // 1. Find root
    while (currentNode.evolves_from_species) {
        currentNode = await cachedFetch(currentNode.evolves_from_species.url, stripSpecies);
        path = [{ name: currentNode.name }, ...path];
    }

    path.forEach((node, idx) => {
        if (idx > 0) html += '<span class="sep">→</span>';
        if (idx === path.length - 1) {
            // Current Pokémon (capitalized)
            html += `<span class="current">${node.name}</span>`;
        } else {
            // Parent Pokémon (clickable)
            html += `<a onclick="navigateTo('${node.name}')">${node.name}</a>`;
        }
    });

    const myEvos = await findMyEvos(evoChainData.chain, speciesData, pokemonData);

    // If single evolution branch, append clickable "?" preview
    if (myEvos.length === 1) {
        const nextEvo = myEvos[0];
        html += `<span class="sep">→</span><a class="evo-preview" onclick="navigateTo('${nextEvo.species.name}')">?</a>`;
    }

    html += '</div>';
    return html;
}

async function renderMainCard(pName, pId, pSprite, pTypes, evoInfo, isVisible) {
    return `
                <div class="result-card" id="result-card" ${isVisible ? `` : `style="display:none"`}>
                    <div class="pokemon-header">
                        <img class="pokemon-sprite" src="${pSprite}" alt="${pName}">
                        <div class="pokemon-info">
                            <div class="pokemon-name">${pName}</div>
                            <div class="pokemon-id">#${String(pId).padStart(3, '0')}</div>
                            <div class="type-badges">
                                ${pTypes.map(t => `<span class="type-badge" style="background:${TYPE_COLORS[t.toLowerCase()] || '#888'}">${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="divider"></div>
                    <div class="evolution-section">
                        ${await renderEvolutions(evoInfo, pName)}
                    </div>
                </div>
            `;
} 

async function findMyEvos(chainNode, speciesData, pokemonData) {
    function traverse(currentChain, isBaseForm) {
        if (currentChain.species.name === speciesData.name) {
            const copyChain = structuredClone(currentChain);
            copyChain.evolves_to = copyChain.evolves_to.filter(evolvesTo => {
                evolvesTo.evolution_details = evolvesTo.evolution_details.filter((detail) => {
                    const base_form = detail.base_form;
                    return ((base_form === null || base_form === undefined) && isBaseForm)
                        || (base_form?.name === pokemonData.name);
                });

                return evolvesTo.evolution_details.length > 0;
            });

            return copyChain.evolves_to;
        } else {
            for (const nextChain of currentChain.evolves_to) {
                const res = traverse(nextChain, isBaseForm);
                if (res) {
                    return res;
                }
            }

            return null;
        }
    }
    const mainForm = await cachedFetch(pokemonData.forms[0].url, stripForm);
    const isBaseForm = (mainForm.form_name === '') || (speciesData.varieties.length <= 1) || (speciesData.name == pokemonData.name);
    const res = traverse(chainNode, isBaseForm);
    return res;
}

async function renderEvolutions(evoInfo, pName) {
    if (!evoInfo || evoInfo.length === 0) {
        return '<div class="no-evolution">✨ This Pokémon does not evolve.</div>';
    }

    let html = '';

    for (const [idx, evoTarget] of evoInfo.entries()) {
        const targetName = evoTarget.species.name;

        // Group details into distinct method boxes
        const methodGroups = evoTarget.evolution_details;

        // Render one spoiler box per distinct method

        const spoilerBoxes = (
            await Promise.all(
                methodGroups.map((group, boxIdx) =>
                    renderMethodBox(targetName, group, boxIdx, idx, pName)
                )
            )
        ).join('');

        const evoId = idx + pName + targetName;

        html += `
            <div class="evo-branch">
                <div class="evo-row">
                    <div class="evo-card">
                        <div class="evo-name-row" id="evoNameRow-${evoId}">
                            <button class="btn-reveal-evo" onclick="toggleEvoReveal('${evoId}', '${targetName}')" id="evoToggleBtn-${evoId}">
                                Show Evolution
                            </button>
                            <span class="evo-hidden-text" id="evoHiddenText-${evoId}"></span>
                            <span class="evo-target-container" id="evoTargetSpan-${evoId}">
                                <a class="evo-target-name" onclick="navigateTo('${targetName}')">${targetName}</a>
                            </span>
                        </div>
                        <div class="spoiler-wrapper">
                            ${spoilerBoxes}
                        </div>
                    </div>
                </div>
            </div>
            ${idx < evoInfo.length - 1 ? '<div class="evo-divider"></div>' : ''}
        `;
    }
    return html;
}

// Group evolution details by unique method signature for multiple trigger boxes
function groupEvolutionMethods(details) {
    const groups = new Map();

    details.forEach(d => {
        // Create a unique key based on trigger + key distinguishing fields
        const key = `${d.trigger}|${d.item || ''}|${d.location || ''}|${d.time_of_day || ''}|${d.min_level || ''}`;

        if (!groups.has(key)) {
            groups.set(key, {
                trigger: d.trigger,
                item: d.item,
                location: d.location,
                time_of_day: d.time_of_day,
                min_level: d.min_level,
                details: []
            });
        }
        groups.get(key).details.push(d);
    });

    return Array.from(groups.values());
}

async function renderMethodBox(targetEvolution, methodGroup, boxIdx, parentIdx, pName) {
    const methodSummary = await getMethodSummary([methodGroup]);
    const methodDetails = await getMethodDetails(methodGroup);

    const id = `${pName}-${targetEvolution}-${parentIdx}-${boxIdx}`;
    const spoilerId = `spoiler-${id}`;
    const btnId = `triggerRevealBtn-${id}`;

    return `
        <div class="spoiler-box">
            <span class="method-title">Method: ${methodSummary}</span>
            <div class="spoiler-details" id="${spoilerId}">
                ${methodDetails}
            </div>
            <button class="btn-reveal" onclick="toggleMethodSpoiler('${spoilerId}', '${btnId}')" id="${btnId}">
                Reveal
            </button>
        </div>
    `;
}

function toggleMethodSpoiler(spoilerId, btnId) {
    const spoiler = document.getElementById(spoilerId);
    const btn = document.getElementById(btnId);
    spoiler.classList.toggle('visible');
    btn.style.display = 'none';
}

function updateBreadcrumbPreview(currentName, nextName, isRevealed) {
    const preview = document.querySelector('.breadcrumb .evo-preview');
    if (preview && preview.onclick?.toString().includes(nextName)) {
        preview.textContent = isRevealed ? nextName : '?';
        preview.style.fontStyle = isRevealed ? 'normal' : 'italic';
    }
}

function toggleEvoReveal(idx, targetName) {
    const hiddenText = document.getElementById(`evoHiddenText-${idx}`);
    const targetSpan = document.getElementById(`evoTargetSpan-${idx}`);
    const toggleBtn = document.getElementById(`evoToggleBtn-${idx}`);

    if (!targetSpan.classList.contains('revealed')) {
        // Reveal
        hiddenText.style.display = 'none';
        targetSpan.classList.add('revealed'); 
        toggleBtn.innerHTML = '🙈';
        toggleBtn.style.display = 'none';
    } else {
        // Hide
        hiddenText.style.display = 'inline';
        targetSpan.classList.remove('revealed');
        toggleBtn.innerHTML = '👁️';
        toggleBtn.style.display = 'inline-flex';
    }

    const currentName = document.querySelector('.pokemon-name')?.textContent;
    if (currentName) {
        updateBreadcrumbPreview(currentName, targetName, targetSpan.classList.contains('revealed'));
    }
}

async function getMethodSummary(details) {
    // Accept either a single detail object or an array
    const detailArray = Array.isArray(details) ? details : [details];
    if (!detailArray || detailArray.length === 0) return 'Unknown method';

    const parts = [];

    // Helper: checks if a detail object has conditions beyond min_level
    function isLevelUpConditional(details) {
        // 1. No min_level set
        if (details.min_level === null || details.min_level === undefined) return true;

        // 2. Any other field has a meaningful value
        for (const key in details) {
            if (key === 'trigger' || key === 'min_level' || key === 'base_form') continue;

            const val = details[key];
            if (val === null || val === undefined || val === '') continue;

            // Handle booleans: only `true` counts as a condition
            if (typeof val === 'boolean') {
                if (val === true) return true;
            } else {
                // Any other non-empty value (including 0 for stats) is a condition
                return true;
            }
        }
        return false;
    }

    function isTradeConditional(details) {
        for (const key in details) {
            if (key === 'trigger' || key === 'base_form') continue;

            const val = details[key];
            if (val === null || val === undefined || val === '') continue;

            // Handle booleans: only `true` counts as a condition
            if (typeof val === 'boolean') {
                if (val === true) return true;
            } else {
                // Any other non-empty value (including 0 for stats) is a condition
                return true;
            }
        }
        return false;
    }

    for (const [idx, detail] of detailArray.entries()) {
        if (detail?.trigger) {
            const triggerKey = detail.trigger.name;

            const data = await cachedFetch(detail.trigger.url, stripToOnlyNames);

            // Tries to find localized name in current language -> or first language -> or trigger name
            let currentLanguageName = getCurrentLanguageName(data);

            // Mark the trigger as conditional
            if ((triggerKey === 'level-up' && isLevelUpConditional(detail)) ||
                (triggerKey === 'trade' && isTradeConditional(detail))) {
                currentLanguageName += ' (Conditional)';
            }


            parts.push(currentLanguageName);
        }
    }

    return parts;
}

async function getMethodDetails(details) {
    const lines = [];

    for (const [key, value] of Object.entries(details)) {
        if (value === null || value === undefined || (typeof value === 'boolean' && value === false) || value === '') {
            continue;
        }

        switch (key) {
            case 'base_form':
                // lines.push(`<strong>Base Form:</strong> ${value}`);
                break;
            case 'gender':
                const gender = await cachedFetch(API_GENDER + value);
                lines.push(`<strong>Gender:</strong> ${gender.name} only`);
                break;
            case 'held_item':
                lines.push(`<strong>Held item:</strong> ${value.name.replace(/-/g, ' ')}`);
                break;
            case 'item':
                lines.push(`<strong>Item:</strong> ${await cachedFetchNameInCurrentLanguage(value.url)}`);
                break;
            case 'known_move':
                lines.push(`<strong>Must know move:</strong> ${await cachedFetchNameInCurrentLanguage(value.url)}`);
                break;
            case 'known_move_type':
                lines.push(`<strong>Must know a move of type:</strong> ${await cachedFetchNameInCurrentLanguage(value.url)}`);
                break;
            case 'location':
                const location = await cachedFetch(value.url, stripLocation);
                const locationName = getCurrentLanguageName(location);
                const regionNameLoc = await cachedFetchNameInCurrentLanguage(location.region.url);
                lines.push(`<strong>Location:</strong> ${locationName} (${regionNameLoc})`);
                break;
            case 'min_affection':
                lines.push(`<strong>Affection:</strong> ${value} or higher`);
                break;
            case 'min_beauty':
                lines.push(`<strong>Beauty:</strong> ${value} or higher`);
                break;
            case 'min_damage_taken':
                lines.push(`<strong>Damage Taken:</strong> ${value} or higher`)
                break;
            case 'min_happiness':
                lines.push(`<strong>Happiness:</strong> ${value} or higher`);
                break;
            case 'min_level':
                lines.push(`<strong>Level:</strong> ${value}`);
                break;
            case 'min_move_count':
                lines.push(`<strong>Number of times:</strong> ${value}`)
                break
            case 'min_steps':
                lines.push(`<strong>Number of steps taken:</strong> ${value} or higher`)
                break;
            case 'needs_multiplayer':
                lines.push(`<strong>Multiplayer link play is needed</strong>`);
                break;
            case 'needs_overworld_rain':
                lines.push('<strong>Needs overworld rain</strong>');
                break;
            case 'party_species':
                const pokemonName = getCurrentLanguageName(await cachedFetch(value.url, stripSpecies));
                lines.push(`Must have a <strong><a href="#" class="pokemon-link" data-name="${pokemonName}">${pokemonName}</a></strong> in the party`);
                break;
            case 'party_type':
                lines.push(`<strong>Must have a Pokémon of type ${await cachedFetchNameInCurrentLanguage(value.url)} in the party</strong> `);
                break;
            case 'region':
                lines.push(`<strong>Region:</strong> ${await cachedFetchNameInCurrentLanguage(value.url)}`);
                break;
            case 'relative_physical_stats':
                if (value > 0) lines.push('<strong>Attack &gt; Defense</strong>');
                else if (value < 0) lines.push('<strong>Defense &gt; Attack</strong>');
                else lines.push('<strong>Attack = Defense</strong>');
                break;
            case 'time_of_day':
                lines.push(`<strong>Time of day:</strong> ${value}`);
                break;
            case 'trade_species':
                const tradedSpecies = getCurrentLanguageName(await cachedFetch(value.url, stripSpecies));
                lines.push(`Must be traded with another player for a <strong><a href="#" class="pokemon-link" data-name="${tradedSpecies}">${tradedSpecies}</a></strong>`);
                break;
            case 'trigger':
                if (value.name === 'trade' && !details.trade_species) {
                    lines.push('<strong>Trade with another player</strong>');
                } else if (value.name === 'shed') {
                    lines.push(`<strong>Level:</strong> 20`);
                    lines.push('<strong>Player must have an empty slot in their party and an extra Poké Ball on hand.</strong>');
                }
                break;
            case 'turn_upside_down':
                lines.push(`<strong>Turn device upside down</strong>`);
                break;
            case 'used_move':
                lines.push(`<strong>Move:</strong> ${await cachedFetchNameInCurrentLanguage(value.url)}`);
                break;
            default:
                if (value?.name) {
                    lines.push(`${key.replace('-', ' ')} : ${value.name}`)
                } else {
                    lines.push(`${key.replace('-', ' ')} : ${value}`)
                }
                break;
        }
    }

    return lines.length === 0 ? 'No additional details available.' : lines.join('<br>');
}

function getCurrentLanguageName(data) {
    return (data.names.find(n => n.language.name === CURRENT_LANGUAGE)?.name)
        || (data.names[0]?.name)
        || (data.name);
}

function toggleSpoiler(idx) {
    const spoiler = document.getElementById(`spoiler-${idx}`);
    spoiler.classList.toggle('visible');

    const btnReveal = document.getElementById(`triggerRevealBtn-${idx}`);
    btnReveal.style.display = 'none';
}


function getLocalStorageSize() {
    let total = 0;

    for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += localStorage[key].length + key.length;
        }
    }

    // UTF-16: ~2 bytes per character
    return total * 2;
}

function getJsonSize(json) {
    const jsonString = JSON.stringify(json);
    const bytes = new TextEncoder().encode(jsonString).length;
    return (bytes / 1024).toFixed(2);
    console.log(bytes + " bytes");
}

const bytes = getLocalStorageSize();

console.log(`Approx size: ${(bytes / 1024).toFixed(2)} KB`);