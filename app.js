
// \u2500\u2500 DEBUG (safe - nunca quebra) \u2500\u2500
function dbg(msg, color) {
  try {
    var el = document.getElementById('debug-log');
    if (!el) return;
    var d = document.createElement('div');
    d.style.color = color||'#f87171';
    d.style.marginBottom='2px';
    d.textContent = new Date().toISOString().slice(11,19)+' '+msg;
    el.insertBefore(d, el.firstChild);
  } catch(e) {}
}

/*
\u2550\u2550 SUPABASE TABLE SQL \u2550\u2550
Execute no SQL Editor do Supabase (pkzjxvrmyilgsqpjpdlr):

CREATE TABLE IF NOT EXISTS fitness_state (
  user_id    TEXT PRIMARY KEY,
  state      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fitness_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON fitness_state
  FOR ALL USING (true) WITH CHECK (true);
*/

// \u2500\u2500 SUPABASE \u2500\u2500
var SUPA_URL   = 'https://pkzjxvrmyilgsqpjpdlr.supabase.co';
var SUPA_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBremp4dnJteWlsZ3NxcGpwZGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNjYzNjEsImV4cCI6MjA5NTg0MjM2MX0.rg9Pm2f8P2FhTQeUTygbnWUY3Uujkj2LX7IwtdQQDbw'; // Cole sua anon key aqui
var USER_ID    = 'osiel';
var TABLE      = 'fitness_state';

async function supaLoad() {
  try {
    var r = await fetch(SUPA_URL+'/rest/v1/'+TABLE+'?user_id=eq.'+USER_ID+'&select=state', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
    });
    if (!r.ok) throw new Error('offline');
    var rows = await r.json();
    return (rows && rows.length > 0) ? (rows[0].state || {}) : {};
  } catch(e) {
    try { return JSON.parse(localStorage.getItem('osielfitv7') || '{}'); } catch(e2) { return {}; }
  }
}
async function supaSave(data) {
  try { localStorage.setItem('osielfitv7', JSON.stringify(data)); } catch(e) {}
  try {
    await fetch(SUPA_URL+'/rest/v1/'+TABLE, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ user_id: USER_ID, state: data, updated_at: new Date().toISOString() })
    });
  } catch(e) {}
}

// \u2500\u2500 STORAGE \u2500\u2500
var SK = 'osielfitv7';
var _cache = null;
function load() {
  if (_cache) return _cache;
  try { return JSON.parse(localStorage.getItem(SK) || '{}'); } catch(e) { return {}; }
}
function save(d) {
  _cache = d;
  try { localStorage.setItem(SK, JSON.stringify(d)); } catch(e) {}
  clearTimeout(window._saveTimer);
  window._saveTimer = setTimeout(function() { supaSave(d); }, 1200);
}

// \u2500\u2500 DATA DE IN\u00cdCIO DO PROTOCOLO \u2500\u2500
var START_DATE = new Date('2026-05-13T00:00:00'); // 13 de maio de 2026

function getWeekNumber() {
  var now = new Date();
  var diff = now - START_DATE;
  var days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil((days + 1) / 7));
}

function getPhaseFromWeek(w) {
  if (w <= 3)  return 0; // Fase 1
  if (w === 4) return 1; // Deload
  if (w <= 7)  return 2; // Fase 2
  if (w === 8) return 3; // Deload
  if (w <= 11) return 4; // Fase 3
  return 5;              // Deload final
}

// \u2500\u2500 SCHEDULE: dia da semana \u2192 treino \u2500\u2500
// 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=S\u00e1b
var DAY_SCHEDULE = {
  1: 'a',  // Segunda \u2192 Push I
  2: 'b',  // Ter\u00e7a   \u2192 Pull I
  3: 'c',  // Quarta  \u2192 Legs
  4: null, // Quinta  \u2192 Descanso
  5: 'd',  // Sexta   \u2192 Push II
  6: 'e',  // S\u00e1bado  \u2192 Pull II
  0: null  // Domingo \u2192 Descanso
};

var TREINO_NAMES = {
  a: 'Push I \u2014 Peito Superior + Ombro',
  b: 'Pull I \u2014 Costas Largura + B\u00edceps',
  c: 'Legs \u2014 Quad + Posterior + Gl\u00fateo',
  d: 'Push II \u2014 Peito Inferior + Tr\u00edceps',
  e: 'Pull II \u2014 Costas Espessura + Antebra\u00e7o'
};

// \u2500\u2500 L\u00d3GICA DO LEMBRETE \u2500\u2500
function getTreinoHoje() {
  var st = load();
  var today = new Date();
  var dow = today.getDay(); // 0\u20136
  var scheduled = DAY_SCHEDULE[dow];
  var todayKey = today.toISOString().slice(0,10); // 'YYYY-MM-DD'
  
  // Verificar se o treino de hoje j\u00e1 foi feito
  var doneToday = st['done_' + todayKey];
  if (doneToday) {
    return { type: 'done', treino: doneToday, date: todayKey };
  }
  
  if (scheduled === null) {
    // Dia de descanso \u2014 verificar se h\u00e1 treino atrasado
    var missed = getMissedTreino();
    if (missed) return { type: 'atrasado', treino: missed, date: todayKey };
    return { type: 'descanso', treino: null, date: todayKey };
  }
  
  // Dia de treino normal
  return { type: 'normal', treino: scheduled, date: todayKey };
}

function getMissedTreino() {
  var st = load();
  var today = new Date();
  // Verificar os \u00faltimos 3 dias para treino n\u00e3o feito
  for (var i = 1; i <= 3; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dow = d.getDay();
    var scheduled = DAY_SCHEDULE[dow];
    if (scheduled) {
      var key = d.toISOString().slice(0,10);
      if (!st['done_' + key]) return scheduled;
    }
  }
  return null;
}

function markTreinoDone(treino) {
  var st = load();
  var today = new Date().toISOString().slice(0,10);
  st['done_' + today] = treino;
  save(st);
  renderHojeBanner();
  updateWeekDots();
}

function renderHojeBanner() {
  var info = getTreinoHoje();
  var banner = document.getElementById('hoje-banner');
  var tag    = document.getElementById('hb-tag');
  var title  = document.getElementById('hb-title');
  var sub    = document.getElementById('hb-sub');
  var btn    = document.getElementById('hb-goto-btn');
  
  banner.className = 'hoje-banner show';
  
  if (info.type === 'done') {
    banner.classList.add('descanso');
    tag.textContent   = '\u2713 FEITO HOJE';
    title.textContent = TREINO_NAMES[info.treino];
    sub.textContent   = 'Treino registrado. Boa recupera\u00e7\u00e3o!';
    btn.style.display = 'none';
    return;
  }
  
  btn.style.display = '';
  
  if (info.type === 'descanso') {
    banner.classList.add('descanso');
    tag.textContent   = 'HOJE \u2014 DESCANSO';
    title.textContent = 'Dia de recupera\u00e7\u00e3o ativa';
    sub.textContent   = '55 min de cardio leve \u00b7 Bom sono e hidrata\u00e7\u00e3o.';
    btn.style.display = 'none';
    return;
  }
  
  if (info.type === 'atrasado') {
    banner.classList.add('atrasado');
    tag.textContent   = '\u26a0 TREINO ATRASADO';
    title.textContent = TREINO_NAMES[info.treino];
    sub.textContent   = 'Este treino n\u00e3o foi feito no dia programado. Fa\u00e7a hoje.';
    btn.setAttribute('data-treino', info.treino);
    return;
  }
  
  // normal
  banner.classList.add('normal');
  var dow = new Date().getDay();
  var dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','S\u00e1b'];
  tag.textContent   = 'HOJE \u2014 ' + dayNames[dow];
  title.textContent = TREINO_NAMES[info.treino];
  sub.textContent   = 'Seu treino programado para hoje.';
  btn.setAttribute('data-treino', info.treino);
}

function irParaTreinoHoje() {
  var btn = document.getElementById('hb-goto-btn');
  var t = btn.getAttribute('data-treino');
  if (t) showTreino(t);
}

// \u2500\u2500 SEMANA ATUAL \u2500\u2500
function renderHeaderWeek() {
  var w = getWeekNumber();
  var el = document.getElementById('header-week-sub');
  el.textContent = 'Semana ' + w + ' de 12 \u00b7 Iniciado 13/mai';
}

