/**
 * APES QoL v2 — Player Dossier
 *
 * Cross-feature intelligence view built from data APES already stores:
 * - Watchlists: player id, villages, population, capital, changes and notes.
 * - Secret Society Scanner/History: rank, roles, member metrics and dated trends.
 * - Report Archive: attacker/defender activity and archived report history.
 *
 * This module does not scan Travian. It only aggregates local APES data and
 * adds dossier entry points beside players already shown by APES/the game.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'playerDossier';
    const PANEL_ID = 'qol-player-dossier';
    const STYLE_ID = 'qol-player-dossier-styles';
    const WATCHLIST_PREFIX = 'qol_watchlist_';
    const SS_CURRENT_KEY = 'apes_secret_society_scans_v1';
    const SS_HISTORY_KEY = 'apes_secret_society_history_v1';
    const REPORT_KEY = `qol_report_archive_${window.location.hostname}`;
    const REFRESH_MS = 700;
    const MAX_REPORT_ROWS = 200;
    const MAX_TIMELINE_ROWS = 250;

    let activeIdentity = null;
    let activeTab = 'overview';
    let refreshTimer = null;
    let observer = null;
    let renderToken = 0;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' ||
            window.isQolEnabled(FEATURE_KEY) === true;
    }

    function clean(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function normalized(value) {
        return clean(value).toLocaleLowerCase();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function numeric(value) {
        const source = clean(value);
        if (!source) return null;
        const negative = /^-/.test(source);
        const digits = source.replace(/[^0-9]/g, '');
        if (!digits) return null;
        const number = Number.parseInt(digits, 10);
        return Number.isFinite(number) ? (negative ? -number : number) : null;
    }

    function formatNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number).toLocaleString() : '—';
    }

    function formatSigned(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '—';
        if (number > 0) return `+${Math.round(number).toLocaleString()}`;
        return Math.round(number).toLocaleString();
    }

    function formatDate(value, withTime = true) {
        const date = new Date(Number(value));
        if (!Number.isFinite(date.getTime())) return 'Unknown date';
        return date.toLocaleString([], withTime
            ? { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
            : { year: 'numeric', month: 'short', day: '2-digit' });
    }

    function serverKey() {
        return location.hostname.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    }

    function watchlistKey() {
        return `${WATCHLIST_PREFIX}${window.location.hostname}`;
    }

    function playerKey(playerId, playerName) {
        return clean(playerId) || normalized(playerName);
    }

    function safeJson(value, fallback) {
        try {
            const parsed = JSON.parse(value);
            return parsed == null ? fallback : parsed;
        } catch (_) {
            return fallback;
        }
    }

    function readWatchlistTabs() {
        const value = safeJson(localStorage.getItem(watchlistKey()) || '[]', []);
        return Array.isArray(value) ? value : [];
    }

    function flattenWatchlist() {
        return readWatchlistTabs().flatMap(tab => {
            const entries = Array.isArray(tab?.entries) ? tab.entries : [];
            return entries.map(entry => ({ tabId: tab.id, tabName: clean(tab.name) || 'Watchlist', entry }));
        });
    }

    function readCurrentSocieties() {
        const root = safeJson(localStorage.getItem(SS_CURRENT_KEY) || '{}', {});
        const scans = root && typeof root === 'object' ? root[serverKey()] : null;
        return Array.isArray(scans) ? scans : [];
    }

    function readSocietyHistoryRoot() {
        const root = safeJson(localStorage.getItem(SS_HISTORY_KEY) || '{}', {});
        const server = root && typeof root === 'object' ? root[serverKey()] : null;
        return server && typeof server === 'object' ? server : {};
    }

    function archiveFreshness(archive) {
        if (!archive || typeof archive !== 'object') return 0;
        const reports = Array.isArray(archive.reports) ? archive.reports : [];
        return Math.max(
            Number(archive.updatedAt || 0),
            0,
            ...reports.flatMap(report => [Number(report?.savedAt || 0), Number(report?.updatedAt || 0)])
        );
    }

    async function readReportArchive() {
        const fallback = safeJson(localStorage.getItem(REPORT_KEY) || '{}', {});
        let extension = null;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const result = await chrome.storage.local.get(REPORT_KEY);
                extension = result?.[REPORT_KEY] || null;
            }
        } catch (_) {
            extension = null;
        }
        const selected = archiveFreshness(extension) >= archiveFreshness(fallback) ? extension : fallback;
        return selected && typeof selected === 'object'
            ? { ...selected, reports: Array.isArray(selected.reports) ? selected.reports : [] }
            : { reports: [] };
    }

    function matchIdentity(candidateId, candidateName, identity) {
        const wantedId = clean(identity?.playerId);
        const candidatePlayerId = clean(candidateId);
        if (wantedId && candidatePlayerId) return wantedId === candidatePlayerId;
        const wantedName = normalized(identity?.playerName);
        const name = normalized(candidateName);
        return Boolean(wantedName && name && wantedName === name);
    }

    function resolveIdentity(seed) {
        const identity = {
            playerId: clean(seed?.playerId),
            playerName: clean(seed?.playerName)
        };

        const watchMatches = flattenWatchlist().filter(item => {
            return matchIdentity(item.entry?.playerId, item.entry?.playerName, identity);
        });
        const currentScans = readCurrentSocieties();
        const ssMembers = currentScans.flatMap(scan => (Array.isArray(scan?.members) ? scan.members : []).map(member => ({ scan, member })));
        const ssMatch = ssMembers.find(item => matchIdentity(item.member?.playerId, item.member?.name, identity));

        if (!identity.playerId) {
            identity.playerId = clean(watchMatches[0]?.entry?.playerId || ssMatch?.member?.playerId);
        }
        if (!identity.playerName) {
            identity.playerName = clean(watchMatches[0]?.entry?.playerName || ssMatch?.member?.name);
        }
        return identity;
    }

    function watchlistMatches(identity) {
        return flattenWatchlist().filter(item => matchIdentity(item.entry?.playerId, item.entry?.playerName, identity));
    }

    function currentSocietyMatches(identity) {
        const matches = [];
        readCurrentSocieties().forEach(scan => {
            (Array.isArray(scan?.members) ? scan.members : []).forEach(member => {
                if (matchIdentity(member?.playerId, member?.name, identity)) {
                    matches.push({ scan, member });
                }
            });
        });
        return matches.sort((a, b) => Number(b.scan?.scannedAt || 0) - Number(a.scan?.scannedAt || 0));
    }

    function historySocietyMatches(identity) {
        const results = [];
        Object.values(readSocietyHistoryRoot()).forEach(society => {
            if (!society || typeof society !== 'object') return;
            const snapshots = Array.isArray(society.snapshots)
                ? society.snapshots.slice().sort((a, b) => Number(a.scannedAt || 0) - Number(b.scannedAt || 0))
                : [];
            if (!snapshots.length) return;
            const hasPlayer = snapshots.some(snapshot => {
                return (Array.isArray(snapshot?.members) ? snapshot.members : [])
                    .some(member => matchIdentity(member?.playerId, member?.name, identity));
            });
            if (hasPlayer) results.push({ society, snapshots });
        });
        return results;
    }

    function reportTimestamp(report) {
        const raw = Number(report?.reportTime);
        if (Number.isFinite(raw) && raw > 0) return raw < 1e12 ? raw * 1000 : raw;
        return Number(report?.savedAt || report?.updatedAt || 0);
    }

    function reportMatchesIdentity(report, identity) {
        const name = normalized(identity?.playerName);
        if (!name) return false;
        return normalized(report?.sourcePlayer) === name || normalized(report?.destPlayer) === name;
    }

    function classifyReport(report, identity) {
        const name = normalized(identity?.playerName);
        const source = normalized(report?.sourcePlayer);
        const destination = normalized(report?.destPlayer);
        let role = 'Involved';
        let opponent = '—';
        let route = `${clean(report?.sourceVillage) || '—'} → ${clean(report?.destVillage) || '—'}`;
        if (source === name && destination !== name) {
            role = 'Attacker';
            opponent = clean(report?.destPlayer) || 'Unknown defender';
        } else if (destination === name && source !== name) {
            role = 'Defender';
            opponent = clean(report?.sourcePlayer) || 'Unknown attacker';
        }
        const searchableType = `${clean(report?.reportType)} ${clean(report?.headline)} ${clean(report?.resultText)}`.toLowerCase();
        const category = /scout|spy|espion/.test(searchableType)
            ? 'Scout'
            : role === 'Attacker' ? 'Attack' : role === 'Defender' ? 'Defense' : 'Other';
        return {
            ...report,
            timestamp: reportTimestamp(report),
            role,
            opponent,
            route,
            category,
            type: clean(report?.reportType || report?.headline) || 'Report',
            result: clean(report?.resultText || report?.headline) || 'Report'
        };
    }

    function matchedReports(archive, identity) {
        return (archive?.reports || [])
            .filter(report => reportMatchesIdentity(report, identity))
            .map(report => classifyReport(report, identity))
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    }

    function entryCreatedAt(entry) {
        const match = String(entry?.id || '').match(/^entry_(\d{10,})$/);
        return match ? Number(match[1]) : 0;
    }

    function profileCandidates(watch, societies) {
        const values = [];
        watch.forEach(item => {
            const entry = item.entry || {};
            values.push({
                source: `Watchlist · ${item.tabName}`,
                timestamp: Number(entry.lastUpdatedAt || entryCreatedAt(entry) || 0),
                population: numeric(entry.population),
                villages: Array.isArray(entry.villages) ? entry.villages.length : null,
                name: clean(entry.playerName),
                playerId: clean(entry.playerId)
            });
        });
        societies.forEach(item => {
            values.push({
                source: `SS · ${clean(item.scan?.name) || 'Secret Society'}`,
                timestamp: Number(item.scan?.scannedAt || 0),
                population: numeric(item.member?.population),
                villages: numeric(item.member?.villages),
                name: clean(item.member?.name),
                playerId: clean(item.member?.playerId)
            });
        });
        return values.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    }

    function buildTrend(identity, historyMatches, watchMatches) {
        const DAY = 86400000;
        const candidates = [];

        historyMatches.forEach(group => {
            const points = group.snapshots.map(snapshot => {
                const member = (Array.isArray(snapshot?.members) ? snapshot.members : [])
                    .find(item => matchIdentity(item?.playerId, item?.name, identity));
                if (!member) return null;
                return {
                    timestamp: Number(snapshot.scannedAt || 0),
                    population: numeric(member.population),
                    villages: numeric(member.villages),
                    societyName: clean(group.society?.name) || 'Secret Society'
                };
            }).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
            if (points.length < 2) return;
            const latest = points.at(-1);
            const target = latest.timestamp - 30 * DAY;
            const older = points.filter(point => point.timestamp <= target).at(-1) || points[0];
            if (!older || older === latest) return;
            candidates.push({
                timestamp: latest.timestamp,
                spanDays: Math.max(1, Math.round((latest.timestamp - older.timestamp) / DAY)),
                population: latest.population != null && older.population != null ? latest.population - older.population : null,
                villages: latest.villages != null && older.villages != null ? latest.villages - older.villages : null,
                source: latest.societyName
            });
        });

        if (candidates.length) return candidates.sort((a, b) => b.timestamp - a.timestamp)[0];

        const watch = watchMatches
            .map(item => item.entry)
            .find(entry => Number.isFinite(Number(entry?.populationChange)) || Number.isFinite(Number(entry?.villageChange)));
        if (watch) {
            return {
                timestamp: Number(watch.lastUpdatedAt || 0),
                spanDays: null,
                population: Number.isFinite(Number(watch.populationChange)) ? Number(watch.populationChange) : null,
                villages: Number.isFinite(Number(watch.villageChange)) ? Number(watch.villageChange) : null,
                source: 'Watchlist refresh'
            };
        }
        return null;
    }

    function roleTags(societies) {
        const roles = new Set();
        societies.forEach(({ member }) => {
            if (member?.off) roles.add('OFF');
            if (member?.def) roles.add('DEF');
            if (member?.op) roles.add('OP');
        });
        return [...roles];
    }

    function buildSocietyTimeline(identity, historyMatches) {
        const events = [];
        historyMatches.forEach(group => {
            const name = clean(group.society?.name) || 'Secret Society';
            const snapshots = group.snapshots;
            for (let index = 1; index < snapshots.length; index += 1) {
                const previous = (snapshots[index - 1]?.members || []).find(member => matchIdentity(member?.playerId, member?.name, identity)) || null;
                const current = (snapshots[index]?.members || []).find(member => matchIdentity(member?.playerId, member?.name, identity)) || null;
                const timestamp = Number(snapshots[index]?.scannedAt || 0);
                if (!previous && current) {
                    events.push({ timestamp, type: 'ss-joined', title: `Joined ${name}`, detail: `Rank ${clean(current.rank) || '—'} · ${formatNumber(numeric(current.population))} population` });
                    continue;
                }
                if (previous && !current) {
                    events.push({ timestamp, type: 'ss-left', title: `Left ${name}`, detail: `Last seen rank ${clean(previous.rank) || '—'}` });
                    continue;
                }
                if (!previous || !current) continue;
                const populationDelta = (numeric(current.population) ?? 0) - (numeric(previous.population) ?? 0);
                const villageDelta = (numeric(current.villages) ?? 0) - (numeric(previous.villages) ?? 0);
                const rankBefore = numeric(previous.rank);
                const rankAfter = numeric(current.rank);
                const rankChanged = rankBefore != null && rankAfter != null && rankBefore !== rankAfter;
                if (!populationDelta && !villageDelta && !rankChanged) continue;
                const detail = [
                    populationDelta ? `Population ${formatSigned(populationDelta)}` : '',
                    villageDelta ? `Villages ${formatSigned(villageDelta)}` : '',
                    rankChanged ? `Rank ${rankBefore} → ${rankAfter}` : ''
                ].filter(Boolean).join(' · ');
                events.push({ timestamp, type: 'ss-change', title: `${name} update`, detail });
            }
        });
        return events;
    }

    function buildTimeline(identity, watch, history, reports) {
        const events = [];
        watch.forEach(item => {
            const entry = item.entry || {};
            const createdAt = entryCreatedAt(entry);
            if (createdAt) events.push({
                timestamp: createdAt,
                type: 'watchlist',
                title: `Added to ${item.tabName}`,
                detail: clean(entry.notes) ? `Note: ${clean(entry.notes)}` : 'Added to Watchlist'
            });
            if (Number(entry.lastUpdatedAt || 0)) {
                const changes = [
                    Number.isFinite(Number(entry.populationChange)) ? `Population ${formatSigned(entry.populationChange)}` : '',
                    Number.isFinite(Number(entry.villageChange)) ? `Villages ${formatSigned(entry.villageChange)}` : ''
                ].filter(Boolean).join(' · ');
                events.push({
                    timestamp: Number(entry.lastUpdatedAt),
                    type: 'watchlist',
                    title: `Watchlist refreshed · ${item.tabName}`,
                    detail: changes || `${formatNumber(numeric(entry.population))} population`
                });
            }
        });

        events.push(...buildSocietyTimeline(identity, history));
        reports.forEach(report => {
            events.push({
                timestamp: report.timestamp,
                type: 'report',
                title: `${report.role} report · ${report.opponent}`,
                detail: `${report.type} · ${report.route}${report.result ? ` · ${report.result}` : ''}`
            });
        });
        return events
            .filter(event => Number.isFinite(Number(event.timestamp)) && Number(event.timestamp) > 0)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_TIMELINE_ROWS);
    }

    function buildModel(identity, archive) {
        const resolved = resolveIdentity(identity);
        const watch = watchlistMatches(resolved);
        const societies = currentSocietyMatches(resolved);
        const history = historySocietyMatches(resolved);
        const reports = matchedReports(archive, resolved);
        const profiles = profileCandidates(watch, societies);
        const latest = profiles[0] || null;
        const trend = buildTrend(resolved, history, watch);
        const tags = roleTags(societies);
        const timeline = buildTimeline(resolved, watch, history, reports);
        return { identity: resolved, watch, societies, history, reports, profiles, latest, trend, tags, timeline };
    }

    function toneForDelta(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number === 0) return 'neutral';
        return number > 0 ? 'positive' : 'negative';
    }

    function badge(text, tone = 'neutral') {
        return `<span class="qol-pd-badge ${escapeHtml(tone)}">${escapeHtml(text)}</span>`;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${PANEL_ID}{position:fixed!important;display:none;flex-direction:column!important;width:min(1040px,96vw)!important;min-width:min(720px,96vw)!important;height:min(660px,90vh)!important;min-height:430px!important;max-width:96vw!important;max-height:92vh!important;resize:both!important;overflow:hidden!important;z-index:1000005!important;border:3px solid var(--qol-border)!important;border-radius:6px!important;background:#f7f5f0!important;color:#3f3020!important;box-shadow:0 14px 38px rgba(0,0,0,.5)!important}
#${PANEL_ID}.qol-open{display:flex!important}
#${PANEL_ID} .qol-pd-head{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 38px!important;min-height:38px!important;padding:6px 10px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fff!important;font-size:14px!important;font-weight:bold!important;cursor:move!important;user-select:none!important;touch-action:none!important}
#${PANEL_ID} .qol-pd-head-title{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important}.qol-pd-head-title span:last-child{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
#${PANEL_ID} .qol-pd-close{display:flex!important;align-items:center!important;justify-content:center!important;width:26px!important;height:26px!important;border-radius:4px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:21px!important;cursor:pointer!important}
#${PANEL_ID} .qol-pd-hero{display:grid!important;grid-template-columns:minmax(220px,1.2fr) repeat(4,minmax(115px,.65fr)) auto!important;gap:7px!important;padding:8px!important;border-bottom:1px solid #d1c1a7!important;background:#eee6d8!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-pd-identity,#${PANEL_ID} .qol-pd-stat{min-width:0!important;padding:7px 9px!important;border:1px solid #d3c4aa!important;border-radius:4px!important;background:#fff!important}
#${PANEL_ID} .qol-pd-name{display:block!important;color:#3e2d1c!important;font-size:16px!important;font-weight:800!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}#${PANEL_ID} .qol-pd-id{display:block!important;margin-top:2px!important;color:#826f55!important;font-size:8.5px!important}
#${PANEL_ID} .qol-pd-tags{display:flex!important;gap:4px!important;flex-wrap:wrap!important;margin-top:5px!important}
#${PANEL_ID} .qol-pd-badge{display:inline-flex!important;align-items:center!important;min-height:19px!important;padding:2px 6px!important;border:1px solid #bca789!important;border-radius:999px!important;background:#f4eee2!important;color:#725a3c!important;font-size:7.5px!important;font-weight:800!important;white-space:nowrap!important}#${PANEL_ID} .qol-pd-badge.positive{border-color:#7da05e!important;background:#edf7e5!important;color:#416922!important}#${PANEL_ID} .qol-pd-badge.negative{border-color:#bc756d!important;background:#fae8e6!important;color:#8f312b!important}#${PANEL_ID} .qol-pd-badge.role{border-color:#a88d58!important;background:#fff2d2!important;color:#745414!important}
#${PANEL_ID} .qol-pd-stat span{display:block!important;color:#77654d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}#${PANEL_ID} .qol-pd-stat strong{display:block!important;margin-top:3px!important;color:#3f3020!important;font-size:14px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}#${PANEL_ID} .qol-pd-stat small{display:block!important;margin-top:2px!important;color:#8c7a63!important;font-size:7.5px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
#${PANEL_ID} .qol-pd-actions{display:flex!important;flex-direction:column!important;gap:5px!important;min-width:92px!important}.qol-pd-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:27px!important;padding:4px 9px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:8.5px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}.qol-pd-action.secondary{border-color:#9e896a!important;background:linear-gradient(#9a815d,#70583a)!important}
#${PANEL_ID} .qol-pd-tabs{display:flex!important;gap:4px!important;padding:7px 8px 0!important;background:#f7f5f0!important;border-bottom:1px solid #d4c5ad!important;flex:0 0 34px!important}.qol-pd-tab{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:94px!important;padding:4px 10px!important;border:1px solid #c8b89e!important;border-bottom:0!important;border-radius:4px 4px 0 0!important;background:#e9dfcf!important;color:#6a563d!important;font-size:9px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}.qol-pd-tab.active{background:#fff!important;color:#3f3020!important}
#${PANEL_ID} .qol-pd-content{display:flex!important;flex:1 1 auto!important;min-height:0!important;overflow:hidden!important;background:#fff!important}.qol-pd-view{display:none!important;flex:1 1 auto!important;min-width:0!important;min-height:0!important;overflow:auto!important;padding:9px!important;background:#fbf8f2!important}.qol-pd-view.active{display:block!important}
#${PANEL_ID} .qol-pd-overview-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.qol-pd-card{min-width:0!important;border:1px solid #d2c2a8!important;border-radius:4px!important;background:#fff!important;overflow:hidden!important}.qol-pd-card.full{grid-column:1/-1!important}.qol-pd-card-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:6px 8px!important;border-bottom:1px solid #d9cbb5!important;background:#eee5d5!important;color:#5f472d!important;font-size:9px!important;font-weight:800!important;text-transform:uppercase!important}.qol-pd-card-body{padding:8px!important;color:#4e3b27!important;font-size:9px!important;line-height:1.45!important}
#${PANEL_ID} .qol-pd-kv{display:grid!important;grid-template-columns:120px minmax(0,1fr)!important;gap:4px 8px!important}.qol-pd-kv b{color:#775f42!important}.qol-pd-notes{display:flex!important;flex-direction:column!important;gap:5px!important}.qol-pd-note{padding:6px 7px!important;border:1px solid #e0d5c3!important;border-radius:3px!important;background:#fffaf0!important}.qol-pd-note strong{display:block!important;margin-bottom:2px!important;color:#6d5437!important;font-size:8px!important;text-transform:uppercase!important}.qol-pd-ss-block{padding:7px!important;border:1px solid #ded2c0!important;border-radius:3px!important;background:#fffdf8!important}.qol-pd-ss-block+.qol-pd-ss-block{margin-top:6px!important}.qol-pd-ss-title{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin-bottom:4px!important;font-weight:bold!important}.qol-pd-ss-metrics{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:4px!important}.qol-pd-ss-metric{padding:4px 5px!important;background:#f4eee3!important;border-radius:3px!important}.qol-pd-ss-metric span{display:block!important;color:#89745b!important;font-size:7px!important;text-transform:uppercase!important}.qol-pd-ss-metric strong{display:block!important;margin-top:1px!important;color:#4c3822!important;font-size:9px!important}
#${PANEL_ID} table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important;background:#fff!important}#${PANEL_ID} th,#${PANEL_ID} td{padding:6px 7px!important;border-bottom:1px solid #e4dccd!important;text-align:left!important;vertical-align:middle!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}#${PANEL_ID} th{position:sticky!important;top:0!important;z-index:2!important;background:#e9dfcc!important;color:#60482f!important;font-size:8px!important;text-transform:uppercase!important}
#${PANEL_ID} .qol-pd-report-role{font-weight:bold!important}.qol-pd-report-role.Attacker{color:#8e4f12!important}.qol-pd-report-role.Defender{color:#3e6b87!important}.qol-pd-report-role.Involved{color:#7b6a55!important}
#${PANEL_ID} .qol-pd-timeline{display:flex!important;flex-direction:column!important;gap:6px!important}.qol-pd-event{display:grid!important;grid-template-columns:130px 110px minmax(0,1fr)!important;gap:8px!important;align-items:start!important;padding:7px 8px!important;border:1px solid #ddd1bf!important;border-radius:4px!important;background:#fff!important}.qol-pd-event-time{color:#89755d!important;font-size:8px!important}.qol-pd-event-type{font-size:8px!important;font-weight:800!important;text-transform:uppercase!important}.qol-pd-event-main strong{display:block!important;color:#4b3822!important;font-size:9.5px!important}.qol-pd-event-main span{display:block!important;margin-top:2px!important;color:#76634b!important;font-size:8.5px!important;line-height:1.35!important}.qol-pd-event.ss-joined .qol-pd-event-type{color:#3f732d!important}.qol-pd-event.ss-left .qol-pd-event-type{color:#982f29!important}.qol-pd-event.report .qol-pd-event-type{color:#7d5e29!important}.qol-pd-event.watchlist .qol-pd-event-type{color:#506c8f!important}
#${PANEL_ID} .qol-pd-empty{padding:24px!important;text-align:center!important;color:#8b7a63!important;font-size:10px!important}
.qol-pd-inline-open{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:20px!important;height:20px!important;margin-left:4px!important;padding:0!important;border:1px solid #ad966f!important;border-radius:3px!important;background:linear-gradient(#fff9ec,#e7d7bb)!important;color:#654a2e!important;cursor:pointer!important;vertical-align:middle!important;user-select:none!important}.qol-pd-inline-open:hover{filter:brightness(1.05)!important}.qol-pd-inline-open svg{width:13px!important;height:13px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;pointer-events:none!important}
.qol-pd-profile-open{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin-left:6px!important;padding:3px 8px!important;border:1px solid var(--qol-accent-outline)!important;border-radius:4px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:10px!important;font-weight:bold!important;cursor:pointer!important;vertical-align:middle!important}
@media(max-width:820px){#${PANEL_ID} .qol-pd-hero{grid-template-columns:1fr 1fr!important}#${PANEL_ID} .qol-pd-identity{grid-column:1/-1!important}#${PANEL_ID} .qol-pd-actions{grid-column:1/-1!important;flex-direction:row!important}#${PANEL_ID} .qol-pd-overview-grid{grid-template-columns:1fr!important}.qol-pd-card.full{grid-column:auto!important}}
`;
        document.head.appendChild(style);
    }

    function dossierIcon() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V21H6z"></path><path d="M15 3.5V7h3"></path><path d="M9 11h6M9 14.5h6M9 18h4"></path></svg>';
    }

    function ensurePanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;
        injectStyles();
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="qol-pd-head">
                <div class="qol-pd-head-title">${dossierIcon()}<span>Player Dossier</span></div>
                <span class="qol-pd-close" title="Close">&times;</span>
            </div>
            <div class="qol-pd-hero"></div>
            <div class="qol-pd-tabs">
                <div class="qol-pd-tab active" data-pd-tab="overview">Overview</div>
                <div class="qol-pd-tab" data-pd-tab="reports">Reports</div>
                <div class="qol-pd-tab" data-pd-tab="timeline">Timeline</div>
            </div>
            <div class="qol-pd-content">
                <div class="qol-pd-view active" data-pd-view="overview"></div>
                <div class="qol-pd-view" data-pd-view="reports"></div>
                <div class="qol-pd-view" data-pd-view="timeline"></div>
            </div>`;
        document.body.appendChild(panel);
        panel.querySelector('.qol-pd-close').addEventListener('click', close);
        panel.querySelectorAll('[data-pd-tab]').forEach(tab => {
            tab.addEventListener('click', () => setTab(tab.dataset.pdTab));
        });
        makeDraggable(panel, panel.querySelector('.qol-pd-head'));
        panel.addEventListener('click', event => {
            const profile = event.target.closest('[data-pd-open-profile]');
            if (profile) {
                event.preventDefault();
                const id = clean(profile.dataset.pdOpenProfile);
                if (id) openProfile(id);
                return;
            }
            if (event.target.closest('[data-pd-refresh]')) {
                event.preventDefault();
                void renderActive();
            }
        });
        return panel;
    }

    function makeDraggable(panel, handle) {
        if (!panel || !handle || handle.dataset.qolPdDrag === 'true') return;
        handle.dataset.qolPdDrag = 'true';
        let dragging = false;
        let dx = 0;
        let dy = 0;
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-pd-close')) return;
            const rect = panel.getBoundingClientRect();
            dragging = true;
            dx = event.clientX - rect.left;
            dy = event.clientY - rect.top;
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            const left = Math.max(8, Math.min(event.clientX - dx, window.innerWidth - panel.offsetWidth - 8));
            const top = Math.max(8, Math.min(event.clientY - dy, window.innerHeight - panel.offsetHeight - 8));
            panel.style.setProperty('left', `${left}px`, 'important');
            panel.style.setProperty('top', `${top}px`, 'important');
            event.preventDefault();
        });
        const stop = event => {
            dragging = false;
            try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }

    function setTab(tabName) {
        activeTab = ['overview', 'reports', 'timeline'].includes(tabName) ? tabName : 'overview';
        const panel = ensurePanel();
        panel.querySelectorAll('[data-pd-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.pdTab === activeTab));
        panel.querySelectorAll('[data-pd-view]').forEach(view => view.classList.toggle('active', view.dataset.pdView === activeTab));
    }

    function positionPanel() {
        const panel = ensurePanel();
        const width = panel.offsetWidth || 1040;
        const height = panel.offsetHeight || 660;
        const left = Math.max(8, Math.min((window.innerWidth - width) / 2, window.innerWidth - width - 8));
        const top = Math.max(8, Math.min((window.innerHeight - height) / 2, window.innerHeight - height - 8));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
    }

    function trendHtml(trend) {
        if (!trend) return '<strong>—</strong><small>No historical delta</small>';
        const pop = trend.population == null ? 'Pop —' : `Pop ${formatSigned(trend.population)}`;
        const villages = trend.villages == null ? 'Vill —' : `Vill ${formatSigned(trend.villages)}`;
        const label = trend.spanDays ? `${trend.spanDays}d · ${trend.source}` : trend.source;
        return `<strong class="${toneForDelta((trend.population || 0) + (trend.villages || 0))}">${escapeHtml(pop)} · ${escapeHtml(villages)}</strong><small>${escapeHtml(label)}</small>`;
    }

    function renderHero(model) {
        const panel = ensurePanel();
        const latest = model.latest;
        const reportCount = model.reports.length;
        const ss = model.societies[0] || null;
        const tagHtml = [
            ...model.tags.map(tag => badge(tag, 'role')),
            ...model.watch.map(item => badge(item.tabName, 'neutral')).slice(0, 4)
        ].join('');
        panel.querySelector('.qol-pd-head-title span:last-child').textContent = `Player Dossier — ${model.identity.playerName || 'Unknown player'}`;
        panel.querySelector('.qol-pd-hero').innerHTML = `
            <div class="qol-pd-identity">
                <span class="qol-pd-name">${escapeHtml(model.identity.playerName || 'Unknown player')}</span>
                <span class="qol-pd-id">Player ID: ${escapeHtml(model.identity.playerId || 'Unknown')}</span>
                <div class="qol-pd-tags">${tagHtml || badge('No tags')}</div>
            </div>
            <div class="qol-pd-stat"><span>Population</span><strong>${formatNumber(latest?.population)}</strong><small>${escapeHtml(latest?.source || 'No local snapshot')}</small></div>
            <div class="qol-pd-stat"><span>Villages</span><strong>${formatNumber(latest?.villages)}</strong><small>${escapeHtml(latest?.source || 'No local snapshot')}</small></div>
            <div class="qol-pd-stat"><span>SS Rank</span><strong>${ss ? `#${escapeHtml(clean(ss.member?.rank) || '—')}` : '—'}</strong><small>${escapeHtml(clean(ss?.scan?.name) || 'Not in scanned SS')}</small></div>
            <div class="qol-pd-stat"><span>Archived Reports</span><strong>${reportCount.toLocaleString()}</strong><small>${model.reports.filter(report => report.role === 'Attacker').length} attack · ${model.reports.filter(report => report.role === 'Defender').length} defense</small></div>
            <div class="qol-pd-stat"><span>Trend</span>${trendHtml(model.trend)}</div>
            <div class="qol-pd-actions">
                <div class="qol-pd-action${model.identity.playerId ? '' : ' secondary'}" data-pd-open-profile="${escapeHtml(model.identity.playerId)}">Open Profile</div>
                <div class="qol-pd-action secondary" data-pd-refresh>Refresh Dossier</div>
            </div>`;
    }

    function watchlistOverview(model) {
        if (!model.watch.length) return '<div class="qol-pd-empty">This player is not currently in a Watchlist.</div>';
        return model.watch.map(item => {
            const entry = item.entry || {};
            const capital = entry.capital || {};
            return `
                <div class="qol-pd-note">
                    <strong>${escapeHtml(item.tabName)}</strong>
                    <div class="qol-pd-kv">
                        <b>Population</b><span>${formatNumber(numeric(entry.population))}${Number.isFinite(Number(entry.populationChange)) ? ` (${formatSigned(entry.populationChange)})` : ''}</span>
                        <b>Villages</b><span>${Array.isArray(entry.villages) ? entry.villages.length : '—'}${Number.isFinite(Number(entry.villageChange)) ? ` (${formatSigned(entry.villageChange)})` : ''}</span>
                        <b>Capital</b><span>${escapeHtml(clean(capital.name) || '—')} ${escapeHtml(clean(capital.coords) || '')}</span>
                        <b>Last refresh</b><span>${entry.lastUpdatedAt ? escapeHtml(formatDate(entry.lastUpdatedAt)) : '—'}</span>
                    </div>
                    ${clean(entry.notes) ? `<div style="margin-top:6px"><b>Note:</b> ${escapeHtml(clean(entry.notes))}</div>` : ''}
                </div>`;
        }).join('');
    }

    function societyOverview(model) {
        if (!model.societies.length) return '<div class="qol-pd-empty">No current Secret Society scan contains this player.</div>';
        return model.societies.map(({ scan, member }) => {
            const roles = ['def', 'off', 'op'].filter(role => member?.[role]).map(role => badge(role.toUpperCase(), 'role')).join('');
            return `
                <div class="qol-pd-ss-block">
                    <div class="qol-pd-ss-title"><span>${escapeHtml(clean(scan?.name) || 'Secret Society')}</span><span>${roles || badge('No roles')}</span></div>
                    <div class="qol-pd-ss-metrics">
                        <div class="qol-pd-ss-metric"><span>Rank</span><strong>#${escapeHtml(clean(member?.rank) || '—')}</strong></div>
                        <div class="qol-pd-ss-metric"><span>Villages</span><strong>${formatNumber(numeric(member?.villages))}</strong></div>
                        <div class="qol-pd-ss-metric"><span>Population</span><strong>${formatNumber(numeric(member?.population))}</strong></div>
                        <div class="qol-pd-ss-metric"><span>Resources Sent</span><strong>${formatNumber(numeric(member?.resourcesSent))}</strong></div>
                        <div class="qol-pd-ss-metric"><span>Def Troops Lost</span><strong>${formatNumber(numeric(member?.troopsLostInDefense))}</strong></div>
                        <div class="qol-pd-ss-metric"><span>Troops Provided</span><strong>${formatNumber(numeric(member?.troopsCurrentlyProvided))}</strong></div>
                    </div>
                    <div style="margin-top:5px;color:#85725a;font-size:8px">Scanned ${escapeHtml(formatDate(scan?.scannedAt || 0))}</div>
                </div>`;
        }).join('');
    }

    function reportSummary(model) {
        const groups = [
            ['Attacking', model.reports.filter(report => report.role === 'Attacker').length],
            ['Defending', model.reports.filter(report => report.role === 'Defender').length],
            ['Scout', model.reports.filter(report => report.category === 'Scout').length]
        ];
        const recent = model.reports[0];
        return `
            <div class="qol-pd-kv">
                ${groups.map(([label, value]) => `<b>${label}</b><span>${value.toLocaleString()}</span>`).join('')}
                <b>Most recent</b><span>${recent ? `${escapeHtml(formatDate(recent.timestamp))} · ${escapeHtml(recent.role)} vs ${escapeHtml(recent.opponent)}` : '—'}</span>
                <b>Archive source</b><span>${model.reports.length ? 'Report Archive' : 'No matching archived reports'}</span>
            </div>`;
    }

    function renderOverview(model) {
        const target = ensurePanel().querySelector('[data-pd-view="overview"]');
        target.innerHTML = `
            <div class="qol-pd-overview-grid">
                <section class="qol-pd-card"><div class="qol-pd-card-head"><span>Watchlist</span><span>${model.watch.length}</span></div><div class="qol-pd-card-body"><div class="qol-pd-notes">${watchlistOverview(model)}</div></div></section>
                <section class="qol-pd-card"><div class="qol-pd-card-head"><span>Secret Society</span><span>${model.societies.length}</span></div><div class="qol-pd-card-body">${societyOverview(model)}</div></section>
                <section class="qol-pd-card full"><div class="qol-pd-card-head"><span>Archived Report Summary</span><span>${model.reports.length}</span></div><div class="qol-pd-card-body">${reportSummary(model)}</div></section>
            </div>`;
    }

    function renderReports(model) {
        const target = ensurePanel().querySelector('[data-pd-view="reports"]');
        const rows = model.reports.slice(0, MAX_REPORT_ROWS).map(report => `
            <tr>
                <td>${escapeHtml(formatDate(report.timestamp))}</td>
                <td><span class="qol-pd-report-role ${escapeHtml(report.role)}">${escapeHtml(report.role)}</span></td>
                <td title="${escapeHtml(report.opponent)}">${escapeHtml(report.opponent)}</td>
                <td title="${escapeHtml(report.route)}">${escapeHtml(report.route)}</td>
                <td title="${escapeHtml(report.type)}">${escapeHtml(report.type)}</td>
                <td title="${escapeHtml(report.result)}">${escapeHtml(report.result)}</td>
            </tr>`).join('');
        target.innerHTML = model.reports.length
            ? `<table><thead><tr><th style="width:145px">Date</th><th style="width:75px">Role</th><th style="width:145px">Opponent</th><th style="width:190px">Villages</th><th style="width:130px">Type</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>${model.reports.length > MAX_REPORT_ROWS ? `<div class="qol-pd-empty">Showing the newest ${MAX_REPORT_ROWS} of ${model.reports.length} matching reports.</div>` : ''}`
            : '<div class="qol-pd-empty">No archived reports match this exact player name.</div>';
    }

    function eventTypeLabel(type) {
        if (type === 'ss-joined') return 'Joined SS';
        if (type === 'ss-left') return 'Left SS';
        if (type === 'ss-change') return 'SS Change';
        if (type === 'report') return 'Report';
        if (type === 'watchlist') return 'Watchlist';
        return 'Event';
    }

    function renderTimeline(model) {
        const target = ensurePanel().querySelector('[data-pd-view="timeline"]');
        target.innerHTML = model.timeline.length
            ? `<div class="qol-pd-timeline">${model.timeline.map(event => `
                <div class="qol-pd-event ${escapeHtml(event.type)}">
                    <div class="qol-pd-event-time">${escapeHtml(formatDate(event.timestamp))}</div>
                    <div class="qol-pd-event-type">${escapeHtml(eventTypeLabel(event.type))}</div>
                    <div class="qol-pd-event-main"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.detail || '')}</span></div>
                </div>`).join('')}</div>`
            : '<div class="qol-pd-empty">No dated Watchlist, Secret Society or Report Archive activity is available for this player yet.</div>';
    }

    async function renderActive() {
        if (!activeIdentity) return;
        const token = ++renderToken;
        const archive = await readReportArchive();
        if (token !== renderToken || !activeIdentity) return;
        const model = buildModel(activeIdentity, archive);
        activeIdentity = model.identity;
        renderHero(model);
        renderOverview(model);
        renderReports(model);
        renderTimeline(model);
        setTab(activeTab);
    }

    async function open(seed) {
        if (!enabled()) return;
        const identity = resolveIdentity(seed || {});
        if (!identity.playerId && !identity.playerName) return;
        activeIdentity = identity;
        activeTab = 'overview';
        window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'playerDossier' } }));
        const panel = ensurePanel();
        panel.classList.add('qol-open');
        requestAnimationFrame(positionPanel);
        await renderActive();
    }

    function close() {
        document.getElementById(PANEL_ID)?.classList.remove('qol-open');
    }

    function openProfile(playerId) {
        if (!playerId) return;
        close();
        let base = String(location.hash || '#/').split(/\/window:|\/playerId:|\/profileTab:/)[0];
        base = base.replace(/\/$/, '');
        location.hash = `${base}/playerId:${playerId}/profileTab:playerProfile/window:profile`;
    }

    function inlineOpenButton(playerId, playerName, className = '') {
        const button = document.createElement('span');
        button.className = `qol-pd-inline-open ${className}`.trim();
        button.title = `Open ${playerName || 'player'} dossier`;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.dataset.pdPlayerId = clean(playerId);
        button.dataset.pdPlayerName = clean(playerName);
        button.innerHTML = dossierIcon();
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            void open({ playerId: button.dataset.pdPlayerId, playerName: button.dataset.pdPlayerName });
        };
        button.addEventListener('click', activate);
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        return button;
    }

    function injectWatchlistButtons() {
        document.querySelectorAll('#qol-watchlist-container .qol-wl-player-cell').forEach(cell => {
            if (cell.querySelector('.qol-pd-inline-open')) return;
            const link = cell.querySelector('.qol-wl-player-link[data-route*="playerId:"]');
            if (!link) return;
            const playerId = String(link.dataset.route || '').match(/playerId:(\d+)/)?.[1] || '';
            const playerName = clean(link.textContent);
            cell.insertBefore(inlineOpenButton(playerId, playerName), cell.querySelector('.qol-wl-del-entry') || null);
        });
    }

    function ssNameMap() {
        const map = new Map();
        readCurrentSocieties().forEach(scan => {
            (Array.isArray(scan?.members) ? scan.members : []).forEach(member => {
                const name = normalized(member?.name);
                if (!name || map.has(name)) return;
                map.set(name, { playerId: clean(member?.playerId), playerName: clean(member?.name) });
            });
        });
        return map;
    }

    function injectSocietyButtons() {
        const map = ssNameMap();
        document.querySelectorAll('#qol-ss-scanner-panel .qol-ss-name-column').forEach(cell => {
            if (cell.querySelector('.qol-pd-inline-open')) return;
            const name = clean(cell.childNodes[0]?.textContent || cell.textContent);
            const identity = map.get(normalized(name)) || { playerName: name, playerId: '' };
            cell.appendChild(inlineOpenButton(identity.playerId, identity.playerName));
        });
    }

    function profilePlayerName() {
        const selectors = [
            'div.content[ng-if="!kingdomProfile"]',
            '.playerProfile .playerName',
            '.playerName'
        ];
        for (const selector of selectors) {
            const text = clean(document.querySelector(selector)?.textContent);
            if (text) return text;
        }
        return '';
    }

    function injectProfileButton() {
        const playerId = String(location.hash || '').match(/(?:^|\/)playerId:(\d+)/i)?.[1] || '';
        if (!playerId) {
            document.querySelectorAll('.qol-pd-profile-open').forEach(button => button.remove());
            return;
        }
        const header = document.querySelector('.contentBox.playerDescription > .contentBoxHeader');
        if (!header || header.querySelector('.qol-pd-profile-open')) return;
        const button = document.createElement('span');
        button.className = 'qol-pd-profile-open';
        button.textContent = 'Open Dossier';
        button.title = 'Open Player Dossier';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void open({ playerId, playerName: profilePlayerName() });
        });
        header.appendChild(button);
    }

    function injectEntryPoints() {
        if (!enabled()) {
            document.querySelectorAll('.qol-pd-inline-open,.qol-pd-profile-open').forEach(button => button.remove());
            close();
            return;
        }
        injectWatchlistButtons();
        injectSocietyButtons();
        injectProfileButton();
    }

    function startObserver() {
        if (observer || !document.documentElement) return;
        observer = new MutationObserver(() => injectEntryPoints());
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function start() {
        injectStyles();
        ensurePanel();
        injectEntryPoints();
        startObserver();
        refreshTimer = window.setInterval(injectEntryPoints, REFRESH_MS);
    }

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        injectEntryPoints();
    });
    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'playerDossier') close();
    });
    window.addEventListener('resize', () => {
        const panel = document.getElementById(PANEL_ID);
        if (!panel?.classList.contains('qol-open')) return;
        const rect = panel.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8));
        const top = Math.max(8, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 8));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const panel = document.getElementById(PANEL_ID);
        if (panel?.classList.contains('qol-open')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();

    window.APES_PLAYER_DOSSIER = Object.freeze({ open, close, refresh: renderActive });
    console.log('[APES Player Dossier] Initialized.');
})();
