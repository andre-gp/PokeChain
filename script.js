const TYPE_COLORS = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c',
    grass: '#7ac74c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1',
    ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746',
    steel: '#b7b7ce', fairy: '#d685ad', unknown: '#787878'
};

// Local caching layer to reduce API requests, optimized to store only necessary fields
const PokeCache = {
    prefix: 'pokeapi_cache_v2.1_',
    timeToStale: 24 * 60 * 60 * 1000, // 24 hours
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
        console.log("Successfully retrieved cached object for " + url);
        return cached;
    } else {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const toCache = stripFn ? stripFn(data) : data;
        PokeCache.set(url, toCache);
        console.log("Found no cache for" + url + ". Sucessfully updated the cache data for it.");
        return toCache;
    }
}

// Strip functions to minimize localStorage footprint
const stripPokemonList = (data) => data.results.map(r => ({ name: r.name, url: r.url }));

const stripSpecies = (data) => ({ evolution_chain_url: data.evolution_chain.url });

// Strip species data including varieties (to find default form)
const stripSpeciesWithVarieties = (data) => ({
    evolution_chain_url: data.evolution_chain.url,
    varieties: data.varieties.map(v => ({
        name: v.pokemon.name,  // This is the form name usable in /pokemon/
        is_default: v.is_default
    }))
});

const stripPokemon = (data) => ({
    id: data.id,
    name: data.name,
    sprite: data.sprites.other['official-artwork']?.front_default || data.sprites.front_default,
    types: data.types.map(t => t.type.name),
    species_url: data.species.url
});

function stripEvolutionDetails(details) {
    return details.map(d => ({
        trigger: d.trigger?.name,
        min_level: d.min_level,
        item: d.item?.name,
        known_move: d.known_move?.name,
        known_move_type: d.known_move_type?.name,
        trade_species: d.trade_species?.name,
        min_happiness: d.min_happiness,
        min_beauty: d.min_beauty,
        min_affection: d.min_affection,
        needs_overworld_rain: d.needs_overworld_rain,
        time_of_day: d.time_of_day,
        relative_physical_stats: d.relative_physical_stats,
        party_type: d.party_type,
        party_species: d.party_species?.name,
        gender: d.gender,
        location: d.location?.name,
        held_item: d.held_item?.name,
        turn_upside_down: d.turn_upside_down
    }));
}

function stripChainNode(node) {
    return {
        species_name: node.species.name,
        evolution_details: stripEvolutionDetails(node.evolution_details),
        evolves_to: node.evolves_to.map(child => stripChainNode(child))
    };
}

const stripEvolutionChain = (data) => stripChainNode(data.chain);

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

// Gender name cache (id -> name)
const genderCache = {};

async function loadGenderData() {
    try {
        // Fetch the main gender list
        const data = await cachedFetch(
            'https://pokeapi.co/api/v2/gender/',
            (response) => response.results // Only keep the results array
        );

        // Build cache from the results, extracting ID from URL
        data.forEach(gender => {
            // Extract ID from URL: "https://pokeapi.co/api/v2/gender/1/" -> 1
            const idMatch = gender.url.match(/\/(\d+)\/$/);
            if (idMatch) {
                const id = parseInt(idMatch[1]);
                genderCache[id] = gender.name;
            }
        });

        console.log(`Loaded ${Object.keys(genderCache).length} genders:`, genderCache);
    } catch (e) {
        console.error('Failed to load gender list', e);
        // Fallback mapping if API fails
        genderCache[1] = 'female';
        genderCache[2] = 'male';
        genderCache[3] = 'genderless';
    }
}