// \u2500\u2500 PROGRESS\u00c3O DE FASE AUTOM\u00c1TICA \u2500\u2500
var currentPhase = 0;
var currentDeload = false;

var PHASE_DATA = [
  {label:'Fase 1 \u00b7 Sem 1\u20133', color:'var(--green)', isDeload:false, startWeek:1, endWeek:3,
   info:'<strong>Fase 1 \u00b7 Semanas 1\u20133:</strong> Adapta\u00e7\u00e3o e t\u00e9cnica. Compostos come\u00e7am leve \u2014 aprenda o movimento antes de avan\u00e7ar a carga. Meta: +2 kg/semana nos compostos quando a execu\u00e7\u00e3o estiver limpa. Cardio LISS 35 min treino / 55 min descanso.'},
  {label:'Deload \u00b7 Sem 4', color:'var(--red)', isDeload:true, startWeek:4, endWeek:4,
   info:'<strong>Semana 4 \u2014 Deload:</strong> 1 s\u00e9rie de trabalho por exerc\u00edcio. Mesmas cargas. Objetivo: recuperar SNC e articula\u00e7\u00f5es. N\u00e3o pule.'},
  {label:'Fase 2 \u00b7 Sem 5\u20137', color:'var(--green)', isDeload:false, startWeek:5, endWeek:7,
   info:'<strong>Fase 2 \u00b7 Semanas 5\u20137:</strong> Intensidade. Drop set na \u00faltima s\u00e9rie dos 2 compostos principais por treino. Terra migra para barra se sum\u00f4 estiver s\u00f3lido. Cardio LISS 35 min.'},
  {label:'Deload \u00b7 Sem 8', color:'var(--red)', isDeload:true, startWeek:8, endWeek:8,
   info:'<strong>Semana 8 \u2014 Deload:</strong> 1 s\u00e9rie de trabalho. Mesmas cargas. Prepara\u00e7\u00e3o para a fase mais intensa.'},
  {label:'Fase 3 \u00b7 Sem 9\u201311', color:'var(--green)', isDeload:false, startWeek:9, endWeek:11,
   info:'<strong>Fase 3 \u00b7 Semanas 9\u201311:</strong> Pico. Rest-pause nos isoladores (1\u00d7 por treino). Terra convencional se sum\u00f4 s\u00f3lido. Cardio LISS 4\u00d7/semana.'},
  {label:'Deload \u00b7 Sem 12', color:'var(--red)', isDeload:true, startWeek:12, endWeek:12,
   info:'<strong>Semana 12 \u2014 Deload final:</strong> 1 s\u00e9rie de trabalho. Fotos comparativas. Avalia\u00e7\u00e3o completa do ciclo.'}
]

function autoSetPhase() {
  var w = getWeekNumber();
  var phaseIdx = getPhaseFromWeek(w);
  var tabs = document.querySelectorAll('.phase-tab');
  tabs.forEach(function(t,i) { t.classList.toggle('active', i === phaseIdx); });
  applyPhase(phaseIdx, false);
}

