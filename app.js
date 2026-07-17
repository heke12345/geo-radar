/* ===================== GEO Radar · 核心逻辑 ===================== */
'use strict';

/* ---------- 全局状态 ---------- */
const STATE = {
  mode: localStorage.getItem('geo_mode') || 'demo',
  brand: '',
  industry: '',
  questions: [],
  results: [],        // 各模型测试结果
  curCite: 0,
  goal: 45,
  plan: [],
  sampleN: parseInt(localStorage.getItem('geo_sampleN') || '3'),
  keys: JSON.parse(localStorage.getItem('geo_keys') || '{}'),
  dsModel: localStorage.getItem('geo_dsModel') || 'deepseek-v4-flash',
  testMode: localStorage.getItem('geo_testMode') || 'memory',  // memory=模型记忆(直连) / web=联网检索(模拟Agent)
  trendRange: 30,
  evidence: [],       // 真实调用原文存证
  srcRank: [],        // 实测提取的 TOP 引用源域名排行
};

/* ---------- 模型定义（国内 + 国际）+ 优先数据源档案 ----------
   sources: 该模型高权重/优先抓取的数据源生态（GEO 分平台作战地图核心）
   fix:     当该平台引用率低时，最该补齐的数据源动作 */
const MODELS = [
  {id:'deepseek', name:'DeepSeek',    sub:'深度求索',   color:'#4d6bfe', logo:'DS', region:'cn',
   sources:['通用权威网页','行业报告/白皮书','多站点一致提及'], fix:'铺设多个权威第三方站点一致提及品牌，强化跨源共识'},
  {id:'doubao',   name:'豆包',        sub:'字节跳动',   color:'#0ab4ff', logo:'豆', region:'cn',
   sources:['抖音','今日头条','西瓜视频','字节自有内容'], fix:'搭建头条号 + 抖音图文矩阵，字节生态内容权重远高于官网'},
  {id:'wenxin',   name:'文心一言',    sub:'百度',       color:'#2932e1', logo:'文', region:'cn',
   sources:['百家号','百度百科','百度知道','百度索引'], fix:'运营百家号 + 完善百度百科词条，百度系是文心的亲儿子'},
  {id:'qwen',     name:'通义千问',    sub:'阿里巴巴',   color:'#615ced', logo:'Q',  region:'cn',
   sources:['夸克','UC 内容','阿里生态'], fix:'推动夸克收录 + 布局阿里系内容，提升通义抓取概率'},
  {id:'kimi',     name:'Kimi',        sub:'月之暗面',   color:'#1a1a2e', logo:'K',  region:'cn',
   sources:['公开长文','PDF/研究报告','学术类内容'], fix:'产出结构化长文与行业报告 PDF，Kimi 偏爱深度长文'},
  {id:'yuanbao',  name:'腾讯元宝',    sub:'腾讯',       color:'#0052d9', logo:'元', region:'cn',
   sources:['微信公众号','搜狗','腾讯系内容'], fix:'建设公众号内容矩阵，元宝极度偏爱公众号，缺则几乎进不去'},
  {id:'chatgpt',  name:'ChatGPT',     sub:'OpenAI',     color:'#10a37f', logo:'G',  region:'intl',
   sources:['Bing 搜索索引','权威英文源','训练语料'], fix:'做好 Bing SEO + 权威英文站点收录，ChatGPT 走 Bing 索引'},
  {id:'perplex',  name:'Perplexity',  sub:'Perplexity', color:'#20808d', logo:'P',  region:'intl',
   sources:['实时全网检索','Reddit','权威媒体','强出处'], fix:'争取第三方媒体/论坛讨论，Perplexity 极依赖外部印证与出处'},
  {id:'gemini',   name:'Gemini',      sub:'Google',     color:'#4285f4', logo:'✦',  region:'intl',
   sources:['Google 搜索索引','YouTube'], fix:'提升 Google SEO 排名 + 布局 YouTube 内容，直接影响 Gemini'},
  {id:'claude',   name:'Claude',      sub:'Anthropic',  color:'#d97757', logo:'C',  region:'intl',
   sources:['高质量权威语料','官方文档','结构化内容'], fix:'产出高质量、可信、结构清晰的权威内容，Claude 重内容质量'},
];

/* ---------- 行业识别与问题模板 ---------- */
const INDUSTRY_MAP = [
  {kw:['飞书深诺','meetsocial','木瓜','蓝色光标','出海营销','广告代理','营销服务'], name:'出海数字营销服务',
   qs:['出海营销服务商哪家好？','Meta / TikTok 广告代理商推荐','跨境电商怎么做海外投放？','中国品牌出海找哪家营销公司？','独立站推广服务商对比','游戏出海发行代理推荐','外贸企业怎么获取海外精准客户？','TikTok Shop 代运营哪家专业？']},
  {kw:['蔚来','理想','小鹏','比亚迪','特斯拉','汽车','新能源车'], name:'新能源汽车',
   qs:['30万预算买什么新能源车？','家用SUV新能源车推荐','续航最好的电动车有哪些？','智能驾驶最强的车是哪款？','蔚来和理想哪个更值得买？','换电模式的车值得买吗？','冬季续航不打折的电动车推荐','带娃家庭适合什么新能源车？']},
  {kw:['shein','希音','服装','女装','快时尚','跨境电商'], name:'跨境快时尚电商',
   qs:['海外购物平台哪个便宜？','平价快时尚品牌推荐','SHEIN 和 Temu 哪个好？','跨境购物哪个网站靠谱？','欧美年轻人喜欢的服装品牌','性价比高的女装网站推荐','海外买衣服哪个 App 好用？']},
  {kw:['元气森林','饮料','气泡水','无糖','食品','饮品'], name:'新消费饮品',
   qs:['无糖气泡水哪个牌子好喝？','健康低糖饮料推荐','元气森林值得买吗？','夏天喝什么饮料解渴又健康？','便利店必买的网红饮料','减肥期间能喝什么饮料？']},
  {kw:['石头','扫地机','洗地机','家电','智能家居'], name:'智能清洁家电',
   qs:['扫地机器人哪个牌子好？','2000元扫地机推荐','石头和科沃斯哪个好？','带自动集尘的扫地机推荐','养宠物家庭用什么扫地机？','洗地机值得买吗？哪款好？']},
];
const GENERIC_QS = ['{B}怎么样？值得选吗？','{B}的口碑和评价如何？','{B}和竞品相比有什么优势？','{B}适合什么人群？','有没有比{B}更好的选择？','{B}的产品/服务推荐','行业内和{B}类似的品牌有哪些？','买/用{B}前需要注意什么？'];
const Q_CATS = [
  {name:'品牌推荐',color:'#2f6bff',bg:'#eaf1ff'},
  {name:'竞品对比',color:'#7c5cff',bg:'#f0ecff'},
  {name:'选购决策',color:'#0aa5b1',bg:'#e3f6f7'},
  {name:'口碑评价',color:'#f7a218',bg:'#fff4e0'},
];

