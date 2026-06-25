// ============================================================
// Team Builder — Settings
// ============================================================

let teamBuilderEnabled = localStorage.getItem('pokechain_team_builder') === 'true';
const settingTeamBuilder = document.getElementById('settingTeamBuilder');
settingTeamBuilder.checked = teamBuilderEnabled;
settingTeamBuilder.addEventListener('change', () => {
    teamBuilderEnabled = settingTeamBuilder.checked;
    localStorage.setItem('pokechain_team_builder', teamBuilderEnabled);
    document.getElementById('teamBuilderBtn').style.display = teamBuilderEnabled ? 'inline-flex' : 'none';
});
if (teamBuilderEnabled) document.getElementById('teamBuilderBtn').style.display = 'inline-flex';

// ============================================================
// Team Builder — Utilities
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================
// Team Builder — Data Layer
// ============================================================

const TEAMS_KEY = 'pokechain_teams';
let activeTeamId = null;

function loadTeams() {
    try { return JSON.parse(localStorage.getItem(TEAMS_KEY) || '[]'); } catch { return []; }
}
function saveTeams(teams) {
    localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
}
function generateTeamId() {
    return 'team_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}
function createTeamRecord(name) {
    return { id: generateTeamId(), name: name || 'Team 1', pokemon: Array(6).fill(null) };
}
function getTeam(teamId) {
    return loadTeams().find(t => t.id === teamId) || null;
}
function saveTeam(updatedTeam) {
    const teams = loadTeams();
    const idx = teams.findIndex(t => t.id === updatedTeam.id);
    if (idx >= 0) teams[idx] = updatedTeam; else teams.push(updatedTeam);
    saveTeams(teams);
}
function deleteTeam(teamId) {
    saveTeams(loadTeams().filter(t => t.id !== teamId));
}
function renameTeam(teamId, newName) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (team) { team.name = newName.trim() || team.name; saveTeams(teams); }
}
function setPokemonInSlot(teamId, slotIndex, pokemonName) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    team.pokemon[slotIndex] = { name: pokemonName, moves: [null, null, null, null], ability: null, nature: null };
    saveTeams(teams);
}
function removePokemonFromSlot(teamId, slotIndex) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    team.pokemon[slotIndex] = null;
    saveTeams(teams);
}
function setMoveInSlot(teamId, slotIndex, moveIndex, moveName) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team || !team.pokemon[slotIndex]) return;
    team.pokemon[slotIndex].moves[moveIndex] = moveName;
    saveTeams(teams);
}
function setAbilityInSlot(teamId, slotIndex, abilityName) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team || !team.pokemon[slotIndex]) return;
    team.pokemon[slotIndex].ability = abilityName || null;
    saveTeams(teams);
}
function setNatureInSlot(teamId, slotIndex, natureName) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team || !team.pokemon[slotIndex]) return;
    team.pokemon[slotIndex].nature = natureName || null;
    saveTeams(teams);
}
function reorderPokemonSlots(teamId, fromIndex, toIndex) {
    const teams = loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team || fromIndex === toIndex) return;
    const temp = team.pokemon[fromIndex];
    team.pokemon[fromIndex] = team.pokemon[toIndex];
    team.pokemon[toIndex] = temp;
    saveTeams(teams);
}
function reorderTeams(fromIndex, toIndex) {
    const teams = loadTeams();
    if (fromIndex === toIndex) return;
    const [moved] = teams.splice(fromIndex, 1);
    teams.splice(toIndex, 0, moved);
    saveTeams(teams);
}

// ============================================================
// Team Builder — Open / Close
// ============================================================

let teamBuilderOpen = false;
let tbEditMode = false;
let tbMoveSearchState = null;     // { teamId, slotIndex, moveIndex }
let tbPokemonPickerState = null;  // { teamId, slotIndex }
let tbDragState = null;           // { teamId, fromIndex }
let tbTabDragState = null;    // { fromIndex }

function updateTeamBuilderHash() {
    const teams = loadTeams();
    const idx = teams.findIndex(t => t.id === activeTeamId);
    const hash = 'team-builder/' + Math.max(0, idx);
    if (window.location.hash !== '#' + hash) window.location.hash = hash;
}

function toggleTeamBuilder() {
    if (teamBuilderOpen) closeTeamBuilder(); else openTeamBuilder();
}
function openTeamBuilder() {
    teamBuilderOpen = true;
    tbEditMode = false;
    document.querySelector('.search-wrapper').style.display = 'none';
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    const view = document.getElementById('teamBuilderView');
    view.style.display = 'block';
    view.classList.remove('edit-mode');
    document.getElementById('teamBuilderBtn').classList.add('active');
    const teams = loadTeams();
    if (teams.length === 0) {
        const first = createTeamRecord('Team 1');
        saveTeam(first);
        activeTeamId = first.id;
    } else if (!activeTeamId || !teams.find(t => t.id === activeTeamId)) {
        activeTeamId = teams[0].id;
    }
    updateTeamBuilderHash();
    renderTeamBuilder();
}
function closeTeamBuilder() {
    teamBuilderOpen = false;
    if (window.location.hash.startsWith('#team-builder')) window.location.hash = '';
    document.getElementById('teamBuilderView').style.display = 'none';
    document.querySelector('.search-wrapper').style.display = '';
    document.getElementById('errorMsg').style.display = '';
    document.getElementById('results').style.display = '';
    document.getElementById('teamBuilderBtn').classList.remove('active');
    closePokemonPicker();
    closeAbilityPicker();
    closeNaturePicker();
}
function toggleTbEditMode() {
    tbEditMode = !tbEditMode;
    if (!tbEditMode) { closeTbMoveSearch(); closePokemonPicker(); closeAbilityPicker(); closeNaturePicker(); }
    document.getElementById('teamBuilderView').classList.toggle('edit-mode', tbEditMode);
    document.getElementById('tbEditModeBtn').classList.toggle('active', tbEditMode);
    // Re-render tabs to show/hide delete button and rename handler
    renderTeamBuilderTabs();
}