function setPhase(i, el) {
  document.querySelectorAll('.phase-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  applyPhase(i, true);
  var st = load(); st.manualPhase = i; save(st);
}

function applyPhase(i, manual) {
  var pd = PHASE_DATA[i];
  document.getElementById('phase-info').innerHTML = pd.info;
  var badge = document.getElementById('phase-badge');
  badge.textContent = pd.label;
  badge.className = 'phase-badge' + (pd.isDeload ? ' deload' : '');
  currentDeload = pd.isDeload;
  document.getElementById('deload-banner').classList.toggle('show', pd.isDeload);
  currentPhase = i;
  // Atualiza s\u00e9ries de deload sem reconstruir o DOM
  updateDeloadSeries();
  // Dica de progress\u00e3o de carga
  renderProgBanner(i);
}

function updateDeloadSeries() {
  // No deload: esconde a s\u00e9rie 2 de cada exerc\u00edcio sem reconstruir o DOM
  ['a','b','c','d','e'].forEach(function(t) {
    EXERCISES[t].forEach(function(ex) {
      var s2 = document.getElementById('sr-'+ex.id+'-2');
      var sck2 = document.getElementById('sck-'+ex.id+'-2');
      if (s2) s2.style.display = currentDeload ? 'none' : '';
      if (sck2) sck2.style.display = currentDeload ? 'none' : '';
    });
  });
}

function renderProgBanner(phaseIdx) {
  var w = getWeekNumber();
  var pd = PHASE_DATA[phaseIdx];
  var banner = document.getElementById('prog-banner');
  var body = document.getElementById('prog-banner-body');
  
  if (pd.isDeload) { banner.classList.remove('show'); return; }
  
  // A cada 3 semanas dentro de uma fase, sugerir progress\u00e3o
  var weekInPhase = w - pd.startWeek + 1;
  if (weekInPhase >= 2) {
    body.textContent = 'Semana ' + weekInPhase + ' da ' + pd.label.split('\u00b7')[0].trim() + ' \u2014 se voc\u00ea fechou as s\u00e9ries com boa forma nas \u00faltimas 2 semanas, suba 2\u20133 kg nos compostos e 1\u20132 kg nos isoladores.';
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}

// \u2500\u2500 DADOS DE EXERC\u00cdCIOS \u2500\u2500
var EXERCISES = {
  a: [
    {id:'a1', name:'Supino inclinado com halteres', badges:['b-pf:Peito superior','b-ok:Ombro seguro'], sets_label:'2 \u00d7 6\u201310', rest:180, yt:'WP1VLAt8hbM',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'Use um peso que d\u00e1 para fazer 15 reps sem esfor\u00e7o. 1 s\u00e9rie \u00d7 12 reps. Objetivo: sentir o peito acordar.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'Sobe para um peso que d\u00e1 para fazer no m\u00e1ximo 6\u20137 reps for\u00e7ando bastante. 1 s\u00e9rie \u00d7 4\u20136 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 6\u201310 reps.</strong> Use a carga que voc\u00ea consegue executar com t\u00e9cnica limpa at\u00e9 as 10 reps. Descanso: 3 min entre as s\u00e9ries. Descida controlada 2s \u2014 sente o alongamento do peitoral.'}
     ],
     obs:'Principal composto do Push I. Halteres permitem rota\u00e7\u00e3o natural do punho \u2014 protege a cartilagem do ombro. Cotovelo a ~45\u00b0 do tronco na descida.'},
    {id:'a2', name:'Pec deck \u2014 Voador m\u00e1quina', badges:['b-pf:Peito superior','b-new:Pr\u00e9-exaust\u00e3o'], sets_label:'2 \u00d7 10\u201312', rest:120, yt:'zdkX5_Gcdq8',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps \u2014 esc\u00e1pulas retra\u00eddas, amplitude completa. Objetivo: ativar as fibras do peitoral.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 10\u201312 reps.</strong> Cotovelos levemente flexionados durante todo o movimento. Sente a contra\u00e7\u00e3o no pico \u2014 segura 1 segundo. Descanso: 2 min.'}
     ],
     obs:'Isolador importante: o voador cria separa\u00e7\u00e3o e densidade no peito, que o supino n\u00e3o alcan\u00e7a sozinho.'},
    {id:'a3', name:'Crossover cabo \u2014 polia alta para baixo', badges:['b-pf:Peito inferior','b-new:Separa\u00e7\u00e3o'], sets_label:'2 \u00d7 12\u201315', rest:90, yt:'uDMmccuPVPQ',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps para calibrar o \u00e2ngulo.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 12\u201315 reps.</strong> Polia alta \u2014 cabo desce e cruza na linha do abd\u00f4men. Bra\u00e7os cruzam levemente no final. Sente a contra\u00e7\u00e3o na linha de baixo do peitoral. Descanso: 90s.'}
     ],
     obs:'Peito inferior est\u00e1 em todos os Push \u2014 hoje o est\u00edmulo principal \u00e9 pelo \u00e2ngulo alto para baixo (cruza diferente do Push II).'},
    {id:'a4', name:'Desenvolvimento com halteres (sentado)', badges:['b-ok:N\u00e3o barra','b-pf:Delt\u00f3ide medial'], sets_label:'2 \u00d7 8\u201310', rest:150, yt:'EuQAfhXBEvs',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie bem leve \u00d7 12 reps \u2014 ativa manguito rotador. Nunca barra: halteres permitem ajuste natural do punho.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie com carga que d\u00e1 para 6\u20137 reps for\u00e7ando. 1 s\u00e9rie \u00d7 4\u20135 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Cotovelos levemente \u00e0 frente do plano do ombro (n\u00e3o abre para o lado). Descanso: 2,5 min. Dor aguda = para imediatamente.'}
     ],
     obs:'Composto de ombro. Halteres protegem a cartilagem. Delt\u00f3ide medial \u00e9 ponto fraco confirmado pelas fotos.'},
    {id:'a5', name:'Eleva\u00e7\u00e3o lateral com halteres', badges:['b-pf:Delt\u00f3ide medial'], sets_label:'2 \u00d7 15\u201320', rest:90, yt:'IwWvZ0rlNXs',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie bem leve \u00d7 20 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15\u201320 reps.</strong> Eleva o COTOVELO, n\u00e3o a m\u00e3o. Carga leve \u2014 20 reps com t\u00e9cnica vale mais que 10 com impulso. Descanso: 90s.'}
     ],
     obs:'Delt\u00f3ide medial responde melhor a reps altas com tens\u00e3o constante. Ponto fraco \u2014 frequ\u00eancia 2\u00d7 semana.'},
    {id:'a6', name:'Abdominal corda no cabo', badges:['b-abd:Abd\u00f4men','b-new:Com carga'], sets_label:'2 \u00d7 15\u201320', rest:90, yt:'Q8TqfD8E7BU',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 20 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15\u201320 reps.</strong> Polia alta, ajoelhado, corda na nuca. Flexiona o tronco com carga progressiva \u2014 n\u00e3o usa impulso. Descanso: 90s. Progride a carga toda semana.'}
     ],
     obs:'Abd\u00f4men com carga em todo treino. Polia alta com corda \u00e9 o exerc\u00edcio de maior ativa\u00e7\u00e3o do reto abdominal com resist\u00eancia real.'}
  ],
  b: [
    {id:'b1', name:'Puxada frente \u2014 pegada fechada supinada', badges:['b-pf:Lat inferior','b-ok:Ombro neutro'], sets_label:'2 \u00d7 8\u201310', rest:150, yt:'pJM_rHhluK8',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 12 reps. Deixa o peso esticar o lat no topo antes de puxar.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie com carga que d\u00e1 para 5\u20136 reps for\u00e7ando muito. 1 s\u00e9rie \u00d7 4\u20135 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Cotovelo puxa para baixo e para tr\u00e1s \u2014 n\u00e3o para frente. Amplitude m\u00e1xima: deixa os bra\u00e7os estenderem completamente no topo. Descanso: 3 min.'}
     ],
     obs:'Composto de lat inferior. Pegada supinada reduz tens\u00e3o no ombro e aumenta amplitude.'},
    {id:'b2', name:'Remada curvada com barra', badges:['b-new:Adicionado','b-ok:Lombar ok'], sets_label:'2 \u00d7 8\u201310', rest:150, yt:'TfxJMertfsw',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie bem leve \u00d7 12 reps \u2014 calibra a postura e aquece a lombar.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com ~70% da carga de trabalho.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Tronco a ~45\u00b0, lombar neutra. Cotovelo puxando para baixo e para tr\u00e1s \u2014 n\u00e3o para cima. Descanso: 3 min.'}
     ],
     obs:'Voc\u00ea testou e est\u00e1 confort\u00e1vel. Composto de espessura \u2014 recruta meio das costas e lat simultaneamente.'},
    {id:'b3', name:'Remada baixa no cabo \u2014 pegada neutra', badges:['b-pf:Lat inferior','b-new:V-taper'], sets_label:'2 \u00d7 12\u201315', rest:90, yt:'Vk6c7CjtM14',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps \u2014 deixa o cabo esticar o lat no come\u00e7o.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 12\u201315 reps.</strong> AMPLITUDE M\u00c1XIMA no alongamento: deixa o cabo puxar os bra\u00e7os completamente para frente antes de puxar. \u00c9 aqui que o lat inferior \u00e9 recrutado. Descanso: 90s.'}
     ],
     obs:'Ponto fraco confirmado pelas fotos \u2014 lat inferior define o V-taper. A amplitude do alongamento \u00e9 onde o est\u00edmulo acontece.'},
    {id:'b4', name:'Rosca direta barra W', badges:['b-pf:B\u00edceps'], sets_label:'2 \u00d7 8\u201310', rest:120, yt:'f1-tThYj3zM',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com carga que d\u00e1 para no m\u00e1ximo 6 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Cotovelos fixos ao lado do corpo. Supina\u00e7\u00e3o completa no topo \u2014 segura 1s. Descanso: 2 min.'}
     ],
     obs:'B\u00edceps j\u00e1 pr\u00e9-fatigado das puxadas \u2014 use carga um pouco menor que o habitual. Normal.'},
    {id:'b5', name:'Rosca martelo alternada', badges:['b-pf:Braquial','b-pf:Antebra\u00e7o'], sets_label:'2 \u00d7 10\u201312', rest:90, yt:'0qkQy8V2FC0',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps \u2014 punho neutro.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 10\u201312 reps cada bra\u00e7o.</strong> Punho neutro durante todo o movimento \u2014 como segurar um martelo. Descanso: 90s.'}
     ],
     obs:'Trabalha braquial (espessura do bra\u00e7o) e braquiorradial (antebra\u00e7o). Complemento ao b\u00edceps.'},
    {id:'b6', name:'Eleva\u00e7\u00e3o de pernas com caneleira', badges:['b-abd:Abd\u00f4men infra','b-new:Com carga'], sets_label:'2 \u00d7 15', rest:90, yt:'0X9DpoNjBXQ',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie sem caneleira \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15 reps.</strong> Deitado no banco ou suspenso nas barras. Caneleira come\u00e7a leve (1\u20132 kg) e progride. Movimento controlado \u2014 n\u00e3o usa impulso. Descanso: 90s.'}
     ],
     obs:'Foco em abd\u00f4men infra \u2014 regi\u00e3o periumbilical e abaixo, ponto fraco confirmado pelas fotos.'}
  ],
  c: [
    {id:'c1', name:'Terra sum\u00f4 com halteres', badges:['b-warn:Aquec. obrigat\u00f3rio','b-ok:Lombar ok'], sets_label:'2 \u00d7 8\u201310', rest:180, yt:'50AkPBZwACQ',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie bem leve \u00d7 10 reps. Ativa cadeia posterior sem for\u00e7ar a lombar.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com ~60\u201370% da carga de trabalho.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Base larga, p\u00e9s apontados para fora. Quadril empurra para tr\u00e1s \u2014 n\u00e3o curva a coluna. Fase 1: desce at\u00e9 abaixo do joelho. Descanso: 3 min.'}
     ],
     obs:'Fase 1: halteres, amplitude parcial. Fase 2: migra para barra sum\u00f4. Tronco mais vertical no sum\u00f4 = menos estresse na lombar.'},
    {id:'c2', name:'Agachamento no Smith', badges:['b-warn:T\u00e9cnica primeiro'], sets_label:'2 \u00d7 8\u201310', rest:180, yt:'zgk71dUUt0Y',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie com barra vazia \u00d7 10 reps. Foco: descida controlada, joelhos no eixo dos p\u00e9s.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com ~60% da carga de trabalho.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Descida 3s controlada. Lombar neutra. Fase 1: at\u00e9 20 kg. Descanso: 3 min.'}
     ],
     obs:'Quadr\u00edceps principal. Smith guia o movimento e protege a lombar nesta fase.'},
    {id:'c3', name:'Leg press 45\u00b0 \u2014 pegada alta/larga', badges:['b-pf:Gl\u00fateo','b-pf:Quad'], sets_label:'2 \u00d7 12\u201315', rest:120, yt:'eO-6NcrE7lk',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps \u2014 p\u00e9s altos na plataforma.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 12\u201315 reps.</strong> P\u00e9s altos e abertos. Desce at\u00e9 90\u00b0 de joelho \u2014 n\u00e3o ultrapassa a lombar saindo do encosto. Descanso: 2 min.'}
     ],
     obs:'P\u00e9s altos ativam mais gl\u00fateo e posterior al\u00e9m do quad. Segundo composto de perna.'},
    {id:'c4', name:'Mesa flexora \u2014 leg curl deitado', badges:['b-pf:Posterior fraco'], sets_label:'2 \u00d7 10\u201312', rest:120, yt:'n3SyFDgEFhM',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 5\u20136 reps for\u00e7ando.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 10\u201312 reps.</strong> Pico de contra\u00e7\u00e3o no topo \u2014 segura 1s. Descida controlada 2s. Descanso: 2 min.'}
     ],
     obs:'Posterior de coxa confirmado como ponto fraco. Frequ\u00eancia 1\u00d7 semana aqui \u2014 gl\u00fateo/posterior recebe aten\u00e7\u00e3o maior no Pull II.'},
    {id:'c5', name:'Cadeira extensora', badges:['b-pf:Quadr\u00edceps'], sets_label:'2 \u00d7 15', rest:90, yt:'el3oHblB5DM',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 20 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15 reps.</strong> Amplitude completa. Pico de contra\u00e7\u00e3o no topo \u2014 segura 1s. Descida controlada. Descanso: 90s.'}
     ],
     obs:'Isolador de quad para finalizar o volume de quadr\u00edceps com bombeamento.'},
    {id:'c6', name:'Decline sit-up com anilha', badges:['b-abd:Abd\u00f4men','b-new:Com carga'], sets_label:'2 \u00d7 12\u201315', rest:90, yt:'kB7n-Tc0r_0',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie sem anilha \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 12\u201315 reps.</strong> Banco declinado. Anilha come\u00e7a leve (5 kg) e progride. Descida 2\u20133s controlada. Descanso: 90s.'}
     ],
     obs:'Reto abdominal com carga real. Progride 5 kg \u2192 20 kg ao longo das fases.'}
  ],
  d: [
    {id:'d1', name:'Supino declinado com halteres', badges:['b-pf:Peito inferior','b-ok:Ombro seguro'], sets_label:'2 \u00d7 8\u201310', rest:180, yt:'J2g6qPBJfqo',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps \u2014 sente o alongamento na parte de baixo do peitoral.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com carga que d\u00e1 para no m\u00e1ximo 6 reps for\u00e7ando.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Halteres permitem rota\u00e7\u00e3o natural \u2014 protege o ombro. Descanso: 3 min. Peitoral inferior \u00e9 o foco deste treino.'}
     ],
     obs:'Ponto fraco n\u00famero 1. O \u00e2ngulo declinado isola a por\u00e7\u00e3o inferior e esternal do peitoral. \u00c9 aqui que a separa\u00e7\u00e3o de baixo do peito \u00e9 constru\u00edda.'},
    {id:'d2', name:'Supino reto com halteres', badges:['b-pf:Peito medial','b-ok:Ombro seguro'], sets_label:'2 \u00d7 8\u201310', rest:150, yt:'EZMYCLKuGow',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 12 reps.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com carga alta.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Halteres. Cotovelo a 45\u00b0 do tronco. Trabalha o corpo medial do peitoral \u2014 regi\u00e3o central. Descanso: 2,5 min.'}
     ],
     obs:'No Push II o reto entra para completar o volume medial. Junto com o declinado e o crossover, o peitoral inteiro \u00e9 coberto.'},
    {id:'d3', name:'Crossover cabo baixo para alto', badges:['b-pf:Peito inferior','b-new:Separa\u00e7\u00e3o'], sets_label:'2 \u00d7 12\u201315', rest:90, yt:'uDMmccuPVPQ',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 12\u201315 reps.</strong> Polia BAIXA \u2014 cabo sobe e cruza na linha do abd\u00f4men superior. \u00c2ngulo diferente do Push I (que era de cima para baixo). Cria separa\u00e7\u00e3o na linha de baixo do peitoral. Descanso: 90s.'}
     ],
     obs:'Segunda vez de crossover na semana \u2014 mas \u00e2ngulo diferente. Hoje cria a separa\u00e7\u00e3o inferior. \u00c9 o que define aquela linha horizontal embaixo do peito.'},
    {id:'d4', name:'Tr\u00edceps polia alta \u2014 barra reta', badges:['b-pf:Tr\u00edceps'], sets_label:'2 \u00d7 10\u201312', rest:90, yt:'vB5OHsJ3EME',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 10\u201312 reps.</strong> Cotovelos fixos ao lado do corpo. Extens\u00e3o completa \u2014 n\u00e3o quebra a posi\u00e7\u00e3o do cotovelo. Descanso: 90s.'}
     ],
     obs:'Tr\u00edceps j\u00e1 pr\u00e9-fatigado dos compostos. Carga um pouco menor que isolado \u2014 isso \u00e9 esperado e correto.'},
    {id:'d5', name:'Tr\u00edceps corda no cabo', badges:['b-pf:Tr\u00edceps'], sets_label:'2 \u00d7 12\u201315', rest:90, yt:'vB5OHsJ3EME',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 12\u201315 reps.</strong> Abre as pontas da corda no final \u2014 m\u00e1xima contra\u00e7\u00e3o. \u00c2ngulo curto complementa a barra reta. Descanso: 90s.'}
     ],
     obs:'Dois \u00e2ngulos do tr\u00edceps no mesmo treino \u2014 barra reta (cotovelo baixo) + corda (abertura lateral). Esgotamento eficiente sem aumentar volume.'},
    {id:'d6', name:'Roda abdominal \u2014 ab wheel', badges:['b-abd:Abd\u00f4men','b-new:Alta intensidade'], sets_label:'2 \u00d7 8\u201312', rest:90, yt:'GJOu7hCHH1Q',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'N\u00e3o tem aquecimento para este exerc\u00edcio \u2014 come\u00e7a mais conservador nas primeiras reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201312 reps.</strong> Fase 1: de joelhos. Fase 3: em p\u00e9. Core completo em cadeia fechada. Descanso: 90s.'}
     ],
     obs:'Exerc\u00edcio de alta intensidade para core \u2014 reto, obl\u00edquos e estabilizadores todos em cadeia fechada. N\u00e3o substitua por crunches.'}
  ],
  e: [
    {id:'e1', name:'Remada cavalinho na m\u00e1quina', badges:['b-ok:Lombar protegida','b-pf:Espessura'], sets_label:'2 \u00d7 8\u201310', rest:150, yt:'Bgg6bRSTM_4',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 12 reps \u2014 aquece lombar e costas superiores.'},
      {tag:'FEEDER',cls:'tag-feed', desc:'1 s\u00e9rie \u00d7 4\u20135 reps com carga alta.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 8\u201310 reps.</strong> Apoio peitoral elimina trabalho da lombar. Cotovelo raspa a costela no pico. Descanso: 2,5 min.'}
     ],
     obs:'Apoio peitoral \u00e9 a vantagem desta m\u00e1quina \u2014 carga maior com menos risco na lombar. Pull II foca espessura (costas meio e superior).'},
    {id:'e2', name:'Remada unilateral com halter no banco', badges:['b-pf:Espessura'], sets_label:'2 \u00d7 10\u201312', rest:120, yt:'Vk6c7CjtM14',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 12 reps cada lado.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 10\u201312 reps cada lado.</strong> Apoio no banco. Cotovelo puxando para cima e para tr\u00e1s. N\u00e3o rotaciona o tronco. Descanso: 2 min entre os lados.'}
     ],
     obs:'Unilateral corrige desequil\u00edbrios esquerda/direita. Voc\u00ea manteve \u2014 boa escolha.'},
    {id:'e3', name:'Pullover no cabo \u2014 polia alta', badges:['b-pf:Lat inferior','b-new:Alongamento'], sets_label:'2 \u00d7 15', rest:90, yt:'XB_7En-zf4M',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15 reps.</strong> Amplitude M\u00c1XIMA no ponto baixo \u2014 estica o lat completamente antes de puxar. Bra\u00e7os quase estendidos. Descanso: 90s.'}
     ],
     obs:'Isolador de lat inferior. O alongamento no ponto baixo \u00e9 onde o est\u00edmulo acontece \u2014 n\u00e3o encurta o movimento.'},
    {id:'e4', name:'Hiperextens\u00e3o lombar no banco', badges:['b-pf:Lombar fraca'], sets_label:'2 \u00d7 15\u201320', rest:90, yt:'IbG5-5BCpXY',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps sem carga adicional.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15\u201320 reps.</strong> Desce devagar \u2014 sobe s\u00f3 at\u00e9 a linha neutra da coluna, n\u00e3o hiperextende. Lombar \u00e9 ponto fraco \u2014 constru\u00e7\u00e3o progressiva. Descanso: 90s.'}
     ],
     obs:'Lombar fraca identificada. Trabalho espec\u00edfico aqui 1\u00d7 semana com progress\u00e3o gradual.'},
    {id:'e5', name:'Rosca scott com halter', badges:['b-pf:B\u00edceps pico'], sets_label:'2 \u00d7 10\u201312', rest:90, yt:'wFMHaWGSMyE',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 15 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 10\u201312 reps.</strong> Supina\u00e7\u00e3o m\u00e1xima no topo \u2014 segura 1s de contra\u00e7\u00e3o. Descida controlada. Descanso: 90s.'}
     ],
     obs:'B\u00edceps em \u00e2ngulo de encurtamento \u2014 diferente da rosca direta do Pull I. Dois \u00e2ngulos de b\u00edceps na semana.'},
    {id:'e6', name:'Rosca punho barra W + inversa', badges:['b-pf:Antebra\u00e7o'], sets_label:'2 \u00d7 20 cada', rest:60, yt:'jbSr9CzJPmA',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'N\u00e3o precisa de aquecimento espec\u00edfico \u2014 cargas s\u00e3o leves.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 20 reps rosca punho + 2 s\u00e9ries \u00d7 20 reps inversa.</strong> Amplitude total em cada repeti\u00e7\u00e3o. Descanso: 60s entre cada s\u00e9rie.'}
     ],
     obs:'Antebra\u00e7o identificado como ponto fraco. Trabalho bilateral: flexores (rosca punho) + extensores (inversa).'},
    {id:'e7', name:'Abdominal m\u00e1quina', badges:['b-abd:Abd\u00f4men','b-new:Com carga'], sets_label:'2 \u00d7 15\u201320', rest:90, yt:'Q8TqfD8E7BU',
     method:[
      {tag:'AQUEC',cls:'tag-warm', desc:'1 s\u00e9rie leve \u00d7 20 reps.'},
      {tag:'TRABALHO',cls:'tag-work', desc:'<strong>2 s\u00e9ries \u00d7 15\u201320 reps.</strong> Carga progressiva \u2014 n\u00e3o decorativa. Flex\u00e3o controlada do tronco, sem usar impulso. Descanso: 90s.'}
     ],
     obs:'Abd\u00f4men com carga em todo treino. Na semana de deload: 1 s\u00e9rie apenas.'}
  ]
}

