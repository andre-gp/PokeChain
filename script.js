const TYPE_COLORS = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c',
    grass: '#7ac74c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1',
    ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746',
    steel: '#b7b7ce', fairy: '#d685ad', unknown: '#787878'
};

const DAMAGE_CLASS_ICONS = {
    physical: 'assets/damage-class/physical.png',
    special:  'assets/damage-class/special.png',
    status:   'assets/damage-class/status.png'
};

const DEBUG = false;
const CURRENT_LANGUAGE = 'en';

const HIDDEN_FORM_SUFFIXES = ['-mega', '-gmax', '-starter'];

const API_POKEMON = 'https://pokeapi.co/api/v2/pokemon/'
const API_SPECIES = 'https://pokeapi.co/api/v2/pokemon-species/';
const API_FORMS = 'https://pokeapi.co/api/v2/pokemon-form/';
const API_GENDER = 'https://pokeapi.co/api/v2/gender/';
const API_ABILITY = 'https://pokeapi.co/api/v2/ability/';
const API_NATURE = 'https://pokeapi.co/api/v2/nature/';
const API_VERSION_GROUP = 'https://pokeapi.co/api/v2/version-group/';
const API_VERSION = 'https://pokeapi.co/api/v2/version/';

// Local caching layer to reduce API requests, optimized to store only necessary fields
const PokeCache = {
    basePrefix: 'pokeapi_cache_',
    version: 'v3.0',
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
const inFlightFetches = new Map();

// Cached fetch wrapper
async function cachedFetch(url, stripFn) {
    const cached = PokeCache.get(url);

    if (cached) {
        if (DEBUG) {
            console.log("Successfully retrieved cached object for " + url + " - " + getJsonSize(cached) + " KB");
        }
        return cached;
    }

    if (inFlightFetches.has(url)) {
        return inFlightFetches.get(url);
    }

    const promise = (async () => {
        const startTime = DEBUG ? performance.now() : 0;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const afterFetch = DEBUG ? performance.now() : 0;

            const data = await res.json();
            const afterJson = DEBUG ? performance.now() : 0;

            const toCache = stripFn ? stripFn(data) : data;
            PokeCache.set(url, toCache);

            if (DEBUG) {
                const endTime = performance.now();

                console.groupCollapsed(
                    `[FETCH] ${url} (${(endTime - startTime).toFixed(1)} ms)`
                );

                console.log(
                    `Network: ${(afterFetch - startTime).toFixed(1)} ms`
                );

                console.log(
                    `JSON parse: ${(afterJson - afterFetch).toFixed(1)} ms`
                );

                console.log(
                    `Processing + cache: ${(endTime - afterJson).toFixed(1)} ms`
                );

                console.log(
                    `Total: ${(endTime - startTime).toFixed(1)} ms`
                );

                console.log("Fetched object:", toCache);

                console.groupEnd();
            }

            return toCache;
        }
        finally {
            inFlightFetches.delete(url);
        }
    })();

    inFlightFetches.set(url, promise);
    return promise;
}

async function cachedFetchNameInCurrentLanguage(url) {
    return getCurrentLanguageName(await cachedFetch(url, stripToOnlyNames))
}

function stripArrayToCurrentLanguageEntry(data) {
    if (!Array.isArray(data)) return null;
    return [data.findLast(entry => entry?.language?.name === CURRENT_LANGUAGE) ?? data[0] ?? null];
}

// Strip functions to minimize localStorage footprint
const stripPokemonList = (data) => data.results.map(r => {
    const idMatch = r.url.match(/\/(\d+)\//);
    return { name: r.name, id: idMatch ? parseInt(idMatch[1]) : 0 };
});

const stripMoveList = (data) => data.results.map(r => r.name);

const stripSpecies = (data) => ({
    evolution_chain: data.evolution_chain,
    evolves_from_species: data.evolves_from_species,
    generation: data.generation,
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
    species: data.species,
    stats: data.stats.map(s => ({ base_stat: s.base_stat, name: s.stat.name })),
    abilities: data.abilities.map(a => ({ name: a.ability.name, is_hidden: a.is_hidden })),
    height: data.height,
    weight: data.weight,
    moves: data.moves.map(m => m.move.name),
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
function stripType(data) {
    return {
        id: data.id,
        name: data.name,
        names: data.names,
        damage_relations: data.damage_relations
    }
}

function stripToOnlyNames(data) {
    return {
        id: data.id,
        name: data.name,
        names: data.names
    }
}

const stripVersionGroup = (data) => ({
    name: data.name,
    versions: data.versions
});

const stripAbility = (data) => ({
    id: data.id,
    name: data.name,
    names: stripArrayToCurrentLanguageEntry(data.names),
    effect_entries: stripArrayToCurrentLanguageEntry(data.effect_entries)
});

const stripNatureList = (data) => data.results.map(r => r.name);

const stripNature = (data) => ({
    id: data.id,
    name: data.name,
    names: stripArrayToCurrentLanguageEntry(data.names),
    increased_stat: data.increased_stat,
    decreased_stat: data.decreased_stat,
});

function stripMove(data) {
    return {
        accuracy: data.accuracy,
        damage_class: data.damage_class,
        effect_chance: data.effect_chance,
        effect_entries: stripArrayToCurrentLanguageEntry(data.effect_entries),
        flavor_text_entries: stripArrayToCurrentLanguageEntry(data.flavor_text_entries),
        generation: data.generation,
        id: data.id,
        meta: data.meta,
        name: data.name,
        names: stripArrayToCurrentLanguageEntry(data.names),
        power: data.power,
        pp: data.pp,
        priority: data.priority,
        stat_changes: data.stat_changes,
        target: data.target,
        type: data.type,
    };
}

let allPokemonNames = [];
let allMoveNames = [];
let searchTimeout = null;
let activeSuggestionIndex = -1;
let autocompleteEnabled = localStorage.getItem('pokechain_autocomplete') === 'true';
let alwaysShowDetails = localStorage.getItem('pokechain_always_show_details') === 'true';
let showHeightWeight = localStorage.getItem('pokechain_show_hw') === 'true';
let alwaysShowForms = localStorage.getItem('pokechain_always_show_forms') === 'true';
let searchStartTime = 0;
let pendingFormsData = null;

const HISTORY_KEY = 'pokechain_history';
const HISTORY_MAX = 8;

function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function addToHistory(name) {
    const h = getHistory().filter(n => n !== name);
    h.unshift(name);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, HISTORY_MAX)));
}
function removeFromHistory(name) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(getHistory().filter(n => n !== name)));
}
function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
}