// Load gender data when app starts
loadGenderData();

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
            pokemonData.species_url,
            stripSpecies
        );

        const evoChainData = await cachedFetch(
            speciesData.evolution_chain_url,
            stripEvolutionChain
        );

        renderResults(speciesData, pokemonData, evoChainData);

    } catch (err) {
        // If pokemon fetch failed, try species endpoint (for base species names)
        if (err.message.includes('404') || err.message.includes('400')) {
            try {
                // Fetch species to find default form
                const speciesData = await cachedFetch(
                    `https://pokeapi.co/api/v2/pokemon-species/${cleanName}`,
                    stripSpeciesWithVarieties
                );

                // Find and redirect to default form
                const defaultVariety = speciesData.varieties.find(v => v.is_default);
                if (defaultVariety) {
                    console.log(`[Redirect] "${cleanName}" → "${defaultVariety.name}"`);
                    navigateTo(defaultVariety.name);  // Triggers new search with form name
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

function renderResults(speciesData, pokemonData, evoChainData) {
    const pName = pokemonData.name;
    const pId = pokemonData.id;
    const pSprite = pokemonData.sprite;
    const pTypes = pokemonData.types;
    const evoInfo = findEvolutionInChain(evoChainData, pName);
    let html = '';

    if (evoInfo) {
        html += '<div class="breadcrumb">';

        // Render path history (current Pokémon + any parents)
        evoInfo.path.forEach((pNode, idx) => {
            if (idx > 0) html += '<span class="sep">→</span>';
            if (idx === evoInfo.path.length - 1) {
                // Current Pokémon (capitalized)
                html += `<span class="current">${pNode.name}</span>`;
            } else {
                // Parent Pokémon (clickable)
                html += `<a onclick="navigateTo('${pNode.name}')">${pNode.name}</a>`;
            }
        });

        // If single evolution branch, append clickable "?" preview
        if (evoInfo.evolvesTo.length === 1) {
            const nextEvo = evoInfo.evolvesTo[0];
            const nextName = nextEvo.species_name;
            html += `<span class="sep">→</span><a class="evo-preview" onclick="navigateTo('${nextName}')">?</a>`;
        }

        html += '</div>';
    }

    // Main card
    html += `
                <div class="result-card">
                    <div class="pokemon-header">
                        <img class="pokemon-sprite" src="${pSprite}" alt="${pName}">
                        <div class="pokemon-info">
                            <div class="pokemon-name">${pName}</div>
                            <div class="pokemon-id">#${String(pId).padStart(3, '0')}</div>
                            <div class="type-badges">
                                ${pTypes.map(t => `<span class="type-badge" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="divider"></div>
                    <div class="evolution-section">
                        ${renderEvolutions(evoInfo, pName)}
                    </div>
                </div>
            `;

    resultsDiv.innerHTML = html;
}

function findEvolutionInChain(chainNode, targetName) {
    function traverse(node, currentPath) {
        currentPath = [...currentPath, { name: node.species_name }];
        if (node.species_name === targetName) {
            return { path: currentPath, details: node.evolution_details, evolvesTo: node.evolves_to };
        }
        for (const child of node.evolves_to) {
            const result = traverse(child, currentPath);
            if (result) return result;
        }
        return null;
    }

    return traverse(chainNode, []);
}

function renderEvolutions(evoInfo) {
    if (!evoInfo || evoInfo.evolvesTo.length === 0) {
        return '<div class="no-evolution">✨ This Pokémon does not evolve.</div>';
    }

    let html = '';

    evoInfo.evolvesTo.forEach((evoTarget, idx) => {
        const targetName = evoTarget.species_name;

        // Group details into distinct method boxes
        const methodGroups = groupEvolutionMethods(evoTarget.evolution_details);

        // Render one spoiler box per distinct method
        const spoilerBoxes = methodGroups.map((group, boxIdx) =>
            renderMethodBox(group, boxIdx, idx)
        ).join('');

        html += `
            <div class="evo-branch">
                <div class="evo-row">
                    <div class="evo-card">
                        <div class="evo-name-row" id="evoNameRow-${idx}">
                            <span class="evo-hidden-text" id="evoHiddenText-${idx}"></span>
                            <span style="display:none;" id="evoTargetSpan-${idx}">
                                <a class="evo-target-name" onclick="navigateTo('${targetName}')">${targetName}</a>
                            </span>
                            <button class="btn-reveal-evo" onclick="toggleEvoReveal(${idx}, '${targetName}')" id="evoToggleBtn-${idx}">
                                Show Evolution
                            </button>
                        </div>
                        <div class="spoiler-wrapper">
                            ${spoilerBoxes}
                        </div>
                    </div>
                </div>
            </div>
            ${idx < evoInfo.evolvesTo.length - 1 ? '<div class="evo-divider"></div>' : ''}
        `;
    });
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

function renderMethodBox(methodGroup, boxIdx, parentIdx) {
    const methodSummary = getMethodSummary([methodGroup]);
    const methodDetails = getMethodDetails(methodGroup.details);
    const spoilerId = `spoiler-${parentIdx}-${boxIdx}`;
    const btnId = `triggerRevealBtn-${parentIdx}-${boxIdx}`;

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

    if (hiddenText.style.display !== 'none') {
        // Reveal
        hiddenText.style.display = 'none';
        targetSpan.style.display = 'inline';
        toggleBtn.innerHTML = '🙈';

        // I'm not sure if I prefer the button toggling or not.
        toggleBtn.style.display = 'none';
    } else {
        // Hide
        hiddenText.style.display = 'inline';
        targetSpan.style.display = 'none';
        toggleBtn.innerHTML = '👁️';
    }

    const currentName = document.querySelector('.pokemon-name')?.textContent;
    if (currentName) {
        updateBreadcrumbPreview(currentName, targetName, hiddenText.style.display === 'none');
    }
}

function getMethodSummary(details) {
    // Accept either a single detail object or an array
    const detailArray = Array.isArray(details) ? details : [details];
    if (!detailArray || detailArray.length === 0) return 'Unknown method';

    const parts = [];

    // Helper: checks if a detail object has conditions beyond min_level
    function isLevelUpConditional(d) {
        // 1. No min_level set
        if (d.min_level === null || d.min_level === undefined) return true;

        // 2. Any other field has a meaningful value
        for (const key in d) {
            if (key === 'trigger' || key === 'min_level') continue;

            const val = d[key];
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

    detailArray.forEach(item => {
        console.log(item);
        if (item?.trigger) {
            const trigger = item.trigger;
            switch (trigger) {
                case 'level-up':
                    // Support both: direct detail objects OR group objects with nested .details array
                    const sources = [];
                    if (item.details && Array.isArray(item.details)) {
                        sources.push(...item.details);
                    } else {
                        sources.push(item);
                    }
                    
                    // If ANY detail in the array is conditional, mark the whole method as conditional
                    const isConditional = sources.some(isLevelUpConditional);
                    parts.push(isConditional ? 'Level Up (conditional)' : 'Level up');
                    break;
                    
                case 'trade':
                    parts.push('Trade');
                    break;
                case 'use-item':
                    parts.push('Use item');
                    break;
                case 'shed':
                    parts.push('Shed');
                    break;
                case 'spin':
                    parts.push('Spin');
                    break;
                case 'tower-of-darkness':
                    parts.push('Tower of Darkness');
                    break;
                case 'tower-of-waters':
                    parts.push('Tower of Waters');
                    break;
                case 'three-critical-hits':
                    parts.push('Critical hits');
                    break;
                case 'take-damage':
                    parts.push('Take damage');
                    break;
                case 'other':
                    parts.push('Other');
                    break;
                case 'agile-style-move':
                    parts.push('Agile style move');
                    break;
                case 'strong-style-move':
                    parts.push('Strong style move');
                    break;
                case 'recoil-damage':
                    parts.push('Recoil damage');
                    break;
                default:
                    parts.push(trigger.replace(/-/g, ' '));
            }
        }
    });
    return [...new Set(parts)].join(', '); // Remove duplicates
}

function getMethodDetails(details) {
    if (!details || details.length === 0) return 'No additional details available.';

    const lines = [];
    details.forEach(d => {
        if (d.min_level) lines.push(`<strong>Level:</strong> ${d.min_level}`);

        // Fixed: d.item is already a string after stripping
        if (d.item) {
            const itemName = d.item.replace(/-/g, ' ');
            lines.push(`<strong>Item:</strong> ${itemName}`);
        }
        if (d.known_move) {
            lines.push(`<strong>Must know move:</strong> ${d.known_move.replace(/-/g, ' ')}`);
        }
        if (d.known_move_type) {
            lines.push(`<strong>Must know a move of type:</strong> ${d.known_move_type}`);
        }
        if (d.trade_species) {
            lines.push(`<strong>Trade while holding:</strong> ${d.trade_species.replace(/-/g, ' ')}`);
        }
        // Fixed: d.trigger is already a string
        if (d.trigger === 'trade') {
            if (!d.item && !d.trade_species) {
                lines.push('<strong>Trade with another player</strong>');
            }
        }
        if (d.min_happiness !== null && d.min_happiness !== undefined) {
            lines.push(`<strong>Happiness:</strong> ${d.min_happiness} or higher`);
        }
        if (d.min_beauty !== null && d.min_beauty !== undefined) {
            lines.push(`<strong>Beauty:</strong> ${d.min_beauty} or higher`);
        }
        if (d.min_affection !== null && d.min_affection !== undefined) {
            lines.push(`<strong>Affection:</strong> ${d.min_affection} or higher`);
        }
        if (d.needs_overworld_rain) {
            lines.push('<strong>Needs overworld rain</strong>');
        }
        if (d.time_of_day) {
            lines.push(`<strong>Time of day:</strong> ${d.time_of_day}`);
        }
        if (d.relative_physical_stats !== null && d.relative_physical_stats !== undefined) {
            if (d.relative_physical_stats > 0) lines.push('<strong>Attack &gt; Defense</strong>');
            else if (d.relative_physical_stats < 0) lines.push('<strong>Defense &gt; Attack</strong>');
            else lines.push('<strong>Attack = Defense</strong>');
        }
        if (d.party_type) {
            lines.push(`<strong>Party type:</strong> ${d.party_type.replace(/-/g, ' ')}`);
        }
        if (d.party_species) {
            lines.push(`<strong>With ${d.party_species.replace(/-/g, ' ')} in party</strong>`);
        }
        if (d.gender !== null && d.gender !== undefined && d.gender > 0) {
            const genderName = genderCache[d.gender] || 'unknown';
            lines.push(`<strong>Gender:</strong> ${genderName} only`);
        }
        if (d.location) {
            const locName = d.location.replace(/-/g, ' ');
            lines.push(`<strong>Location:</strong> ${locName}`);
        }
        if (d.held_item) {
            lines.push(`<strong>Held item:</strong> ${d.held_item.replace(/-/g, ' ')}`);
        }
        if (d.turn_upside_down) {
            lines.push('<strong>Turn 3DS upside down</strong>');
        }
    });

    return lines.length === 0 ? 'No additional details available.' : lines.join('<br>');
}

function toggleSpoiler(idx) {
    const spoiler = document.getElementById(`spoiler-${idx}`);
    spoiler.classList.toggle('visible');

    const btnReveal = document.getElementById(`triggerRevealBtn-${idx}`);
    btnReveal.style.display = 'none';
}