// \u2500\u2500 VARIA\u00c7\u00d5ES \u2500\u2500
var VARIATIONS = {
  'a1': {type:'livre', varName:'Smith Inclinado', varYt:'WP1VLAt8hbM', varTip:'No Smith: p\u00e9s levemente \u00e0 frente, mesma amplitude. Use quando o ombro estiver sens\u00edvel ou os halteres pesados demais.'},
  'a2': {type:'maquina', varName:'Crucifixo com halteres', varYt:'uDMmccuPVPQ', varTip:'Halteres: amplitude total, cotovelos levemente flexionados. Mais estabiliza\u00e7\u00e3o. Banco reto ou inclinado.'},
  'a3': {type:'livre', varName:'Crucifixo declinado halteres', varYt:'uDMmccuPVPQ', varTip:'Banco declinado com halteres. \u00c2ngulo similar ao crossover alto. Boa alternativa quando o cabo estiver ocupado.'},
  'a4': {type:'livre', varName:'Desenvolvimento na m\u00e1quina', varYt:'EuQAfhXBEvs', varTip:'M\u00e1quina guiada: elimina instabilidade, use quando ombro estiver sens\u00edvel ou carga alta.'},
  'a5': {type:'livre', varName:'Eleva\u00e7\u00e3o lateral no cabo unilateral', varYt:'IwWvZ0rlNXs', varTip:'Cabo mant\u00e9m tens\u00e3o constante no \u00e2ngulo baixo \u2014 melhor est\u00edmulo para o delt\u00f3ide.'},
  'b1': {type:'maquina', varName:'Pulldown barra reta pronada', varYt:'pJM_rHhluK8', varTip:'Pegada pronada aberta: mais largura de lat. Menos b\u00edceps. Use quando as m\u00e3os cansam na supinada.'},
  'b2': {type:'livre', varName:'Remada cavalinho m\u00e1quina', varYt:'Bgg6bRSTM_4', varTip:'Apoio peitoral elimina trabalho da lombar. Ideal quando a lombar estiver cansada.'},
  'b3': {type:'maquina', varName:'Remada baixa halteres alternada', varYt:'Vk6c7CjtM14', varTip:'Um halter de cada vez: maior amplitude. Alterna quando o cabo estiver ocupado.'},
  'b4': {type:'livre', varName:'Rosca direta halteres alternada', varYt:'f1-tThYj3zM', varTip:'Halteres: supina\u00e7\u00e3o individual, pico maior. Use quando a barra W estiver ocupada.'},
  'b5': {type:'livre', varName:'Rosca martelo no cabo', varYt:'0qkQy8V2FC0', varTip:'Cabo baixo com corda: tens\u00e3o constante. Trabalha braquial e braquiorradial igual ao halter.'},
  'c1': {type:'livre', varName:'Terra sum\u00f4 no Smith', varYt:'zgk71dUUt0Y', varTip:'Smith: menor demanda de estabiliza\u00e7\u00e3o. Use quando a forma livre ainda n\u00e3o estiver consolidada.'},
  'c2': {type:'livre', varName:'Hack squat m\u00e1quina', varYt:'zgk71dUUt0Y', varTip:'Posi\u00e7\u00e3o guiada, mais segura para lombar. Amplitude maior poss\u00edvel com p\u00e9s no centro da plataforma.'},
  'c3': {type:'maquina', varName:'Agachamento sum\u00f4 com halteres', varYt:'50AkPBZwACQ', varTip:'Halteres: mais amplitude, mais recrutamento de gl\u00fateo. Segura entre as pernas (goblet style).'},
  'c4': {type:'maquina', varName:'Mesa flexora sentada', varYt:'n3SyFDgEFhM', varTip:'Sentada: recruta mais a cabe\u00e7a longa do b\u00edceps femoral. Complementar \u00e0 deitada.'},
  'c5': {type:'maquina', varName:'Agachamento Smith para quad', varYt:'zgk71dUUt0Y', varTip:'P\u00e9s mais fechados e \u00e0 frente: isola o quad. Use quando a extensora estiver ocupada.'},
  'd1': {type:'livre', varName:'Supino declinado no Smith', varYt:'J2g6qPBJfqo', varTip:'Smith declinado: mais estabilidade. Use quando os halteres estiverem pesados ou ombro sens\u00edvel.'},
  'd2': {type:'livre', varName:'Supino reto no Smith', varYt:'EZMYCLKuGow', varTip:'Smith reto: guia o movimento. Use quando houver assimetria entre os lados.'},
  'd3': {type:'livre', varName:'Crucifixo declinado halteres', varYt:'uDMmccuPVPQ', varTip:'Banco declinado com halteres: \u00e2ngulo similar ao crossover baixo. Use quando o cabo estiver ocupado.'},
  'd4': {type:'maquina', varName:'Tr\u00edceps corda (mesma polia)', varYt:'vB5OHsJ3EME', varTip:'Barra \u2192 corda: abre as m\u00e3os no final, mais ativa\u00e7\u00e3o da cabe\u00e7a lateral.'},
  'd5': {type:'maquina', varName:'Tr\u00edceps barra reta polia', varYt:'vB5OHsJ3EME', varTip:'Corda \u2192 barra reta: punho pronado, mais ativa\u00e7\u00e3o da cabe\u00e7a longa.'},
  'e1': {type:'maquina', varName:'Remada curvada com barra', varYt:'TfxJMertfsw', varTip:'Barra: mais carga, menor apoio. Aten\u00e7\u00e3o \u00e0 lombar \u2014 n\u00e3o ultrapasse 45\u00b0.'},
  'e2': {type:'livre', varName:'Remada curvada unilateral no cabo', varYt:'Vk6c7CjtM14', varTip:'Cabo: tens\u00e3o constante. Corrige desequil\u00edbrios esquerda/direita.'},
  'e3': {type:'maquina', varName:'Pullover com halter no banco', varYt:'XB_7En-zf4M', varTip:'Halter: amplitude m\u00e1xima, lat inferior no alongamento. Mesmo est\u00edmulo do pullover no cabo.'},
  'e4': {type:'maquina', varName:'Extens\u00e3o lombar no cabo', varYt:'IbG5-5BCpXY', varTip:'Cabo: resist\u00eancia constante. Use quando o banco de hiperextens\u00e3o estiver ocupado.'},
  'e5': {type:'livre', varName:'Rosca scott barra EZ', varYt:'wFMHaWGSMyE', varTip:'Barra EZ no scott: mais est\u00e1vel, permite carga maior. Alternativa direta ao halter.'},
  'e6': {type:'livre', varName:'Rosca punho com anilha (unilateral)', varYt:'jbSr9CzJPmA', varTip:'Anilha: amplitude maior. Use quando a barra W estiver ocupada.'}
};