async function showMoveInfo(moveName) {
    const modal = document.getElementById('moveInfoModal');
    const body = document.getElementById('moveInfoBody');
    modal.style.display = 'block';
    body.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';
    try {
        const moveData = await cachedFetch('https://pokeapi.co/api/v2/move/' + moveName, stripMove);
        await renderMoveResults(moveData, body);
    } catch {
        body.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px;">Failed to load move.</p>';
    }
}
function closeMoveInfoModal() {
    document.getElementById('moveInfoModal').style.display = 'none';
}

function createNewTeam() {
    const teams = loadTeams();
    const newTeam = createTeamRecord('Team ' + (teams.length + 1));
    saveTeam(newTeam);
    activeTeamId = newTeam.id;
    updateTeamBuilderHash();
    renderTeamBuilder();
}

// ============================================================
// Team Builder — Rendering
// ============================================================

function renderTeamBuilder() {
    renderTeamBuilderTabs();
    const team = getTeam(activeTeamId);
    const bodyEl = document.getElementById('teamBuilderBody');
    if (!team) {
        bodyEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px;">No team selected.</p>';
        return;
    }
    bodyEl.innerHTML = `<div class="tb-grid" id="tbGrid"></div>`;
    renderAllSlots(team);
}

function renderTeamBuilderTabs() {
    const teams = loadTeams();
    const tabsEl = document.getElementById('teamBuilderTabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = teams.map((team, idx) => `
        <div class="tb-tab ${team.id === activeTeamId ? 'active' : ''}"
             draggable="true"
             onclick="switchTeam('${team.id}')"
             ondragstart="onTbTabDragStart(event, ${idx})"
             ondragover="onTbTabDragOver(event, ${idx})"
             ondragleave="onTbTabDragLeave(event)"
             ondrop="onTbTabDrop(event, ${idx})"
             ondragend="onTbTabDragEnd()">
            <span class="tb-tab-name"
                  id="tbTabName-${team.id}"
                  >${escapeHtml(team.name)}</span>
            <div class="tb-tab-actions">
                <button class="tb-tab-rename"
                        onclick="event.stopPropagation(); startRenameTeam('${team.id}')"
                        title="Rename team">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="tb-tab-delete"
                        onclick="event.stopPropagation(); confirmDeleteTeam('${team.id}')"
                        title="Delete team">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function renderAllSlots(team) {
    const grid = document.getElementById('tbGrid');
    if (!grid) return;
    grid.innerHTML = team.pokemon.map((slot, idx) => `
        <div class="tb-slot" id="tbSlot-${team.id}-${idx}" data-team="${team.id}" data-slot="${idx}"
             draggable="true"
             ondragstart="onTbSlotDragStart(event, '${team.id}', ${idx})"
             ondragover="onTbSlotDragOver(event, '${team.id}', ${idx})"
             ondragleave="onTbSlotDragLeave(event)"
             ondrop="onTbSlotDrop(event, '${team.id}', ${idx})"
             ondragend="onTbSlotDragEnd()">
            ${renderEmptySlot(team.id, idx)}
        </div>
    `).join('');
    team.pokemon.forEach((slot, idx) => {
        if (slot) loadSlotCard(team.id, idx, slot);
    });
}

function renderEmptySlot(teamId, slotIndex) {
    return `
        <div class="tb-empty-slot" onclick="openPokemonPicker(this, '${teamId}', ${slotIndex})">
            <div class="tb-empty-icon">+</div>
            <div class="tb-empty-label">Add Pokémon</div>
        </div>
    `;
}

function renderCompactCard(pName, pId, pSprite, pTypes, stats = []) {
    const STAT_SHORT = {
        'hp': 'HP', 'attack': 'Atk', 'defense': 'Def',
        'special-attack': 'SpA', 'special-defense': 'SpD', 'speed': 'Spe'
    };

    const statsHtml = stats.length ? (() => {
        const pairs = [];
        for (let i = 0; i < stats.length; i += 2) pairs.push([stats[i], stats[i + 1]]);
        const renderStat = s => {
            if (!s) return '<div class="cc-stat"></div>';
            const pct = Math.round((s.base_stat / 255) * 100);
            const cls = s.base_stat >= 90 ? 'stat-bar--high' : s.base_stat >= 50 ? 'stat-bar--mid' : 'stat-bar--low';
            return `<div class="cc-stat">
                <span class="cc-stat__label">${STAT_SHORT[s.name] || s.name}</span>
                <span class="cc-stat__value">${s.base_stat}</span>
                <div class="stat-bar-track cc-stat__bar"><div class="stat-bar-fill ${cls}" style="width:${pct}%"></div></div>
            </div>`;
        };
        return `<div class="cc-stats-grid">${pairs.map(([a, b]) => `<div class="cc-stat-row">${renderStat(a)}${renderStat(b)}</div>`).join('')}</div>`;
    })() : '';

    return `
        <div class="result-card compact-card">
            <div class="compact-card-header">
                <img class="compact-sprite" src="${pSprite}" alt="${pName}">
                <div class="pokemon-info">
                    <div class="compact-name">${pName}</div>
                    <div class="pokemon-id-row">
                        <span class="pokemon-id">#${String(pId).padStart(3, '0')}</span>
                    </div>
                    <div class="type-badges">
                        ${pTypes.map(t => `<button class="type-badge" style="background:${TYPE_COLORS[t.slug] || '#888'}" onclick="showTypeDetails('${t.slug}')">${t.name}</button>`).join('')}
                    </div>
                </div>
            </div>
            ${statsHtml}
        </div>
    `;
}

async function loadSlotCard(teamId, slotIndex, slotData) {
    const container = document.getElementById(`tbSlot-${teamId}-${slotIndex}`);
    if (!container) return;
    container.innerHTML = `
        <div class="tb-slot-loading">
            <div class="spinner" style="margin: 0 auto;"></div>
        </div>
    `;
    try {
        const pokemonName = slotData.name;
        const pokemonData = await cachedFetch(API_POKEMON + pokemonName, stripPokemon);
        const pTypes = await Promise.all(
            pokemonData.types.map(async slot => ({
                name: await cachedFetchNameInCurrentLanguage(slot.type.url),
                slug: slot.type.name
            }))
        );
        const primaryTypeColor = pTypes.length > 0 ? (TYPE_COLORS[pTypes[0].slug] || '#888') : '#888';
        container.style.borderLeft = `3px solid ${primaryTypeColor}`;
        const cardHtml = renderCompactCard(
            pokemonData.name, pokemonData.id, pokemonData.sprite,
            pTypes, pokemonData.stats
        );
        container.innerHTML = `
            <div class="tb-slot-inner">
                <div class="tb-drag-handle" title="Drag to reorder">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <circle cx="4" cy="2" r="1.2"/><circle cx="8" cy="2" r="1.2"/>
                        <circle cx="4" cy="6" r="1.2"/><circle cx="8" cy="6" r="1.2"/>
                        <circle cx="4" cy="10" r="1.2"/><circle cx="8" cy="10" r="1.2"/>
                    </svg>
                </div>
                <button class="tb-slot-remove"
                    onclick="removeFromTeam('${teamId}', ${slotIndex})"
                    title="Remove Pokémon">&times;</button>
                ${cardHtml}
                <div class="tb-attr-row">
                    ${renderAbilityRow(teamId, slotIndex, slotData, pokemonData.abilities)}
                    ${renderNatureRow(teamId, slotIndex, slotData)}
                </div>
                ${renderMoveButtons(teamId, slotIndex, slotData.moves)}
            </div>
        `;
        wireAbilityTooltip(teamId, slotIndex);
        wireNatureTooltip(teamId, slotIndex);
    } catch (err) {
        console.error(err);
        container.style.borderLeft = '';
        container.innerHTML = `
            <div class="tb-slot-error">
                <div>Failed to load ${escapeHtml(slotData.name)}</div>
                <button class="btn-reveal" onclick="removeFromTeam('${teamId}', ${slotIndex})">Remove</button>
            </div>
        `;
    }
}

function renderMoveButtons(teamId, slotIndex, moves) {
    const buttons = moves.map((moveName, moveIdx) => {
        if (moveName) {
            const moveData = PokeCache.get('https://pokeapi.co/api/v2/move/' + moveName);
            const typeColor = moveData?.type?.name ? (TYPE_COLORS[moveData.type.name] || null) : null;
            const colorStyle = typeColor
                ? ` style="border-color:${typeColor};color:${typeColor};background:${typeColor}18;"`
                : '';
            const displayName = moveData?.names ? getCurrentLanguageName(moveData) : moveName;
            return `<button class="tb-move-btn tb-move-btn--filled"${colorStyle}
                onclick="onMoveButtonClick(this, '${teamId}', ${slotIndex}, ${moveIdx}, '${escapeHtml(moveName)}')"
                title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</button>`;
        }
        return `<button class="tb-move-btn tb-move-btn--empty"
            onclick="onMoveButtonClick(this, '${teamId}', ${slotIndex}, ${moveIdx}, '')">+ Move ${moveIdx + 1}</button>`;
    }).join('');
    return `<div class="tb-move-row" id="tbMoveRow-${teamId}-${slotIndex}"
        data-team="${teamId}" data-slot="${slotIndex}">${buttons}</div>`;
}

// ============================================================
// Team Builder — Drag-and-Drop Reordering
// ============================================================

function onTbSlotDragStart(event, teamId, slotIndex) {
    if (!tbEditMode) { event.preventDefault(); return; }
    const team = getTeam(teamId);
    if (!team || team.pokemon[slotIndex] === null) { event.preventDefault(); return; }
    tbDragState = { teamId, fromIndex: slotIndex };
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.classList.add('tb-slot--dragging');
}

function onTbSlotDragOver(event, teamId, toIndex) {
    if (!tbEditMode || !tbDragState || tbDragState.teamId !== teamId) return;
    if (tbDragState.fromIndex === toIndex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.tb-slot--drag-over').forEach(el => el.classList.remove('tb-slot--drag-over'));
    event.currentTarget.classList.add('tb-slot--drag-over');
}

function onTbSlotDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('tb-slot--drag-over');
    }
}

function onTbSlotDrop(event, teamId, toIndex) {
    if (!tbEditMode || !tbDragState || tbDragState.teamId !== teamId) return;
    event.preventDefault();
    const fromIndex = tbDragState.fromIndex;
    tbDragState = null;
    document.querySelectorAll('.tb-slot--dragging, .tb-slot--drag-over').forEach(el => {
        el.classList.remove('tb-slot--dragging', 'tb-slot--drag-over');
    });
    if (fromIndex === toIndex) return;
    reorderPokemonSlots(teamId, fromIndex, toIndex);
    renderAllSlots(getTeam(teamId));
}

function onTbSlotDragEnd() {
    tbDragState = null;
    document.querySelectorAll('.tb-slot--dragging, .tb-slot--drag-over').forEach(el => {
        el.classList.remove('tb-slot--dragging', 'tb-slot--drag-over');
    });
}

// ============================================================
// Team Builder — Tab Drag-and-Drop Reordering
// ============================================================

function onTbTabDragStart(event, fromIndex) {
    if (!tbEditMode) { event.preventDefault(); return; }
    tbTabDragState = { fromIndex };
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.classList.add('tb-tab--dragging');
}

function onTbTabDragOver(event, toIndex) {
    if (!tbEditMode || !tbTabDragState) return;
    if (tbTabDragState.fromIndex === toIndex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.tb-tab--drag-over').forEach(el => el.classList.remove('tb-tab--drag-over'));
    event.currentTarget.classList.add('tb-tab--drag-over');
}

function onTbTabDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('tb-tab--drag-over');
    }
}