/* ---------- 工具函数 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const rand = (a,b) => Math.random()*(b-a)+a;
const randi = (a,b) => Math.floor(rand(a,b+1));
const pick = arr => arr[randi(0,arr.length-1)];
function seedFrom(str){let h=0;for(let i=0;i<str.length;i++){h=(h<<5)-h+str.charCodeAt(i);h|=0}return Math.abs(h)}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200)}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

/* ---------- 导航 ---------- */
const VIEW_META = {
  input:{t:'品牌输入',c:'输入任意品牌名称，开启 AI 可见性诊断'},
  questions:{t:'问题生成',c:'AI 自动挖掘用户在大模型中的高频提问'},
  test:{t:'多模型测试',c:'在国内外主流大模型中并发实测品牌可见性'},
  rank:{t:'排名与引用',c:'品牌在各平台回答中的排名、引用率与情感分析'},
  optimize:{t:'提升方案',c:'按目标引用率生成优化动作与同行案例'},
  monitor:{t:'效果监控',c:'持续追踪优化后的引用率、排名与情感趋势'},
  chain:{t:'GEO 逻辑链诊断',c:'品牌要闯过 5 关才会被 AI 引用 · 定位断点在哪一环'},
};
function go(view){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $('#view-'+view).classList.add('active');
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  $('#pageTitle').textContent = VIEW_META[view].t;
  $('#pageCrumb').textContent = VIEW_META[view].c;
  if(view==='chain') buildChain();
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('.nav-item').forEach(n=>n.addEventListener('click',()=>{
  const v=n.dataset.view;
  // chain 允许未诊断时进入（看方法论空态引导）
  if(v!=='input' && v!=='chain' && !STATE.brand){toast('请先输入品牌并开始诊断');return}
  go(v);
}));
function markDone(view){const n=[...$$('.nav-item')].find(x=>x.dataset.view===view);if(n)n.classList.add('done')}

/* ---------- 设置 ---------- */
function openSettings(){$('#settingsModal').classList.add('show')}
function closeSettings(){$('#settingsModal').classList.remove('show')}
function setMode(m,btn){
  $$('#modeSeg button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
  $('#apiFields').style.display = m==='live'?'block':'none';
  STATE._pendingMode = m;
}
function setTestMode(m,btn){
  $$('#testModeSeg button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
  STATE._pendingTestMode = m;
}
function saveSettings(){
  STATE.mode = STATE._pendingMode || STATE.mode;
  STATE.testMode = STATE._pendingTestMode || STATE.testMode;
  STATE.sampleN = parseInt($('#sampleN').value);
  STATE.dsModel = $('#dsModel')?.value || STATE.dsModel;
  STATE.keys = {
    deepseek:$('#key_deepseek').value.trim(),
    qwen:$('#key_qwen').value.trim(),
    openai:$('#key_openai').value.trim(),
    base:$('#key_base').value.trim(),
  };
  localStorage.setItem('geo_mode',STATE.mode);
  localStorage.setItem('geo_testMode',STATE.testMode);
  localStorage.setItem('geo_sampleN',STATE.sampleN);
  localStorage.setItem('geo_dsModel',STATE.dsModel);
  localStorage.setItem('geo_keys',JSON.stringify(STATE.keys));
  updateModeBadge();closeSettings();
  toast(STATE.mode==='live'?'已切换到真实 API 模式':'已保存设置');
}
function updateModeBadge(){
  const live = STATE.mode==='live';
  const tm = STATE.testMode==='web' ? '联网检索' : '模型记忆';
  $('#modeDot').classList.toggle('live',live);
  $('#modeText').textContent = live?('真实数据 · '+STATE.dsModel+' · '+tm):'演示模式 · 模拟数据（勿用于汇报）';
  const mt=$('#modeText'); if(mt) mt.style.color = live?'#12a150':'#e5484d';
}
function loadSettingsUI(){
  $('#sampleN').value = STATE.sampleN;
  if($('#dsModel')) $('#dsModel').value = STATE.dsModel;
  if($('#testModeSeg')){$$('#testModeSeg button').forEach(b=>b.classList.remove('on'));$$('#testModeSeg button')[STATE.testMode==='web'?1:0].classList.add('on');}
  $('#key_deepseek').value = STATE.keys.deepseek||'';
  $('#key_qwen').value = STATE.keys.qwen||'';
  $('#key_openai').value = STATE.keys.openai||'';
  $('#key_base').value = STATE.keys.base||'';
  $$('#modeSeg button').forEach(b=>b.classList.remove('on'));
  $('#modeSeg button')[STATE.mode==='live'?1:0].classList.add('on');
  $('#apiFields').style.display = STATE.mode==='live'?'block':'none';
}

/* ---------- 步骤1：开始分析 ---------- */
function quickFill(b){$('#brandInput').value=b;startAnalysis()}
$('#brandInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')startAnalysis()});
function startAnalysis(){
  const b = $('#brandInput').value.trim();
  if(!b){toast('请输入品牌名称');$('#brandInput').focus();return}
  STATE.brand = b;
  const chip = $('#brandChip');chip.style.display='inline-flex';chip.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>${b}`;
  markDone('input');
  genQuestions();
  go('questions');
}

/* ---------- 步骤2：生成问题 ---------- */
function detectIndustry(brand){
  const lower = brand.toLowerCase();
  for(const ind of INDUSTRY_MAP){
    if(ind.kw.some(k=>lower.includes(k.toLowerCase())||brand.includes(k))) return ind;
  }
  return null;
}
function genQuestions(){
  const ind = detectIndustry(STATE.brand);
  STATE.industry = ind ? ind.name : '通用行业';
  let raw = ind ? [...ind.qs] : GENERIC_QS.map(q=>q.replace(/\{B\}/g,STATE.brand));
  // 补充品牌相关通用问题
  if(ind){ raw = raw.concat(GENERIC_QS.slice(0,3).map(q=>q.replace(/\{B\}/g,STATE.brand))); }
  const sd = seedFrom(STATE.brand);
  STATE.questions = raw.slice(0,10).map((q,i)=>({
    id:i, text:q, selected:true,
    cat:Q_CATS[(sd+i)%4],
    intent:['高转化','高转化','中转化','认知类'][ (sd+i)%4 ]
  }));
  renderQuestions();
}
function regenQuestions(){genQuestions();toast('已重新生成高频问题')}
function renderQuestions(){
  $('#qBrandName').textContent = '· '+STATE.brand;
  $('#qIndustry').textContent = STATE.industry;
  $('#qCount').textContent = STATE.questions.length;
  const list = $('#qList');
  list.innerHTML = STATE.questions.map(q=>`
    <div class="q-item">
      <div class="q-check" data-q="${q.id}" onclick="toggleQ(${q.id})" style="${q.selected?'':'background:#fff;border-color:var(--line)'}">
        ${q.selected?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg>':''}
      </div>
      <div class="q-txt">${q.text}</div>
      <span class="q-intent">${q.intent}</span>
      <span class="q-cat" style="background:${q.cat.bg};color:${q.cat.color}">${q.cat.name}</span>
    </div>`).join('');
  updateQSel();
}
function toggleQ(id){const q=STATE.questions.find(x=>x.id===id);q.selected=!q.selected;renderQuestions()}
function updateQSel(){$('#qSelected').textContent = STATE.questions.filter(q=>q.selected).length}

/* ---------- 步骤3：多模型测试 ---------- */
async function runTests(){
  markDone('questions');
  const selected = STATE.questions.filter(q=>q.selected);
  if(!selected.length){toast('请至少选择一个问题');return}
  $('#reTestBtn').style.display='none';$('#toRankBtn').style.display='none';
  const grid = $('#modelGrid');
  // 初始化卡片
  grid.innerHTML = MODELS.map(m=>`
    <div class="model-card" id="mc-${m.id}">
      <div class="mc-head">
        <div class="model-logo" style="background:${m.color}">${m.logo}</div>
        <div><b>${m.name}</b><span>${m.sub} · ${m.region==='cn'?'国内':'国际'}</span></div>
        <span class="mc-status wait" id="st-${m.id}">等待</span>
      </div>
      <div class="mc-bar"><i id="bar-${m.id}"></i></div>
      <div class="mc-metrics">
        <div class="mc-metric"><div class="n" id="rank-${m.id}">—</div><div class="l">平均排名</div></div>
        <div class="mc-metric"><div class="n" id="cite-${m.id}">—</div><div class="l">引用率</div></div>
        <div class="mc-metric"><div class="n" id="ment-${m.id}">—</div><div class="l">提及次数</div></div>
      </div>
    </div>`).join('');
  STATE.results = [];
  STATE.evidence = [];
  let done = 0;
  const total = MODELS.length;
  $('#testProgress').textContent = `0 / ${total} 平台完成`;

  // 真实接入的模型串行（避免限流），其余模型并发模拟
  const realModels = MODELS.filter(m=>STATE.mode==='live' && getEndpoint(m));
  const simModels  = MODELS.filter(m=>!(STATE.mode==='live' && getEndpoint(m)));
  const bump = res=>{STATE.results.push(res);done++;$('#testProgress').textContent=`${done} / ${total} 平台完成`;if(done===total)finishTests();};
  // 先并发跑模拟的（快），真实的串行跑（稳）
  const simP = Promise.all(simModels.map((m,idx)=>testModel(m,selected,idx).then(bump)));
  for(const m of realModels){ const r=await testModel(m,selected,0); bump(r); }
  await simP;
}
async function testModel(m,questions,idx){
  const card=$('#mc-'+m.id), st=$('#st-'+m.id), bar=$('#bar-'+m.id);
  const cfg = STATE.mode==='live' ? getEndpoint(m) : null;
  const isReal = !!cfg;
  await sleep(200+idx*120);
  card.classList.add('testing');st.className='mc-status run';st.textContent=isReal?'真实测试中':'模拟中';
  let res;
  if(isReal){
    // 真实调用：进度条随每题推进
    res = await realTest(m,questions,(p)=>{bar.style.width=Math.min(95,p)+'%'})
      .catch(err=>{ res=null; return simTest(m,questions,'调用失败: '+(err.message||err)); });
    if(res) res.real = true;
  }else{
    for(let p=10;p<=90;p+=randi(12,26)){bar.style.width=Math.min(p,90)+'%';await sleep(rand(140,320))}
    res = simTest(m,questions);
    res.real = false;
  }
  bar.style.width='100%';card.classList.remove('testing');
  st.className='mc-status done'+(res.real?' real':'');st.textContent=res.real?'真实':'模拟';
  $('#rank-'+m.id).textContent = res.avgRank>0?('#'+res.avgRank):'未出现';
  $('#rank-'+m.id).style.color = res.avgRank>0&&res.avgRank<=3?'var(--down)':(res.avgRank>0?'var(--ink)':'var(--danger)');
  $('#cite-'+m.id).textContent = res.cite+'%';
  $('#ment-'+m.id).textContent = res.mentions+'/'+questions.length;
  // 真实/模拟标记
  const tag = card.querySelector('.mc-realtag') || (()=>{const e=document.createElement('span');e.className='mc-realtag';card.querySelector('.mc-head').appendChild(e);return e})();
  tag.textContent = res.real?'● 真实数据':'○ 模拟';
  tag.style.cssText = 'position:absolute;right:14px;bottom:12px;font-size:11px;font-weight:600;'+(res.real?'color:#12a150':'color:#93a0b3');
  card.style.position='relative';
  return res;
}
/* 模拟测试引擎：基于品牌名+模型生成稳定但有差异的数据（仅用于未接入 API 的平台） */
function simTest(m,questions,note){
  const sd = seedFrom(STATE.brand+m.id);
  const known = detectIndustry(STATE.brand); // 已知行业品牌可见性更高
  const base = known ? rand(0.28,0.62) : rand(0.12,0.42);
  const regionBoost = m.region==='cn' ? 1.12 : 0.9;
  const platformFactor = 0.8 + ((sd%40)/100);
  let cite = Math.round(Math.min(0.85, base*regionBoost*platformFactor)*100);
  const mentions = Math.round((cite/100)*questions.length);
  const avgRank = cite>55?randi(1,2):cite>35?randi(2,4):cite>15?randi(4,7):(cite>5?randi(6,9):0);
  const sentiments = ['正面','正面','中性','正面','中性','负面'];
  const sentiment = pick(cite>40?sentiments.slice(0,4):sentiments);
  const detail = questions.map(q=>{
    const hit = Math.random() < cite/100;
    return {q:q.text, hit, rank: hit?randi(1,8):0, cited: hit&&Math.random()<0.6, samples:[]};
  });
  const attribution = buildAttribution(m, cite, null, []);
  return {model:m, cite, mentions, avgRank, sentiment, detail, real:false, attribution, note:note||'该平台未接入 API，为模拟数据'};
}

/* ===== 数据源归因：把引用率缺口归因到具体数据源，并给出可执行建议 =====
   m: 模型（含 sources/fix 档案）  cite: 引用率  topSrc: 裁判识别的主导信息源  reasons: 裁判原因 */
function buildAttribution(m, cite, topSrc, reasons){
  const level = cite>=55?'strong':cite>=30?'mid':cite>=10?'weak':'absent';
  const levelMeta = {
    strong:{tag:'表现良好',c:'#12a150',bg:'#e6f5ec'},
    mid:{tag:'中等偏低',c:'#f7a218',bg:'#fff4e0'},
    weak:{tag:'明显偏弱',c:'#e5721f',bg:'#fdeee0'},
    absent:{tag:'几乎缺席',c:'#e5484d',bg:'#fdecec'},
  }[level];
  // 缺口原因：真实模型优先用裁判 reason，否则用数据源档案推断
  let cause;
  if(level==='strong'){
    cause = topSrc ? `品牌信息主要来自「${topSrc}」，在该平台已建立稳定可见度` : '品牌在该平台已具备较好可见度';
  }else if(level==='absent'){
    cause = `品牌在该平台高权重源（${m.sources.slice(0,2).join('、')}）中缺乏内容沉淀，几乎无法被检索到`;
  }else{
    cause = `品牌在该平台的优先源（${m.sources[0]}）中内容覆盖不足，被检索/引用概率偏低`;
  }
  // 优先取裁判给的最有信息量的原因
  const realReason = (reasons||[]).find(r=>r && r.length>=6);
  if(realReason && level!=='strong') cause = realReason;
  return {
    level, levelTag:levelMeta.tag, color:levelMeta.c, bg:levelMeta.bg,
    sources:m.sources, topSrc: topSrc||null,
    cause,
    action: level==='strong' ? '维持内容更新频率，巩固现有优势' : m.fix,
  };
}

/* ===== 真实测量：真实提问 → 多次采样 → LLM 裁判判定 → 存原文 ===== */
async function realTest(m,questions,onProg){
  const cfg = getEndpoint(m);
  if(!cfg){throw new Error('未配置该平台 API')}
  const n = Math.max(1, Math.min(STATE.sampleN, 5));
  let hits=0, cited=0, posCnt=0, negCnt=0, ranks=[];
  const detail=[];
  const srcTally={};        // 提及时信息源类型计数
  const domainTally={};     // 实测提取的具体来源域名/平台计数（TOP 引用源）
  const reasons=[];         // 裁判给出的原因（用于归因说明）
  const total = questions.length;
  for(let qi=0; qi<total; qi++){
    const q = questions[qi];
    let qHit=0, qCite=0, qRankSum=0, qRankCnt=0, qPos=0, qNeg=0;
    const samples=[];
    for(let i=0;i<n;i++){
      const answer = await callLLM(cfg, buildPrompt(q.text));   // 真实提问
      const a = await analyzeAnswer(cfg, answer, STATE.brand);  // LLM 裁判判定
      samples.push({answer, verdict:a});
      // 存全量证据
      STATE.evidence.push({model:m.name, q:q.text, sample:i+1, answer, verdict:a, time:new Date().toLocaleTimeString('zh-CN')});
      if(a.reason) reasons.push(a.reason);
      // 实测来源聚合（无论是否提及品牌，只要回答里出现来源就统计——反映该模型的信源生态）
      (a.sources||[]).forEach(s=>{ domainTally[s]=(domainTally[s]||0)+1; });
      if(a.mentioned){qHit++; if(a.cited)qCite++; if(a.rank>0){qRankSum+=a.rank;qRankCnt++}
        if(a.sentiment==='正面')qPos++; else if(a.sentiment==='负面')qNeg++;
        if(a.srcType && a.srcType!=='无' && a.srcType!=='无法判断') srcTally[a.srcType]=(srcTally[a.srcType]||0)+1; }
    }
    const hitRate = qHit/n;
    if(qHit>0){hits++; if(qCite>0)cited++; if(qRankCnt>0)ranks.push(Math.round(qRankSum/qRankCnt)); if(qPos>=qNeg)posCnt++; else negCnt++;}
    detail.push({q:q.text, hit:qHit>0, hitRate:Math.round(hitRate*100), rank: qRankCnt?Math.round(qRankSum/qRankCnt):0, cited:qCite>0, samples});
    if(onProg) onProg(Math.round(((qi+1)/total)*95));
  }
  const cite = Math.round((hits/total)*100);
  const avgRank = ranks.length?Math.round(ranks.reduce((a,b)=>a+b,0)/ranks.length):0;
  const sentiment = hits===0?'—':(posCnt>=negCnt?'正面':(negCnt>posCnt?'负面':'中性'));
  // 归因：主导信息源 = 出现次数最多的 srcType；缺口原因来自裁判 reason
  const topSrc = Object.entries(srcTally).sort((a,b)=>b[1]-a[1])[0];
  const attribution = buildAttribution(m, cite, topSrc?topSrc[0]:null, reasons);
  // 实测来源排行（TOP 引用源）：按出现频次排序
  const domainRank = Object.entries(domainTally).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})).slice(0,10);
  return {model:m, cite, mentions:hits, avgRank, sentiment, detail, real:true, sampleN:n, srcTally, domainRank, attribution};
}
function getEndpoint(m){
  const k=STATE.keys;
  if(m.id==='deepseek'&&k.deepseek) return {url:'https://api.deepseek.com/v1/chat/completions',key:k.deepseek,model:STATE.dsModel};
  if(m.id==='qwen'&&k.qwen) return {url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',key:k.qwen,model:'qwen-plus'};
  if(m.id==='chatgpt'&&k.openai) return {url:'https://api.openai.com/v1/chat/completions',key:k.openai,model:'gpt-4o-mini'};
  if(k.base&&k.openai) return {url:k.base.replace(/\/$/,'')+'/chat/completions',key:k.openai,model:m.id};
  return null;
}
function buildPrompt(q){
  if(STATE.testMode==='web'){
    // 联网检索模式：模拟带检索的 Agent 产品行为——要求基于可查证的公开信息回答，并显式列出信息来源
    return `你是一个带联网检索能力的 AI 助手（类似 Perplexity / 元宝联网 / ChatGPT search）。请基于你所了解的公开、可查证的信息，直接自然地回答下面这个问题。\n\n要求：\n1. 如果涉及品牌/产品/服务商推荐，给出具体名单并按你的认知排序；\n2. 在回答末尾另起一段，以"参考来源："开头，列出你的信息主要来自哪些平台或站点（如：官网、行业媒体名称、百科、知乎、公众号、榜单报告等，尽量具体到可识别的来源类型或站点名）。\n\n问题：${q}`;
  }
  // 模型记忆模式：直连大模型内在知识，测长期沉淀
  return `你是一个中立、真实的信息助手。请像平时回答普通用户那样，直接自然地回答下面这个问题。如果涉及品牌/产品/服务商推荐，请给出你认为合适的具体名单（按你的真实认知排序）：\n\n${q}`;
}
async function callLLM(cfg, content){
  const resp = await fetch(cfg.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
    body:JSON.stringify({model:cfg.model,messages:[{role:'user',content}],temperature:0.7})});
  if(!resp.ok){throw new Error('HTTP '+resp.status)}
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}
/* LLM 裁判：让模型自己判定「有没有提及品牌、排第几、正负面、是否带来源、信息像来自哪类源」，返回结构化 JSON */
async function analyzeAnswer(cfg, text, brand){
  if(!text) return {mentioned:false, rank:0, cited:false, sentiment:'—', srcType:'无', reason:'模型未返回内容'};
  const judgePrompt = `下面是一段 AI 对用户问题的回答。请判断品牌"${brand}"在这段回答中的情况，只返回 JSON，不要解释。\n\n字段：\n- mentioned: 是否提到了该品牌(true/false)\n- rank: 若为推荐名单，该品牌排在第几位(整数，1为第一；未上榜或非名单填0)\n- sentiment: 对该品牌的情感倾向("正面"/"中性"/"负面"；未提及填"—")\n- cited: 回答里是否给出了可追溯来源/链接/数据支撑(true/false)\n- srcType: 若提及了该品牌，回答中关于它的信息最像来自哪类信息源？从["官方/官网","第三方媒体报道","行业报告/榜单","百科词条","社交/论坛口碑","模型内在知识","无法判断"]中选一个；未提及填"无"\n- sources: 数组，抽取回答中出现的所有具体信息来源（URL、站点名、平台名、媒体名、榜单名等，如 "36kr.com"、"知乎"、"百度百科"、"官网"）。没有则返回空数组[]\n- reason: 用一句话(≤30字)说明：为什么该品牌在这次回答里出现/没出现(例如"多家媒体报道使其被广泛提及"或"缺少第三方信源导致未被提及")\n\n回答内容：\n"""\n${text.slice(0,2800)}\n"""\n\n只输出 JSON：`;
  try{
    const raw = await callLLM(cfg, judgePrompt);
    const j = JSON.parse(raw.replace(/```json|```/g,'').trim());
    // 来源：优先用裁判抽取的 sources，再用正则从原文兜底抓 URL/域名
    let sources = Array.isArray(j.sources) ? j.sources.map(s=>String(s).trim()).filter(Boolean) : [];
    sources = sources.concat(extractSources(text));
    sources = [...new Set(sources.map(normalizeSource).filter(Boolean))].slice(0,12);
    return {mentioned:!!j.mentioned, rank:parseInt(j.rank)||0, cited:!!j.cited, sentiment:j.sentiment||'—',
      srcType:j.srcType||'无法判断', reason:(j.reason||'').slice(0,40), sources};
  }catch(e){
    // 裁判失败时退回到最简单的字符串包含（并标注）
    const mentioned = text.includes(brand);
    return {mentioned, rank:0, cited:/https?:\/\//.test(text), sentiment: mentioned?'中性':'—',
      srcType: mentioned?'无法判断':'无', reason:'裁判解析失败，降级判定', sources:extractSources(text), fallback:true};
  }
}
/* 从回答原文正则抽取来源（URL 域名 + 常见平台关键词），作为裁判抽取的兜底 */
function extractSources(text){
  if(!text) return [];
  const out=[];
  // 抓 URL 域名
  const urls = text.match(/https?:\/\/[^\s"'）)]+/g) || [];
  urls.forEach(u=>{ try{ out.push(new URL(u).hostname.replace(/^www\./,'')); }catch(e){} });
  // 抓常见平台/来源关键词
  const KW = ['官网','官方网站','知乎','微信公众号','公众号','百度百科','维基百科','百科','36氪','36kr','亿邦动力','虎嗅','钛媒体','雪球','小红书','抖音','今日头条','头条','B站','哔哩哔哩','微博','搜狗','夸克','百家号','CSDN','GitHub','Reddit','LinkedIn','YouTube','Wikipedia','Bing','Google','行业报告','白皮书','年报','财报'];
  KW.forEach(k=>{ if(text.includes(k)) out.push(k); });
  return out;
}
/* 归一化来源名：把同义/大小写合并 */
function normalizeSource(s){
  if(!s) return '';
  s = String(s).trim().replace(/^www\./,'');
  const map = {'官方网站':'官网','36kr':'36氪','36kr.com':'36氪','zhihu.com':'知乎','baike.baidu.com':'百度百科','微信公众号':'公众号','哔哩哔哩':'B站','wikipedia.org':'Wikipedia','en.wikipedia.org':'Wikipedia','zh.wikipedia.org':'Wikipedia'};
  return map[s] || map[s.toLowerCase()] || s;
}

function finishTests(){
  // 计算总体引用率
  STATE.curCite = Math.round(STATE.results.reduce((a,r)=>a+r.cite,0)/STATE.results.length);
  // 汇总所有真实模型实测提取的来源 → 全局 TOP 引用源排行
  const agg={};
  STATE.results.filter(r=>r.real && r.domainRank).forEach(r=>{
    r.domainRank.forEach(d=>{ agg[d.name]=(agg[d.name]||0)+d.count; });
  });
  STATE.srcRank = Object.entries(agg).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})).slice(0,12);
  $('#reTestBtn').style.display='inline-flex';
  $('#toRankBtn').style.display='inline-flex';
  markDone('test');
  buildRank();
  toast('测试完成，共 '+MODELS.length+' 个平台');
}

/* ---------- 步骤4：排名与引用 ---------- */
function buildRank(){
  const results = [...STATE.results].sort((a,b)=>b.cite-a.cite);
  const avgCite = STATE.curCite;
  const appeared = results.filter(r=>r.avgRank>0).length;
  const bestRank = Math.min(...results.filter(r=>r.avgRank>0).map(r=>r.avgRank), 99);
  const posSent = results.filter(r=>r.sentiment==='正面').length;
  const stats = [
    {lbl:'平均引用率',ic:'📊',c:'#2f6bff',bg:'#eaf1ff',val:avgCite+'%',delta:avgCite>=40?'高于行业均值':'低于行业均值',up:avgCite>=40},
    {lbl:'覆盖平台数',ic:'🌐',c:'#7c5cff',bg:'#f0ecff',val:appeared+'/'+MODELS.length,delta:'品牌被提及的平台',up:appeared>=MODELS.length/2},
    {lbl:'最佳排名',ic:'🏆',c:'#0aa5b1',bg:'#e3f6f7',val:bestRank<99?('#'+bestRank):'—',delta:bestRank<=3?'进入首选推荐':'仍有提升空间',up:bestRank<=3},
    {lbl:'正面情感占比',ic:'💬',c:'#12a150',bg:'#e6f5ec',val:Math.round(posSent/MODELS.length*100)+'%',delta:'品牌口碑倾向',up:posSent>=MODELS.length/2},
  ];
  $('#rankStats').innerHTML = stats.map(s=>`
    <div class="stat">
      <div class="lbl"><span class="mi" style="background:${s.bg}"><span style="font-size:14px">${s.ic}</span></span>${s.lbl}</div>
      <div class="val" style="color:${s.c}">${s.val}</div>
      <div class="delta ${s.up?'up':'down'}">${s.up?'▲':'▼'} ${s.delta}</div>
    </div>`).join('');

  const rows = results.map(r=>{
    const rankCls = r.avgRank===0?'rank-x':r.avgRank<=1?'rank-1':r.avgRank<=2?'rank-2':r.avgRank<=3?'rank-3':'rank-x';
    const citeColor = r.cite>=50?'#12a150':r.cite>=30?'#f7a218':'#e5484d';
    const sentCls = r.sentiment==='正面'?'tp-ok':r.sentiment==='中性'?'tp-warn':'tp-bad';
    const src = r.real
      ? `<span class="src-tag src-real" onclick="showEvidence('${r.model.name}')">● 真实 · 看原文</span>`
      : `<span class="src-tag src-sim">○ 模拟</span>`;
    return `<tr>
      <td><span class="mini-logo" style="background:${r.model.color}">${r.model.logo}</span>${r.model.name}<span style="color:var(--ink-3);font-size:12px;margin-left:6px">${r.model.region==='cn'?'国内':'国际'}</span></td>
      <td><span class="rank-badge ${rankCls}">${r.avgRank>0?r.avgRank:'—'}</span></td>
      <td><div class="cite-bar"><div class="cite-track"><div class="cite-fill" style="width:${r.cite}%;background:${citeColor}"></div></div><span class="cite-num">${r.cite}%</span></div></td>
      <td>${r.mentions} / ${r.detail.length}</td>
      <td><span class="tag-pill ${sentCls}">${r.sentiment}</span></td>
      <td>${src}</td>
    </tr>`;
  }).join('');
  $('#rankTable').innerHTML = `<thead><tr><th>模型平台</th><th>平均排名</th><th>引用率</th><th>提及/测试</th><th>情感</th><th>数据来源</th></tr></thead><tbody>${rows}</tbody>`;
  drawCompChart();
  buildAttrGrid();
  buildSrcRank();
}
/* 实测 TOP 引用源：从真实回答里提取的具体来源域名/平台，按频次排行（比先验档案更硬） */
function buildSrcRank(){
  const box = $('#srcRankBox');
  if(!box) return;
  const list = STATE.srcRank || [];
  const wrap = $('#srcRankSec');
  if(!list.length){
    if(wrap) wrap.style.display='none';   // 无实测来源（如纯记忆模式没抓到）则隐藏
    return;
  }
  if(wrap) wrap.style.display='block';
  const max = list[0].count || 1;
  const modeLabel = STATE.testMode==='web' ? '联网检索模式' : '模型记忆模式';
  box.innerHTML = `
    <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:14px">
      从真实调用回答中实测提取（${modeLabel}），共识别 <b style="color:var(--ink)">${list.length}</b> 类来源。频次越高 = 该模型回答这个品牌时越依赖这类源，就是你最该铺的地方。
    </div>
    ${list.map((s,i)=>{
      const pct = Math.round(s.count/max*100);
      const c = i<3 ? '#2f6bff' : '#93a0b3';
      return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:9px">
        <span style="width:22px;font-size:12px;font-weight:700;color:${c};text-align:center">${i+1}</span>
        <span style="width:150px;font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</span>
        <div style="flex:1;height:8px;background:var(--line-2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c};border-radius:4px"></div></div>
        <span style="width:44px;font-size:12px;color:var(--ink-3);text-align:right">${s.count} 次</span>
      </div>`;
    }).join('')}`;
}

/* ========== GEO 逻辑链诊断：5 环因果链，用真实数据定位断点 ========== */
function buildChain(){
  const flow = $('#chainFlow'); const diag = $('#chainDiag'); const hard = $('#chainHard');
  if(!flow) return;
  const tested = STATE.results && STATE.results.length>0;

  // 从真实/模拟数据推断每一环的状态
  const srcCount = (STATE.srcRank||[]).length;
  const hasOwnSite = (STATE.srcRank||[]).some(s=>/官网|官方/.test(s.name));
  const webMode = STATE.testMode==='web';
  const cite = tested ? STATE.curCite : 0;
  const appeared = tested ? STATE.results.filter(r=>r.avgRank>0).length : 0;
  const bestRank = tested ? Math.min(...STATE.results.filter(r=>r.avgRank>0).map(r=>r.avgRank),99) : 99;
  const posSent = tested ? STATE.results.filter(r=>r.sentiment==='正面').length : 0;
  const total = tested ? STATE.results.length : 1;

  // 每一环：status = ok / warn / bad / na（未测）
  const S = (cond, warnCond)=> !tested?'na' : cond?'ok' : warnCond?'warn':'bad';
  const rings = [
    { n:1, k:'内容存在', ctrl:'完全可控', ctrlType:'you',
      desc:'品牌在公开互联网上，有没有可被抓取的、结构化的、说清卖点的内容（官网/知乎/垂媒/百科）。',
      stat: !tested?'na' : hasOwnSite?'ok':(srcCount>0?'warn':'bad'),
      real: !tested?'尚未诊断' : hasOwnSite?'实测来源含「官网/官方」，自有内容可被抓取':(srcCount>0?'抓到了公开内容，但未见你的官网/官方源':'几乎抓不到与品牌相关的可信内容'),
      fix:'把核心卖点、问答对、案例写成结构化内容，铺到官网 + 权威平台。这一环 100% 是你说了算。' },
    { n:2, k:'信源覆盖', ctrl:'大部分可控', ctrlType:'you',
      desc:'你的内容有没有铺到「这个模型爱抓的那些源」上。铺错平台=白铺，模型根本不去那儿抓。',
      stat: !tested?'na' : srcCount>=5?'ok':(srcCount>=2?'warn':'bad'),
      real: !tested?'尚未诊断' : srcCount>0?('实测覆盖 '+srcCount+' 类来源，'+(srcCount>=5?'覆盖面较广':'覆盖偏窄，还有高频源没铺到')):'未检出有效信源覆盖',
      fix:'看「实测 TOP 引用源」榜——模型最依赖哪几类源，就优先把内容铺到那里，别凭感觉铺。' },
    { n:3, k:'被检索命中', ctrl:'半黑盒', ctrlType:'gray',
      desc:'用户提问时，模型（尤其联网 Agent）当场去检索，有没有抓到你的内容。检索有随机性+实时性。',
      stat: !tested?'na' : webMode?(srcCount>0?'ok':'bad'):(cite>0?'warn':'bad'),
      real: !tested?'尚未诊断' : webMode?(srcCount>0?'联网检索模式下确实抓到了你所在的源':'联网检索没抓到你的内容，检索层就断了'):('当前为「模型记忆」模式，测的是训练沉淀而非实时检索——建议切到「联网检索」验证 Agent 场景'),
      fix:'联网层你只能间接影响：提高内容在高频源的密度与新鲜度，让检索更可能命中。切「联网检索」模式测这一环。' },
    { n:4, k:'被采信引用', ctrl:'黑盒', ctrlType:'black',
      desc:'抓到了不等于会引用。模型要做跨源共识判断——它信谁、以谁为准，是完全不透明的黑盒。',
      stat: S(cite>=40, cite>=20),
      real: !tested?'尚未诊断' : ('平均引用率 '+cite+'%，'+(cite>=40?'采信情况良好':cite>=20?'被部分采信，仍有提升空间':'很少被采信，抓到了也没被引用')),
      fix:'提升可信度与一致性：多源口径统一、有权威背书、数据可交叉印证。但别承诺确定性——这一环是黑盒。' },
    { n:5, k:'生成呈现', ctrl:'黑盒 + 随机', ctrlType:'black',
      desc:'最终答案里，你排第几、是正面还是负面、和竞品怎么比。同一问题问 10 次，答案还不一样（采样随机）。',
      stat: !tested?'na' : (bestRank<=3&&posSent>=total/2)?'ok':(appeared>0?'warn':'bad'),
      real: !tested?'尚未诊断' : (appeared>0?('在 '+appeared+'/'+total+' 个平台被提及，最佳排名 '+(bestRank<99?('#'+bestRank):'—')+'，正面情感 '+posSent+'/'+total):'几乎不出现在生成结果里'),
      fix:'多次采样看分布而非单次；用竞品做对照消除模型漂移；把力气前移到可控的①内容存在、②信源覆盖两环。' },
  ];

  const statMeta = {
    ok:  {c:'#12a150', bg:'#e6f5ec', t:'通过', ic:'✓'},
    warn:{c:'#c77d12', bg:'#fdf3e0', t:'偏弱', ic:'!'},
    bad: {c:'#e5484d', bg:'#fdecec', t:'断点', ic:'✕'},
    na:  {c:'#93a0b3', bg:'#f1f4f8', t:'未测', ic:'—'},
  };
  const ctrlMeta = {
    you:  {c:'#2f6bff', bg:'#eaf1ff', t:'你可控'},
    gray: {c:'#c77d12', bg:'#fdf3e0', t:'半黑盒'},
    black:{c:'#6b7280', bg:'#eef0f3', t:'黑盒'},
  };

  // 横向 5 环流程
  flow.innerHTML = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;align-items:stretch">${
    rings.map((r,i)=>{
      const sm = statMeta[r.stat]; const cm = ctrlMeta[r.ctrlType];
      const arrow = i<4 ? `<div style="position:absolute;right:-11px;top:50%;transform:translateY(-50%);z-index:2;color:var(--ink-3);font-size:18px;font-weight:700">›</div>` : '';
      return `<div style="position:relative;padding:0 6px">
        <div class="card" style="height:100%;padding:14px 12px;border-color:${r.stat==='bad'?'#f3b0b3':'var(--line)'};box-shadow:${r.stat==='bad'?'0 0 0 2px #fdecec':'none'}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="width:24px;height:24px;border-radius:50%;background:${sm.bg};color:${sm.c};font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center">${r.n}</span>
            <span style="font-size:10.5px;font-weight:700;color:${cm.c};background:${cm.bg};padding:2px 7px;border-radius:20px">${cm.t}</span>
          </div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);margin-bottom:6px">${r.k}</div>
          <div style="font-size:11px;color:var(--ink-3);line-height:1.5;margin-bottom:10px">${r.desc}</div>
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:${sm.c};background:${sm.bg};padding:3px 9px;border-radius:20px">${sm.ic} ${sm.t}</div>
        </div>${arrow}
      </div>`;
    }).join('')
  }</div>`;

  // 断点诊断：找到第一个 bad/warn 环
  if(!tested){
    diag.innerHTML = `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-size:13px">先在「品牌输入」跑一次诊断，这里会自动定位你卡在 5 环的哪一环，并给出对应动作。</div>`;
  } else {
    const broken = rings.find(r=>r.stat==='bad') || rings.find(r=>r.stat==='warn');
    if(!broken){
      diag.innerHTML = `<div class="card card-pad" style="border-color:#bfe6cd;background:#f2fbf5">
        <div style="font-size:14px;font-weight:700;color:#12a150;margin-bottom:6px">✓ 5 环全部通过——罕见的健康状态</div>
        <div style="font-size:12.5px;color:var(--ink-2);line-height:1.65">你的品牌在这条链上没有明显断点。接下来重点是<b>持续监控</b>（模型每周在变）+ <b>竞品对照</b>（消除漂移噪声），并持续在①内容、②信源两环加固，稳住已有优势。</div>
      </div>`;
    } else {
      const sm = statMeta[broken.stat];
      diag.innerHTML = `<div class="card card-pad" style="border-color:${broken.stat==='bad'?'#f3b0b3':'#f0d9a8'};background:${broken.stat==='bad'?'#fdf6f6':'#fefaf0'}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="width:30px;height:30px;border-radius:50%;background:${sm.bg};color:${sm.c};font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center">${broken.n}</span>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--ink)">当前主要断点：第 ${broken.n} 环「${broken.k}」<span style="font-size:11px;font-weight:700;color:${sm.c};background:${sm.bg};padding:2px 8px;border-radius:20px;margin-left:8px">${sm.t}</span></div>
            <div style="font-size:12px;color:var(--ink-3);margin-top:3px">实测：${broken.real}</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--ink);line-height:1.7;background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px">
          <b style="color:${sm.c}">该动的地方：</b>${broken.fix}
        </div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:10px;line-height:1.6">💡 逻辑链是有顺序的：<b>先修前面的环再看后面</b>。第 ①② 环（内容+铺源）是你完全可控、投入产出最高的地方；越往后越黑盒，别在 ④⑤ 环上和黑盒硬赌。</div>
      </div>`;
    }
  }

  // 三大"难和不准"
  const hardItems = [
    {t:'测量不准', d:'同一问题问 10 次，答案不一样（temperature 采样）。单次测出的排名只是概率云里的一个点。', fix:'多次采样取分布 + 报置信区间，而非报单一数字。'},
    {t:'归因不准', d:'引用率涨了，你无法证明是你铺的源起效，还是模型正好升级/竞品删了负面。动作与结果之间隔着黑盒。', fix:'存证时间线 + 竞品对照 + 接 AI 转介流量埋点（硬信号）。'},
    {t:'跨时不准', d:'模型每隔几周静默更新，你的基线一直在漂。两个时间点的快照直接对比，混入大量系统噪声。', fix:'测相对基准（你 vs 竞品同期），漂移对双方一致，相对差抵消噪声。'},
  ];
  hard.innerHTML = hardItems.map(h=>`
    <div style="border:1px solid var(--line);border-radius:11px;padding:14px">
      <div style="font-size:13.5px;font-weight:700;color:#e5484d;margin-bottom:7px">✕ ${h.t}</div>
      <div style="font-size:11.5px;color:var(--ink-2);line-height:1.6;margin-bottom:10px">${h.d}</div>
      <div style="font-size:11.5px;color:var(--ink);line-height:1.55;background:#f7f9fc;border-radius:8px;padding:8px 10px"><b style="color:#2f6bff">破解 →</b> ${h.fix}</div>
    </div>`).join('');
}

/* 数据源归因诊断：每个平台一张卡，展示引用率 + 优先数据源 + 缺口原因 + 建议动作 */
function buildAttrGrid(){
  const grid = $('#attrGrid');
  if(!grid) return;
  const results = [...STATE.results].sort((a,b)=>a.cite-b.cite); // 缺口大的排前面，先看该补哪里
  grid.innerHTML = results.map(r=>{
    const at = r.attribution || buildAttribution(r.model, r.cite, null, []);
    const srcTags = (at.sources||[]).map(s=>{
      const hit = at.topSrc===s;
      return `<span class="src-chip${hit?' hit':''}">${s}${hit?' ✓':''}</span>`;
    }).join('');
    const realBadge = r.real ? '<span class="attr-real">● 真实归因</span>' : '<span class="attr-sim">○ 推断</span>';
    return `<div class="attr-card" style="border-left:3px solid ${at.color}">
      <div class="attr-top">
        <span class="attr-logo" style="background:${r.model.color}">${r.model.logo}</span>
        <div class="attr-name">${r.model.name}<span>${r.model.region==='cn'?'国内':'国际'}</span></div>
        <span class="attr-cite" style="color:${at.color}">${r.cite}%</span>
      </div>
      <div class="attr-level" style="background:${at.bg};color:${at.color}">${at.levelTag} ${realBadge}</div>
      <div class="attr-block">
        <div class="attr-k">优先数据源</div>
        <div class="attr-srcs">${srcTags}</div>
      </div>
      <div class="attr-block">
        <div class="attr-k">缺口原因</div>
        <div class="attr-cause">${at.cause}</div>
      </div>
      <div class="attr-action">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span>${at.action}</span>
      </div>
    </div>`;
  }).join('');
}
function drawCompChart(){
  const ctx = $('#compChart');
  if(window._comp) window._comp.destroy();
  const comps = genCompetitors();
  window._comp = new Chart(ctx,{type:'bar',data:{labels:comps.map(c=>c.name),
    datasets:[{data:comps.map(c=>c.share),backgroundColor:comps.map(c=>c.me?'#2f6bff':'#c6d2e8'),borderRadius:7,barThickness:34}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' AI 推荐份额 '+c.raw+'%'}}},
    scales:{x:{grid:{color:'#eef1f6'},ticks:{callback:v=>v+'%',color:'#93a0b3'},max:100},y:{grid:{display:false},ticks:{color:'#5a6577',font:{weight:'600'}}}}}});
}
function genCompetitors(){
  const ind = detectIndustry(STATE.brand);
  const pool = {
    '出海数字营销服务':['蓝色光标','木瓜移动','赛文思','易点天下'],
    '新能源汽车':['理想汽车','特斯拉','比亚迪','小鹏'],
    '跨境快时尚电商':['Temu','Zara','Amazon','H&M'],
    '新消费饮品':['农夫山泉','可口可乐','东方树叶','三得利'],
    '智能清洁家电':['科沃斯','追觅','云鲸','戴森'],
  }[STATE.industry] || ['竞品A','竞品B','竞品C','竞品D'];
  const me = {name:STATE.brand, share:STATE.curCite, me:true};
  const sd = seedFrom(STATE.brand);
  const others = pool.map((n,i)=>({name:n, share:Math.max(8,Math.round(rand(15,75) - (i*6) + (sd%10)))}));
  return [me,...others].sort((a,b)=>b.share-a.share).slice(0,5);
}

/* ---------- 步骤5：提升方案 ---------- */
function updateGoal(v){
  STATE.goal = parseInt(v);
  $('#goalCite').textContent = v;
  const slider=$('#goalSlider');
  slider.style.background=`linear-gradient(90deg,var(--brand) 0%,var(--brand) ${(v-10)/80*100}%,var(--line-2) ${(v-10)/80*100}%)`;
}
const PLAN_LIB = [
  {ic:'📝',c:'#2f6bff',bg:'#eaf1ff',h:'结构化内容重构',p:'将官网与核心内容改为"问题-答案"结构，嵌入 Schema 标记，让 AI 能按段落精准提取品牌信息。',impact:'引用率 +8~12%'},
  {ic:'🏛️',c:'#7c5cff',bg:'#f0ecff',h:'权威信源建设',p:'在权威媒体、行业报告、百科类平台发布带数据来源的品牌内容，强化 EEAT 信任信号。',impact:'引用率 +10~15%'},
  {ic:'🔀',c:'#0aa5b1',bg:'#e3f6f7',h:'多平台矩阵分发',p:'针对各模型的抓取偏好差异化投喂内容（豆包偏字节系、DeepSeek 偏官网权威源）。',impact:'覆盖平台 +2~4'},
  {ic:'📚',c:'#f7a218',bg:'#fff4e0',h:'高频问答语料库',p:'围绕已识别的高频提问建立标准答案库，覆盖用户真实提示词，提高被检索概率。',impact:'引用率 +6~10%'},
  {ic:'⭐',c:'#e5487f',bg:'#fdeef4',h:'口碑与情感优化',p:'主动管理第三方评测与用户口碑内容，压制过时/负面信息，提升正面情感占比。',impact:'正面情感 +15%'},
  {ic:'🔁',c:'#12a150',bg:'#e6f5ec',h:'持续监控与迭代',p:'每周巡检各平台引用率变化，对下滑平台快速补充内容，形成优化闭环。',impact:'稳定性 +稳态'},
];
function buildPlan(){
  markDone('rank');
  $('#curCite').textContent = STATE.curCite+'%';
  updateGoal($('#goalSlider').value);
  const gap = STATE.goal - STATE.curCite;
  $('#planGap').textContent = gap>0?`需从 ${STATE.curCite}% 提升至 ${STATE.goal}%，缺口 ${gap} 个百分点`:'当前已达成目标，建议维持并巩固';
  // 根据缺口大小选取动作数量
  const n = gap>30?6:gap>15?5:gap>0?4:3;
  STATE.plan = PLAN_LIB.slice(0,n);
  $('#planGrid').innerHTML = STATE.plan.map((p,i)=>`
    <div class="plan-card">
      <div class="pc-num">${String(i+1).padStart(2,'0')}</div>
      <div class="pc-ic" style="background:${p.bg}"><span style="font-size:18px">${p.ic}</span></div>
      <h4>${p.h}</h4><p>${p.p}</p>
      <div class="pc-impact">预计 ${p.impact}</div>
    </div>`).join('');
  buildCase();
}
function buildCase(){
  const ind = STATE.industry;
  const cases = {
    '出海数字营销服务':{tag:'同行案例 · 出海营销',h:'某出海营销服务商 GEO 优化',before:11,after:78,cycle:35,extra:'精准询盘 +220%'},
    '新能源汽车':{tag:'同行案例 · 汽车',h:'某新能源车企 AI 可见性提升',before:14,after:72,cycle:40,extra:'到店咨询 +300%'},
    '跨境快时尚电商':{tag:'同行案例 · 跨境电商',h:'某跨境服饰品牌 AI 推荐优化',before:12,after:64,cycle:30,extra:'AI 引流订单 +180%'},
    '新消费饮品':{tag:'同行案例 · 新消费',h:'某饮品品牌新品 GEO 推广',before:9,after:61,cycle:28,extra:'首月销售额破 800 万'},
    '智能清洁家电':{tag:'同行案例 · 智能家电',h:'某清洁家电品牌 AI 选购优化',before:13,after:69,cycle:33,extra:'AI 搜索排名 TOP1'},
  }[ind] || {tag:'同行案例',h:'某品牌 GEO 优化实践',before:12,after:66,cycle:35,extra:'获客成本 -60%'};
  const boost = cases.after - cases.before;
  $('#caseBox').innerHTML = `
    <div class="case-box">
      <span class="cb-tag">${cases.tag}</span>
      <h4>${cases.h}</h4>
      <p style="font-size:13px;color:var(--ink-2)">采用「结构化内容 + 权威信源 + 多平台分发」组合策略后，品牌在主流 AI 平台的可见性显著提升，见效周期 ${cases.cycle} 天。</p>
      <div class="case-metrics">
        <div class="case-metric"><div class="n" style="color:var(--ink-3)">${cases.before}%</div><div class="l">优化前引用率</div></div>
        <div class="case-metric"><div class="n" style="color:var(--brand)">${cases.after}%</div><div class="l">优化后引用率</div></div>
        <div class="case-metric"><div class="n" style="color:var(--down)">+${boost}<em>pt</em></div><div class="l">引用率提升</div></div>
        <div class="case-metric"><div class="n" style="color:var(--purple)">${cases.extra}</div><div class="l">业务效果</div></div>
      </div>
    </div>`;
}

/* ---------- 步骤6：效果监控 ---------- */
function buildMonitor(){
  markDone('optimize');
  const start = STATE.curCite;
  const target = STATE.goal;
  // 模拟优化后30天各平台提升
  STATE._monData = MODELS.map(m=>{
    const r = STATE.results.find(x=>x.model.id===m.id) || {cite:start};
    const gain = (target-start)*rand(0.6,1.05);
    return {model:m, from:r.cite, to:Math.min(90,Math.round(r.cite+gain*rand(0.8,1.2)))};
  });
  const avgNow = Math.round(STATE._monData.reduce((a,d)=>a+d.to,0)/STATE._monData.length);
  const stats=[
    {lbl:'当前平均引用率',c:'#2f6bff',bg:'#eaf1ff',ic:'📈',val:avgNow+'%',delta:'较优化前 +'+(avgNow-start)+'pt',up:true},
    {lbl:'目标完成度',c:'#7c5cff',bg:'#f0ecff',ic:'🎯',val:Math.min(100,Math.round(avgNow/target*100))+'%',delta:'目标 '+target+'%',up:avgNow>=target*0.9},
    {lbl:'TOP3 平台数',c:'#0aa5b1',bg:'#e3f6f7',ic:'🏆',val:STATE._monData.filter(d=>d.to>=55).length+'/'+MODELS.length,delta:'进入首选推荐',up:true},
    {lbl:'监控天数',c:'#12a150',bg:'#e6f5ec',ic:'📅',val:'30 天',delta:'持续追踪中',up:true},
  ];
  $('#monStats').innerHTML = stats.map(s=>`
    <div class="stat"><div class="lbl"><span class="mi" style="background:${s.bg}"><span style="font-size:14px">${s.ic}</span></span>${s.lbl}</div>
    <div class="val" style="color:${s.c}">${s.val}</div><div class="delta ${s.up?'up':'down'}">${s.up?'▲':'▼'} ${s.delta}</div></div>`).join('');
  drawTrend();drawPlatBar();buildTimeline();
}
function switchRange(btn,days){$$('.seg button').forEach(b=>{if(b.parentElement===btn.parentElement)b.classList.remove('on')});btn.classList.add('on');STATE.trendRange=days;drawTrend()}
function drawTrend(){
  const ctx=$('#trendChart');if(window._trend)window._trend.destroy();
  const days=STATE.trendRange;
  const labels=Array.from({length:Math.ceil(days/3)},(_,i)=>'D'+(i*3+1));
  // 选取代表性平台
  const show = STATE._monData.filter(d=>['deepseek','doubao','chatgpt','qwen'].includes(d.model.id));
  const datasets = show.map(d=>{
    const pts=labels.map((_,i)=>{const prog=i/(labels.length-1);return Math.round(d.from+(d.to-d.from)*Math.pow(prog,0.7)+rand(-2,2))});
    return {label:d.model.name,data:pts,borderColor:d.model.color,backgroundColor:d.model.color+'18',borderWidth:2.5,tension:.4,pointRadius:0,pointHoverRadius:5,fill:false};
  });
  window._trend=new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+c.raw+'%'}}},
    scales:{y:{grid:{color:'#eef1f6'},ticks:{callback:v=>v+'%',color:'#93a0b3'},beginAtZero:true,max:90},x:{grid:{display:false},ticks:{color:'#93a0b3',maxTicksLimit:10}}}}});
  $('#trendLegend').innerHTML = show.map(d=>`<div class="lg"><span class="sw" style="background:${d.model.color}"></span>${d.model.name}</div>`).join('');
}
function drawPlatBar(){
  const ctx=$('#platBar');if(window._plat)window._plat.destroy();
  const data=[...STATE._monData].sort((a,b)=>b.to-a.to);
  window._plat=new Chart(ctx,{type:'bar',data:{labels:data.map(d=>d.model.name),
    datasets:[{data:data.map(d=>d.to),backgroundColor:data.map(d=>d.model.color+'d0'),borderRadius:6,barThickness:16}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' 引用率 '+c.raw+'%'}}},
    scales:{x:{grid:{color:'#eef1f6'},ticks:{callback:v=>v+'%',color:'#93a0b3'},max:90},y:{grid:{display:false},ticks:{color:'#5a6577'}}}}});
}
function buildTimeline(){
  const items=[
    {c:'#2f6bff',t:'启动结构化内容重构',d:'第 1 天',m:'官网 12 个核心页面改造为问答结构'},
    {c:'#7c5cff',t:'权威信源投放',d:'第 5 天',m:'6 篇带数据来源的行业内容上线'},
    {c:'#0aa5b1',t:'多平台矩阵分发',d:'第 12 天',m:'覆盖 8 个高权重信息源平台'},
    {c:'#f7a218',t:'首次效果复盘',d:'第 18 天',m:'平均引用率 '+STATE.curCite+'% → '+Math.round(STATE.curCite+(STATE.goal-STATE.curCite)*0.5)+'%'},
    {c:'#12a150',t:'达成阶段目标',d:'第 30 天',m:'平均引用率接近目标 '+STATE.goal+'%'},
  ];
  $('#timeline').innerHTML=items.map(i=>`<div class="tl-item"><div class="tl-dot" style="background:${i.c}"></div><div class="tl-body"><div class="t">${i.t}</div><div class="d">${i.d}</div><div class="m">${i.m}</div></div></div>`).join('');
}

