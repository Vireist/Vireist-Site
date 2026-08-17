'use strict';
/* ============ УТИЛИТЫ ============ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = document.documentElement;
const getJSON = async p => { const r = await fetch(p); if (!r.ok) throw new Error(p + ' → ' + r.status); return r.json(); };
const getText = async p => { const r = await fetch(p); if (!r.ok) throw new Error(p + ' → ' + r.status); return r.text(); };

/* ============ МАЛЫЙ MARKDOWN ============ */
function mdToHtml(src){
    const inline = t => esc(t)
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g,'<em>$1</em>')
        .replace(/`([^`]+)`/g,'<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    let html='', list=false, para=[];
    const flushP=()=>{ if(para.length){ html+='<p>'+inline(para.join(' '))+'</p>'; para=[]; } };
    const flushL=()=>{ if(list){ html+='</ul>'; list=false; } };
    for (const raw of String(src).replace(/\r/g,'').split('\n')){
        const t=raw.trim(); let m;
        if(!t){ flushP(); flushL(); continue; }
        if(m=t.match(/^(#{1,3})\s+(.*)/)){ flushP(); flushL(); const lv=m[1].length+1; html+=`<h${lv}>`+inline(m[2])+`</h${lv}>`; continue; }
        if(/^(-{3,}|\*{3,})$/.test(t)){ flushP(); flushL(); html+='<hr>'; continue; }
        if(m=t.match(/^[-*]\s+(.*)/)){ flushP(); if(!list){ html+='<ul>'; list=true; } html+='<li>'+inline(m[1])+'</li>'; continue; }
        if(m=t.match(/^>\s?(.*)/)){ flushP(); flushL(); html+='<blockquote>'+inline(m[1])+'</blockquote>'; continue; }
        para.push(t);
    }
    flushP(); flushL(); return html;
}
/* ============ ФРОНТМАТТЕР ============ */
function parseFrontmatter(src){
    const m = String(src).replace(/\r/g,'').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if(!m) return {meta:{}, body:String(src)};
    const meta={};
    for(const line of m[1].split('\n')){
        const i=line.indexOf(':'); if(i<0) continue;
        let k=line.slice(0,i).trim(), v=line.slice(i+1).trim();
        if(v.startsWith('[')&&v.endsWith(']')) v=v.slice(1,-1).split(',').map(s=>s.trim()).filter(Boolean);
        meta[k]=v;
    }
    return {meta, body:m[2]};
}

const state = { config:{}, games:[], reviews:[], contacts:[], about:'',
    filters:{q:'', system:'', format:'', genre:'', price:''},
    revShown: 6, revPageSize: 6 };

/* ============ СТАРТ ============ */
(async function boot(){
    initTheme();
    try{
        state.config   = await getJSON('data/config.json');
        state.revPageSize = Number(state.config.reviewsPageSize) || 6;
        state.revShown    = state.revPageSize;
        const manifest = await getJSON('data/manifest.json');
        state.contacts = await getJSON('data/contacts.json');
        const loadDoc = f => getText(f).then(parseFrontmatter).catch(e=>{ console.warn('Не читается:', f, e); return null; });
        const [games, reviews, about, table, recruits] = await Promise.all([
            Promise.all(manifest.games.map(loadDoc)),
            Promise.all(manifest.reviews.map(loadDoc)),
            getText(state.config.aboutFile || 'data/about.md').catch(()=> ''),
            getJSON(state.config.tableFile || 'data/table.json').catch(()=> []),
            getJSON(state.config.recruitsFile || 'data/recruits.json').catch(()=> [])
        ]);
        state.recruits = recruits;
        state.games   = games.filter(Boolean).sort((a,b)=>String(a.meta.id).localeCompare(String(b.meta.id)));
        state.reviews = reviews.filter(Boolean);
        state.about   = about;
        state.table   = table;
        buildStatic(); buildFilters();
        renderCatalog(); renderReviews(); renderContacts(); renderRecruits(); renderTable();
        $('#catalog').addEventListener('click', e=>{
            const card=e.target.closest('.case-card');
            if(card && !e.target.closest('button')) location.hash='#/game/'+encodeURIComponent(card.dataset.id);
        });
        $('#catalog').addEventListener('keydown', e=>{
            const card=e.target.closest('.case-card');
            if(card && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); location.hash='#/game/'+encodeURIComponent(card.dataset.id); }
        });
        window.addEventListener('hashchange', route);
        route();
    }catch(e){
        console.error(e);
        $('#view-home').innerHTML =
            `<div class="container load-error"><h2>Ошибка загрузки данных</h2>
       <p>${esc(e.message)}</p>
       <p>Если вы открыли сайт двойным кликом по index.html — так не заработает (fetch запрещён для file://).<br>
       Запустите локальный сервер или откройте сайт на GitHub Pages — см. README.md.</p></div>`;
    }
})();

/* ============ ТЕМА ============ */
function initTheme(){
    const saved = localStorage.getItem('vireist-theme');
    if(saved) setTheme(saved, true);
    $('#theme-btn').addEventListener('click', ()=> setTheme(root.dataset.theme==='dark' ? 'light' : 'dark'));
}
function setTheme(t, silent){
    const animate = !silent && matchMedia('(prefers-reduced-motion: no-preference)').matches;
    if(animate) root.classList.add('theme-anim');
    root.dataset.theme = t;
    if(!silent) localStorage.setItem('vireist-theme', t);
    $('#theme-btn').textContent = t==='dark' ? '☀' : '☾';
    if(animate){
        clearTimeout(setTheme._t);
        setTheme._t = setTimeout(()=>root.classList.remove('theme-anim'), 500);
    }
}

/* ============ СТАТИКА ИЗ КОНФИГА ============ */
function buildStatic(){
    const c = state.config;
    const nick = c.nick || 'Vireist';
    const name = c.name || '';
    document.title = (name ? name + ' «' + nick + '» — ' : nick + ' — ') + 'досье мастера: НРИ, хоррор и драма';
    $('#logo-nick').textContent = (c.nick||'VIREIST').toUpperCase();
    $('#hero-overline').textContent = c.overline || '';
    $('#hero-name').innerHTML = esc(c.name||'') + ' <span class="accent">«' + esc(c.nick||'') + '»</span>';
    $('#hero-role').innerHTML = '<span class="slashes">///</span> ' + esc((c.role||'').toUpperCase());
    $('#hero-text').textContent = c.heroText || '';
    $('#hero-stamp').textContent = c.stamp || '';
    $('#hero-stamp').style.display = c.stamp ? '' : 'none';
    $('#hero-photo').innerHTML = c.portrait ? `
    <figure class="polaroid">
      <span class="tape"></span>
      <img src="${esc(c.portrait)}" alt="Портрет ведущего">
      <figcaption>${esc(c.portraitCaption||'')}</figcaption>
      <span class="tape b"></span>
    </figure>` : '';
    const systems = [...new Set(state.games.map(g=>(g.meta.system||'').toLowerCase()).filter(Boolean))];
    const formats = [...new Set(state.games.map(g=>(g.meta.format||'').toLowerCase()).filter(Boolean))];
    $('#stats').innerHTML = `
    <div class="stat"><b>${state.games.length}</b><span>дел в архиве</span></div>
    <div class="stat"><b>${systems.length}</b><span>системы</span></div>
    <div class="stat"><b>${formats.length}</b><span>формата</span></div>`;
    const tick = (c.ticker||[]).map(x=>`<span>${esc(x)}</span><i>✦</i>`).join('');
    $('#ticker-track').innerHTML = tick + tick;
    $('#about-text').innerHTML = mdToHtml(state.about);
    $('#systems-list').innerHTML = (c.systems||[]).map(s=>`
    <div class="sys-card"><h4>${esc(s.title)} <span class="tagline">// ${esc(s.tag)}</span></h4>
    <p>${esc(s.text)}</p></div>`).join('');
    $('#license-line').textContent = `Материалы публикуются под лицензией ${c.license||'CC BY-NC-SA 4.0'}: делитесь и адаптируйте для своих игр с указанием автора, без коммерческого использования.`;
    $('#year').textContent = new Date().getFullYear();
    $('#footer-nick').textContent = c.nick || 'Vireist';
}

/* ============ ФИЛЬТРЫ ============ */
function buildFilters(){
    const uniq = k => [...new Set(state.games.map(g=>g.meta[k]||'').filter(Boolean))];
    makeChips('#f-system','system', uniq('system'));
    makeChips('#f-format','format', uniq('format'));
    const genres = [...new Set(state.games.flatMap(g=>g.meta.tags||[]))].sort((a,b)=>a.localeCompare(b,'ru'));
    $('#genre').insertAdjacentHTML('beforeend', genres.map(g=>`<option value="${esc(g.toLowerCase())}">${esc(g)}</option>`).join(''));
    $('#genre').addEventListener('change', e=>{ state.filters.genre=e.target.value; renderCatalog(); });
    $('#search').addEventListener('input', e=>{ state.filters.q=e.target.value.trim().toLowerCase(); renderCatalog(); });
    $('#f-price').addEventListener('click', e=>{
        const b=e.target.closest('.chip'); if(!b) return;
        chipSelect('#f-price', b); state.filters.price=b.dataset.price; renderCatalog();
    });
}
function makeChips(sel, key, values){
    $(sel).innerHTML = `<button class="chip active" data-val="">Все</button>` +
        values.map(v=>`<button class="chip" data-val="${esc(v.toLowerCase())}">${esc(v)}</button>`).join('');
    $(sel).addEventListener('click', e=>{
        const b=e.target.closest('.chip'); if(!b) return;
        chipSelect(sel, b); state.filters[key]=b.dataset.val; renderCatalog();
    });
}
function chipSelect(sel, btn){ $$(sel+' .chip').forEach(c=>c.classList.toggle('active', c===btn)); }
function resetFilters(){
    state.filters={q:'',system:'',format:'',genre:'',price:''};
    $('#search').value=''; $('#genre').value='';
    ['#f-system','#f-format','#f-price'].forEach(s=>chipSelect(s, $(s+' .chip')));
    renderCatalog();
}
function filteredGames(){
    const f=state.filters;
    return state.games.filter(g=>{
        const m=g.meta;
        if(f.q && !(m.title||'').toLowerCase().includes(f.q)) return false;
        if(f.system && (m.system||'').toLowerCase()!==f.system) return false;
        if(f.format && (m.format||'').toLowerCase()!==f.format) return false;
        if(f.genre  && !(m.tags||[]).map(t=>t.toLowerCase()).includes(f.genre)) return false;
        if(f.price  && (m.price||'').toLowerCase()!==f.price) return false;
        return true;
    });
}

/* ============ КАТАЛОГ ============ */
function coverHtml(m, cls){
    return m.cover
        ? `<div class="${cls}"><img src="${esc(m.cover)}" alt=""></div>`
        : `<div class="${cls} empty"></div>`;
}
function bindCoverErrors(scope){
    $$(scope+' .case-cover img, '+scope+' .doc-cover img').forEach(img=>
        img.addEventListener('error', ()=>{ img.parentNode.classList.add('empty'); img.remove(); }));
}
function caseCard(g){
    const m=g.meta, paid=(m.price||'').toLowerCase()==='платно';
    return `<article class="case-card" data-id="${esc(m.id)}" tabindex="0" role="link" aria-label="${esc(m.title)}">
    <div class="case-top"><span class="case-num">Дело № ${esc(m.id)}</span>
      <span class="price ${paid?'paid':'free'}">${esc(m.price||'')}</span></div>
    ${coverHtml(m,'case-cover')}
    <div class="case-body">
      <h3>${esc(m.title)}</h3>
      <p>${esc(m.teaser||'')}</p>
      <div class="meta"><span class="sys">${esc(m.system)}</span> · ${esc(m.format)} · ${esc(m.players)} · ${esc(m.duration)}</div>
      <div class="tags">${(m.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div></article>`;
}
function renderCatalog(){
    const list=filteredGames();
    $('#count').textContent='Найдено дел: '+list.length;
    $('#catalog').innerHTML = list.length ? list.map(caseCard).join('') :
        `<div class="empty-state">По такому запросу дел нет — сбросьте фильтры.<br>
     <button class="btn ghost" id="reset-f">Сбросить</button></div>`;
    bindCoverErrors('#catalog');
    const r=$('#reset-f'); if(r) r.addEventListener('click', resetFilters);
}

/* ============ ЧТО БУДЕТ ============ */
function renderTable(){
    const cols = state.table || [];
    $('#table').hidden = !cols.length;
    $('#table-cols').innerHTML = cols.map(col=>{
        const neg = (col.type||'').toLowerCase()==='no';
        return `<div class="table-col">
      <h3 class="table-title${neg?' neg':''}">${esc(col.title||'')}</h3>
      <div class="table-stack">${(col.items||[]).map((it,i)=>`
        <div class="table-card${neg?' no':''}">
          <span class="t-num">${String(i+1).padStart(2,'0')}</span>
          <h3>${esc(it.title||'')}</h3>
          <p>${esc(it.text||'')}</p>
        </div>`).join('')}
      </div></div>`;
    }).join('');
}

/* ============ АКТИВНЫЕ НАБОРЫ ============ */
function contactCardHtml(c){
    const pref = c.preferred;
    const label = typeof pref === 'string' ? pref : 'предпочтительно';
    return `<a class="contact-card${pref?' preferred':''}" href="${esc(c.url)}" target="_blank" rel="noopener">
    ${pref ? `<span class="pref-stamp">${esc(label)}</span>` : ''}
    <span class="c-icon">${ICONS[c.icon]||ICONS.link}</span>
    <span class="c-text"><strong>${esc(c.title)}</strong><em>${esc(c.handle)}</em><small>${esc(c.note||'')}</small></span>
    <span class="c-arrow">→</span>
  </a>`;
}
function renderContacts(){
    $('#contacts-list').innerHTML = state.contacts.map(contactCardHtml).join('');
}
function renderRecruits(){
    const items = state.recruits || [];
    $('#recruits').hidden = !items.length;
    $('#recruits-list').innerHTML = items.map(contactCardHtml).join('');
}
/* ============ ОТЗЫВЫ / КОНТАКТЫ ============ */
function renderReviews(){
    const reviews = state.reviews || [];
    const total = reviews.length;
    const shown = Math.min(state.revShown, total);
    const slice = reviews.slice(0, shown);

    $('#reviews-list').innerHTML = slice.map((r,i)=>`
        <figure class="rev-card" style="--rot:${i%2 ? '1.3deg' : '-1.6deg'}">
          ${mdToHtml(r.body)}
          <figcaption><span class="rev-name">${esc(r.meta.name||'Аноним')}</span>
          <span class="rev-game">${esc(r.meta.game||'')}</span></figcaption>
        </figure>`).join('');

    $('#reviews-count').textContent = total ? `показано ${shown} из ${total}` : '';

    // Анимация появления только что пришедших карточек
    $$('#reviews-list .rev-card').forEach((el,i)=>{
        if(i >= shown - Math.min(6, Math.max(state.revPageSize, 1))){
            el.classList.add('rev-enter');
        }
    });

    const foot = $('#reviews-foot');
    if(!foot) return;
    if(total <= state.revPageSize){ foot.hidden = true; return; }
    foot.hidden = false;

    const allShown = shown === total;
    foot.innerHTML = allShown
        ? `<button class="btn ghost" id="rev-fold">Скрыть</button>
           <span class="sec-count-foot">распечатано ${total} показаний</span>`
        : `<button class="btn" id="rev-more">Запросить ещё · +${Math.min(state.revPageSize, total-shown)}</button>
           <button class="btn ghost" id="rev-all">Показать все ${total}</button>`;

    const more = $('#rev-more');
    const btnAll = $('#rev-all');
    const fold = $('#rev-fold');
    if(more) more.onclick = ()=>{ state.revShown = Math.min(total, state.revShown + state.revPageSize); renderReviews(); };
    if(btnAll) btnAll.onclick = ()=>{ state.revShown = total; renderReviews(); };
    if(fold) fold.onclick = ()=>{ state.revShown = state.revPageSize; renderReviews(); window.scrollTo({top: document.getElementById('reviews').offsetTop - 60, behavior:'smooth'}); };}
const ICONS = {
    telegram:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
    mail:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="1"/><path d="m2 7 10 7L22 7"/></svg>',
    vk:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="12" y="16" text-anchor="middle" font-size="9" font-family="monospace" fill="currentColor" stroke="none">VK</text></svg>',
    discord:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5c-1.5 0-3-.4-4.3-1.1L3 20l1.1-5.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M9.5 11.5h.01M14.5 11.5h.01"/></svg>',
    link:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'
};

/* ============ СТРАНИЦА ДЕЛА / РОУТЕР ============ */
function renderGame(id){
    const g = state.games.find(x=>x.meta.id===id);
    const view = $('#view-game');
    if(!g){
        view.innerHTML = `<div class="container game-doc"><a class="back" href="#/">← В картотеку</a>
      <h2 class="doc-title">Дело не найдено</h2>
      <p class="hero-text">Такого номера в архиве нет. Возможно, файл ещё не добавлен в manifest.json.</p></div>`;
        return;
    }
    const m=g.meta, paid=(m.price||'').toLowerCase()==='платно';
    view.innerHTML = `<div class="container game-doc">
    <a class="back" href="#/" data-section="games">← В картотеку</a>
    <div class="doc-head"><span class="case-num">Дело № ${esc(m.id)}</span>
      <span class="price ${paid?'paid':'free'}">${esc(m.price||'')}</span></div>
    <h2 class="doc-title">${esc(m.title)}</h2>
    <p class="hero-text">${esc(m.teaser||'')}</p>
    <dl class="doc-meta">
      <div><dt>Система</dt><dd class="t">${esc(m.system)}</dd></div>
      <div><dt>Формат</dt><dd>${esc(m.format)}</dd></div>
      <div><dt>Игроки</dt><dd>${esc(m.players)}</dd></div>
      <div><dt>Длительность</dt><dd>${esc(m.duration)}</dd></div>
      <div><dt>Стоимость</dt><dd>${esc(m.price)}</dd></div>
    </dl>
    ${coverHtml(m,'doc-cover')}
    <div class="doc-body">${mdToHtml(g.body)}</div>
    <div class="doc-actions">
      <a class="btn" href="#/" data-section="contacts">Записаться на игру</a>
      <a class="btn ghost" href="#/" data-section="games">Все дела</a>
    </div></div>`;
    bindCoverErrors('#view-game');
}
function route(){
    const m = location.hash.match(/^#\/game\/(.+)$/);
    if(m){
        renderGame(decodeURIComponent(m[1]));
        $('#view-home').hidden = true; $('#view-game').hidden = false;
        window.scrollTo(0,0);
    }else{
        $('#view-game').hidden = true; $('#view-home').hidden = false;
    }
}
/* навигация по секциям (работает и со страницы дела) */
document.addEventListener('click', e=>{
    const a = e.target.closest('[data-section]'); if(!a) return;
    e.preventDefault();
    const go = ()=>{ const el=document.getElementById(a.dataset.section); el && el.scrollIntoView({behavior:'smooth', block:'start'}); };
    if($('#view-home').hidden){ location.hash='#/'; setTimeout(go, 90); } else go();
});