function onTbTabDrop(event, toIndex) {
    if (!tbEditMode || !tbTabDragState) return;
    event.preventDefault();
    const fromIndex = tbTabDragState.fromIndex;
    tbTabDragState = null;
    document.querySelectorAll('.tb-tab--dragging, .tb-tab--drag-over').forEach(el => {
        el.classList.remove('tb-tab--dragging', 'tb-tab--drag-over');
    });
    if (fromIndex === toIndex) return;
    reorderTeams(fromIndex, toIndex);
    updateTeamBuilderHash();
    renderTeamBuilderTabs();
}

function onTbTabDragEnd() {
    tbTabDragState = null;
    document.querySelectorAll('.tb-tab--dragging, .tb-tab--drag-over').forEach(el => {
        el.classList.remove('tb-tab--dragging', 'tb-tab--drag-over');
    });
}

// ============================================================
// Team Builder — Move Search
// ============================================================

function onMoveButtonClick(btnEl, teamId, slotIndex, moveIdx, moveName) {
    if (tbEditMode) {
        openMoveSearch(btnEl, teamId, slotIndex, moveIdx);
    } else if (moveName) {
        showMoveInfo(moveName);
    }
}

function ensureMoveSearchPanel() {
    if (document.getElementById('tbMoveSearchPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'tbMoveSearchPanel';
    panel.className = 'tb-move-search-panel';
    panel.innerHTML = `
        <input type="text" class="tb-move-input" id="tbMoveSearchInput"
            placeholder="Move name..." autocomplete="off" spellcheck="false">
        <div class="tb-move-search-sugg" id="tbMoveSearchSugg"></div>
        <div class="tb-move-search-actions">
            <button class="btn-reveal" onclick="submitTbMoveSearch()">OK</button>
            <button class="btn-reveal" onclick="closeTbMoveSearch()">Cancel</button>
            <button class="btn-reveal tb-move-delete-btn" onclick="deleteTbMove()">Delete</button>
            <span class="tb-move-error" id="tbMoveSearchErr"></span>
        </div>
    `;
    document.body.appendChild(panel);
    const input = panel.querySelector('#tbMoveSearchInput');
    input.addEventListener('input', () => showTbMoveSuggestions(input.value.trim().toLowerCase()));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitTbMoveSearch(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeTbMoveSearch(); }
    });
}