// \u2500\u2500 BUILD EXERCISE LISTS \u2500\u2500
function buildAllLists() {
  ['a','b','c','d','e'].forEach(function(t) {
    var c = document.getElementById('exlist-'+t);
    if (!c) return;
    c.innerHTML = '';
    EXERCISES[t].forEach(function(ex) { c.appendChild(buildExItem(ex, t)); });
  });
}

function buildExItem(ex, treino) {
  var wrap = document.createElement('div');
  wrap.className = 'ex-item';
  wrap.id = 'exwrap-'+ex.id;

  var badges = (ex.badges||[]).map(function(b) {
    var p = b.split(':');
    return '<span class="badge '+p[0]+'">'+p[1]+'</span>';
  }).join('');

  var hasVar = !!VARIATIONS[ex.id];

  var hdr = document.createElement('div');
  hdr.className = 'ex-hdr';
  hdr.innerHTML =
    '<div class="ex-num">'+ex.id.replace(treino,'')+'</div>'+
    '<div class="ex-info"><div class="ex-name">'+ex.name+'</div><div class="ex-badges">'+badges+'</div></div>'+
    '<div class="ex-right">'+
    '<div><div class="ex-sets">'+ex.sets_label+'</div><div class="ex-rest">'+(ex.rest>=120?Math.floor(ex.rest/60)+'min':ex.rest+'s')+' desc.</div></div>'+
    (hasVar ? '<div class="ex-var-btn" id="varbtn-'+ex.id+'" title="Ver varia\u00e7\u00e3o">\u21c4</div>' : '')+
    '<div class="ex-vid" id="vidbtn-'+ex.id+'" title="Ver v\u00eddeo">\u25b6</div>'+
    '</div>';

  // Eventos via addEventListener (sem problemas de aspas)
  hdr.addEventListener('click', function() { toggleDetail(ex.id); });

  var vidBtn = hdr.querySelector('#vidbtn-'+ex.id);
  if (vidBtn) {
    vidBtn.addEventListener('click', function(e) { e.stopPropagation(); openYT(ex.yt); });
  }

  if (hasVar) {
    var varBtn = hdr.querySelector('#varbtn-'+ex.id);
    if (varBtn) {
      varBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleVar(ex.id); });
    }
  }

  wrap.appendChild(hdr);

  var det = document.createElement('div');
  det.className = 'ex-detail';
  det.id = 'det-'+ex.id;
  det.innerHTML = buildDetailHTML(ex);
  wrap.appendChild(det);

  if (hasVar) {
    var vp = document.createElement('div');
    vp.className = 'var-panel';
    vp.id = 'var-'+ex.id;
    var v = VARIATIONS[ex.id];
    var typeLabel = v.type === 'livre' ? '\u2192 Varia\u00e7\u00e3o na M\u00c1QUINA' : '\u2192 Varia\u00e7\u00e3o LIVRE (peso livre)';
    vp.innerHTML =
      '<div class="var-title">'+typeLabel+'</div>'+
      '<div class="var-name">'+v.varName+'</div>'+
      '<div class="var-tip">'+v.varTip+'</div>'+
      '<div class="var-vid-btn" id="varvidbtn-'+ex.id+'">\u25b6 Ver execu\u00e7\u00e3o</div>';
    // Evento no bot\u00e3o de v\u00eddeo da varia\u00e7\u00e3o
    wrap.appendChild(vp);
    setTimeout(function() {
      var vvb = document.getElementById('varvidbtn-'+ex.id);
      if (vvb) vvb.addEventListener('click', function() { openYT(v.varYt); });
    }, 0);
  }

  return wrap;
}

