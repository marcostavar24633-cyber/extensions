(() => {
  const PCS_BUILD = '1.4.12';
  if (window.__pcsProLoadedVersion === PCS_BUILD) return;
  window.__pcsProLoadedVersion = PCS_BUILD;
  window.__pcsProLoaded = true;

  function cleanText(el) { return (el?.innerText || el?.textContent || "").trim(); }

  function scanGithub() {
    const found = new Map();
    document.querySelectorAll('a[href^="/"]').forEach(a => {
      const href = a.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
      if (!match) return;
      const owner = match[1], repo = match[2];
      const ignored = new Set(["settings","notifications","marketplace","features","pricing","login","logout","signup","sponsors","orgs","topics","collections","events","codespaces","copilot","search","issues","pulls"]);
      if (ignored.has(owner.toLowerCase()) || ignored.has(repo.toLowerCase())) return;
      const full = `${owner}/${repo}`;
      if (!found.has(full)) {
        const container = a.closest("li, article, [data-testid]") || a.parentElement;
        found.set(full, {full_name:full,url:`https://github.com/${full}`,description:cleanText(container).replace(full,"").slice(0,240)});
      }
    });
    return [...found.values()];
  }

  function isConversationUrl(value) {
    try {
      const u = new URL(value, location.origin);
      return ["chatgpt.com","chat.openai.com"].includes(u.hostname) && /(?:^|\/)c\/[A-Za-z0-9_-]{8,}(?:\/|$)/.test(u.pathname);
    } catch (_) { return false; }
  }
  function getSidebarRoots() {
    const selectors = ['aside','nav','[role="navigation"]','[data-testid*="sidebar"]','[data-testid*="history"]','[aria-label*="Sidebar" i]','[aria-label*="History" i]','[aria-label*="Боков" i]','[aria-label*="Истор" i]','#history'];
    const roots = [...document.querySelectorAll(selectors.join(','))];
    for (const a of document.querySelectorAll('a[href]')) {
      if (!isConversationUrl(a.href)) continue;
      const root = a.closest('aside, nav, [role="navigation"], [role="list"], [data-testid*="sidebar"], [data-testid*="history"]');
      if (root && !roots.includes(root)) roots.push(root);
    }
    return [...new Set(roots)].filter(el => el?.getClientRects().length);
  }
  function chatTitle(a) {
    const parts = [a.innerText,a.getAttribute('aria-label'),a.getAttribute('title'),a.querySelector('[title]')?.getAttribute('title')].filter(Boolean).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    return parts.sort((x,y)=>y.length-x.length)[0] || '';
  }
  function collectChatLinks(found, roots=getSidebarRoots()) {
    for (const root of (roots.length ? roots : [document])) {
      const anchors = root.matches?.('a[href]') ? [root] : [...root.querySelectorAll('a[href]')];
      for (const a of anchors) {
        if (!isConversationUrl(a.href)) continue;
        const title = chatTitle(a); if (!title) continue;
        const u = new URL(a.href), url = `${u.origin}${u.pathname}`.replace(/\/$/,'');
        if (!found.has(url)) found.set(url,{title,url});
      }
    }
  }
  function findSidebarScroller(roots=getSidebarRoots()) {
    const candidates=roots.flatMap(root=>[root,...root.querySelectorAll('*')]);
    const scrollable=candidates.filter(el=>{
      if(el.clientHeight<100||el.clientWidth<120)return false;
      const style=getComputedStyle(el); return el.scrollHeight>el.clientHeight+40 && /(auto|scroll)/.test(style.overflowY);
    });
    if(scrollable.length)return scrollable.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0];
    return candidates.filter(el=>el.scrollHeight>el.clientHeight+80&&el.clientHeight>100).sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]||null;
  }
  async function scanChats() {
    const found=new Map(), roots=getSidebarRoots(); collectChatLinks(found,roots);
    const scroller=findSidebarScroller(roots);
    if(scroller){
      const originalTop=scroller.scrollTop; let previousTop=-1;
      for(let step=0;step<100;step++){
        collectChatLinks(found,roots); const maxTop=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
        if(scroller.scrollTop>=maxTop-3||scroller.scrollTop===previousTop)break;
        previousTop=scroller.scrollTop; scroller.scrollTop=Math.min(maxTop,scroller.scrollTop+Math.max(220,scroller.clientHeight*.72)); await sleep(260);
      }
      collectChatLinks(found,roots); scroller.scrollTop=originalTop;
    }
    return [...found.values()];
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0 && el.getClientRects().length > 0;
  }
  function findComposer() {
    // ChatGPT can keep hidden desktop/mobile composer copies in the DOM.
    // Never select the first matching node blindly: rank only visible, editable nodes.
    const selectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'main [contenteditable="true"]',
      'main [role="textbox"]',
      'main textarea',
      'form [contenteditable="true"]',
      'textarea[placeholder]',
      '[contenteditable="true"].ProseMirror',
      '[contenteditable="true"][role="textbox"]'
    ];
    const all = new Set();
    for (const selector of selectors) document.querySelectorAll(selector).forEach(el => all.add(el));
    const candidates = [...all].filter(el => {
      if (!isVisible(el) || el.disabled || el.readOnly) return false;
      return el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.getAttribute('role') === 'textbox';
    });
    const score = el => {
      let n = 0;
      if (el.id === 'prompt-textarea') n += 100;
      if (el.getAttribute('data-testid') === 'prompt-textarea') n += 90;
      if (el.closest('main')) n += 50;
      if (el.closest('form')) n += 20;
      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') n += 15;
      if (el.getAttribute('role') === 'textbox') n += 10;
      return n;
    };
    candidates.sort((a,b) => score(b)-score(a));
    return candidates[0] || null;
  }
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let lastSendAttempt=null;
  function composerText(el){
    if(!el)return '';
    const raw=(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)
      ? el.value
      : (el.innerText ?? el.textContent ?? '');
    return String(raw).replace(/\u00a0/g,' ').replace(/\u200b/g,'').trim();
  }
  function normalizeForCompare(value){return String(value||'').replace(/\u00a0/g,' ').replace(/\u200b/g,'').replace(/[\r\n\t ]+/g,' ').trim();}

  function userMessages(){return [...document.querySelectorAll('[data-message-author-role="user"]')];}
  function assistantMessages(){return [...document.querySelectorAll('[data-message-author-role="assistant"]')];}
  function stopGeneratingButton(){
    const selectors=[
      'main button[data-testid*="stop"]',
      'main button[aria-label*="Stop generating" i]',
      'main button[aria-label*="Остановить" i]',
      'main button[title*="Stop generating" i]',
      'main button[title*="Остановить" i]'
    ];
    for(const selector of selectors){
      const found=[...document.querySelectorAll(selector)].find(isVisible);
      if(found)return found;
    }
    return null;
  }
  async function waitForAssistantCompletion(timeout=300000){
    if(!lastSendAttempt)return {ok:false,error:'Нет данных об отправленном сообщении.'};
    const started=Date.now();
    const before=lastSendAttempt.beforeAssistantCount||0;
    let previousText='', stable=0, sawGeneration=false;
    while(Date.now()-started<timeout){
      const stop=stopGeneratingButton();
      if(stop){sawGeneration=true;stable=0;}
      const messages=assistantMessages();
      const latest=messages.length>before?messages[messages.length-1]:null;
      const latestText=(latest?.innerText||latest?.textContent||'').trim();
      if(latest && latestText){
        if(latestText===previousText) stable++;
        else {previousText=latestText;stable=0;}
        // Require several unchanged samples with no active generation control.
        if(!stop && stable>=4)return {ok:true,completed:true,sawGeneration};
      }
      await sleep(1000);
    }
    return {ok:false,error:'Сообщение отправлено, но завершение ответа ChatGPT не подтверждено за 5 минут. Фоновая вкладка оставлена открытой.'};
  }
  function sendButtonFor(composer){
    const form=composer?.closest('form') || document.querySelector('main form');
    const scope=form || composer?.closest('main') || document.querySelector('main') || document;
    const selectors=[
      'button[data-testid="send-button"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Отправ" i]',
      'button[title*="Send" i]',
      'button[title*="Отправ" i]',
      'button[type="submit"]'
    ];
    const found=new Set();
    for(const selector of selectors) scope.querySelectorAll(selector).forEach(b=>found.add(b));
    // Some ChatGPT builds render the submit button outside the editor form.
    if(!found.size) for(const selector of selectors) document.querySelectorAll(`main ${selector}`).forEach(b=>found.add(b));
    const buttons=[...found].filter(isVisible);
    return buttons.find(b=>!b.disabled && b.getAttribute('aria-disabled')!=='true') || buttons[0] || null;
  }
  function setComposerText(composer,text){
    composer.scrollIntoView({block:'center',inline:'nearest'});
    composer.focus();
    if(composer.isContentEditable || composer.getAttribute('contenteditable')==='true'){
      // Use Chrome's native editing command so the editor's own input pipeline
      // receives the change. Select existing content first to avoid appending.
      try { document.execCommand('selectAll',false,null); } catch(_) {}
      let inserted=false;
      try { inserted=document.execCommand('insertText',false,text); } catch(_) {}
      if(!inserted || normalizeForCompare(composerText(composer))!==normalizeForCompare(text)){
        // DOM fallback for editor builds that reject insertText.
        const selection=window.getSelection();
        const range=document.createRange();
        range.selectNodeContents(composer);
        range.deleteContents();
        const node=document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        try {
          composer.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text}));
          composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
        } catch(_) { composer.dispatchEvent(new Event('input',{bubbles:true})); }
      }
      composer.focus();
    } else {
      const proto=composer instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter)setter.call(composer,text); else composer.value=text;
      composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
      composer.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return composerText(composer);
  }
  async function waitForSubmitted(beforeCount,composer,timeout=12000,expectedText='далее'){
    const started=Date.now();
    while(Date.now()-started<timeout){
      const newMessages=userMessages().slice(beforeCount);
      // Confirm only the exact submitted text in a newly rendered user message.
      if(newMessages.some(m=>normalizeForCompare(composerText(m))===normalizeForCompare(expectedText)))return {ok:true,method:'message-observed'};
      await sleep(200);
    }
    return {ok:false};
  }
  async function waitForSendButton(composer){
    for(let i=0;i<50;i++){
      const button=sendButtonFor(composer);
      if(button && !button.disabled && button.getAttribute('aria-disabled')!=='true')return button;
      await sleep(100);
    }
    return null;
  }
  function submitByKeyboard(composer){
    composer.focus();
    const eventInit={key:'Enter',code:'Enter',which:13,keyCode:13,bubbles:true,cancelable:true};
    composer.dispatchEvent(new KeyboardEvent('keydown',eventInit));
    composer.dispatchEvent(new KeyboardEvent('keypress',eventInit));
    composer.dispatchEvent(new KeyboardEvent('keyup',eventInit));
    const form=composer.closest('form');
    if(form?.requestSubmit){
      const button=sendButtonFor(composer);
      try { form.requestSubmit(button || undefined); return 'form-requestSubmit'; } catch(_) {}
    }
    return 'keyboard-enter';
  }
  async function sendText(text){
    const command=String(text||'').trim();
    if(!command)return {ok:false,error:'Команда для отправки пуста.'};
    const composer=findComposer();
    if(!composer){
      const candidates=[...document.querySelectorAll('main [contenteditable], main textarea, main [role="textbox"]')];
      return {ok:false,error:`Видимое поле ввода ChatGPT не найдено. Кандидатов в main: ${candidates.length}. Обновите вкладку ChatGPT и убедитесь, что чат открыт.`};
    }
    const beforeCount=userMessages().length;
    const beforeAssistantCount=assistantMessages().length;
    let actual='';
    try{actual=setComposerText(composer,command);}catch(e){return {ok:false,error:`Ошибка ввода в редактор ${composer.tagName}#${composer.id||'-'}: ${e.message}`};}
    if(normalizeForCompare(actual)!==normalizeForCompare(command))return {ok:false,error:`Не удалось подтвердить ввод в редактор ${composer.tagName}#${composer.id||'-'}. Получено ${actual.length} символов из ${command.length}.`};

    await sleep(150);
    let button=await waitForSendButton(composer);
    let method='button-click';
    lastSendAttempt={at:Date.now(),beforeCount,beforeAssistantCount,text:command,attempts:1};
    if(button && !button.disabled && button.getAttribute('aria-disabled')!=='true') button.click();
    else method=submitByKeyboard(composer);

    let confirmation=await waitForSubmitted(beforeCount,composer,2000,command);
    if(confirmation.ok)return {ok:true,submitted:true,method,attempts:1,text:command};

    const remaining=composerText(composer);
    if(remaining===''){
      confirmation=await waitForSubmitted(beforeCount,composer,8000,command);
      if(confirmation.ok)return {ok:true,submitted:true,method:`${method}-delayed-render`,attempts:1,text:command};
      return {ok:false,error:'Редактор очистился после отправки, но сообщение не появилось в истории за 10 секунд. Повтор отменён, чтобы избежать дубликата.'};
    }
    if(remaining!==command)return {ok:false,error:`После первой попытки в редакторе неожиданное содержимое: «${remaining}». Повтор отменён.`};

    await sleep(2000);
    button=await waitForSendButton(composer);
    lastSendAttempt={at:Date.now(),beforeCount,beforeAssistantCount,text:command,attempts:2};
    if(button && !button.disabled && button.getAttribute('aria-disabled')!=='true') { button.click(); method='automatic-retry-after-2s'; }
    else method=submitByKeyboard(composer);
    confirmation=await waitForSubmitted(beforeCount,composer,8000,command);
    if(confirmation.ok)return {ok:true,submitted:true,method,attempts:2,text:command};
    return {ok:false,error:`ChatGPT не подтвердил отправку после двух попыток. Поле ввода: ${composer.tagName}#${composer.id||'-'}, текст в поле: ${composerText(composer).slice(0,180)||'(пусто)'}, кнопка отправки: ${sendButtonFor(composer)?'найдена':'не найдена'}.`};
  }
  async function sendNext(){return sendText('далее');}
  function buildNextAction(){
    const messages=assistantMessages();
    const latest=messages[messages.length-1];
    const answer=(latest?.innerText||latest?.textContent||'').trim();
    if(!answer)return {ok:false,hasAnswer:false};
    const tail=answer.slice(-10000);
    // Do not fabricate missing user data or repeatedly act on a request that explicitly awaits the user.
    const humanInputPattern=/(уточните|пришлите|предоставьте|нужны данные|нужен доступ|введите код|подтвердите действие|ожидаю от вас|ответьте,? пожалуйста|какой именно файл|какой именно вариант)/i;
    if(humanInputPattern.test(tail)){
      return {ok:true,hasAnswer:true,needsHuman:true,reason:'В последнем ответе обнаружен запрос данных или подтверждения от пользователя.'};
    }
    const prompt=`Не отправляй слово «далее». Проанализируй приведённый ниже последний ответ и выполни конкретное следующее действие, которое в нём предлагается, запрашивается или логически требуется. Это может быть объединение файлов/изменений, замена кода, вставка фрагмента, исправление ошибки, проверка, создание или настройка.\n\nПравила:\n1. Определи действие по заключительной части ответа и контексту, затем сразу выполни его в рамках текущего проекта.\n2. Если перечислено несколько технических вариантов, выбери наиболее безопасный, полный и логичный для проекта; кратко обозначь выбор и действуй, не спрашивая подтверждение.\n3. Если требуется объединить или заменить материалы, сам определи правильный способ по контексту и выполни его, сохранив нужную функциональность.\n4. Не ограничивайся описанием плана и не повторяй прошлый ответ — выполни работу.\n5. Не выдумывай отсутствующие файлы, результаты тестов или доступы. Если без конкретных данных/доступа пользователя выполнить работу нельзя, задай один точный вопрос и остановись.\n\nПоследний ответ ассистента:\n---\n${tail}\n---`;
    return {ok:true,hasAnswer:true,needsHuman:false,prompt};
  }
  function verifySent(){
    if(!lastSendAttempt)return {ok:false,error:'Нет зарегистрированной попытки отправки.'};
    const msgs=userMessages();
    const newMessages=msgs.slice(lastSendAttempt.beforeCount);
    const expected=lastSendAttempt.text||'далее';
    if(newMessages.some(m=>composerText(m)===expected))return {ok:true,text:expected};
    return {ok:false,error:`Отправленное сообщение не обнаружено в истории чата. Ожидалось: «${expected.slice(0,100)}».`};
  }


  async function createProjectChat(message){
    const projectName=String(message.projectName||'').trim();
    const repoFullName=String(message.repoFullName||'').trim();
    const repoUrl=String(message.repoUrl||'').trim();
    if(!projectName) return {ok:false,error:'Не задано название проекта.'};
    if(!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(repoUrl)) return {ok:false,error:'Для проекта нужна корректная ссылка GitHub на репозиторий.'};

    // Start the first message with the exact project title so it is unmistakable
    // in the conversation and is never reduced to a generic "new project" prompt.
    const prompt=[
      `Проект: ${projectName}`,
      `Название проекта: ${projectName}`,
      repoFullName ? `Репозиторий: ${repoFullName}` : '',
      `GitHub: ${repoUrl}`,
      '',
      `Это отдельный рабочий чат проекта «${projectName}». Сохраняй это название и используй его как основной контекст дальнейшей работы. Подтверди, что проект распознан.`
    ].filter(Boolean).join('\n');

    const started=Date.now();
    let composer=null;
    while(Date.now()-started<90000){
      composer=findComposer();
      if(composer)break;
      await sleep(400);
    }
    if(!composer) return {ok:false,error:'ChatGPT не показал видимое поле ввода за 90 секунд. Проверьте авторизацию и доступность страницы.'};

    const beforeCount=userMessages().length;
    let actual='';
    try {
      actual=setComposerText(composer,prompt);
      // Explicitly notify React/ProseMirror editors after native insertion.
      composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));
      composer.dispatchEvent(new Event('change',{bubbles:true}));
    } catch(e) {
      return {ok:false,error:`Не удалось вставить название проекта в поле ChatGPT: ${e.message}`};
    }
    if(normalizeForCompare(actual)!==normalizeForCompare(prompt) ||
       normalizeForCompare(composerText(composer))!==normalizeForCompare(prompt)){
      return {ok:false,error:`Название проекта не попало в поле ввода. Ожидалось ${prompt.length} символов, в поле ${composerText(composer).length}.`};
    }

    await sleep(350);
    let button=await waitForSendButton(composer);
    let method='send-button-click';
    if(button && !button.disabled && button.getAttribute('aria-disabled')!=='true') button.click();
    else method=submitByKeyboard(composer);

    let confirmation=await waitForSubmitted(beforeCount,composer,15000,prompt);
    if(!confirmation.ok){
      const remaining=composerText(composer);
      if(remaining===normalizeForCompare(prompt) || normalizeForCompare(remaining)===normalizeForCompare(prompt)){
        // Retry only while the exact same text remains in the editor; this avoids
        // duplicate project messages when ChatGPT already accepted the first send.
        await sleep(2000);
        button=await waitForSendButton(composer);
        if(button && !button.disabled && button.getAttribute('aria-disabled')!=='true') {
          button.click(); method='retry-send-button-after-2s';
        } else {
          method=submitByKeyboard(composer);
        }
        confirmation=await waitForSubmitted(beforeCount,composer,15000,prompt);
      } else if(remaining===''){
        confirmation=await waitForSubmitted(beforeCount,composer,10000,prompt);
        method+='-delayed-render';
      }
    }
    if(!confirmation.ok){
      return {ok:false,error:`ChatGPT не подтвердил отправку названия проекта «${projectName}». Поле ввода: ${composerText(composer).slice(0,120)||'(пусто)'}. Кнопка отправки: ${sendButtonFor(composer)?'найдена':'не найдена'}. Повторите создание чата после обновления вкладки ChatGPT.`};
    }

    const routeStarted=Date.now();
    while(Date.now()-routeStarted<60000){
      if(/\/c\/[a-zA-Z0-9-]+/.test(location.pathname)){
        return {ok:true,chatUrl:location.href,chatTitle:projectName,submitted:true,verified:true,method};
      }
      await sleep(250);
    }
    return {ok:false,error:`Название проекта «${projectName}» отправлено и отображается в истории, но ChatGPT не создал URL нового диалога за 60 секунд. Чат не привязан автоматически.`};
  }

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type==='PCS_SCAN_GITHUB'){sendResponse({ok:true,repositories:scanGithub(),page:location.href});return true;}
    if(message?.type==='PCS_CREATE_PROJECT_CHAT'){createProjectChat(message).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));return true;}
    if(message?.type==='PCS_SCAN_CHATS'){scanChats().then(chats=>sendResponse({ok:true,chats,page:location.href})).catch(error=>sendResponse({ok:false,error:error.message,chats:[]}));return true;}
    if(message?.type==='PCS_V1412_SELECT_CHAT_FROM_SIDEBAR'){
      (async()=>{
        let targetPath; try{targetPath=new URL(message.chatUrl).pathname.replace(/\/$/,'');}catch(_){return {ok:false,error:'Некорректная ссылка чата.'};}
        const findLink=()=>{
          const roots=getSidebarRoots(), scopes=roots.length?roots:[document];
          for(const root of scopes){
            const anchors=root.matches?.('a[href]')?[root]:[...root.querySelectorAll('a[href]')];
            const match=anchors.find(a=>{try{return isConversationUrl(a.href)&&new URL(a.href).pathname.replace(/\/$/,'')===targetPath&&a.getClientRects().length>0;}catch(_){return false;}});
            if(match)return match;
          }
          return null;
        };
        let roots=getSidebarRoots(),scroller=findSidebarScroller(roots);
        for(let step=0;step<100;step++){
          const link=findLink();
          if(link){link.scrollIntoView({block:'center',behavior:'instant'});await sleep(180);link.click();return {ok:true,selected:true,title:chatTitle(link)};}
          if(!scroller){roots=getSidebarRoots();scroller=findSidebarScroller(roots);}
          if(!scroller)break;
          const before=scroller.scrollTop,maxTop=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
          scroller.scrollTop=Math.min(before+Math.max(250,scroller.clientHeight*.75),maxTop);await sleep(280);
          if(scroller.scrollTop===before||scroller.scrollTop>=maxTop-2){scroller.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:Math.max(250,scroller.clientHeight*.6)}));await sleep(350);if(scroller.scrollTop===before||scroller.scrollTop>=maxTop-2)break;}
        }
        return {ok:false,error:'Чат не найден среди ссылок боковой панели. Выполните повторное сканирование.'};
      })().then(sendResponse).catch(e=>sendResponse({ok:false,error:`Ошибка выбора чата: ${e.message}`}));return true;
    }
    if(message?.type==='PCS_DEBUG_COMPOSER'){
      const composer=findComposer();
      const button=composer?sendButtonFor(composer):null;
      sendResponse({
        ok:!!composer,
        url:location.href,
        title:document.title,
        readyState:document.readyState,
        composer:composer?{
          tag:composer.tagName,id:composer.id||'',testid:composer.getAttribute('data-testid')||'',
          role:composer.getAttribute('role')||'',contenteditable:!!composer.isContentEditable,
          visible:isVisible(composer),textLength:composerText(composer).length
        }:null,
        sendButton:button?{
          testid:button.getAttribute('data-testid')||'',aria:button.getAttribute('aria-label')||'',
          disabled:!!button.disabled,visible:isVisible(button)
        }:null,
        userMessages:userMessages().length
      });
      return true;
    }
    if(message?.type==='PCS_V1412_CHECK_CHAT'){
      const composer=findComposer(),title=document.querySelector('main h1')||document.querySelector('h1');
      sendResponse(composer?{ok:true,title:cleanText(title),composer:{tag:composer.tagName,id:composer.id||'',testid:composer.getAttribute('data-testid')||'',role:composer.getAttribute('role')||'',placeholder:composer.getAttribute('placeholder')||composer.getAttribute('data-placeholder')||'',visible:isVisible(composer)}}:{ok:false,error:'Видимое поле ввода не найдено: чат ещё загружается, редактор скрыт или требуется авторизация.',url:location.href,readyState:document.readyState});return true;
    }
    if(message?.type==='PCS_V1412_SEND_NEXT'){sendNext().then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));return true;}
    if(message?.type==='PCS_V1412_BUILD_NEXT_ACTION'){sendResponse(buildNextAction());return true;}
    if(message?.type==='PCS_V1412_SEND_TEXT'){sendText(message.text).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));return true;}
    if(message?.type==='PCS_V1412_VERIFY_SENT'){sendResponse(verifySent());return true;}
    if(message?.type==='PCS_V1412_WAIT_RESPONSE'){waitForAssistantCompletion(message.timeout||300000).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));return true;}
  });
})();