async function openMoveSearch(btnEl, teamId, slotIndex, moveIndex) {
    ensureMoveSearchPanel();
    closeTbMoveSearch(); // close any previously open panel first
    tbMoveSearchState = { teamId, slotIndex, moveIndex, learnset: null };

    const panel = document.getElementById('tbMoveSearchPanel');
    const input = document.getElementById('tbMoveSearchInput');
    const errEl = document.getElementById('tbMoveSearchErr');
    const suggDiv = document.getElementById('tbMoveSearchSugg');

    const existingMove = getTeam(teamId)?.pokemon[slotIndex]?.moves[moveIndex] || '';
    input.value = existingMove;
    errEl.textContent = '';
    suggDiv.classList.remove('visible');

    // Position above the clicked button
    const rect = btnEl.getBoundingClientRect();
    const panelW = 260;
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    if (left < 8) left = 8;
    panel.style.left = (left + window.scrollX) + 'px';
    panel.style.top = (rect.top + window.scrollY - 8) + 'px';
    panel.style.transform = 'translateY(-100%)';
    panel.style.bottom = 'auto';
    panel.classList.add('visible');

    input.focus();
    input.select();

    setTimeout(() => document.addEventListener('click', onTbMoveSearchOutsideClick), 0);

    const pokemonName = getTeam(teamId)?.pokemon[slotIndex]?.name;
    if (pokemonName) {
        try {
            const pokemonData = await cachedFetch(API_POKEMON + pokemonName, stripPokemon);
            if (tbMoveSearchState) {
                tbMoveSearchState.learnset = pokemonData.moves || null;
                showTbMoveSuggestions(input.value.trim().toLowerCase());
            }
        } catch {}
    }
}

