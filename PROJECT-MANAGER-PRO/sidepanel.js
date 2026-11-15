const $=id=>document.getElementById(id);
const STATUS={active:'В работе',review:'Проверка',planned:'Запланирован',done:'Завершён',archived:'Архив'};
const PM_KEY='projectManagerProProjectsV1';
const SEED=[
{name:'SLOPAY-BUKET',description:'Интернет-магазин букетов · PR #7 · GitHub Pages / Vercel',status:'review',priority:'high',nextTask:'Проверить PR #7, исправить замечания, завершить публикацию и проверить production-домен.'},
{name:'PENKA',description:'Адаптивный сайт · финальная проверка качества',status:'review',priority:'normal',audit:true,seo:true,responsive:true,published:true,nextTask:'Завершить браузерные тесты и зафиксировать итоговый результат.'},
{name:'RAKI',description:'Продажа живых и варёных раков · Ульяновск',status:'active',priority:'normal',nextTask:'Продолжить разработку и проверку страниц.'},
{name:'HAIR',description:'Сайт парикмахерской · аудит и премиальный редизайн',status:'active',priority:'normal',nextTask:'Продолжить аудит и редизайн интерфейса.'},
{name:'PHOTOGRAF',description:'Сайт фотографа · премиальная цифровая концепция',status:'active',priority:'normal',nextTask:'Продолжить разработку новой концепции и структуры.'},
{name:'ДОМ УЛЬЯНОВСК',description:'Строительная компания · ремонт и отделка под ключ',status:'planned',priority:'normal',nextTask:'Уточнить структуру услуг, преимущества и форму заявки.'},
{name:'DOMA TECH',description:'Продажа бытовой техники · посудомоечные машины',status:'planned',priority:'normal',nextTask:'Подготовить структуру каталога и коммерческие предложения.'},
{name:'LANDING STUDIO',description:'Конструктор коммерческих лендингов для малого бизнеса',status:'planned',priority:'normal',nextTask:'Определить актуальный объём работ и архитектуру.'}
].map((p,i)=>({...p,id:p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||`project-${i}`,full_name:'',url:'',githubUrl:'',siteUrl:'',deployUrl:'',chatUrl:'',chatTitle:'',chatBinding:'',audit:!!p.audit,seo:!!p.seo,responsive:!!p.responsive,published:!!p.published,createdAt:Date.now()-((8-i)*86400000),updatedAt:Date.now()}));
let projects=[],chats=[],suggestions=[],selected=new Set(),logEntries=[],toastTimer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function notice(s,type=''){const n=$('integrationNotice');n.textContent=s;n.className=`notice ${type}`}
function normalizeProject(p){const name=p.name||p.full_name||p.fullName||'Без названия';const repo=p.full_name||p.fullName||'';return {...p,id:String(p.id||repo||name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi,'-')),name,full_name:repo||name,url:safeUrl(p.url||p.html_url||p.githubUrl)||(repo?`https://github.com/${repo}`:''),githubUrl:safeUrl(p.githubUrl||p.url||p.html_url)||(repo?`https://github.com/${repo}`:''),siteUrl:safeUrl(p.siteUrl||p.websiteUrl||p.website_url||p.liveUrl||p.live_url||p.productionUrl||p.production_url||p.deployUrl||p.vercelUrl),deployUrl:safeUrl(p.deployUrl||p.vercelUrl),chatUrl:safeUrl(p.chatUrl),status:STATUS[p.status]?p.status:'planned',priority:['high','low','normal'].includes(p.priority)?p.priority:'normal',audit:!!p.audit,seo:!!p.seo,responsive:!!p.responsive,published:!!(p.published||p.publishCheck),createdAt:p.createdAt||Date.now(),updatedAt:p.updatedAt||Date.now()}}
async function persist(){projects=projects.map(normalizeProject);await chrome.storage.local.set({projects,[PM_KEY]:projects,selectedRepos:[...selected],activityLog:logEntries});$('saveState').textContent='Сохранено локально';setTimeout(()=>$('saveState').textContent='Готово',1300);render()}
async function init(){const data=await chrome.storage.local.get(['projects',PM_KEY,'selectedRepos','activityLog','githubToken','chatCandidates','chatScanDiagnostics']);const pcs=Array.isArray(data.projects)?data.projects:[];const pm=Array.isArray(data[PM_KEY])?data[PM_KEY]:[];const source=pcs.length?pcs:pm.length?pm:SEED;const byKey=new Map();for(const p of [...pm,...pcs,...source]){const n=normalizeProject(p);const key=(n.full_name||n.name).split('/').pop().toLowerCase();byKey.set(key,{...(byKey.get(key)||{}),...n})}projects=[...byKey.values()];selected=new Set(data.selectedRepos||[]);logEntries=(data.activityLog||[]).slice(0,100).map(e=>({time:e.time||new Date().toLocaleTimeString(),message:e.message||'',type:e.type||e.kind||'info'}));chats=data.chatCandidates||[];if(data.githubToken)$('token').value=data.githubToken;$('chatDiagnostics').textContent=(data.chatScanDiagnostics||[]).join(' · ');await persist();renderLog();renderMatches();}
function formatDate(ts){if(!ts)return '—';try{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit'}).format(new Date(ts))}catch{return '—'}}
function githubPagesUrl(p){
  const explicit=safeUrl(p.githubPagesUrl||p.pagesUrl||p.github_pages_url);
  if(explicit)return explicit;
  const full=String(p.full_name||p.fullName||'').trim();
  const match=full.match(/^([^/]+)\/([^/]+)$/);
  if(!match)return '';
  const owner=match[1],repoName=match[2];
  return repoName.toLowerCase()===`${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${repoName}/`;
}
function projectLinks(p){return [['Сайт',p.siteUrl||githubPagesUrl(p)],['GitHub',p.githubUrl||p.url],['Vercel',p.deployUrl],['Чат',p.chatUrl]].filter(x=>safeUrl(x[1]))}
function cardHtml(p){const links=projectLinks(p);const displaySite=p.siteUrl||p.deployUrl||githubPagesUrl(p);const siteKind=(!p.siteUrl&&!p.deployUrl&&displaySite)?'GITHUB PAGES':'САЙТ';const quality=[['Аудит',p.audit],['SEO',p.seo],['Адаптивность',p.responsive],['Публикация',p.published]];const bound=!!p.chatUrl;return `<article class="project-card" data-id="${esc(p.id)}"><div class="card-top"><input class="project-select" type="checkbox" data-select="${esc(p.id)}" ${selected.has(p.full_name||p.name)?'checked':''} aria-label="Выбрать ${esc(p.name)}"><div class="project-symbol">${esc((p.name||'P').slice(0,2).toUpperCase())}</div><div class="project-main"><div class="project-name">${esc(p.name)}</div><div class="project-desc">${esc(p.description||'Описание не добавлено')}</div>${displaySite?'<a class="site-address-panel" href="'+esc(safeUrl(displaySite))+'" target="_blank" rel="noopener" title="Открыть сайт проекта"><span class="site-address-label">'+siteKind+'</span><span class="site-address-value">'+esc(displaySite.replace(/^https?:\/\//,'').replace(/\/$/,''))+'</span><span class="site-address-open">↗</span></a>':'<div class="site-address-panel site-address-empty"><span class="site-address-label">САЙТ</span><span class="site-address-value">Добавьте адрес в «Изменить → Рабочий сайт»</span></div>'}</div><span class="pill ${esc(p.status)}">${STATUS[p.status]}</span></div><div class="card-meta"><span>${p.priority==='high'?'⚑ Высокий приоритет':p.priority==='low'?'Низкий приоритет':'Обычный приоритет'}</span><span>Обновлён ${formatDate(p.updatedAt)}</span></div><div class="quality">${quality.map(([label,ok])=>`<span class="${ok?'ok':''}">${ok?'✓':'○'} ${label}</span>`).join('')}</div><div class="link-state ${bound?'':'unlinked'}">${bound?`Чат: ${esc(p.chatTitle||'привязан')}`:'Чат не привязан'}</div>${p.lastStatus?`<div class="project-status ${p.lastResult==='ok'?'ok':p.lastResult==='fail'?'fail':p.lastResult==='wait'?'wait':''}">${esc(p.lastStatus)}</div>`:''}<div class="card-actions"><button data-action="details" data-id="${esc(p.id)}">Обзор</button><button data-action="edit" data-id="${esc(p.id)}">Изменить</button><button data-action="bind" data-id="${esc(p.id)}">Привязать чат</button>${bound?`<button data-action="open-chat" data-id="${esc(p.id)}">Открыть чат</button><button data-action="send" data-id="${esc(p.id)}">Открыть + далее</button>`:`<button data-action="new-chat" data-id="${esc(p.id)}">Новый чат</button>`}${links.slice(0,2).map(([label,url])=>`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}<button class="more" data-action="menu" data-id="${esc(p.id)}">•••</button></div></article>`}
function render(){const q=$('searchInput').value.trim().toLowerCase(),filter=$('statusFilter').value;const visible=projects.filter(p=>{const hay=[p.name,p.full_name,p.description,p.nextTask,p.chatTitle].join(' ').toLowerCase();return(!q||hay.includes(q))&&(filter==='all'||p.status===filter)}).sort((a,b)=>{const order={active:0,review:1,planned:2,done:3,archived:4};return(order[a.status]??5)-(order[b.status]??5)||a.name.localeCompare(b.name,'ru')});$('totalCount').textContent=projects.filter(p=>p.status!=='archived').length;$('linkedCount').textContent=projects.filter(p=>p.chatUrl).length;$('selectedCount').textContent=selected.size;$('shownCount').textContent=`${visible.length} из ${projects.length}`;$('projectList').innerHTML=visible.map(cardHtml).join('');$('emptyState').classList.toggle('hidden',visible.length>0)}
function addLog(message,type='info'){logEntries.unshift({time:new Date().toLocaleTimeString(),message,type});logEntries=logEntries.slice(0,100);chrome.storage.local.set({activityLog:logEntries});renderLog()}
function renderLog(){const root=$('log');root.innerHTML=logEntries.length?logEntries.map(e=>`<div class="log-entry ${esc(e.type)}">${esc(e.time)} · ${esc(e.message)}</div>`).join(''):'<div class="empty">Событий пока нет.</div>'}
function norm(v){return(v||'').toLowerCase().replace(/https?:\/\/github\.com\//g,'').replace(/[^a-zа-яё0-9]+/gi,' ').trim()}
function similarity(a,b){const aa=norm(a).split(/\s+/).filter(x=>x.length>1),bb=norm(b).split(/\s+/).filter(x=>x.length>1);if(!aa.length||!bb.length)return 0;const phrase=(h,n)=>n.length<=h.length&&h.some((_,i)=>n.every((t,j)=>h[i+j]===t));if(phrase(bb,aa)||phrase(aa,bb))return .96;const A=new Set(aa),B=new Set(bb);let c=0;for(const x of A)if(B.has(x))c++;return 2*c/(A.size+B.size)}
function ranked(p){const short=(p.full_name||p.name).split('/').pop();return chats.map(c=>({...c,score:Math.max(similarity(short,c.title),similarity(p.full_name||p.name,c.title))})).sort((a,b)=>b.score-a.score)}
async function scanChats(){const btn=$('scanChats');btn.disabled=true;notice('Сканируем открытые вкладки ChatGPT и подгружаем список диалогов…');try{const tabs=await chrome.tabs.query({url:['https://chatgpt.com/*','https://chat.openai.com/*']});if(!tabs.length)throw new Error('Не найдена открытая вкладка ChatGPT. Откройте ChatGPT и раскройте боковую панель.');const all=new Map(),diagnostics=[];for(const tab of tabs){try{let res;try{res=await chrome.tabs.sendMessage(tab.id,{type:'PCS_SCAN_CHATS'})}catch(_){await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});await new Promise(r=>setTimeout(r,350));res=await chrome.tabs.sendMessage(tab.id,{type:'PCS_SCAN_CHATS'})}if(!res?.ok){diagnostics.push(`${tab.title||tab.id}: ${res?.error||'нет ответа'}`);continue}for(const c of res.chats||[])all.set(c.url,c);diagnostics.push(`${tab.title||tab.id}: ${res.chats?.length||0}`)}catch(e){diagnostics.push(`${tab.title||tab.id}: ${e.message}`)}}chats=[...all.values()];await chrome.storage.local.set({chatCandidates:chats,chatScanDiagnostics:diagnostics,chatScanAt:new Date().toISOString()});$('chatCount').textContent=String(chats.length);$('chatDiagnostics').textContent=diagnostics.join(' · ');renderMatches();notice(chats.length?`Обнаружено ${chats.length} диалогов в боковых панелях ChatGPT.`:`Диалоги не найдены. Проверьте, что боковая панель ChatGPT раскрыта.`,chats.length?'ok':'error');addLog(`Сканирование ChatGPT: найдено ${chats.length} чатов`,'info')}catch(e){notice(e.message,'error')}finally{btn.disabled=false}}
function renderMatches(){const root=$('matches');$('chatCount').textContent=String(chats.length);if(!suggestions.length){root.innerHTML=chats.length?`<div class="tiny-note">Найдено ${chats.length} диалогов. Нажмите «Автопривязка» или привяжите чат из карточки проекта.</div>`:'<div class="empty">Чаты ещё не сканировались.</div>';return}root.innerHTML='';for(const s of suggestions){const box=document.createElement('div');box.className='match-card';const title=document.createElement('strong');title.textContent=s.repo;box.append(title);for(const c of s.candidates){const small=document.createElement('small');small.textContent=`${c.title} · совпадение ${Math.round(c.score*100)}%`;const b=document.createElement('button');b.className='secondary-btn';b.textContent='Подтвердить привязку';b.onclick=()=>bindCandidate(s.repo,c);box.append(small,b)}root.append(box)}}
async function bindCandidate(repo,c){const p=projects.find(x=>(x.full_name||x.name)===repo);if(!p)return;const dup=projects.find(x=>x.id!==p.id&&x.chatUrl===c.url);if(dup){notice(`Этот чат уже привязан к ${dup.name}.`,'error');return}p.chatUrl=c.url;p.chatTitle=c.title;p.chatBinding='manual-confirmed';p.chatBoundAt=new Date().toISOString();suggestions=suggestions.filter(x=>x.repo!==repo);await persist();renderMatches();notice(`Чат «${c.title}» привязан к ${p.name}.`,'ok');addLog(`${p.name}: привязан чат «${c.title}»`,'ok')}
async function autoMatch(){if(!projects.length){notice('Сначала добавьте проект или загрузите репозитории GitHub.','error');return}await scanChats();if(!chats.length)return;const used=new Set(projects.filter(p=>p.chatUrl).map(p=>p.chatUrl));const proposals=projects.filter(p=>!p.chatUrl).map(p=>({p,ranked:ranked(p).filter(c=>!used.has(c.url))})).map(x=>({...x,best:x.ranked[0],second:x.ranked[1],margin:(x.ranked[0]?.score||0)-(x.ranked[1]?.score||0)}));const confident=proposals.filter(x=>x.best&&x.best.score>=.90&&x.margin>=.15);const counts=new Map();for(const x of confident)counts.set(x.best.url,(counts.get(x.best.url)||0)+1);let bound=0;for(const x of confident){if(counts.get(x.best.url)!==1)continue;x.p.chatUrl=x.best.url;x.p.chatTitle=x.best.title;x.p.chatBinding='automatic-high-confidence';x.p.chatBoundAt=new Date().toISOString();used.add(x.best.url);bound++}suggestions=proposals.filter(x=>!x.p.chatUrl&&x.ranked.some(c=>c.score>=.40)).map(x=>({repo:x.p.full_name||x.p.name,candidates:x.ranked.filter(c=>c.score>=.40).slice(0,3)}));await persist();renderMatches();notice(`Автоматически привязано: ${bound}. Требуют проверки: ${suggestions.length}.`,'ok');addLog(`Автопривязка: автоматически ${bound}, на подтверждение ${suggestions.length}`,bound?'ok':'info')}
async function activeTab(){const t=await chrome.tabs.query({active:true,lastFocusedWindow:true});return t[0]}
function openLink(url){const u=safeUrl(url);if(u)chrome.tabs.create({url:u});else toast('Ссылка ещё не добавлена в карточку')}

async function findExistingChatTab(targetUrl=''){
  const tabs=await chrome.tabs.query({});
  const chatTabs=tabs.filter(t=>/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(t.url||''));
  if(targetUrl){
    const wanted=new URL(targetUrl);
    const exact=chatTabs.find(t=>{
      try{const u=new URL(t.url);return u.hostname===wanted.hostname&&u.pathname.replace(/\/$/,'')===wanted.pathname.replace(/\/$/,'');}catch(_){return false;}
    });
    if(exact)return exact;
  }
  chatTabs.sort((a,b)=>(Number(b.active)-Number(a.active))||(Number(b.lastAccessed||0)-Number(a.lastAccessed||0)));
  return chatTabs[0]||null;
}
async function openChatInExistingTab(url){
  const u=safeUrl(url);
  if(!u){notice('У проекта ещё нет сохранённой ссылки на чат.','error');return}
  const tab=await findExistingChatTab(u);
  if(!tab){notice('Вкладка ChatGPT не найдена. Откройте ChatGPT вручную — новая вкладка создаваться не будет.','error');return}
  await chrome.tabs.update(tab.id,{url:u,active:true});
}

const chatCreationInProgress=new Set();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForTabReady(tabId,timeout=25000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    try{
      const tab=await chrome.tabs.get(tabId);
      if(tab.status==='complete' && /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url||''))return tab;
    }catch(_){throw new Error('Вкладка ChatGPT была закрыта до завершения создания чата.')}
    await delay(250);
  }
  throw new Error('ChatGPT не загрузился за 25 секунд. Проверьте подключение и авторизацию.');
}
async function createRepoChat(p){
  if(p.chatUrl){await openChatInExistingTab(p.chatUrl);return}
  if(chatCreationInProgress.has(p.id))return;
  const repoUrl=safeUrl(p.githubUrl||p.url)||(p.full_name?`https://github.com/${p.full_name}`:'');
  if(!repoUrl){notice(`Для ${p.name} сначала добавьте ссылку GitHub на репозиторий.`,'error');return}
  chatCreationInProgress.add(p.id);
  const button=document.querySelector(`[data-action="new-chat"][data-id="${CSS.escape(p.id)}"]`);
  if(button){button.disabled=true;button.textContent='Создаём…'}
  notice(`Открываем новый диалог проекта ${p.name} в уже открытой вкладке ChatGPT…`);
  try{
    const tab=await findExistingChatTab();
    if(!tab)throw new Error('Не найдена открытая вкладка ChatGPT. Откройте ChatGPT вручную и повторите.');
    await chrome.tabs.update(tab.id,{url:'https://chatgpt.com/',active:true});
    await waitForTabReady(tab.id,25000);

    // Ensure the current extension content script is attached after navigation.
    let probe=null;
    try{probe=await chrome.tabs.sendMessage(tab.id,{type:'PCS_DEBUG_COMPOSER'});}catch(_){}
    if(!probe?.ok){
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
      await delay(250);
      probe=await chrome.tabs.sendMessage(tab.id,{type:'PCS_DEBUG_COMPOSER'});
    }
    if(!probe?.ok)throw new Error('Поле ввода ChatGPT не готово. Проверьте авторизацию и повторите.');

    const result=await chrome.tabs.sendMessage(tab.id,{
      type:'PCS_CREATE_PROJECT_CHAT',
      projectName:p.name,
      shortName:(p.full_name||p.name).split('/').pop(),
      repoFullName:p.full_name||'',
      repoUrl
    });
    if(!result?.ok)throw new Error(result?.error||'Не удалось отправить название проекта в ChatGPT.');
    const chatUrl=safeUrl(result.chatUrl);
    if(!chatUrl||!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\/c\/[^/]+/.test(chatUrl))throw new Error('ChatGPT не вернул корректный URL нового диалога; привязка не сохранена.');
    const current=projects.find(x=>x.id===p.id);
    if(!current)throw new Error('Проект больше не найден в каталоге.');
    current.chatUrl=chatUrl;
    current.chatTitle=p.name;
    current.chatBinding='created-by-project-manager';
    current.chatCreatedAt=new Date().toISOString();
    current.chatCheck='available';
    current.chatCheckAt=new Date().toISOString();
    current.lastStatus='Название проекта и ссылка GitHub отправлены; новый чат привязан';
    current.lastResult='ok';
    current.updatedAt=Date.now();
    await persist();
    notice(`Проект «${p.name}»: название отправлено и чат привязан.`,'ok');
    addLog(`${p.name}: название проекта подтверждено в первом сообщении нового чата`,'ok');
  }catch(e){
    notice(`${p.name}: ${e.message}`,'error');
    addLog(`${p.name}: ошибка создания/отправки чата — ${e.message}`,'fail');
  }finally{
    chatCreationInProgress.delete(p.id);
    render();
  }
}
function openForm(p){$('projectForm').reset();$('projectId').value=p?.id||'';$('formEyebrow').textContent=p?'РЕДАКТИРОВАНИЕ':'НОВЫЙ ПРОЕКТ';$('formTitle').textContent=p?'Изменить проект':'Добавить проект';$('nameInput').value=p?.name||'';$('descriptionInput').value=p?.description||'';$('projectStatus').value=p?.status||'active';$('priorityInput').value=p?.priority||'normal';$('siteInput').value=p?.siteUrl||'';$('githubInput').value=p?.githubUrl||p?.url||'';$('deployInput').value=p?.deployUrl||'';$('chatInput').value=p?.chatUrl||'';$('auditCheck').checked=!!p?.audit;$('seoCheck').checked=!!p?.seo;$('responsiveCheck').checked=!!p?.responsive;$('publishCheck').checked=!!p?.published;$('taskInput').value=p?.nextTask||'';$('projectDialog').showModal()}
function formProject(){const old=projects.find(p=>p.id===$('projectId').value);const gh=safeUrl($('githubInput').value);let repo=old?.full_name||'';try{const u=new URL(gh);if(u.hostname==='github.com')repo=u.pathname.split('/').filter(Boolean).slice(0,2).join('/')}catch{}return normalizeProject({...old,id:old?.id||crypto.randomUUID(),name:$('nameInput').value.trim(),full_name:repo,url:gh,githubUrl:gh,description:$('descriptionInput').value.trim(),status:$('projectStatus').value,priority:$('priorityInput').value,siteUrl:safeUrl($('siteInput').value),deployUrl:safeUrl($('deployInput').value),chatUrl:safeUrl($('chatInput').value),audit:$('auditCheck').checked,seo:$('seoCheck').checked,responsive:$('responsiveCheck').checked,published:$('publishCheck').checked,nextTask:$('taskInput').value.trim(),createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()})}
function details(id){const p=projects.find(x=>x.id===id);if(!p)return;const links=projectLinks(p);$('detailContent').innerHTML=`<div class="detail-content"><div class="dialog-head"><div><div class="eyebrow">КАРТОЧКА ПРОЕКТА</div><h2>${esc(p.name)}</h2></div><button class="icon-btn" data-close="detailDialog">✕</button></div><p class="muted">${esc(p.description||'Описание не добавлено')}</p><span class="pill ${esc(p.status)}">${STATUS[p.status]}</span><div class="detail-links">${links.length?links.map(([n,u])=>`<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(n)} ↗<br><small>${esc(u)}</small></a>`).join(''):'<span class="muted">Ссылки не добавлены.</span>'}</div><div class="form-section-title">КАЧЕСТВО</div><div class="quality">${[['Аудит',p.audit],['SEO',p.seo],['Адаптивность',p.responsive],['Публикация',p.published]].map(([n,v])=>`<span class="${v?'ok':''}">${v?'✓':'○'} ${n}</span>`).join('')}</div><div class="detail-task"><b>СЛЕДУЮЩАЯ ЗАДАЧА</b><p>${esc(p.nextTask||'Не указана')}</p></div><div class="detail-task"><b>СОСТОЯНИЕ ЧАТА</b><p>${esc(p.chatTitle||p.chatUrl||'Чат не привязан')}</p><p>${esc(p.lastStatus||'Нет истории отправки')}</p></div><div class="dialog-actions"><button class="secondary-btn" data-close="detailDialog">Закрыть</button><button class="primary-btn" data-action="edit-from-detail" data-id="${esc(p.id)}">Изменить</button></div></div>`;$('detailDialog').showModal()}
async function bindCurrent(p){
  try{
    // Use only the active tab in the side panel's window to avoid binding a different chat.
    const activeTabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});
    const tab=activeTabs&&activeTabs[0];
    if(!tab?.url){
      notice('Не удалось определить активную вкладку. Откройте нужный диалог ChatGPT и повторите привязку.','error');
      return;
    }
    let parsed;
    try{parsed=new URL(tab.url)}catch(_){
      notice('Не удалось прочитать адрес активной вкладки.','error');
      return;
    }
    if(!['chatgpt.com','chat.openai.com'].includes(parsed.hostname)||!parsed.pathname.startsWith('/c/')){
      notice('Сейчас активна не страница диалога ChatGPT. Переключитесь на нужный чат (адрес должен содержать /c/), затем нажмите «Привязать чат» ещё раз.','error');
      return;
    }
    const url=parsed.origin+parsed.pathname.replace(/\/$/,'');
    const duplicate=projects.find(x=>{
      if(x.id===p.id||!x.chatUrl)return false;
      try{const u=new URL(x.chatUrl);return u.hostname===parsed.hostname&&u.pathname.replace(/\/$/,'')===parsed.pathname.replace(/\/$/,'')}catch(_){return false}
    });
    if(duplicate){
      notice(`Этот чат уже привязан к проекту «${duplicate.name}». Сначала отвяжите его там.`,'error');
      return;
    }
    p.chatUrl=url;
    p.chatTitle=tab.title||p.name;
    p.chatBinding='manual-current-active-tab';
    p.chatBoundAt=new Date().toISOString();
    p.chatCheck='available';
    p.chatCheckAt=new Date().toISOString();
    p.lastStatus='Чат привязан вручную; сохранение проверено';
    p.lastResult='ok';
    await persist();
    const saved=await chrome.storage.local.get(['projects',PM_KEY]);
    const savedProjects=Array.isArray(saved.projects)?saved.projects:(Array.isArray(saved[PM_KEY])?saved[PM_KEY]:[]);
    const confirmed=savedProjects.find(x=>x.id===p.id&&x.chatUrl===url);
    if(!confirmed){
      p.chatUrl='';
      p.chatTitle='';
      p.chatBinding='';
      p.lastStatus='Ошибка проверки сохранения привязки';
      p.lastResult='fail';
      await persist();
      notice('Привязка не подтверждена: ссылка не найдена в локальном хранилище. Повторите попытку.','error');
      addLog(`${p.name}: ошибка проверки сохранения ручной привязки`,'fail');
      return;
    }
    notice(`Чат успешно привязан к проекту «${p.name}».`,'ok');
    addLog(`${p.name}: вручную привязан активный чат ${url}; сохранение подтверждено`,'ok');
  }catch(error){
    console.error('PROJECT MANAGER PRO bindCurrent error:',error);
    notice(`Не удалось привязать чат: ${error?.message||'неизвестная ошибка'}`,'error');
  }
}
async function syncGithub(){const token=$('token').value.trim();if(token)await chrome.storage.local.set({githubToken:token});$('syncGithub').disabled=true;notice('Синхронизируем репозитории GitHub…');try{const r=await chrome.runtime.sendMessage({type:'PCS_SYNC_REPOSITORIES'});if(!r?.ok){const m={'missing-token':'Сохраните GitHub-токен или используйте сканирование открытой страницы.','http-401':'GitHub отклонил токен.','http-403':'Недостаточно прав или превышен лимит GitHub API.','invalid-response':'GitHub вернул неожиданный ответ.'};throw new Error(m[r?.reason]||`Ошибка GitHub: ${r?.reason||'неизвестно'}`)}const d=await chrome.storage.local.get(['projects','lastRepoSync']);const merged=new Map();for(const raw of (d.projects||[])){const item=normalizeProject(raw),key=(item.full_name||item.name).split('/').pop().toLowerCase();merged.set(key,{...(merged.get(key)||{}),...item})}projects=[...merged.values()].map(normalizeProject);await persist();notice(`GitHub обновлён: ${r.count} репозиториев, новых: ${r.newRepos?.length||0}.`,'ok');addLog(`Синхронизация GitHub: ${r.count} репозиториев`,'ok')}catch(e){notice(e.message,'error')}finally{$('syncGithub').disabled=false}}
async function scanGithubPage(){const tab=await activeTab();if(!tab?.id||!/^https:\/\/github\.com\//.test(tab.url||'')){notice('Откройте GitHub — страницу репозиториев или профиль.','error');return}try{let r;try{r=await chrome.tabs.sendMessage(tab.id,{type:'PCS_SCAN_GITHUB'})}catch(_){await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});r=await chrome.tabs.sendMessage(tab.id,{type:'PCS_SCAN_GITHUB'})}if(!r?.ok)throw new Error('Не удалось прочитать страницу GitHub');const map=new Map(projects.map(p=>[(p.full_name||p.name).split('/').pop().toLowerCase(),p]));for(const repo of r.repositories||[]){const key=repo.full_name.split('/').pop().toLowerCase(),old=map.get(key)||{};map.set(key,normalizeProject({...old,...repo,name:old.name||repo.full_name,full_name:repo.full_name,url:repo.url,githubUrl:repo.url}))}projects=[...map.values()];await persist();notice(`На открытой странице найдено ${r.repositories.length} репозиториев.`,'ok')}catch(e){notice(e.message,'error')}}
async function sendProject(p){if(!p.chatUrl){notice(`У проекта ${p.name} нет привязанного чата.`,'error');return}notice(`Отправляем команду в уже открытую вкладку чата ${p.name}…`);try{const r=await chrome.runtime.sendMessage({type:'PCS_SEND_PROJECT',project:{...p,full_name:p.full_name||p.name}});if(!r?.ok)throw new Error(r?.error||'Отправка не подтверждена');if(r.needsHuman){notice(`${p.name}: требуется ваш ответ — автоматизация приостановлена.`,'error');addLog(`${p.name}: требуется ответ пользователя`,'wait');return}notice(`Команда отправлена и обработана в открытом чате: ${p.name}.`,'ok');addLog(`${p.name}: команда отправлена в существующую вкладку и подтверждена`,'ok');const d=await chrome.storage.local.get('projects');projects=(d.projects||projects).map(normalizeProject);render()}catch(e){notice(`${p.name}: ${e.message}`,'error');addLog(`${p.name}: ошибка отправки — ${e.message}`,'fail');const d=await chrome.storage.local.get('projects');projects=(d.projects||projects).map(normalizeProject);render()}}
async function preflight(){const linked=projects.filter(p=>p.chatUrl);if(!linked.length){$('preflightInfo').textContent='Нет привязанных чатов.';return}$('preflight').disabled=true;let good=0,bad=0;for(let i=0;i<linked.length;i++){const p=linked[i];$('preflightInfo').textContent=`Проверка ${i+1}/${linked.length}: ${p.name}`;try{const u=new URL(p.chatUrl);if(!['chatgpt.com','chat.openai.com'].includes(u.hostname)||!u.pathname.includes('/c/'))throw new Error('Некорректный URL чата');const tabs=await chrome.tabs.query({url:[`${u.origin}/*`]});const tab=tabs.find(t=>t.url?.split('?')[0].split('#')[0]===p.chatUrl.split('?')[0].split('#')[0]);if(tab){let res;try{res=await chrome.tabs.sendMessage(tab.id,{type:'PCS_V1412_CHECK_CHAT'})}catch(_){await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});res=await chrome.tabs.sendMessage(tab.id,{type:'PCS_V1412_CHECK_CHAT'})}if(!res?.ok)throw new Error(res?.error||'Редактор не найден')}p.chatCheck=tab?'available':'url-valid-not-open';p.chatCheckAt=new Date().toISOString();good++}catch(e){p.chatCheck='unavailable';p.chatCheckError=e.message;p.chatCheckAt=new Date().toISOString();bad++}await chrome.storage.local.set({projects})}await persist();$('preflightInfo').textContent=`Проверено: ${good} без ошибок, ${bad} ошибок. Закрытые вкладки проверяются только по формату URL.`;addLog(`Проверка чатов: ${good} без ошибок, ${bad} ошибок`,bad?'fail':'ok');$('preflight').disabled=false}
async function batch(selectedOnly){const queue=projects.filter(p=>p.chatUrl&&/^https:\/\/(chatgpt\.com|chat\.openai\.com)\/c\//.test(p.chatUrl)&&(!selectedOnly||selected.has(p.full_name||p.name)));if(!queue.length){notice(selectedOnly?'Среди выбранных проектов нет привязанных доступных чатов.':'Нет привязанных доступных чатов.','error');return}const cycleCount=Math.max(1,Math.min(1000,parseInt($('cycleCount').value,10)||1));const interval=Math.max(1,Math.min(3600,parseInt($('cycleInterval').value,10)||10));$('queueState').textContent='Выполняется';$('progress').textContent=`Запуск: ${queue.length} проектов · ${cycleCount} циклов`;try{const r=await chrome.runtime.sendMessage({type:'PCS_RUN_QUEUE',projects:queue.map(p=>({...p,full_name:p.full_name||p.name})),cycleCount,cycleIntervalSeconds:interval});if(!r?.ok)throw new Error(r?.error||'Очередь не запустилась');$('progress').textContent=r.summary;$('queueState').textContent=r.stopped?'Остановлена':'Завершена';addLog(r.summary,r.failed?'fail':'ok');const d=await chrome.storage.local.get('projects');projects=(d.projects||projects).map(normalizeProject);render()}catch(e){$('queueState').textContent='Ошибка';$('progress').textContent=e.message;notice(e.message,'error')}}
function projectMenu(id){const p=projects.find(x=>x.id===id);if(!p)return;const choice=prompt(`Действия для «${p.name}»:\n1 — открыть рабочий чат\n2 — архивировать / восстановить\n3 — удалить\n4 — открыть все ссылки`);if(choice==='1')openLink(p.chatUrl);else if(choice==='2'){p.status=p.status==='archived'?'planned':'archived';p.updatedAt=Date.now();persist().then(()=>toast(p.status==='archived'?'Проект архивирован':'Проект восстановлен'))}else if(choice==='3'&&confirm(`Удалить «${p.name}»?`)){projects=projects.filter(x=>x.id!==id);selected.delete(p.full_name||p.name);persist().then(()=>toast('Проект удалён'))}else if(choice==='4')projectLinks(p).forEach(x=>openLink(x[1]))}

const PMPRO_VERSION='1.10.7';
function setUpdateStatus(message,kind=''){
  const el=$('updateStatus'); if(!el)return;
  el.textContent=message; el.className=`update-status ${kind}`;
}
function callUpdater(action){
  return new Promise((resolve,reject)=>{
    let settled=false;
    let port;
    const finish=(err,value)=>{if(settled)return;settled=true;try{port?.disconnect()}catch(_){};err?reject(err):resolve(value)};
    try{port=chrome.runtime.connectNative('com.pmpro.updater');}
    catch(e){reject(new Error('Локальный помощник обновления не установлен. Один раз запустите INSTALL-UPDATE-HELPER.bat из папки расширения.'));return;}
    port.onMessage.addListener(message=>finish(message?.ok?null:new Error(message?.error||'Помощник не смог выполнить обновление.'),message));
    port.onDisconnect.addListener(()=>{if(!settled){const err=chrome.runtime.lastError;finish(new Error(err?.message||'Нет связи с помощником обновления. Проверьте его установку.'));}});
    try{port.postMessage({action,version:PMPRO_VERSION});}catch(e){finish(e)}
    setTimeout(()=>finish(new Error('Помощник обновления не ответил за 90 секунд.')),90000);
  });
}
async function runOneClickUpdate(){
  const btn=$('updateBtn'); if(!btn)return;
  btn.disabled=true; btn.textContent='Проверка…';
  setUpdateStatus('Проверяем доступную версию на GitHub…','');
  try{
    const result=await callUpdater('update');
    if(result.updated){
      setUpdateStatus(`Обновление ${result.version} установлено. Перезапускаем расширение…`,'ok');
      addLog(`Расширение обновлено до версии ${result.version}`,'ok');
      btn.textContent='Перезапуск…';
      setTimeout(()=>chrome.runtime.reload(),900);
      return;
    }
    setUpdateStatus(result.message||`Установлена последняя версия ${PMPRO_VERSION}.`,'ok');
    toast('Обновлений нет');
  }catch(e){
    setUpdateStatus(e.message||'Не удалось проверить обновление.','error');
    addLog(`Обновление: ${e.message}`,'fail');
    toast('Ошибка обновления');
  }finally{
    if(btn.isConnected){btn.disabled=false;btn.textContent='↻ Обновить';}
  }
}

$('detachWindowBtn').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'PCS_OPEN_MANAGER_WINDOW'});if(!r?.ok)throw new Error(r?.error||'Не удалось открыть отдельное окно');if(!r.reused)toast('Менеджер открыт в отдельном окне');}catch(e){notice(`Не удалось открыть отдельное окно: ${e.message}`,'error')}};
$('updateBtn').onclick=runOneClickUpdate;$('addBtn').onclick=()=>openForm();$('emptyAddBtn').onclick=()=>openForm();$('settingsBtn').onclick=()=>$('settingsDialog').showModal();$('searchInput').oninput=render;$('statusFilter').onchange=render;
$('projectForm').onsubmit=async e=>{e.preventDefault();if(!$('nameInput').value.trim())return;const p=formProject(),i=projects.findIndex(x=>x.id===p.id);if(i>=0)projects[i]=p;else projects.unshift(p);await persist();$('projectDialog').close();toast(i>=0?'Проект обновлён':'Проект добавлен')};
document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close){$(close.dataset.close)?.close();return}const b=e.target.closest('[data-action]');if(!b)return;const p=projects.find(x=>x.id===b.dataset.id);if(!p)return;switch(b.dataset.action){case'details':details(p.id);break;case'edit':openForm(p);break;case'edit-from-detail':$('detailDialog').close();openForm(p);break;case'menu':projectMenu(p.id);break;case'bind':bindCurrent(p);break;case'new-chat':createRepoChat(p);break;case'open-chat':openChatInExistingTab(p.chatUrl);break;case'send':sendProject(p);break}});
document.addEventListener('change',e=>{const c=e.target.closest('[data-select]');if(!c)return;const p=projects.find(x=>x.id===c.dataset.select);if(!p)return;const key=p.full_name||p.name;if(c.checked)selected.add(key);else selected.delete(key);chrome.storage.local.set({selectedRepos:[...selected]});$('selectedCount').textContent=selected.size});
$('saveToken').onclick=async()=>{const t=$('token').value.trim();if(!t){notice('Введите токен.','error');return}await chrome.storage.local.set({githubToken:t});toast('Токен сохранён локально')};$('syncGithub').onclick=syncGithub;$('scanGithubPage').onclick=scanGithubPage;$('scanChats').onclick=scanChats;$('autoMatch').onclick=autoMatch;$('preflight').onclick=preflight;$('startQueue').onclick=()=>batch(false);$('sendSelected').onclick=()=>batch(true);$('pauseQueue').onclick=async()=>{const s=await chrome.runtime.sendMessage({type:'PCS_QUEUE_PAUSE'});$('queueState').textContent='Пауза запрошена';$('progress').textContent='Очередь приостановлена'};$('stopQueue').onclick=async()=>{await chrome.runtime.sendMessage({type:'PCS_QUEUE_STOP'});$('progress').textContent='Запрошена остановка очереди…'};$('selectAll').onclick=async()=>{selected=new Set(projects.map(p=>p.full_name||p.name));await chrome.storage.local.set({selectedRepos:[...selected]});render()};$('selectNone').onclick=async()=>{selected.clear();await chrome.storage.local.set({selectedRepos:[]});render()};$('clearLog').onclick=async()=>{logEntries=[];await chrome.storage.local.set({activityLog:[]});renderLog()};
$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({app:'PROJECT MANAGER PRO',version:1,exportedAt:new Date().toISOString(),projects},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`project-manager-pro-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(u);toast('Резервная копия подготовлена')};$('importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text()),arr=Array.isArray(d)?d:d.projects;if(!Array.isArray(arr)||!arr.every(p=>p&&typeof p.name==='string'))throw Error('bad');if(!confirm(`Заменить каталог ${arr.length} проектами?`))return;projects=arr.map(normalizeProject);selected.clear();await persist();$('settingsDialog').close();toast('Каталог импортирован')}catch{toast('Не удалось прочитать JSON')}finally{e.target.value=''}};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.projects){projects=(changes.projects.newValue||[]).map(normalizeProject);render()}});
init().catch(e=>{console.error(e);notice(`Ошибка загрузки: ${e.message}`,'error')});