function buildDetailHTML(ex) {
  var methodHTML = '<div class="method-box">';
  ex.method.forEach(function(m) {
    methodHTML += '<div class="method-row"><span class="'+m.cls+'">'+m.tag+'</span><div class="method-desc">'+m.desc+'</div></div>';
  });
  methodHTML += '</div>';

  var workSets = currentDeload ? 1 : 2;
  var serieHTML = '<div class="serie-log"><div class="serie-log-title">Registrar s\u00e9ries</div>';
  var st = load();
  for (var i = 1; i <= workSets; i++) {
    var k = ex.id+'_s'+i;
    var sdata = st[k] || {};
    var done = sdata.done ? ' done' : '';
    var doneN = sdata.done ? ' done-n' : '';
    serieHTML +=
      '<div class="serie-row" id="sr-'+ex.id+'-'+i+'">'+
      '<div class="snum'+doneN+'" id="snum-'+ex.id+'-'+i+'">'+(sdata.done?'\u2713':i)+'</div>'+
      '<input class="s-inp" id="kg-'+ex.id+'-'+i+'" type="number" step="0.5" placeholder="kg" value="'+(sdata.kg||'')+'" data-exid="'+ex.id+'" data-serie="'+i+'" data-type="kg">'+
      '<div class="s-x">\u00d7</div>'+
      '<input class="s-inp" id="rp-'+ex.id+'-'+i+'" type="number" placeholder="reps" value="'+(sdata.reps||'')+'" data-exid="'+ex.id+'" data-serie="'+i+'" data-type="rp">'+
      '<div class="s-chk'+done+'" id="sck-'+ex.id+'-'+i+'" data-exid="'+ex.id+'" data-serie="'+i+'">'+(sdata.done?'\u2713':'\u25cb')+'</div>'+
      '</div>';
  }
  serieHTML += '</div>';

  var progHint = buildProgHint(ex.id);
  var obsHTML = ex.obs ? '<div class="ex-obs">'+ex.obs+'</div>' : '';
  return methodHTML + serieHTML + progHint + obsHTML;
}

function buildProgHint(exId) {
  var st = load();
  var hist = st['hist_'+exId];
  if (!hist || hist.length < 2) return '';
  
  // Pegar \u00faltimas 2 sess\u00f5es
  var last = hist[hist.length-1];
  var prev = hist[hist.length-2];
  if (!last || !prev) return '';
  
  var lastKg = parseFloat(last.kg) || 0;
  var prevKg = parseFloat(prev.kg) || 0;
  
  // Se ficou na mesma carga por 2+ sess\u00f5es e fechou as reps, sugerir progress\u00e3o
  if (lastKg > 0 && lastKg === prevKg && last.reps && parseInt(last.reps) >= (ex.sets_label ? parseInt(ex.sets_label.split('\u2013')[1]) || 10 : 10)) {
    return '<div class="prog-hint">\u2b06 Voc\u00ea fechou as reps com '+lastKg+'kg nas \u00faltimas 2 sess\u00f5es \u2014 hora de subir 2\u20133 kg.</div>';
  }
  if (lastKg > prevKg) {
    return '<div class="prog-hint">\u2713 Progress\u00e3o confirmada: '+prevKg+'kg \u2192 '+lastKg+'kg</div>';
  }
  return '';
}

function toggleDetail(id) {
  var det = document.getElementById('det-'+id);
  if (det) det.classList.toggle('open');
}