function findPathInChain(chain, targetName) {
    function traverse(node, path) {
        const current = [...path, node.species.name];
        if (node.species.name === targetName) return current;
        for (const next of node.evolves_to) {
            const result = traverse(next, current);
            if (result) return result;
        }
        return null;
    }
    return traverse(chain, []);
}

const searchInput = document.getElementById('searchInput');
const searchSpinner = document.getElementById('searchSpinner');
const suggestionsDiv = document.getElementById('suggestions');
const errorMsg = document.getElementById('errorMsg');
const resultsDiv = document.getElementById('results');
const settingAutocomplete = document.getElementById('settingAutocomplete');
settingAutocomplete.checked = autocompleteEnabled;
settingAutocomplete.addEventListener('change', () => {
    autocompleteEnabled = settingAutocomplete.checked;
    localStorage.setItem('pokechain_autocomplete', autocompleteEnabled);
    if (!autocompleteEnabled) {
        suggestionsDiv.classList.remove('visible');
        activeSuggestionIndex = -1;
    }
});

document.body.classList.toggle('show-hw', showHeightWeight);
document.body.classList.toggle('always-show-details', alwaysShowDetails);

const settingAlwaysShowDetails = document.getElementById('settingAlwaysShowDetails');
settingAlwaysShowDetails.checked = alwaysShowDetails;
settingAlwaysShowDetails.addEventListener('change', () => {
    alwaysShowDetails = settingAlwaysShowDetails.checked;
    localStorage.setItem('pokechain_always_show_details', alwaysShowDetails);
    document.body.classList.toggle('always-show-details', alwaysShowDetails);
    if (alwaysShowDetails) {
        document.querySelectorAll('.details-panel').forEach(p => {
            p.classList.add('visible');
            loadDetailsPanel(p);
        });
    } else {
        document.querySelectorAll('.details-panel').forEach(p => p.classList.remove('visible'));
    }
});

const settingShowHW = document.getElementById('settingShowHW');
settingShowHW.checked = showHeightWeight;
settingShowHW.addEventListener('change', () => {
    showHeightWeight = settingShowHW.checked;
    localStorage.setItem('pokechain_show_hw', showHeightWeight);
    document.body.classList.toggle('show-hw', showHeightWeight);
});

const settingAlwaysShowForms = document.getElementById('settingAlwaysShowForms');
settingAlwaysShowForms.checked = alwaysShowForms;
settingAlwaysShowForms.addEventListener('change', () => {
    alwaysShowForms = settingAlwaysShowForms.checked;
    localStorage.setItem('pokechain_always_show_forms', alwaysShowForms);
    if (alwaysShowForms && pendingFormsData) {
        showAlternativeForms();
    }
});

function openSettings() {
    document.getElementById('settingsModal').style.display = 'block';
}
function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Routing Helper (Hash-based for static servers)
function navigateTo(name) {
    if (teamBuilderOpen) closeTeamBuilder();
    const cleanName = name ? name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-') : '';
    window.location.hash = cleanName;
}

// Handle Route Change
function handleRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'team-builder' || hash.startsWith('team-builder/')) {
        if (hash.startsWith('team-builder/')) {
            const rawIdx = parseInt(hash.slice('team-builder/'.length), 10);
            if (!isNaN(rawIdx)) {
                const teams = loadTeams();
                if (teams.length > 0) {
                    const clamped = Math.max(0, Math.min(rawIdx, teams.length - 1));
                    activeTeamId = teams[clamped].id;
                    if (clamped !== rawIdx) {
                        window.location.hash = 'team-builder/' + clamped;
                        return;
                    }
                }
            }
        }
        if (!teamBuilderOpen) openTeamBuilder();
        else renderTeamBuilder();
    } else if (hash) {
        if (teamBuilderOpen) closeTeamBuilder();
        searchInput.value = hash;
        search(hash);
    } else {
        if (teamBuilderOpen) closeTeamBuilder();
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
        allPokemonNames = data;
    } catch (e) {
        console.warn('Failed to load pokemon list for autocomplete', e);
    }
}

async function loadMoveList() {
    try {
        const data = await cachedFetch('https://pokeapi.co/api/v2/move?limit=1000', stripMoveList);
        allMoveNames = data;
    } catch (e) {
        console.warn('Failed to load move list for autocomplete', e);
    }
}

loadPokemonList();
loadMoveList();

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    clearTimeout(searchTimeout);

    if (val.length === 0) {
        showHistorySuggestions();
        return;
    }

    if (val.length < 2 || (allPokemonNames.length === 0 && allMoveNames.length === 0) || !autocompleteEnabled) {
        suggestionsDiv.classList.remove('visible');
        return;
    }
    searchTimeout = setTimeout(() => {
        showSuggestions(val);
    }, 150);
});

searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() === '') {
        showHistorySuggestions();
    }
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

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({length: n + 1}, (_, j) => j);
    let curr = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            curr[j] = a[i - 1] === b[j - 1]
                ? prev[j - 1]
                : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

function fuzzyDistance(query, name) {
    const full = levenshtein(query, name);
    if (full <= 1) return full;
    // Also check the name prefix of the same length to catch mid-word typos
    const prefix = levenshtein(query, name.slice(0, query.length));
    return Math.min(full, prefix);
}