function onTbMoveSearchOutsideClick(e) {
    const panel = document.getElementById('tbMoveSearchPanel');
    if (panel && !panel.contains(e.target)) closeTbMoveSearch();
}

function closeTbMoveSearch() {
    const panel = document.getElementById('tbMoveSearchPanel');
    if (panel) panel.classList.remove('visible');
    tbMoveSearchState = null;
    document.removeEventListener('click', onTbMoveSearchOutsideClick);
}

function showTbMoveSuggestions(query) {
    const suggDiv = document.getElementById('tbMoveSearchSugg');
    if (!suggDiv) return;
    const learnset = tbMoveSearchState?.learnset;
    if (!learnset && (!query || query.length < 2)) {
        suggDiv.classList.remove('visible');
        return;
    }
    const pool = learnset || allMoveNames;
    if (pool.length === 0) { suggDiv.classList.remove('visible'); return; }
    const matches = query ? pool.filter(m => m.includes(query)) : pool.slice();
    if (matches.length === 0) { suggDiv.classList.remove('visible'); return; }
    suggDiv.innerHTML = matches.map(m => `<div class="suggestion-item" data-name="${m}">${m.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>`).join('');
    suggDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            document.getElementById('tbMoveSearchInput').value = item.dataset.name;
            suggDiv.classList.remove('visible');
            submitTbMoveSearch();
        });
    });
    suggDiv.classList.add('visible');
}

async function submitTbMoveSearch() {
    if (!tbMoveSearchState) return;
    const { teamId, slotIndex, moveIndex } = tbMoveSearchState;
    const input = document.getElementById('tbMoveSearchInput');
    const errEl = document.getElementById('tbMoveSearchErr');
    const moveName = input.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!moveName) { closeTbMoveSearch(); return; }
    try {
        await cachedFetch('https://pokeapi.co/api/v2/move/' + moveName, stripMove);
        setMoveInSlot(teamId, slotIndex, moveIndex, moveName);
        closeTbMoveSearch();
        refreshMoveRow(teamId, slotIndex);
    } catch {
        if (errEl) errEl.textContent = `"${moveName}" not found.`;
    }
}

function deleteTbMove() {
    if (!tbMoveSearchState) return;
    const { teamId, slotIndex, moveIndex } = tbMoveSearchState;
    setMoveInSlot(teamId, slotIndex, moveIndex, null);
    closeTbMoveSearch();
    refreshMoveRow(teamId, slotIndex);
}

function refreshMoveRow(teamId, slotIndex) {
    const rowEl = document.getElementById(`tbMoveRow-${teamId}-${slotIndex}`);
    if (!rowEl) return;
    const team = getTeam(teamId);
    if (!team || !team.pokemon[slotIndex]) return;
    rowEl.outerHTML = renderMoveButtons(teamId, slotIndex, team.pokemon[slotIndex].moves);
}

function renderAbilityRow(teamId, slotIndex, slotData, abilities) {
    const selectedAbility = slotData.ability || null;
    const abilitiesAttr = escapeHtml(JSON.stringify(abilities));
    if (selectedAbility) {
        const isHidden = abilities.find(a => a.name === selectedAbility)?.is_hidden;
        const hiddenBadge = isHidden ? ' <span class="tb-ability-hidden-badge">H</span>' : '';
        const displayName = selectedAbility.replace(/-/g, ' ');
        return `<div class="tb-ability-row" id="tbAbilityRow-${teamId}-${slotIndex}" data-abilities="${abilitiesAttr}">
            <button class="tb-ability-btn tb-ability-btn--filled"
                onclick="onAbilityButtonClick(this, '${teamId}', ${slotIndex})">${displayName}${hiddenBadge}</button>
        </div>`;
    }
    return `<div class="tb-ability-row" id="tbAbilityRow-${teamId}-${slotIndex}" data-abilities="${abilitiesAttr}">
        <button class="tb-ability-btn tb-ability-btn--empty"
            onclick="onAbilityButtonClick(this, '${teamId}', ${slotIndex})">+ Ability</button>
    </div>`;
}

function renderNatureRow(teamId, slotIndex, slotData) {
    const nature = slotData.nature || null;
    if (nature) {
        const displayName = nature.charAt(0).toUpperCase() + nature.slice(1);
        return `<div class="tb-nature-row" id="tbNatureRow-${teamId}-${slotIndex}">
            <button class="tb-nature-btn tb-nature-btn--filled"
                onclick="onNatureButtonClick(this, '${teamId}', ${slotIndex})">${displayName}</button>
        </div>`;
    }
    return `<div class="tb-nature-row" id="tbNatureRow-${teamId}-${slotIndex}">
        <button class="tb-nature-btn tb-nature-btn--empty"
            onclick="onNatureButtonClick(this, '${teamId}', ${slotIndex})">+ Nature</button>
    </div>`;
}