function toggleVar(id) {
  var vp = document.getElementById('var-'+id);
  if (vp) vp.classList.toggle('open');
}

// \u2500\u2500 SERIE LOGGING \u2500\u2500
function saveKg(id,i,v) {
  var st=load(); var k=id+'_s'+i;
  if(!st[k])st[k]={};
  st[k].kg=v;
  save(st);
  // Salvar no hist\u00f3rico ao confirmar
}
function saveRp(id,i,v) {
  var st=load(); var k=id+'_s'+i;
  if(!st[k])st[k]={};
  st[k].reps=v;
  save(st);
}
function checkS(id,i) {
  var st=load(); var k=id+'_s'+i;
  if(!st[k])st[k]={};
  st[k].done=!st[k].done;
  
  // Ao marcar como feito, salva no hist\u00f3rico de cargas
  if(st[k].done && st[k].kg) {
    var hist = st['hist_'+id] || [];
    var today = new Date().toISOString().slice(0,10);
    // Evitar duplicata no mesmo dia
    var existing = hist.findIndex(function(h) { return h.date === today && h.serie === i; });
    if (existing === -1) {
      hist.push({ date: today, kg: parseFloat(st[k].kg)||0, reps: parseInt(st[k].reps)||0, serie: i });
      if (hist.length > 60) hist = hist.slice(-60); // M\u00e1x 60 registros por exerc\u00edcio
      st['hist_'+id] = hist;
    }
  }
  
  save(st);
  var ck=document.getElementById('sck-'+id+'-'+i);
  var row=document.getElementById('sr-'+id+'-'+i);
  var num=document.getElementById('snum-'+id+'-'+i);
  if(st[k].done){
    if(ck){ck.classList.add('done');ck.textContent='\u2713';}
    if(row)row.classList.add('done');
    if(num){num.textContent='\u2713';num.classList.add('done-n');}
  }else{
    if(ck){ck.classList.remove('done');ck.textContent='\u25cb';}
    if(row)row.classList.remove('done');
    if(num){num.textContent=i;num.classList.remove('done-n');}
  }
  // Atualizar chart se vis\u00edvel
  renderChart();
}

// \u2500\u2500 VIDEO \u2500\u2500
function openYT(id) { window.open('https://www.youtube.com/watch?v='+id, '_blank'); }

// \u2500\u2500 TREINO NAVIGATION \u2500\u2500
var currentTreino = 'a';
var wdayMap = {a:0,b:1,c:2,d:4,e:5};
function showTreino(id) {
  ['a','b','c','d','e'].forEach(function(t) {
    var tc = document.getElementById('tc-'+t);
    if (tc) tc.style.display = (t===id?'':'none');
  });
  document.querySelectorAll('.wday').forEach(function(w) { w.classList.remove('active-day'); });
  var strips = document.querySelectorAll('.wday');
  if (wdayMap[id] !== undefined) strips[wdayMap[id]].classList.add('active-day');
  currentTreino = id;
  var nameEl = document.getElementById('treino-sub');
  if (nameEl) nameEl.textContent = TREINO_NAMES[id] || '';
  var body = document.getElementById('tc'+id);
  var chev = document.getElementById('chev-tc'+id);
  if (body && !body.classList.contains('open')) {
    body.classList.add('open');
    if (chev) chev.style.transform = 'rotate(180deg)';
  }
}

function toggleTC(id) {
  var body = document.getElementById(id);
  var chev = document.getElementById('chev-'+id);
  if (!body) return;
  var open = body.classList.contains('open');
  body.classList.toggle('open', !open);
  if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
}

// \u2500\u2500 WEEK DOT (treino feito na semana) \u2500\u2500
function updateWeekDots() {
  var st = load();
  var strips = document.querySelectorAll('.wday');
  var dayOrder = [1,2,3,null,5,6,null]; // \u00edndices 0\u20136 do strip
  var today = new Date();
  // Pegar datas da semana atual
  var dow = today.getDay();
  var monday = new Date(today);
  monday.setDate(today.getDate() - ((dow+6)%7));
  strips.forEach(function(el, idx) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    var key = 'done_' + d.toISOString().slice(0,10);
    el.classList.toggle('has-log', !!st[key]);
  });
}