function showSuggestions(query) {
    const LIMIT = 5;
    const threshold = Math.max(1, Math.floor(query.length / 2.5));

    const exactPokemon = allPokemonNames.filter(p => p.name.includes(query));
    let pokemonMatches = exactPokemon.slice(0, LIMIT);
    if (pokemonMatches.length < LIMIT) {
        const exactNames = new Set(exactPokemon.map(p => p.name));
        const fuzzy = allPokemonNames
            .filter(p => !exactNames.has(p.name))
            .map(p => ({ p, d: fuzzyDistance(query, p.name) }))
            .filter(x => x.d <= threshold)
            .sort((a, b) => a.d - b.d)
            .map(x => x.p);
        pokemonMatches = [...pokemonMatches, ...fuzzy].slice(0, LIMIT);
    }

    const moveLimit = 8 - pokemonMatches.length;
    const exactMoves = allMoveNames.filter(m => m.includes(query));
    let moveMatches = exactMoves.slice(0, moveLimit);
    if (moveMatches.length < moveLimit) {
        const exactMoveSet = new Set(exactMoves);
        const fuzzyMoves = allMoveNames
            .filter(m => !exactMoveSet.has(m))
            .map(m => ({ m, d: fuzzyDistance(query, m) }))
            .filter(x => x.d <= threshold)
            .sort((a, b) => a.d - b.d)
            .map(x => x.m);
        moveMatches = [...moveMatches, ...fuzzyMoves].slice(0, moveLimit);
    }

    if (pokemonMatches.length === 0 && moveMatches.length === 0) {
        suggestionsDiv.classList.remove('visible');
        return;
    }

    const pokemonHTML = pokemonMatches.map(p => `
        <div class="suggestion-item" data-name="${p.name}">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="" loading="lazy">
            <span class="suggestion-name">${p.name}</span>
            <span class="suggestion-id">#${String(p.id).padStart(3, '0')}</span>
        </div>
    `).join('');

    const moveHTML = moveMatches.map(m => `
        <div class="suggestion-item suggestion-item--move" data-name="${m}">
            <span class="suggestion-move-icon">⚡</span>
            <span class="suggestion-name">${m.replace(/-/g, ' ')}</span>
            <span class="suggestion-badge">Move</span>
        </div>
    `).join('');

    suggestionsDiv.innerHTML = pokemonHTML + moveHTML;

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            navigateTo(item.dataset.name);
            suggestionsDiv.classList.remove('visible');
        });
    });

    suggestionsDiv.classList.add('visible');
    activeSuggestionIndex = -1;
}

function historyItemHTML(name) {
    const clockBadge = `<span class="suggestion-history-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>`;
    const removeBtn = `<button class="suggestion-remove" data-remove="${name}" aria-label="Remove from history">&times;</button>`;

    const pokemon = allPokemonNames.find(p => p.name === name);
    if (pokemon) {
        return `
            <div class="suggestion-item suggestion-item--history" data-name="${name}">
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png" alt="" loading="lazy">
                <span class="suggestion-name">${name}</span>
                ${clockBadge}
                ${removeBtn}
            </div>`;
    }

    return `
        <div class="suggestion-item suggestion-item--move suggestion-item--history" data-name="${name}">
            <span class="suggestion-move-icon">⚡</span>
            <span class="suggestion-name">${name.replace(/-/g, ' ')}</span>
            ${clockBadge}
            ${removeBtn}
        </div>`;
}

function showHistorySuggestions() {
    const history = getHistory();
    if (history.length === 0) {
        suggestionsDiv.classList.remove('visible');
        return;
    }

    const itemsHTML = history.map(historyItemHTML).join('');

    suggestionsDiv.innerHTML = `
        <div class="suggestions-history-header">
            <span>Recent</span>
            <button class="suggestions-clear-all">Clear all</button>
        </div>
        ${itemsHTML}
    `;

    suggestionsDiv.querySelector('.suggestions-clear-all').addEventListener('click', () => {
        clearHistory();
        suggestionsDiv.classList.remove('visible');
    });

    suggestionsDiv.querySelectorAll('.suggestion-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromHistory(btn.dataset.remove);
            showHistorySuggestions();
        });
    });

    suggestionsDiv.querySelectorAll('.suggestion-item--history').forEach(item => {
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
        search(e.target.dataset.name);
    }
});

async function search(query) {
    const cleanQuery = query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')      // Replace spaces with dashes
        .replace(/[^a-z0-9-]/g, ''); // Remove everything except letters, numbers, and dashes
    if (!cleanQuery) return;

    if (searchInput.value !== cleanQuery) {
        searchInput.value = cleanQuery;
    }

    suggestionsDiv.classList.remove('visible');
    activeSuggestionIndex = -1;
    errorMsg.classList.remove('visible');
    resultsDiv.innerHTML = '';
    searchSpinner.classList.add('active');
    if (DEBUG) searchStartTime = performance.now();

    try {
        const pokemonUrl = `https://pokeapi.co/api/v2/pokemon/${cleanQuery}`;
        const speciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${cleanQuery}`;
        const moveUrl = `https://pokeapi.co/api/v2/move/${cleanQuery}`;

        const taggedPromises = [
            cachedFetch(pokemonUrl, stripPokemon).then(value => ({ type: "pokemon", value })),
            cachedFetch(speciesUrl, stripSpecies).then(value => ({ type: "species", value })),
            cachedFetch(moveUrl, stripMove).then(value => ({ type: "move", value }))
        ];

        const result = await Promise.any(taggedPromises);

        if (result.type === "pokemon") {
            const pokemonData = result.value;
            const speciesData = await cachedFetch(API_SPECIES + pokemonData.species.name, stripSpecies);
            const evoChainData = await cachedFetch(speciesData.evolution_chain.url);
            await renderResults(speciesData, pokemonData, evoChainData);
            addToHistory(cleanQuery);
            return;
        }

        if (result.type === "species") {
            const speciesData = result.value;
            const defaultVariety = speciesData.varieties.find(v => v.is_default);

            if (defaultVariety) {
                const targetName = defaultVariety.pokemon.name;

                if (targetName !== cleanQuery) {
                    console.log(`[Redirect] "${cleanQuery}" → "${targetName}"`);
                    navigateTo(targetName);
                } else {
                    // If the species is found before the pokémon, and it shares the same name,
                    // we need to render directly (e.g: eevee (pokémon) === eevee (species))
                    // because the hash won't change
                    const pokemonData = await cachedFetch(API_POKEMON + targetName, stripPokemon);
                    const evoChainData = await cachedFetch(speciesData.evolution_chain.url);
                    await renderResults(speciesData, pokemonData, evoChainData);
                    addToHistory(cleanQuery);
                }

                return;
            }

            showError(`Pokémon "${cleanQuery}" not found. Please check the spelling.`);
            return;
        }

        if (result.type === "move") {
            await renderMoveResults(result.value);
            addToHistory(cleanQuery);
            return;
        }
    } catch (err) {
        console.error(err);
        showError(`"${cleanQuery}" not found as a Pokémon, Species, or Move. Please check the spelling.`);
    } finally {
        searchSpinner.classList.remove('active');
    }
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('visible');
}