// ============================================================
// Team Builder — Ability Picker
// ============================================================

let tbAbilityPickerState = null;

function ensureAbilityPickerPanel() {
    if (document.getElementById('tbAbilityPickerPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'tbAbilityPickerPanel';
    panel.className = 'tb-ability-picker';
    panel.innerHTML = `<div id="tbAbilityPickerList"></div>`;
    document.body.appendChild(panel);
}

function onAbilityButtonClick(btnEl, teamId, slotIndex) {
    if (!tbEditMode) return;
    const rowEl = btnEl.closest('.tb-ability-row');
    const abilities = JSON.parse(rowEl.dataset.abilities);
    openAbilityPicker(btnEl, teamId, slotIndex, abilities);
}

function openAbilityPicker(btnEl, teamId, slotIndex, abilities) {
    ensureAbilityPickerPanel();
    closeAbilityPicker();
    tbAbilityPickerState = { teamId, slotIndex };
    const panel = document.getElementById('tbAbilityPickerPanel');
    const listEl = document.getElementById('tbAbilityPickerList');
    const currentAbility = getTeam(teamId)?.pokemon[slotIndex]?.ability || null;

    const items = abilities.map(a => {
        const hiddenBadge = a.is_hidden ? ` <span class="tb-ability-hidden-badge">H</span>` : '';
        const active = a.name === currentAbility ? ' tb-ability-item--active' : '';
        return `<button class="tb-ability-item${active}" data-name="${a.name}">${a.name.replace(/-/g, ' ')}${hiddenBadge}</button>`;
    });
    if (currentAbility) {
        items.push(`<button class="tb-ability-item tb-ability-item--clear" data-name="">Clear</button>`);
    }
    listEl.innerHTML = items.join('');
    listEl.querySelectorAll('.tb-ability-item').forEach(item => {
        item.addEventListener('click', () => {
            setAbilityInSlot(teamId, slotIndex, item.dataset.name || null);
            closeAbilityPicker();
            refreshAbilityRow(teamId, slotIndex);
        });
    });

    const rect = btnEl.getBoundingClientRect();
    const panelW = 200;
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    if (left < 8) left = 8;
    panel.style.left = (left + window.scrollX) + 'px';
    panel.style.top = (rect.top + window.scrollY - 8) + 'px';
    panel.style.transform = 'translateY(-100%)';
    panel.style.bottom = 'auto';
    panel.classList.add('visible');
    setTimeout(() => document.addEventListener('click', onAbilityPickerOutsideClick), 0);
}

function onAbilityPickerOutsideClick(e) {
    const panel = document.getElementById('tbAbilityPickerPanel');
    if (panel && !panel.contains(e.target)) closeAbilityPicker();
}

function closeAbilityPicker() {
    const panel = document.getElementById('tbAbilityPickerPanel');
    if (panel) panel.classList.remove('visible');
    tbAbilityPickerState = null;
    document.removeEventListener('click', onAbilityPickerOutsideClick);
}

function refreshAbilityRow(teamId, slotIndex) {
    const rowEl = document.getElementById(`tbAbilityRow-${teamId}-${slotIndex}`);
    if (!rowEl) return;
    const team = getTeam(teamId);
    if (!team || !team.pokemon[slotIndex]) return;
    const abilities = JSON.parse(rowEl.dataset.abilities);
    rowEl.outerHTML = renderAbilityRow(teamId, slotIndex, team.pokemon[slotIndex], abilities);
    wireAbilityTooltip(teamId, slotIndex);
}

async function wireAbilityTooltip(teamId, slotIndex) {
    const team = getTeam(teamId);
    const abilityName = team?.pokemon[slotIndex]?.ability;
    if (!abilityName) return;
    const btn = document.querySelector(`#tbAbilityRow-${teamId}-${slotIndex} .tb-ability-btn--filled`);
    if (!btn) return;
    try {
        const abilityData = await cachedFetch(API_ABILITY + abilityName, stripAbility);
        const shortEffect = abilityData.effect_entries?.[0]?.short_effect ?? '';
        if (!shortEffect) return;
        btn.dataset.tooltip = shortEffect;
        btn.tabIndex = 0;
        btn.addEventListener('mouseenter', () => abilityTooltip.show(btn));
        btn.addEventListener('mouseleave', () => abilityTooltip.hide());
        btn.addEventListener('focus',      () => abilityTooltip.show(btn));
        btn.addEventListener('blur',       () => abilityTooltip.hide());
    } catch {}
}

async function wireNatureTooltip(teamId, slotIndex) {
    const team = getTeam(teamId);
    const natureName = team?.pokemon[slotIndex]?.nature;
    if (!natureName) return;
    const btn = document.querySelector(`#tbNatureRow-${teamId}-${slotIndex} .tb-nature-btn--filled`);
    if (!btn) return;
    try {
        const natureData = await cachedFetch(API_NATURE + natureName, stripNature);
        let tooltipText;
        if (!natureData.increased_stat) {
            tooltipText = 'No stat changes';
        } else {
            const [plusName, minusName] = await Promise.all([
                cachedFetchNameInCurrentLanguage(natureData.increased_stat.url),
                cachedFetchNameInCurrentLanguage(natureData.decreased_stat.url),
            ]);
            tooltipText = `+${plusName} / −${minusName}`;
        }
        btn.dataset.tooltip = tooltipText;
        btn.tabIndex = 0;
        btn.addEventListener('mouseenter', () => abilityTooltip.show(btn));
        btn.addEventListener('mouseleave', () => abilityTooltip.hide());
        btn.addEventListener('focus',      () => abilityTooltip.show(btn));
        btn.addEventListener('blur',       () => abilityTooltip.hide());
    } catch {}
}

// ============================================================
// Team Builder — Nature Picker
// ============================================================

let tbNaturePickerState = null;
let tbNatureDataCache = null;

const NATURE_STAT_SHORT = {
    'attack': 'Atk', 'defense': 'Def',
    'special-attack': 'SpA', 'special-defense': 'SpD', 'speed': 'Spe'
};

async function loadAllNatureData() {
    if (tbNatureDataCache) return tbNatureDataCache;
    const nameList = await cachedFetch(API_NATURE + '?limit=100', stripNatureList);
    const natures = await Promise.all(nameList.map(n => cachedFetch(API_NATURE + n, stripNature)));
    tbNatureDataCache = natures;
    return natures;
}

function ensureNaturePickerPanel() {
    if (document.getElementById('tbNaturePickerPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'tbNaturePickerPanel';
    panel.className = 'tb-nature-picker';
    panel.innerHTML = `<div id="tbNaturePickerList" class="tb-nature-picker-list"></div>`;
    document.body.appendChild(panel);
}

function onNatureButtonClick(btnEl, teamId, slotIndex) {
    if (!tbEditMode) return;
    openNaturePicker(btnEl, teamId, slotIndex);
}

async function openNaturePicker(btnEl, teamId, slotIndex) {
    ensureNaturePickerPanel();
    closeNaturePicker();
    tbNaturePickerState = { teamId, slotIndex };

    const panel = document.getElementById('tbNaturePickerPanel');
    const listEl = document.getElementById('tbNaturePickerList');

    const rect = btnEl.getBoundingClientRect();
    const panelW = 210;
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    if (left < 8) left = 8;
    panel.style.left = (left + window.scrollX) + 'px';
    panel.style.top = (rect.top + window.scrollY - 8) + 'px';
    panel.style.transform = 'translateY(-100%)';
    panel.style.bottom = 'auto';
    panel.classList.add('visible');

    const currentNature = getTeam(teamId)?.pokemon[slotIndex]?.nature || null;
    listEl.innerHTML = '<div class="tb-nature-loading"><div class="spinner" style="margin:0 auto"></div></div>';
    setTimeout(() => document.addEventListener('click', onNaturePickerOutsideClick), 0);

    try {
        const natures = await loadAllNatureData();

        const items = natures.map(n => {
            const statHtml = n.increased_stat
                ? ` <span class="tb-nature-stat-hint"><span class="tb-nature-plus">+${NATURE_STAT_SHORT[n.increased_stat.name]}</span> <span class="tb-nature-minus">−${NATURE_STAT_SHORT[n.decreased_stat.name]}</span></span>`
                : '';
            const active = n.name === currentNature ? ' tb-nature-item--active' : '';
            const displayName = n.name.charAt(0).toUpperCase() + n.name.slice(1);
            return `<button class="tb-nature-item${active}" data-name="${n.name}">${displayName}${statHtml}</button>`;
        });
        if (currentNature) {
            items.push(`<button class="tb-nature-item tb-nature-item--clear" data-name="">Clear</button>`);
        }
        listEl.innerHTML = items.join('');
        listEl.querySelectorAll('.tb-nature-item').forEach(item => {
            item.addEventListener('click', () => {
                setNatureInSlot(teamId, slotIndex, item.dataset.name || null);
                closeNaturePicker();
                refreshNatureRow(teamId, slotIndex);
            });
        });
    } catch {
        listEl.innerHTML = '<div style="padding:12px;color:var(--danger);font-size:0.8rem;">Failed to load natures.</div>';
    }
}

function onNaturePickerOutsideClick(e) {
    const panel = document.getElementById('tbNaturePickerPanel');
    if (panel && !panel.contains(e.target)) closeNaturePicker();
}

function closeNaturePicker() {
    const panel = document.getElementById('tbNaturePickerPanel');
    if (panel) panel.classList.remove('visible');
    tbNaturePickerState = null;
    document.removeEventListener('click', onNaturePickerOutsideClick);
}

async function refreshNatureRow(teamId, slotIndex) {
    const rowEl = document.getElementById(`tbNatureRow-${teamId}-${slotIndex}`);
    if (!rowEl) return;
    const team = getTeam(teamId);
    if (!team || !team.pokemon[slotIndex]) return;
    const slotData = team.pokemon[slotIndex];
    const natureData = slotData.nature
        ? await cachedFetch(API_NATURE + slotData.nature, stripNature).catch(() => null)
        : null;
    rowEl.outerHTML = renderNatureRow(teamId, slotIndex, slotData);
    wireNatureTooltip(teamId, slotIndex);
}

// ============================================================
// ============================================================

function ensurePokemonPickerPanel() {
    if (document.getElementById('tbPokemonPickerPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'tbPokemonPickerPanel';
    panel.className = 'tb-pokemon-picker-panel';
    panel.innerHTML = `
        <div class="tb-pokemon-picker-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-secondary)">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="tbPokemonPickerInput" class="tb-pokemon-picker-input"
                placeholder="Search Pokémon..." autocomplete="off" spellcheck="false">
        </div>
        <div id="tbPokemonPickerSugg" class="tb-pokemon-picker-sugg"></div>
    `;
    document.body.appendChild(panel);
    const input = panel.querySelector('#tbPokemonPickerInput');
    input.addEventListener('input', () => showPokemonPickerSuggestions(input.value.trim().toLowerCase()));
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); closePokemonPicker(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
            if (val && tbPokemonPickerState) addPokemonToSlot(tbPokemonPickerState.teamId, tbPokemonPickerState.slotIndex, val);
        }
    });
}

function openPokemonPicker(triggerEl, teamId, slotIndex) {
    ensurePokemonPickerPanel();
    closePokemonPicker();
    tbPokemonPickerState = { teamId, slotIndex };

    const panel = document.getElementById('tbPokemonPickerPanel');
    const input = document.getElementById('tbPokemonPickerInput');
    const suggDiv = document.getElementById('tbPokemonPickerSugg');

    input.value = '';
    suggDiv.innerHTML = '';

    const slotEl = triggerEl.closest('.tb-slot') || triggerEl;
    const rect = slotEl.getBoundingClientRect();
    panel.style.left = (rect.left + window.scrollX) + 'px';
    panel.style.top = (rect.top + window.scrollY) + 'px';
    panel.style.width = rect.width + 'px';
    panel.classList.add('visible');

    input.focus();
    setTimeout(() => document.addEventListener('click', onPokemonPickerOutsideClick), 0);
}

function onPokemonPickerOutsideClick(e) {
    const panel = document.getElementById('tbPokemonPickerPanel');
    if (panel && !panel.contains(e.target)) closePokemonPicker();
}

function closePokemonPicker() {
    const panel = document.getElementById('tbPokemonPickerPanel');
    if (panel) panel.classList.remove('visible');
    tbPokemonPickerState = null;
    document.removeEventListener('click', onPokemonPickerOutsideClick);
}

function showPokemonPickerSuggestions(query) {
    const suggDiv = document.getElementById('tbPokemonPickerSugg');
    if (!suggDiv) return;
    if (!query || query.length < 2 || allPokemonNames.length === 0) {
        suggDiv.innerHTML = '';
        return;
    }
    const matches = allPokemonNames.filter(p => p.name.includes(query)).slice(0, 8);
    if (matches.length === 0) { suggDiv.innerHTML = ''; return; }
    suggDiv.innerHTML = matches.map(p => `
        <div class="suggestion-item" data-name="${p.name}">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="" loading="lazy">
            <span class="suggestion-name">${p.name}</span>
            <span class="suggestion-id">#${String(p.id).padStart(3, '0')}</span>
        </div>
    `).join('');
    suggDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            if (tbPokemonPickerState) addPokemonToSlot(tbPokemonPickerState.teamId, tbPokemonPickerState.slotIndex, item.dataset.name);
        });
    });
}