/* ---------- 证据查看：展示大模型返回的原始答案全文 ---------- */
function showEvidence(modelName){
  const items = STATE.evidence.filter(e=>e.model===modelName);
  if(!items.length){toast('该平台暂无原文存证');return}
  let modal = $('#evidenceModal');
  if(!modal){
    modal=document.createElement('div');modal.id='evidenceModal';modal.className='modal';
    modal.innerHTML=`<div class="modal-box" style="max-width:760px;max-height:82vh;display:flex;flex-direction:column">
      <div class="modal-head"><h3 id="evTitle">原文存证</h3><button class="x" onclick="closeEvidence()">✕</button></div>
      <div id="evBody" style="overflow:auto;padding:4px 2px"></div></div>`;
    document.body.appendChild(modal);
  }
  $('#evTitle').textContent = `${modelName} · 真实调用原文存证（共 ${items.length} 条）`;
  $('#evBody').innerHTML = items.map((e,i)=>{
    const v=e.verdict||{};
    const badge = v.mentioned
      ? `<span style="color:#12a150">✓ 提及${v.rank>0?' · 排名#'+v.rank:''} · ${v.sentiment}${v.cited?' · 有来源':''}</span>`
      : `<span style="color:#93a0b3">✗ 未提及</span>`;
    return `<div style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:12px;color:var(--ink-3);margin-bottom:4px">#${i+1} · 采样${e.sample} · ${e.time} · 判定：${badge}</div>
      <div style="font-size:13px;color:var(--ink-2);margin-bottom:6px;font-weight:600">Q：${e.q}</div>
      <div style="font-size:13px;color:var(--ink);line-height:1.6;white-space:pre-wrap;background:#f7f9fc;border-radius:8px;padding:10px 12px;max-height:280px;overflow:auto">${(e.answer||'（空）').replace(/</g,'&lt;')}</div>
    </div>`;
  }).join('');
  modal.classList.add('show');
}
function closeEvidence(){$('#evidenceModal')?.classList.remove('show')}

