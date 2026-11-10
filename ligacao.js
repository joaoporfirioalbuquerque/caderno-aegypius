/* Caderno de Campo Aegypius — ligação ao Supabase.
   Dá à página a mesma interface que ela usava dentro do Claude (window.claude.use('db' | 'assets' | 'user' | 'downloads')),
   com sessão por código de email, cópia local dos dados para trabalhar sem rede e atualizações em direto. */
(function(){
  'use strict';
  const CFG = window.AEG_CONFIG || {};
  const configured = CFG.url && CFG.anonKey && !/COLAR/.test(CFG.url + CFG.anonKey);
  const sb = configured ? window.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'aeg-auth'}
  }) : null;
  const LS = {
    get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
    del(k){ try{ localStorage.removeItem(k); }catch(e){} }
  };
  const err = (code, message) => ({code, message});
  const isNet = e => !e || /fetch|network|Failed|Load failed|timeout/i.test(String(e.message || e)) || e.code === 'unavailable';
  const mapErr = e => isNet(e) ? err('unavailable', 'Sem ligação') : (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) ? err('invalid_argument', 'Sem permissão para gravar') : err('unavailable', e.message || 'Erro');

  /* ---------------- sessão ---------------- */
  let ME = LS.get('aeg-me', null);          // {email, nome, papel, membro}
  let ready, resolveReady;
  ready = new Promise(r => resolveReady = r);
  const hasStoredSession = () => { try{ return !!localStorage.getItem('aeg-auth'); }catch(e){ return false; } };

  async function loadMember(email){
    if(!navigator.onLine && ME && ME.email === email) return ME;
    try{
      const {data, error} = await sb.from('membros').select('email,nome,papel').eq('email', email).maybeSingle();
      if(error) throw error;
      ME = {email, nome: data?.nome || '', papel: data?.papel || '', membro: !!data};
    }catch(e){
      if(ME && ME.email === email) return ME;   // sem rede: fica o que já se sabia
      ME = {email, nome: '', papel: '', membro: false};
    }
    LS.set('aeg-me', ME); return ME;
  }

  async function start(){
    if(!sb){ showGate('config'); return; }
    let session = null;
    try{ session = (await sb.auth.getSession()).data.session; }catch(e){}
    if(session){ await loadMember(session.user.email.toLowerCase()); return enter(); }
    if(hasStoredSession() && ME){ return enter(); }   // sem rede com sessão guardada: entra com os dados deste aparelho
    showGate('email');
  }
  function enter(){ hideGate(); resolveReady(true); addAccountCard(); if(ME && !ME.membro) notMemberNote(); }

  /* ---------------- ecrã de entrada ---------------- */
  let gate = null, gateEmail = '';
  function gateHTML(step){
    if(step === 'config') return `<h1>Caderno de Campo Aegypius</h1><p>Falta ligar a app ao Supabase: preencha <code>js/config.js</code> com o URL e a chave pública do projeto (ver o guia).</p>`;
    if(step === 'code') return `<h1>Código enviado</h1><p>Enviámos um código de 6 dígitos para <b>${esc(gateEmail)}</b>. Pode demorar um minuto; veja também o spam.</p>
      <label for="g-code">Código</label><input id="g-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456">
      <button id="g-go" class="btn primary">Entrar</button><button id="g-back" class="btn">Usar outro email</button><p id="g-msg" class="g-msg"></p>`;
    return `<h1>Caderno de Campo Aegypius</h1><p>Entre com o seu email. Recebe um código para confirmar; não há palavra-passe.</p>
      <label for="g-email">Email</label><input id="g-email" type="email" inputmode="email" autocomplete="email" placeholder="nome@exemplo.pt" value="${esc(gateEmail)}">
      <button id="g-send" class="btn primary">Enviar código</button><p id="g-msg" class="g-msg"></p>
      <p class="g-small">Só quem foi autorizado pelo responsável do caderno vê os dados.</p>`;
  }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function showGate(step){
    if(!gate){ gate = document.createElement('div'); gate.id = 'gate'; document.body.appendChild(gate); }
    gate.innerHTML = `<div class="g-card">${gateHTML(step)}</div>`; gate.hidden = false;
    const msg = t => { const m = gate.querySelector('#g-msg'); if(m) m.textContent = t; };
    const send = gate.querySelector('#g-send');
    if(send){
      const input = gate.querySelector('#g-email'); input.focus();
      const go = async () => {
        const email = input.value.trim().toLowerCase();
        if(!/^\S+@\S+\.\S+$/.test(email)){ msg('Escreva um email válido.'); return; }
        if(!navigator.onLine){ msg('Precisa de rede para entrar pela primeira vez.'); return; }
        send.disabled = true; msg('A enviar…');
        const {error} = await sb.auth.signInWithOtp({email, options: {shouldCreateUser: true}});
        send.disabled = false;
        if(error){ msg(/rate|limit/i.test(error.message) ? 'Foram pedidos códigos a mais. Espere uns minutos e tente de novo.' : 'Não foi possível enviar: ' + error.message); return; }
        gateEmail = email; showGate('code');
      };
      send.onclick = go; input.onkeydown = e => { if(e.key === 'Enter') go(); };
    }
    const ok = gate.querySelector('#g-go');
    if(ok){
      const input = gate.querySelector('#g-code'); input.focus();
      const go = async () => {
        const token = input.value.replace(/\s/g, '');
        if(!/^\d{6,8}$/.test(token)){ msg('O código tem 6 dígitos.'); return; }
        ok.disabled = true; msg('A confirmar…');
        const {data, error} = await sb.auth.verifyOtp({email: gateEmail, token, type: 'email'});
        ok.disabled = false;
        if(error){ msg('Código errado ou expirado. Peça outro.'); return; }
        await loadMember(data.user.email.toLowerCase()); enter();
      };
      ok.onclick = go; input.onkeydown = e => { if(e.key === 'Enter') go(); };
      gate.querySelector('#g-back').onclick = () => showGate('email');
    }
  }
  function hideGate(){ if(gate) gate.hidden = true; }
  function notMemberNote(){
    const t = document.getElementById('noacc-t');
    if(t) t.textContent = `Entrou como ${ME.email}, mas este email ainda não foi autorizado. Peça ao responsável do caderno para o acrescentar à lista de membros.`;
  }
  function addAccountCard(){
    const v = document.getElementById('v-exportar'); if(!v || document.getElementById('acc-card')) return;
    const c = document.createElement('div'); c.className = 'card'; c.id = 'acc-card';
    c.innerHTML = `<h3>Sessão</h3><p class="hint" style="margin:0">${esc(ME?.nome ? ME.nome + ' · ' : '')}${esc(ME?.email || '')}${ME?.papel === 'admin' ? ' · administrador' : ''}</p>
      <div class="btns"><button class="btn small" type="button" id="acc-out">Terminar sessão</button></div>
      <p class="hint" style="margin:0">Ao terminar a sessão apaga-se a cópia dos dados deste aparelho. Registos ainda por sincronizar perdem-se: guarde-os antes em ficheiro.</p>`;
    v.prepend(c);
    c.querySelector('#acc-out').onclick = async () => {
      const pend = LS.get('aeg-outbox-v1', []);
      if(pend.length && !confirm(`Há ${pend.length} alteração(ões) por sincronizar neste aparelho. Terminar mesmo a sessão?`)) return;
      try{ await sb.auth.signOut(); }catch(e){}
      Object.keys(localStorage).filter(k => /^(aeg-|sbc-)/.test(k)).forEach(k => LS.del(k));
      location.reload();
    };
  }

  /* ---------------- base de dados (coleções → tabela docs) ---------------- */
  const cols = new Map();   // col -> {map: Map(id->data), subs:Set(cb), loaded:boolean}
  function colState(col){
    if(!cols.has(col)){
      const cached = LS.get('sbc-' + col, null);
      cols.set(col, {map: new Map(cached ? Object.entries(cached) : []), subs: new Set(), loaded: false, hadCache: !!cached, channel: null});
    }
    return cols.get(col);
  }
  function persist(col){ const s = colState(col); LS.set('sbc-' + col, Object.fromEntries(s.map)); }
  function emit(col, fromCache){
    const s = colState(col);
    const snap = {docs: [...s.map].map(([id, d]) => ({id, data: () => d})), metadata: {fromCache}};
    s.subs.forEach(cb => { try{ cb(snap); }catch(e){ console.error(e); } });
  }
  async function fetchCol(col){
    const s = colState(col); const map = new Map(); const page = 1000;
    for(let from = 0; ; from += page){
      const {data, error} = await sb.from('docs').select('id,data').eq('col', col).range(from, from + page - 1);
      if(error) throw error;
      for(const r of data) map.set(r.id, r.data);
      if(data.length < page) break;
    }
    s.map = map; s.loaded = true; persist(col); emit(col, false);
  }
  function listen(col){
    const s = colState(col); if(s.channel) return;
    s.channel = sb.channel('docs-' + col).on('postgres_changes', {event: '*', schema: 'public', table: 'docs', filter: 'col=eq.' + col}, p => {
      if(p.eventType === 'DELETE'){ const id = p.old && p.old.id; if(id != null) s.map.delete(id); }
      else if(p.new) s.map.set(p.new.id, p.new.data);
      persist(col); emit(col, false);
    }).subscribe(st => { if(st === 'SUBSCRIBED' && s.loaded) fetchCol(col).catch(() => {}); });
  }
  const refreshAll = () => { if(!navigator.onLine) return; for(const col of cols.keys()) fetchCol(col).catch(() => {}); };
  window.addEventListener('online', () => setTimeout(refreshAll, 1000));
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') refreshAll(); });
  setInterval(refreshAll, 120000);

  const db = {
    collection(col){
      return {
        onSnapshot(cb){
          const s = colState(col); s.subs.add(cb);
          setTimeout(() => { if(s.hadCache || s.map.size) emit(col, true); }, 0);
          if(ME && ME.membro !== false){
            fetchCol(col).catch(() => {});   // sem rede: fica a cópia local; a página marca "sem rede" sozinha
            listen(col);
          } else if(ME && ME.membro === false){ setTimeout(() => { s.map = new Map(); emit(col, false); }, 0); }
          return () => s.subs.delete(cb);
        },
        doc(id){
          return {
            async get(){
              try{
                const {data, error} = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle();
                if(error) throw error;
                return {exists: !!data, data: () => data ? data.data : undefined};
              }catch(e){ throw mapErr(e); }
            },
            async set(d){
              try{
                const {error} = await sb.from('docs').upsert({col, id, data: d});
                if(error) throw error;
              }catch(e){ throw mapErr(e); }
              const s = colState(col); s.map.set(id, d); persist(col); emit(col, false);
            },
            async delete(){
              try{
                const {error} = await sb.from('docs').delete().eq('col', col).eq('id', id);
                if(error) throw error;
              }catch(e){ throw mapErr(e); }
              const s = colState(col); s.map.delete(id); persist(col); emit(col, false);
            }
          };
        }
      };
    }
  };

  /* ---------------- fotografias (Storage, pasta "fotos") ---------------- */
  const assets = {
    async upload(blob, opt){
      const type = (opt && opt.type) || blob.type || 'image/jpeg';
      const ext = type === 'image/png' ? 'png' : 'jpg';
      const rnd = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '');
      const path = `${new Date().getFullYear()}/${rnd}.${ext}`;
      if(blob.size > 20 * 1024 * 1024) throw err('too_large', 'Ficheiro grande demais');
      try{
        const {error} = await sb.storage.from('fotos').upload(path, blob, {contentType: type, cacheControl: '31536000', upsert: false});
        if(error) throw error;
      }catch(e){
        if(isNet(e)) throw err('upstream_error', 'Sem ligação');
        if(/quota|exceed|limit/i.test(e.message || '')) throw err('quota_or_state', e.message);
        if(/row-level|permission|Unauthorized|403/i.test(e.message || '')) throw err('not_granted', e.message);
        throw err('upstream_error', e.message);
      }
      const url = sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
      return {id: path, url, sizeBytes: blob.size, contentType: type};
    },
    async delete(id){ if(!id || /^q-/.test(id)) return; const {error} = await sb.storage.from('fotos').remove([id]); if(error) throw err('upstream_error', error.message); },
    async list(){ return {assets: [], usage: {}}; }
  };

  /* ---------------- pessoas ---------------- */
  let names = LS.get('aeg-names', {});
  async function loadNames(){
    try{ const {data, error} = await sb.from('membros').select('email,nome'); if(error) throw error; names = {}; for(const m of data) names[m.email.toLowerCase()] = m.nome || m.email; LS.set('aeg-names', names); }catch(e){}
  }
  const user = {
    async id(){ return ME ? ME.email : null; },
    async me(){ return {id: ME ? ME.email : null, name: ME ? (ME.nome || ME.email) : ''}; },
    async profiles(ids){ if(navigator.onLine) await loadNames(); const out = {}; for(const id of ids) out[id] = {id, name: names[String(id).toLowerCase()] || (String(id).includes('@') ? id : ''), guest: false}; return out; },
    async can(what){ return what === 'data.write' ? !!(ME && ME.membro) : null; },
    isOwner(){ return !!(ME && ME.papel === 'admin'); },
    canEdit(){ return !!(ME && ME.papel === 'admin'); },
    async search(){ return []; }
  };

  /* ---------------- descarregar ficheiros ---------------- */
  const downloads = {
    async save({filename, data}){
      const blob = data instanceof Blob ? data : new Blob([data], {type: /\.json$/.test(filename) ? 'application/json' : /\.csv$|\.tsv$|\.txt$/.test(filename) ? 'text/plain;charset=utf-8' : 'application/octet-stream'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
  };

  const NS = {db, assets, user, downloads};
  window.claude = {
    async use(name){
      if(!(name in NS)) return null;
      await ready;
      if(!sb) return null;
      if(name === 'db' && ME && ME.membro === false && navigator.onLine){ await loadMember(ME.email); }
      return NS[name];
    }
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
