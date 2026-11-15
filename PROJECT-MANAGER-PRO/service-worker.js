async function syncRepositories() {
  const data = await chrome.storage.local.get(["githubToken","projects"]);
  const token = data.githubToken;
  if (!token) return {ok:false, reason:"missing-token"};
  const repos = [];
  for (let page=1; page<=100; page++) {
    const response = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&visibility=all`, {
      headers: {"Accept":"application/vnd.github+json", "Authorization":`Bearer ${token}`, "X-GitHub-Api-Version":"2022-11-28"}
    });
    if (!response.ok) return {ok:false,reason:`http-${response.status}`};
    const batch = await response.json();
    if (!Array.isArray(batch)) return {ok:false,reason:"invalid-response"};
    repos.push(...batch.map(r=>({full_name:r.full_name,url:r.html_url,description:r.description||"",private:!!r.private,archived:!!r.archived,default_branch:r.default_branch||"",updated_at:r.updated_at||"",pushed_at:r.pushed_at||""})));
    if (batch.length<100) break;
  }
  const old = data.projects || [];
  const oldNames = new Set(old.map(p=>p.full_name));
  const incoming = new Map(repos.map(r=>[r.full_name,r]));
  const merged = old.map(p=>({...p,...(incoming.get(p.full_name)||{})}));
  for (const repo of repos) if (!oldNames.has(repo.full_name)) merged.push({...repo,isNew:true,discoveredAt:new Date().toISOString()});
  await chrome.storage.local.set({projects:merged.sort((a,b)=>a.full_name.localeCompare(b.full_name)),lastRepoSync:new Date().toISOString(),lastNewRepos:repos.filter(r=>!oldNames.has(r.full_name)).map(r=>r.full_name)});
  return {ok:true,count:repos.length,newRepos:repos.filter(r=>!oldNames.has(r.full_name)).map(r=>r.full_name)};
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let queueState = {running:false, paused:false, stop:false};
function addActivity(message, kind="info") {
  chrome.storage.local.get(["activityLog"]).then(({activityLog=[]}) => {
    activityLog.unshift({message,kind,time:new Date().toISOString()});
    chrome.storage.local.set({activityLog:activityLog.slice(0,200)});
  });
}
async function updateProject(fullName, patch) {
  const {projects=[]} = await chrome.storage.local.get(["projects"]);
  const next = projects.map(p => p.full_name===fullName ? {...p,...patch} : p);
  await chrome.storage.local.set({projects:next});
}
function waitForTabLoad(tabId, timeout=30000) {
  return new Promise(async (resolve,reject) => {
    let done=false;
    const finish=(err)=>{if(done)return;done=true;chrome.tabs.onUpdated.removeListener(listener);err?reject(err):resolve();};
    const listener=(id,info)=>{if(id===tabId && info.status==="complete") finish();};
    chrome.tabs.onUpdated.addListener(listener);
    try { const tab=await chrome.tabs.get(tabId); if(tab.status==="complete") return finish(); }
    catch(e){return finish(e);}
    setTimeout(()=>finish(new Error("Страница ChatGPT не загрузилась за 30 секунд.")),timeout);
  });
}
async function ensureContentScript(tabId) {
  try { await chrome.tabs.sendMessage(tabId,{type:"PCS_V1412_CHECK_CHAT"}); }
  catch (_) { await chrome.scripting.executeScript({target:{tabId},files:["content.js"]}); }
}
async function sendInBackgroundTab(project) {
  if (!project.chatUrl || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\/c\//.test(project.chatUrl)) {
    throw new Error("Некорректная ссылка привязанного чата. Проверьте привязку проекта.");
  }
  const target = new URL(project.chatUrl);
  const expectedPath = target.pathname.replace(/\/$/, "");
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find(t => {
    try {
      const u = new URL(t.url || "");
      return ["chatgpt.com", "chat.openai.com"].includes(u.hostname) &&
        u.pathname.replace(/\/$/, "") === expectedPath;
    } catch (_) { return false; }
  });
  if (!tab) {
    throw new Error("Привязанный чат сейчас не открыт в Chrome. Новую вкладку не создаю. Откройте сохранённый чат проекта в существующей вкладке и повторите отправку.");
  }
  try {
    if (tab.status !== "complete") await waitForTabLoad(tab.id, 45000);
    await ensureContentScript(tab.id);
    let ready = false;
    let lastError = "Чат загружен в фоновой вкладке, ожидаю поле ввода.";
    for (let i = 0; i < 60; i++) {
      try {
        const current = await chrome.tabs.get(tab.id);
        const currentUrl = new URL(current.url || "");
        if (currentUrl.pathname.replace(/\/$/, "") !== expectedPath) {
          lastError = "Фоновая вкладка ещё переходит к нужному чату.";
        } else {
          const check = await chrome.tabs.sendMessage(tab.id, { type: "PCS_V1412_CHECK_CHAT" });
          if (check?.ok) { ready = true; break; }
          lastError = check?.error || "Поле ввода пока не готово.";
        }
      } catch (e) { lastError = e.message || "Ожидаю загрузки интерфейса ChatGPT."; }
      await sleep(250);
    }
    if (!ready) throw new Error(`${lastError} Проверьте авторизацию ChatGPT и доступность чата.`);
    // Inspect the last assistant answer. If it contains a concrete next task,
    // send an action-specific instruction instead of the generic word "далее".
    let action = null;
    try {
      action = await chrome.tabs.sendMessage(tab.id, { type: "PCS_V1412_BUILD_NEXT_ACTION" });
    } catch (_) {}
    if (action?.needsHuman) {
      return {
        ok: true,
        skipped: true,
        needsHuman: true,
        reason: action.reason || "Ответ ожидает данных пользователя.",
        tabId: tab.id,
        background: true,
        backgroundTabKeptOpen: true
      };
    }
    const result = action?.hasAnswer && action?.prompt
      ? await chrome.tabs.sendMessage(tab.id, { type: "PCS_V1412_SEND_TEXT", text: action.prompt })
      : await chrome.tabs.sendMessage(tab.id, { type: "PCS_V1412_SEND_NEXT" });
    if (!result?.ok) throw new Error(result?.error || "ChatGPT не подтвердил отправку команды.");
    await sleep(250);
    const verify = await chrome.tabs.sendMessage(tab.id, { type: "PCS_V1412_VERIFY_SENT" });
    if (!verify?.ok) throw new Error(verify?.error || "Сообщение не подтверждено в истории чата.");

    // Wait for the assistant to finish before the queue moves to the next
    // project/cycle. Keep the tab inactive and alive so generation is not
    // interrupted and later commands can reuse this same tab.
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "PCS_V1412_WAIT_RESPONSE",
      timeout: 300000
    });
    if (!response?.ok) throw new Error(response?.error || "Ответ ChatGPT ещё не завершён.");

    return {
      ...result,
      tabId: tab.id,
      verified: true,
      responseCompleted: true,
      background: true,
      backgroundTabKeptOpen: true,
      reusedExistingTab: true
    };
  } finally {
    // Keep the inactive chat tab alive so the response can finish.
  }
}

async function processProject(project) {
  await updateProject(project.full_name,{lastStatus:"отправляем в уже открытую вкладку привязанного чата…",lastResult:"wait"});
  try {
    const result=await sendInBackgroundTab(project);
    if (result.needsHuman) {
      const status="Ожидает вашего ответа: ChatGPT запросил уточнение или данные. Автоотправка приостановлена для этого чата.";
      await updateProject(project.full_name,{lastStatus:status,lastResult:"wait",lastNeedsUserInput:true,lastNeedsUserInputAt:new Date().toISOString()});
      addActivity(`${project.full_name}: ${status}`,"wait");
      return result;
    }
    const attemptInfo = result.attempts > 1 ? `со второй попытки (${result.attempts}/2)` : `с первой попытки (${result.attempts}/2)`;
    const smart = result.text && result.text !== "далее";
    const label = smart ? "конкретная задача из последнего ответа" : "«далее»";
    await updateProject(project.full_name,{lastStatus:`${label} отправлена в фоне, ответ завершён ${attemptInfo}`,lastResult:"ok",lastProcessedAt:new Date().toISOString(),lastSendMethod:result.method||"unknown",lastSendAttempts:result.attempts||1,lastNeedsUserInput:false,lastCommandType:smart?"context-action":"continue"});
    addActivity(`${project.full_name}: ${label} отправлена в фоне, ответ завершён ${attemptInfo}; способ: ${result.method||"не указан"}`,"ok");
    return result;
  } catch(e) {
    await updateProject(project.full_name,{lastStatus:e.message,lastResult:"fail"});
    addActivity(`${project.full_name}: ошибка — ${e.message}`,"fail");
    throw e;
  }
}
async function runQueue(projects, cycleCount=1, cycleIntervalSeconds=10) {
  if(queueState.running) return {ok:false,error:"Очередь уже выполняется."};
  queueState={running:true,paused:false,stop:false};
  addActivity(`Запуск очереди: ${projects.length} проектов`);
  let completed=0, failed=0;
  try {
    const cycles = Math.max(1, Math.min(1000, Number.parseInt(cycleCount,10) || 1));
    const intervalMs = Math.max(1, Math.min(3600, Number.parseInt(cycleIntervalSeconds,10) || 10)) * 1000;
    for(let cycle=0; cycle<cycles; cycle++) {
      if(queueState.stop) break;
      addActivity(`Цикл ${cycle+1} из ${cycles}: ${projects.length} чатов`);
      for(let i=0;i<projects.length;i++) {
        while(queueState.paused && !queueState.stop) await sleep(250);
        if(queueState.stop) break;
        try { await processProject(projects[i]); completed++; }
        catch(_) { failed++; }
        if(i<projects.length-1 && !queueState.stop) {
          for(let t=0;t<500 && !queueState.stop;t+=100) {
            while(queueState.paused && !queueState.stop) await sleep(250);
            await sleep(100);
          }
        }
      }
      if(cycle<cycles-1 && !queueState.stop) {
        addActivity(`Цикл ${cycle+1} завершён. Пауза ${Math.round(intervalMs/1000)} сек. перед следующим циклом`);
        let waited=0;
        while(waited<intervalMs && !queueState.stop) {
          while(queueState.paused && !queueState.stop) await sleep(250);
          if(queueState.stop) break;
          const slice=Math.min(250,intervalMs-waited);
          await sleep(slice); waited+=slice;
        }
      }
    }
    const stopped=queueState.stop;
    const summary=stopped?`Остановлено. Успешно: ${completed}, ошибок: ${failed}.`:`Обработка завершена. Успешно: ${completed}, ошибок: ${failed}.`;
    addActivity(summary,failed?"fail":"ok");
    return {ok:true,completed,failed,stopped,summary};
  } finally { queueState={running:false,paused:false,stop:false}; }
}

chrome.alarms.onAlarm.addListener(async alarm=>{if(alarm.name==="pcs-repo-refresh") await syncRepositories();});
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type==="PCS_OPEN_MANAGER_WINDOW"){openManagerWindow().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
  if(message?.type==="PCS_SYNC_REPOSITORIES"){syncRepositories().then(sendResponse);return true;}
  if(message?.type==="PCS_SEND_PROJECT") { processProject(message.project).then(result=>sendResponse({ok:true,...result})).catch(e=>sendResponse({ok:false,error:e.message})); return true; }
  if(message?.type==="PCS_RUN_QUEUE") { runQueue(message.projects||[],message.cycleCount,message.cycleIntervalSeconds).then(sendResponse); return true; }
  if(message?.type==="PCS_QUEUE_PAUSE") { queueState.paused=true; sendResponse({ok:true}); return true; }
  if(message?.type==="PCS_QUEUE_RESUME") { queueState.paused=false; sendResponse({ok:true}); return true; }
  if(message?.type==="PCS_QUEUE_STOP") { queueState.stop=true; queueState.paused=false; sendResponse({ok:true}); return true; }
});


// Открываем менеджер в отдельном окне Chrome, не занимая область страницы.
async function openManagerWindow() {
  const managerUrl = chrome.runtime.getURL("sidepanel.html");
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup"] });
  for (const win of windows) {
    const existing = (win.tabs || []).find(tab => tab.url === managerUrl);
    if (existing) {
      await chrome.windows.update(win.id, { focused: true, state: "normal" });
      return { ok: true, reused: true, windowId: win.id };
    }
  }
  const created = await chrome.windows.create({
    url: managerUrl,
    type: "popup",
    width: 560,
    height: 900,
    focused: true
  });
  return { ok: true, reused: false, windowId: created.id };
}

chrome.runtime.onInstalled.addListener(async()=>{
  const data=await chrome.storage.local.get(["autoRefresh"]);
  if(data.autoRefresh) chrome.alarms.create("pcs-repo-refresh",{periodInMinutes:30});
  try { await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false}); } catch (_) {}
});
chrome.runtime.onStartup.addListener(async()=>{
  try { await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false}); } catch (_) {}
});
chrome.action.onClicked.addListener(() => { openManagerWindow().catch(error => console.error("PROJECT MANAGER PRO window:", error)); });