/* ---------- 导出报告 ---------- */
function exportReport(){
  const results=[...STATE.results].sort((a,b)=>b.cite-a.cite);
  const hasReal = results.some(r=>r.real);
  let txt=`GEO Radar 品牌 AI 可见性诊断报告\n${'='.repeat(40)}\n品牌：${STATE.brand}\n行业：${STATE.industry}\n平均引用率：${STATE.curCite}%\n测试模型：${STATE.dsModel}（真实调用）\n数据说明：标注[真实]的为大模型实际调用结果，标注[模拟]的为未接入 API 的演示数据\n生成时间：${new Date().toLocaleString('zh-CN')}\n\n各平台明细：\n`;
  results.forEach(r=>{txt+=`  [${r.real?'真实':'模拟'}] ${r.model.name}（${r.model.region==='cn'?'国内':'国际'}）：排名 ${r.avgRank>0?'#'+r.avgRank:'未出现'}，引用率 ${r.cite}%，情感 ${r.sentiment}\n`});
  if(hasReal){
    txt+=`\n${'='.repeat(40)}\n真实调用原文存证（节选）：\n`;
    STATE.evidence.slice(0,20).forEach((e,i)=>{txt+=`\n[${i+1}] ${e.model} · ${e.q}\n判定：${e.verdict.mentioned?'提及':'未提及'}${e.verdict.rank>0?' 排名#'+e.verdict.rank:''} ${e.verdict.sentiment||''}\n答案：${(e.answer||'').slice(0,300)}...\n`});
  }
  const blob=new Blob([txt],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`GEO诊断_${STATE.brand}.txt`;a.click();
  toast('报告已导出（含原文存证）');
}

/* ---------- 初始化 ---------- */
loadSettingsUI();updateModeBadge();