async function renderVarietyCard(variety, speciesData, evoChainData, isVisible) {
    if (HIDDEN_FORM_SUFFIXES.some(suffix => variety.pokemon.name.includes(suffix))) return '';
    const pkmnData = await cachedFetch(API_POKEMON + variety.pokemon.name, stripPokemon);
    const mainFormPromise = cachedFetch(API_FORMS + pkmnData.forms[0].name, stripForm);
    const pTypesPromise = Promise.all(
        pkmnData.types.map(async slot => ({
            name: await cachedFetchNameInCurrentLanguage(slot.type.url),
            slug: slot.type.name
        }))
    );
    const myEvosPromise = findMyEvos(evoChainData.chain, speciesData, pkmnData);
    const [mainForm, pTypes, myEvos] = await Promise.all([mainFormPromise, pTypesPromise, myEvosPromise]);

    const chainDepth = getChainDepth(evoChainData.chain);
    return renderMainCard(pkmnData.name, pkmnData.id, pkmnData.sprite, pTypes, myEvos, isVisible, pkmnData.stats, pkmnData.abilities, pkmnData.height, pkmnData.weight, chainDepth, speciesData.generation);
}

async function renderResults(speciesData, pokemonData, evoChainData) {
    const pName = getCurrentLanguageName(speciesData);
    const pId = pokemonData.id;
    const pSprite = pokemonData.sprite;
    let html = '';

    if (evoChainData) {
        html += '<div class="breadcrumb">';

        path = (findPathInChain(evoChainData.chain, speciesData.name) ?? [speciesData.name])
            .map(name => ({ name }));

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

    const defaultVariety = speciesData.varieties.find(v => v.is_default) ?? speciesData.varieties[0];
    html += await renderVarietyCard(defaultVariety, speciesData, evoChainData, true);

    const otherVarieties = speciesData.varieties.filter(v => !v.is_default);
    const hasRevealableVarieties = otherVarieties.some(
        v => !HIDDEN_FORM_SUFFIXES.some(suffix => v.pokemon.name.includes(suffix))
    );

    if (hasRevealableVarieties) {
        if (alwaysShowForms) {
            const formResults = (await Promise.all(
                otherVarieties.map(v => renderVarietyCard(v, speciesData, evoChainData, true))
            )).filter(r => r !== '');
            html += `<div id="otherFormsContainer">${formResults.join('')}</div>`;
        } else {
            pendingFormsData = { varieties: otherVarieties, speciesData, evoChainData };
            html += `
                <div class="reveal-forms-wrapper" id="revealFormsWrapper">
                    <button class="btn-reveal-forms" onclick="showAlternativeForms()">
                        🔍 Reveal other forms
                    </button>
                    <div id="otherFormsContainer"></div>
                </div>
            `;
        }
    }

    resultsDiv.innerHTML = html;
    if (alwaysShowDetails) {
        document.querySelectorAll('.details-panel').forEach(p => {
            p.classList.add('visible');
            loadDetailsPanel(p);
        });
    }
    await revealAndScrollToForm(speciesData, pokemonData);
    if (DEBUG) console.log(`[TOTAL] Search → render: ${(performance.now() - searchStartTime).toFixed(1)} ms`);
}

// When the searched/linked Pokémon is a non-default form, reveal the hidden forms and scroll
// to its card so deep-linking (e.g. #lycanroc-midnight from an evolution branch) lands on it.
async function revealAndScrollToForm(speciesData, pokemonData) {
    const variety = speciesData.varieties.find(v => v.pokemon.name === pokemonData.name);
    if (!variety || variety.is_default) return; // default variety is already shown on top

    let card = document.querySelector(`[data-variety="${pokemonData.name}"]`);
    if (!card && pendingFormsData) {
        await showAlternativeForms();
        card = document.querySelector(`[data-variety="${pokemonData.name}"]`);
    }
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function showAlternativeForms() {
    if (!pendingFormsData) return;
    const wrapper = document.getElementById('revealFormsWrapper');
    const btn = wrapper.querySelector('.btn-reveal-forms');
    btn.disabled = true;
    const { varieties, speciesData, evoChainData } = pendingFormsData;
    pendingFormsData = null;

    const results = (await Promise.all(
        varieties.map(v => renderVarietyCard(v, speciesData, evoChainData, true))
    )).filter(r => r !== '');

    const container = document.getElementById('otherFormsContainer');
    container.innerHTML = results.join('');
    if (alwaysShowDetails) {
        container.querySelectorAll('.details-panel').forEach(p => {
            p.classList.add('visible');
            loadDetailsPanel(p);
        });
    }
    btn.style.display = 'none';
}

async function renderBreadcrumbs(speciesData) {

    html = '<div class="breadcrumb">';

    let currentNode = speciesData;

    path = [{ name: currentNode.name }]

    // 1. Find root
    while (currentNode.evolves_from_species) {
        currentNode = await cachedFetch(API_SPECIES + currentNode.evolves_from_species.name, stripSpecies);
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

async function renderMainCard(pName, pId, pSprite, pTypes, evoInfo, isVisible, stats = [], abilities = [], height = null, weight = null, chainDepth = null, generation = null) {
    const primaryTypeColor = pTypes.length > 0 ? (TYPE_COLORS[pTypes[0].slug] || '#888') : '#888';
    const panelId    = `details-panel-${pName}-${pId}`;
    const panelBtnId = `details-btn-${pName}-${pId}`;
    const encodedDetails = encodeURIComponent(JSON.stringify({ stats, abilities }));
    return `
                <div class="result-card" id="result-card" data-variety="${pName}" style="border-left: 3px solid ${primaryTypeColor};${isVisible ? '' : ' display:none;'}">
                    <div class="pokemon-header">
                        <img class="pokemon-sprite" src="${pSprite}" alt="${pName}">
                        <div class="pokemon-info">
                            <div class="pokemon-name">${pName}</div>
                            <div class="pokemon-id-row">
                                <span class="pokemon-id">#${String(pId).padStart(3, '0')}</span>
                                ${generation ? `<span class="pokemon-gen">· Gen ${generation.name.split('-').slice(1).join('-').toUpperCase()} ·</span>` : ''}
                                <button class="btn-stats-icon btn-toggle-details" id="${panelBtnId}"
                                    onclick="toggleDetailsPanel('${panelId}', '${panelBtnId}')"
                                    aria-expanded="false" title="Base Stats &amp; Abilities">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                        <line x1="18" y1="20" x2="18" y2="10"/>
                                        <line x1="12" y1="20" x2="12" y2="4"/>
                                        <line x1="6" y1="20" x2="6" y2="14"/>
                                    </svg>
                                </button>
                                ${chainDepth !== null ? `
                                <button class="btn-stats-icon" onclick="revealChainLength(this, ${chainDepth})" title="Reveal number of evolution stages">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                        <circle cx="3" cy="12" r="2.5"/>
                                        <circle cx="12" cy="12" r="2.5"/>
                                        <circle cx="21" cy="12" r="2.5"/>
                                        <rect x="6" y="11" width="4" height="2" rx="1"/>
                                        <rect x="15" y="11" width="4" height="2" rx="1"/>
                                    </svg>
                                </button>` : ''}
                            </div>
                            ${height != null && weight != null ? `
                            <div class="pokemon-hw">${(height / 10).toFixed(1)} m &nbsp;·&nbsp; ${(weight / 10).toFixed(1)} kg</div>` : ''}
                            <div class="type-badges">
                                ${pTypes.map(t => `<button class="type-badge" style="background:${TYPE_COLORS[t.slug] || '#888'}" onclick="showTypeDetails('${t.slug}')">${t.name}</button>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="divider"></div>
                    <div class="evolution-section">
                        ${await renderEvolutions(evoInfo, pName)}
                    </div>
                    <div class="details-panel" id="${panelId}"
                        data-pkmn-details="${encodedDetails}"></div>
                </div>
            `;
}

function getChainDepth(chainNode) {
    if (!chainNode || !chainNode.evolves_to || chainNode.evolves_to.length === 0) return 1;
    return 1 + Math.max(...chainNode.evolves_to.map(getChainDepth));
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
    const mainForm = await cachedFetch(API_FORMS + pokemonData.forms[0].name, stripForm);
    const isBaseForm = (mainForm.form_name === '') || (speciesData.varieties.length <= 1) || (speciesData.name == pokemonData.name);
    const res = traverse(chainNode, isBaseForm);
    return res;
}

async function renderEvolutions(evoInfo, pName) {
    if (!evoInfo || evoInfo.length === 0) {
        return '<div class="no-evolution">✨ This Pokémon does not evolve.</div>';
    }

    // Split each evolves_to species node into one render target per evolved_form.
    const renderTargets = [];
    for (const node of evoInfo) {
        const byForm = new Map();
        for (const d of node.evolution_details) {
            const key = d.evolved_form?.name ?? null;
            if (!byForm.has(key)) byForm.set(key, []);
            byForm.get(key).push(d);
        }
        for (const [formName, details] of byForm) {
            renderTargets.push({ navName: formName ?? node.species.name, details });
        }
    }

    const branches = await Promise.all(
        renderTargets.map(async (target, idx) => {
            const targetName = target.navName;
            const methodGroups = groupMethodsByGame(target.details);

            let current = methodGroups.filter(g => g.isDefault);
            let others = methodGroups.filter(g => !g.isDefault);
            if (current.length === 0) {
                // No method is flagged default: treat the newest as current, rest as other games.
                const sorted = [...methodGroups].sort(
                    (a, b) => Math.max(...b.versionGroups) - Math.max(...a.versionGroups)
                );
                current = sorted.slice(0, 1);
                others = sorted.slice(1);
            }
            others.sort((a, b) => Math.min(...a.versionGroups) - Math.min(...b.versionGroups));

            const currentBoxes = (
                await Promise.all(
                    current.map((group, boxIdx) => renderMethodBox(targetName, group.detail, boxIdx, idx, pName))
                )
            ).join('');

            let spoilerBoxes = currentBoxes;
            if (others.length > 0) {
                const otherBoxes = (
                    await Promise.all(
                        others.map(async (group, boxIdx) => {
                            const labels = await Promise.all(group.versionGroups.map(getVersionGroupLabel));
                            return renderMethodBox(targetName, group.detail, current.length + boxIdx, idx, pName, labels.join(', '));
                        })
                    )
                ).join('');

                spoilerBoxes += `
                    <details class="evo-other-games">
                        <summary>Other games (${others.length})</summary>
                        ${otherBoxes}
                    </details>
                `;
            }

            const evoId = idx + pName + targetName;
            return `
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
                ${idx < renderTargets.length - 1 ? '<div class="evo-divider"></div>' : ''}
            `;
        })
    );
    return branches.join('');
}

// Resolve a version_group id to a localized "Game / Game" label (all fetches cached).
async function getVersionGroupLabel(versionGroupId) {
    const vg = await cachedFetch(API_VERSION_GROUP + versionGroupId, stripVersionGroup);
    const names = await Promise.all(
        vg.versions.map(v => cachedFetchNameInCurrentLanguage(v.url))
    );
    return names.join(' / ');
}

// Group an evolution target's details by method signature, ignoring version_group/is_default.
function groupMethodsByGame(details) {
    const groups = new Map();

    details.forEach(d => {
        const { version_group, is_default, ...method } = d;
        const signature = JSON.stringify(method);

        if (!groups.has(signature)) {
            groups.set(signature, { detail: d, versionGroups: [], isDefault: false });
        }
        const group = groups.get(signature);
        if (version_group != null) group.versionGroups.push(version_group);
        if (is_default) {
            group.isDefault = true;
            group.detail = d;
        }
    });

    return Array.from(groups.values());
}

async function renderMethodBox(targetEvolution, methodGroup, boxIdx, parentIdx, pName, gameLabel = '') {
    const methodSummary = await getMethodSummary([methodGroup]);

    const id = `${pName}-${targetEvolution}-${parentIdx}-${boxIdx}`;
    const spoilerId = `spoiler-${id}`;
    const btnId = `triggerRevealBtn-${id}`;


    const filteredMethodGroup = Object.fromEntries(
        Object.entries(methodGroup).filter(([key, value]) =>
            key !== 'version_group' &&
            key !== 'is_default' &&
            key !== 'evolved_form' &&
            value !== null &&
            value !== undefined &&
            !(typeof value === 'boolean' && value === false) &&
            value !== ''
        )
    );

    const encodedMethodGroup = encodeURIComponent(JSON.stringify(filteredMethodGroup));

    const gameLabelHtml = gameLabel
        ? `<span class="evo-game-label">${gameLabel}</span>`
        : '';

    return `
        <div class="spoiler-box">
            ${gameLabelHtml}
            <span class="method-title">Method: ${methodSummary}</span>

            <div class="spoiler-details" id="${spoilerId}" data-method-group="${encodedMethodGroup}" hidden></div>

            <button class="btn-reveal" onclick="toggleMethodSpoiler('${spoilerId}', '${btnId}')" id="${btnId}">
                Reveal
            </button>
        </div>
    `;
}

async function toggleMethodSpoiler(spoilerId, btnId) {
    const spoiler = document.getElementById(spoilerId);
    const btn = document.getElementById(btnId);
    spoiler.classList.toggle('visible');
    btn.style.display = 'none';

 
    spoiler.dataset.loading = 'true';
    spoiler.innerHTML = 'Loading...';

    try {
        const methodGroup = JSON.parse(decodeURIComponent(spoiler.dataset.methodGroup));
        spoiler.innerHTML = await getMethodDetails(methodGroup);
        spoiler.dataset.loaded = 'true';
    } catch (err) {
        console.error(err);
        spoiler.innerHTML = 'Failed to load method details.';
    } finally {
        delete spoiler.dataset.loading;
    }
}

function smoothScrollIntoView(el, padding = 52, duration = 480) {
    const rect = el.getBoundingClientRect();
    const overflow = rect.bottom + padding - window.innerHeight;
    if (overflow <= 0) return;
    const startY = window.scrollY;
    const dist = overflow;
    let startTime;
    function step(ts) {
        if (!startTime) startTime = ts;
        const t = Math.min((ts - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        window.scrollTo(0, startY + dist * ease);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

async function loadDetailsPanel(panel) {
    if (panel.dataset.loaded) return;

    panel.innerHTML = '<div style="text-align:center;padding:16px"><div class="spinner" style="margin:0 auto"></div></div>';

    const { stats, abilities } = JSON.parse(decodeURIComponent(panel.dataset.pkmnDetails));

    const STAT_LABELS = {
        'hp': 'HP', 'attack': 'Atk', 'defense': 'Def',
        'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', 'speed': 'Speed'
    };

    const barsHtml = stats.map(s => {
        const pct = Math.round((s.base_stat / 255) * 100);
        const cls = s.base_stat >= 90 ? 'stat-bar--high' : s.base_stat >= 50 ? 'stat-bar--mid' : 'stat-bar--low';
        return `<div class="stat-row">
            <span class="stat-row__label">${STAT_LABELS[s.name] || s.name}</span>
            <span class="stat-row__value">${s.base_stat}</span>
            <div class="stat-bar-track"><div class="stat-bar-fill ${cls}" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');

    const resolvedAbilities = await Promise.all(
        abilities.map(async a => {
            const abilityData = await cachedFetch(API_ABILITY + a.name, stripAbility);
            return {
                displayName: getCurrentLanguageName(abilityData),
                shortEffect: abilityData.effect_entries?.[0]?.short_effect ?? '',
                is_hidden: a.is_hidden
            };
        })
    );

    const abilitiesHtml = resolvedAbilities.map(a => {
        const tag = a.is_hidden ? ' <span class="ability-hidden-tag">(hidden)</span>' : '';
        const tooltip = a.shortEffect ? ` data-tooltip="${a.shortEffect.replace(/"/g, '&quot;')}"` : '';
        return `<li class="ability-item"${tooltip}>${a.displayName}${tag}</li>`;
    }).join('');

    panel.innerHTML = `
        <div class="details-panel__stats">
            <div class="details-panel__section-title">Base Stats</div>
            ${barsHtml}
        </div>
        <div class="details-panel__abilities">
            <div class="details-panel__section-title">Abilities</div>
            <ul class="ability-list">${abilitiesHtml}</ul>
        </div>`;

    panel.querySelectorAll('.ability-item[data-tooltip]').forEach(el => {
        el.tabIndex = 0;
        el.addEventListener('mouseenter', () => abilityTooltip.show(el));
        el.addEventListener('mouseleave', () => abilityTooltip.hide());
        el.addEventListener('focus',      () => abilityTooltip.show(el));
        el.addEventListener('blur',       () => abilityTooltip.hide());
    });

    panel.dataset.loaded = 'true';
}

async function toggleDetailsPanel(panelId, btnId) {
    const panel = document.getElementById(panelId);
    const btn   = document.getElementById(btnId);
    const isOpen = panel.classList.toggle('visible');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.classList.toggle('active', isOpen);

    if (!isOpen) return;

    await loadDetailsPanel(panel);
    smoothScrollIntoView(panel);
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
            if (key === 'trigger' || key === 'min_level' || key === 'base_form'
                || key === 'version_group' || key === 'is_default' || key === 'evolved_form') continue;

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
            if (key === 'trigger' || key === 'base_form'
                || key === 'version_group' || key === 'is_default' || key === 'evolved_form') continue;

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
            case 'version_group':
            case 'is_default':
            case 'evolved_form':
                // Internal grouping fields — never shown in the method details
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

function revealChainLength(btn, depth) {
    const span = document.createElement('span');
    span.className = 'chain-length-badge';
    span.textContent = `${depth} stage${depth !== 1 ? 's' : ''}`;
    btn.replaceWith(span);
}

function toggleSpoiler(idx) {
    const spoiler = document.getElementById(`spoiler-${idx}`);
    spoiler.classList.toggle('visible');

    const btnReveal = document.getElementById(`triggerRevealBtn-${idx}`);
    btnReveal.style.display = 'none';
}

async function showTypeDetails(typeName) {
    const modal = document.getElementById('typeModal');
    const title = document.getElementById('typeModalTitle');
    const body = document.getElementById('typeModalBody');

    title.innerHTML = `<span class="type-badge" style="background:${TYPE_COLORS[typeName] || '#888'}">${typeName}</span>`;
    body.innerHTML = '<div style="text-align:center; padding: 20px;"><div class="spinner" style="margin: 0 auto;"></div></div>';
    modal.style.display = 'block';
    modal.querySelector('.type-modal-content').style.borderLeft = `3px solid ${TYPE_COLORS[typeName] || '#888'}`;

    try {
        // Fetch type data using the English slug
        const typeData = await cachedFetch(`https://pokeapi.co/api/v2/type/${typeName}/`, stripType);
        const relations = typeData.damage_relations;

        const renderTypes = async (typesArray) => {
            // Return null if the array is empty so we can hide the section entirely
            if (!typesArray || typesArray.length === 0) return null;

            const badges = await Promise.all(typesArray.map(async t => {
                const localizedName = await cachedFetchNameInCurrentLanguage(t.url);
                return `<button class="type-relation-badge" style="background:${TYPE_COLORS[t.name] || '#888'}" onclick="showTypeDetails('${t.name}')">${localizedName}</button>`;
            }));
            return badges.join('');
        };

        // Fetch all relations in parallel
        const [
            doubleFrom, doubleTo,
            halfFrom, halfTo,
            noFrom, noTo
        ] = await Promise.all([
            renderTypes(relations.double_damage_from),
            renderTypes(relations.double_damage_to),
            renderTypes(relations.half_damage_from),
            renderTypes(relations.half_damage_to),
            renderTypes(relations.no_damage_from),
            renderTypes(relations.no_damage_to)
        ]);

        // Build a section only if it has content, and apply good/bad styling
        const buildSection = (title, htmlContent, type) => {
            if (!htmlContent) return '';

            // Assign CSS class based on whether it's a good or bad matchup
            const typeClass = 'relation-' + type;

            return `
                <div class="type-relation-group ${typeClass}">
                    <h4>${title}</h4>
                    <div class="type-relation-badges">${htmlContent}</div>
                </div>
            `;
        };


        const attackerHtml =
            buildSection('Super Effective (2x)', doubleTo, 'good') +
            buildSection('Not Very Effective (0.5x)', halfTo, 'bad') +
            buildSection('No Effect (0x)', noTo, 'none');

        const defenderHtml =
            buildSection('Weak To (2x)', doubleFrom, 'good') +
            buildSection('Resists (0.5x)', halfFrom, 'bad') +
            buildSection('Immune (0x)', noFrom, 'none');

        body.innerHTML = `
            <div class="type-modal-body-wrapper">
                <div class="type-column">
                    <h3 class="column-title">Attacker</h3>
                    ${attackerHtml || '<p style="color:var(--text-secondary); font-style:italic; font-size: 0.85rem;">Neutral to all types.</p>'}
                </div>
                <div class="type-column">
                    <h3 class="column-title">Defender</h3>
                    ${defenderHtml || '<p style="color:var(--text-secondary); font-style:italic; font-size: 0.85rem;">Neutral to all types.</p>'}
                </div>
            </div>
        `;
    } catch (e) {
        body.innerHTML = '<p style="color:var(--danger); text-align:center; padding: 20px;">Failed to load type details.</p>';
        console.error(e);
    }
}
function closeTypeModal() {
    document.getElementById('typeModal').style.display = 'none';
}

// Close modal when clicking outside of the content box
window.addEventListener('click', function (event) {
    const modal = document.getElementById('typeModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
});

// Close modal when pressing the Escape key
window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const moveInfoModal = document.getElementById('moveInfoModal');
        if (moveInfoModal && moveInfoModal.style.display === 'block') {
            closeMoveInfoModal(); return;
        }
        if (teamBuilderOpen) {
            closeTeamBuilder(); return;
        }
        const typeModal = document.getElementById('typeModal');
        if (typeModal && typeModal.style.display === 'block') {
            typeModal.style.display = 'none';
        }
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal && settingsModal.style.display === 'block') {
            settingsModal.style.display = 'none';
        }
    }
});

async function renderMoveResults(moveData, targetEl = null) {
    const moveName = getCurrentLanguageName(moveData);
    const typeName = await cachedFetchNameInCurrentLanguage(moveData.type.url);
    const typeSlug = moveData.type.name;
    const damageClassName = await cachedFetchNameInCurrentLanguage(moveData.damage_class.url);
    const damageClassSlug = moveData.damage_class.name;
    const targetName = await cachedFetchNameInCurrentLanguage(moveData.target.url);

    const statChanges = moveData.stat_changes ?? [];
    const resolvedStatChanges = statChanges.length > 0
        ? await Promise.all(
            statChanges.map(async sc => ({
                change: sc.change,
                name: await cachedFetchNameInCurrentLanguage(sc.stat.url)
            }))
          )
        : [];

    const rawEffect = moveData.effect_entries[0]
        ? moveData.effect_entries[0].effect
        : 'No effect description available.';
    const effect = moveData.effect_chance !== null
        ? rawEffect.replace(/\$effect_chance/g, moveData.effect_chance)
        : rawEffect;

    const flavorText = moveData.flavor_text_entries?.[0]?.flavor_text ?? '';

    const p = moveData.priority;
    const priorityBadge = p > 0
        ? `<span class="priority-badge priority-positive">+${p}</span>`
        : p < 0
            ? `<span class="priority-badge priority-negative">${p}</span>`
            : `<span class="priority-badge priority-neutral">0</span>`;

    const detailRows = [];
    const meta = moveData.meta;

    if (meta) {
        if (meta.flinch_chance > 0)
            detailRows.push({ label: 'Flinch chance', value: `${meta.flinch_chance}%` });

        if (meta.ailment && meta.ailment.name !== 'none') {
            const ailmentLabel = meta.ailment.name.replace(/-/g, ' ');
            detailRows.push({
                label: 'Ailment',
                value: meta.ailment_chance > 0 ? `${ailmentLabel} (${meta.ailment_chance}%)` : `${ailmentLabel} (always)`
            });
        }

        if (meta.min_hits !== null && meta.max_hits !== null) {
            detailRows.push({
                label: 'Hits',
                value: meta.min_hits === meta.max_hits ? `${meta.min_hits}×` : `${meta.min_hits}–${meta.max_hits}×`
            });
        }

        if (meta.min_turns !== null && meta.max_turns !== null)
            detailRows.push({ label: 'Duration', value: `${meta.min_turns}–${meta.max_turns} turns` });

        if (meta.drain > 0)       detailRows.push({ label: 'Drain', value: `${meta.drain}% of damage dealt` });
        else if (meta.drain < 0)  detailRows.push({ label: 'Recoil', value: `${Math.abs(meta.drain)}% of damage dealt` });

        if (meta.healing > 0)     detailRows.push({ label: 'Healing', value: `${meta.healing}% max HP` });
        if (meta.crit_rate > 0)   detailRows.push({ label: 'Crit rate', value: 'High' });
    }

    for (const sc of resolvedStatChanges) {
        const sign = sc.change > 0 ? '+' : '';
        detailRows.push({ label: 'Stat change', value: `${sign}${sc.change} ${sc.name}` });
    }

    const detailsSectionHtml = detailRows.length > 0 ? `
        <div class="move-section">
            <h4>Details</h4>
            <div class="move-details-box">
                ${detailRows.map(r => `
                <div class="move-detail-row">
                    <span class="move-detail-label">${r.label}</span>
                    <span class="move-detail-value">${r.value}</span>
                </div>`).join('')}
            </div>
        </div>` : '';

    const html = `
        <div class="result-card move-card" style="border-left: 3px solid ${TYPE_COLORS[typeSlug] || '#888'}">
            <div class="move-header">
                <div class="move-info">
                    <div class="move-name">${moveName}</div>
                    <div class="move-meta">
                        <button class="type-badge" style="background:${TYPE_COLORS[typeSlug] || '#888'}" onclick="showTypeDetails('${typeSlug}')">${typeName}</button>
                    </div>
                </div>
                <div class="move-header-right">
                    <div class="damage-class-display" data-tooltip="${damageClassName}">
                        <img src="${DAMAGE_CLASS_ICONS[damageClassSlug]}" class="damage-class-icon ${damageClassSlug}" alt="${damageClassName}">
                    </div>
                    ${priorityBadge}
                </div>
            </div>
            <div class="divider"></div>
            <div class="move-stats">
                <div class="stat-item">
                    <span class="stat-label">Power</span>
                    <span class="stat-value">${moveData.power !== null ? moveData.power : '—'}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Accuracy</span>
                    <span class="stat-value">${moveData.accuracy !== null ? moveData.accuracy + '%' : '—'}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">PP</span>
                    <span class="stat-value">${moveData.pp}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Target</span>
                    <span class="stat-value stat-value--target">${targetName}</span>
                </div>
            </div>
            ${flavorText ? `
            <div class="move-section move-section--flavor">
                <h4>Description</h4>
                <p class="move-flavor">${flavorText}</p>
            </div>
            ` : ''}
            <div class="move-section">
                <h4>Effect</h4>
                <p class="move-effect">${effect}</p>
            </div>
            ${detailsSectionHtml}
        </div>
    `;

    (targetEl || resultsDiv).innerHTML = html;
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

const abilityTooltip = (() => {
    const el = document.createElement('div');
    el.className = 'ability-tooltip';
    document.body.appendChild(el);

    function show(target) {
        el.textContent = target.dataset.tooltip;
        el.classList.add('visible');
        position(target);
    }

    function position(target) {
        const rect = target.getBoundingClientRect();
        const margin = 8;
        const tw = Math.min(220, window.innerWidth - 16);
        const th = el.offsetHeight;

        let left = rect.left + rect.width / 2 - tw / 2;
        let top  = rect.top - th - margin;

        left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
        if (top < margin) top = rect.bottom + margin;

        el.style.left  = left + 'px';
        el.style.top   = top  + 'px';
        el.style.width = tw   + 'px';
    }

    function hide() {
        el.classList.remove('visible');
    }

    return { show, hide };
})();

if (DEBUG) {
    const bytes = getLocalStorageSize();

    console.log(`Approx size: ${(bytes / 1024).toFixed(2)} KB`);
}