// \u2500\u2500 PAGE \u2500\u2500
function setPage(p) {
  document.querySelectorAll('.page').forEach(function(x) { x.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(x) { x.classList.remove('active'); });
  document.getElementById('page-'+p).classList.add('active');
  document.getElementById('nav-'+p).classList.add('active');
  if (p === 'prog') {
    renderCheckinTimeline();
    populateExSelect();
  }
}

// \u2500\u2500 DIET \u2500\u2500
function setDiet(i,el) {
  document.querySelectorAll('.diet-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.diet-panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('diet-'+i).classList.add('active');
}
function toggleMeal(id) { var b=document.getElementById(id); if(b) b.classList.toggle('open'); }

// \u2500\u2500 CHECKIN \u2500\u2500
function renderWeekButtons() {
  var w = getWeekNumber();
  var strip = document.getElementById('week-num-strip');
  var st = load();
  strip.innerHTML = '';
  for (var i = 1; i <= 12; i++) {
    var btn = document.createElement('div');
    btn.className = 'wk-btn' + (i===w?' active':'') + (st['checkin_'+i]?' has-data':'');
    btn.textContent = 'Sem '+i;
    btn.setAttribute('data-w', i);
    btn.onclick = (function(week) { return function() {
      document.querySelectorAll('.wk-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      loadCheckin(week);
    }; })(i);
    strip.appendChild(btn);
  }
  // Scroll to current week
  setTimeout(function() {
    var active = strip.querySelector('.wk-btn.active');
    if (active) active.scrollIntoView({inline:'center', behavior:'smooth'});
  }, 100);
  loadCheckin(w);
}

function loadCheckin(week) {
  var st = load();
  var ci = st['checkin_'+week] || {};
  document.getElementById('ci-peso').value = ci.peso || '';
  document.getElementById('ci-semana').value = week;
  document.getElementById('ci-nota').value = ci.nota || '';
}

function saveCheckin() {
  var st = load();
  var week = parseInt(document.getElementById('ci-semana').value) || getWeekNumber();
  st['checkin_'+week] = {
    peso: parseFloat(document.getElementById('ci-peso').value) || null,
    nota: document.getElementById('ci-nota').value.trim(),
    date: new Date().toISOString().slice(0,10),
    week: week
  };
  save(st);
  renderWeekButtons();
  renderCheckinTimeline();
  // Feedback
  var btn = document.querySelector('.ci-save-btn');
  btn.textContent = '\u2713 Salvo!';
  setTimeout(function() { btn.textContent = '\u1f4be Salvar Checkin'; }, 2000);
}

function renderCheckinTimeline() {
  var st = load();
  var tl = document.getElementById('checkin-timeline');
  var items = [];
  for (var i = 1; i <= 12; i++) {
    if (st['checkin_'+i]) items.push(Object.assign({week:i}, st['checkin_'+i]));
  }
  if (!items.length) {
    tl.innerHTML = '<div class="empty-state"><div class="empty-icon">\u1f4cb</div>Nenhum checkin registrado ainda.<br>Registre seu peso semanal acima.</div>';
    return;
  }
  items.reverse();
  tl.innerHTML = items.map(function(ci) {
    return '<div class="ptl-item">'+
      '<div class="ptl-dot" style="background:var(--green)"></div>'+
      '<div class="ptl-body">'+
      '<div class="ptl-title">Semana '+(ci.week)+' \u2014 '+(ci.peso ? ci.peso+'kg' : 'peso n\u00e3o informado')+'</div>'+
      '<div class="ptl-val">'+(ci.nota || '')+'</div>'+
      '</div>'+
      '<div class="ptl-date">'+(ci.date||'')+'</div>'+
      '</div>';
  }).join('');
}

// \u2500\u2500 GR\u00c1FICO DE CARGAS \u2500\u2500
function populateExSelect() {
  var sel = document.getElementById('hist-ex-select');
  var st = load();
  sel.innerHTML = '<option value="">\u2014 Selecione um exerc\u00edcio \u2014</option>';
  
  var allEx = [];
  ['a','b','c','d','e'].forEach(function(t) {
    EXERCISES[t].forEach(function(ex) {
      var hist = st['hist_'+ex.id];
      allEx.push({ id: ex.id, name: ex.name, hasData: !!(hist && hist.length > 0) });
    });
  });
  
  // Com dados primeiro
  allEx.sort(function(a,b) { return (b.hasData?1:0) - (a.hasData?1:0); });
  
  allEx.forEach(function(ex) {
    var opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = (ex.hasData?'\u1f4ca ':'') + ex.name;
    sel.appendChild(opt);
  });
}

function renderChart() {
  var exId = document.getElementById('hist-ex-select').value;
  var wrap = document.getElementById('hist-chart-wrap');
  var statsEl = document.getElementById('hist-stats');
  
  if (!exId) {
    wrap.innerHTML = '<div class="hist-empty">Selecione um exerc\u00edcio para ver a progress\u00e3o</div>';
    statsEl.style.display = 'none';
    return;
  }
  
  var st = load();
  var hist = st['hist_'+exId] || [];
  
  // Agregar por data (m\u00e9dia das s\u00e9ries do dia)
  var byDate = {};
  hist.forEach(function(h) {
    if (!byDate[h.date]) byDate[h.date] = [];
    byDate[h.date].push(h.kg);
  });
  var points = Object.keys(byDate).sort().map(function(d) {
    var arr = byDate[d];
    return { date: d, kg: Math.max.apply(null, arr) };
  });
  
  if (points.length === 0) {
    wrap.innerHTML = '<div class="hist-empty">\u1f4ed Nenhuma carga registrada ainda.<br>Marque as s\u00e9ries como feitas no treino para registrar.</div>';
    statsEl.style.display = 'none';
    return;
  }
  
  if (points.length === 1) {
    wrap.innerHTML = '<div class="hist-empty">Registre mais sess\u00f5es para ver a progress\u00e3o.<br>Primeira carga: <strong>'+points[0].kg+'kg</strong> em '+points[0].date+'</div>';
    statsEl.style.display = 'none';
    return;
  }
  
  // SVG Chart
  var W = 300, H = 120, PL = 30, PR = 10, PT = 18, PB = 24;
  var cW = W - PL - PR, cH = H - PT - PB;
  var kgs = points.map(function(p) { return p.kg; });
  var minKg = Math.min.apply(null,kgs), maxKg = Math.max.apply(null,kgs);
  var range = maxKg - minKg || 5;
  var pad = range * 0.15;
  var vMin = minKg - pad, vMax = maxKg + pad;
  var vRange = vMax - vMin;
  
  function xPos(i) { return PL + (i / (points.length-1)) * cW; }
  function yPos(kg) { return PT + cH - ((kg - vMin) / vRange) * cH; }
  
  var pathD = points.map(function(p,i) { return (i===0?'M':'L')+xPos(i).toFixed(1)+','+yPos(p.kg).toFixed(1); }).join(' ');
  var areaD = pathD + ' L'+xPos(points.length-1).toFixed(1)+','+(PT+cH)+' L'+PL+','+(PT+cH)+' Z';
  
  // Eixo Y labels
  var yLabels = '';
  for (var i = 0; i <= 3; i++) {
    var v = vMin + (vRange/3)*i;
    var y = PT + cH - (i/3)*cH;
    yLabels += '<text class="chart-label" x="'+(PL-3)+'" y="'+(y+3)+'" text-anchor="end">'+Math.round(v)+'</text>';
    yLabels += '<line x1="'+PL+'" y1="'+y+'" x2="'+(PL+cW)+'" y2="'+y+'" stroke="rgba(255,255,255,.04)" stroke-width="1"/>';
  }
  
  // Pontos e datas
  var dotsHTML = '';
  var dateLabels = '';
  var step = Math.max(1, Math.floor(points.length / 4));
  points.forEach(function(p, i) {
    var x = xPos(i), y = yPos(p.kg);
    dotsHTML += '<circle class="chart-dot" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3"/>';
    dotsHTML += '<text class="chart-val" x="'+x.toFixed(1)+'" y="'+(y-6).toFixed(1)+'" text-anchor="middle">'+p.kg+'</text>';
    if (i===0 || i===points.length-1 || i%step===0) {
      var d = p.date.slice(5); // MM-DD
      dateLabels += '<text class="chart-label" x="'+x.toFixed(1)+'" y="'+(PT+cH+14)+'" text-anchor="middle">'+d+'</text>';
    }
  });
  
  wrap.innerHTML = '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+
    yLabels+
    '<path class="chart-area" d="'+areaD+'"/>'+
    '<path class="chart-line" d="'+pathD+'"/>'+
    dotsHTML+dateLabels+
    '</svg>';
  
  // Stats
  var first = kgs[0], last2 = kgs[kgs.length-1];
  var diff = (last2 - first).toFixed(1);
  var sign = diff >= 0 ? '+' : '';
  var sessions = points.length;
  statsEl.style.display = 'grid';
  statsEl.innerHTML =
    '<div class="hist-stat"><div class="hist-stat-val" style="color:var(--teal)">'+first+'kg</div><div class="hist-stat-lbl">In\u00edcio</div></div>'+
    '<div class="hist-stat"><div class="hist-stat-val" style="color:var(--green)">'+last2+'kg</div><div class="hist-stat-lbl">Atual</div></div>'+
    '<div class="hist-stat"><div class="hist-stat-val" style="color:'+(diff>=0?'var(--green)':'var(--red)')+'">'+sign+diff+'kg</div><div class="hist-stat-lbl">Evolu\u00e7\u00e3o ('+sessions+' sess.)</div></div>';
}

// \u2500\u2500 INIT \u2500\u2500
function initApp() {
  // 1. Delega\u00e7\u00e3o de eventos
  document.getElementById('main-content').addEventListener('input', function(e) {
    var t = e.target;
    if (t.dataset.type === 'kg') saveKg(t.dataset.exid, parseInt(t.dataset.serie), t.value);
    if (t.dataset.type === 'rp') saveRp(t.dataset.exid, parseInt(t.dataset.serie), t.value);
  });
  document.getElementById('main-content').addEventListener('click', function(e) {
    var t = e.target;
    if (t.classList.contains('s-chk') && t.dataset.exid) {
      checkS(t.dataset.exid, parseInt(t.dataset.serie));
    }
  });

  // 2. Carregar localStorage IMEDIATAMENTE (s\u00edncrono)
  // Supabase sincroniza em background depois
  _cache = null;
  try {
    var local = localStorage.getItem(SK);
    if (local) _cache = JSON.parse(local);
  } catch(e) {}

  // 3. Construir exerc\u00edcios no DOM
  dbg('buildAllLists...', '#2dd4bf');
  buildAllLists();
  dbg('buildAllLists OK - ' + document.querySelectorAll('.ex-item').length + ' itens', '#c6f135');

  // 4. Semana e fase autom\u00e1ticas
  dbg('renderHeaderWeek...', '#2dd4bf');
  renderHeaderWeek();
  dbg('autoSetPhase...', '#2dd4bf');
  autoSetPhase();
  dbg('fase OK', '#c6f135');

  // 5. Estado visual
  renderHojeBanner();
  updateWeekDots();
  document.getElementById('ci-semana').value = getWeekNumber();

  // 6. Abrir treino do dia
  dbg('abrindo treino...', '#2dd4bf');
  var info = getTreinoHoje();
  var treinoInicial = (info.treino && info.type !== 'done') ? info.treino : 'a';
  showTreino(treinoInicial);
  toggleTC('tc' + treinoInicial);
  dbg('app pronto!', '#c6f135');

  // 7. Sincronizar Supabase em background (n\u00e3o bloqueia)
  setTimeout(function() {
    supaLoad().then(function(remote) {
      if (remote && Object.keys(remote).length > 0) {
        _cache = remote;
        try { localStorage.setItem(SK, JSON.stringify(remote)); } catch(e) {}
        dbg('Supabase sync OK', '#c6f135');
        // Re-renderizar apenas o que precisa (dots e checkin)
        updateWeekDots();
        renderHojeBanner();
      }
    }).catch(function(e) {
      dbg('Supabase offline (usando local)', '#a78bfa');
    });
  }, 100);
}

initApp();

initApp();

initApp();