async function addPokemonToSlot(teamId, slotIndex, pokemonName) {
    closePokemonPicker();
    setPokemonInSlot(teamId, slotIndex, pokemonName);
    const updatedTeam = getTeam(teamId);
    await loadSlotCard(teamId, slotIndex, updatedTeam.pokemon[slotIndex]);
}

function removeFromTeam(teamId, slotIndex) {
    removePokemonFromSlot(teamId, slotIndex);
    const slotEl = document.getElementById(`tbSlot-${teamId}-${slotIndex}`);
    if (slotEl) {
        slotEl.style.borderLeft = '';
        slotEl.innerHTML = renderEmptySlot(teamId, slotIndex);
    }
}

// ============================================================
// Team Builder — Tab Management
// ============================================================

function switchTeam(teamId) {
    activeTeamId = teamId;
    updateTeamBuilderHash();
    renderTeamBuilder();
}

function startRenameTeam(teamId) {
    const nameEl = document.getElementById(`tbTabName-${teamId}`);
    if (!nameEl) return;
    const currentName = nameEl.textContent;
    nameEl.outerHTML = `
        <input class="tb-tab-rename-input" type="text" value="${escapeHtml(currentName)}"
            id="tbRenameInput-${teamId}"
            onblur="finishRenameTeam('${teamId}')"
            onkeydown="handleRenameKey(event, '${teamId}')">
    `;
    const input = document.getElementById(`tbRenameInput-${teamId}`);
    if (input) { input.focus(); input.select(); }
}

function handleRenameKey(event, teamId) {
    if (event.key === 'Enter') { event.preventDefault(); finishRenameTeam(teamId); }
    else if (event.key === 'Escape') {
        event.preventDefault();
        renderTeamBuilderTabs();
    }
}

function finishRenameTeam(teamId) {
    const input = document.getElementById(`tbRenameInput-${teamId}`);
    if (!input) return;
    const newName = input.value.trim();
    if (newName) renameTeam(teamId, newName);
    renderTeamBuilderTabs();
}

function confirmDeleteTeam(teamId) {
    const teams = loadTeams();
    if (teams.length === 1) { alert('You must have at least one team.'); return; }
    if (!confirm('Delete this team?')) return;
    deleteTeam(teamId);
    const remaining = loadTeams();
    activeTeamId = remaining[0]?.id || null;
    updateTeamBuilderHash();
    renderTeamBuilder();
}
