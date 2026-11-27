/* Browser API adapter. Never send session/recovery credentials through public sync relays. */
export function createDuckQuackApi(baseUrl, storage = localStorage) {
  const base=String(baseUrl||"").replace(/\/+$/,""),SESSION="dq_trusted_session_v1",RECOVERY="dq_recovery_code_v1";
  async function call(path,options={}){const h=new Headers(options.headers||{});h.set("content-type","application/json");const t=storage.getItem(SESSION);if(t)h.set("authorization","Bearer "+t);const r=await fetch(base+path,{...options,headers:h,cache:"no-store"}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"API request failed");return data;}
  const save=s=>{if(!s?.token)throw new Error("Missing session token");storage.setItem(SESSION,s.token);};
  return {
    async bootstrap(){const d=await call("/api/session",{method:"POST",body:"{}"});save(d.session);if(d.recoveryCode)storage.setItem(RECOVERY,d.recoveryCode);return d;},
    async recover(recoveryCode){const d=await call("/api/session/recover",{method:"POST",body:JSON.stringify({recoveryCode})});save(d.session);storage.setItem(RECOVERY,recoveryCode);return d;},
    async ensureIdentity(){if(this.hasSession()){try{return await this.me();}catch{}}const recovery=this.getRecoveryCode();if(recovery){const restored=await this.recover(recovery);return restored.player;}const created=await this.bootstrap();return created.player;},
    me(){return call("/api/me");},setUsername(username){return call("/api/me",{method:"POST",body:JSON.stringify({username})});},
    chatHistory(){return call("/api/chat");},chatUpdates(since){return call("/api/chat?since="+encodeURIComponent(String(since||0)));},sendChat(text){return call("/api/chat",{method:"POST",body:JSON.stringify({text})});},
    async leaderboard(){const r=await fetch(base+"/api/leaderboard",{cache:"no-store"});if(!r.ok)throw new Error("Leaderboard request failed");return r.json();},
    getRecoveryCode(){return storage.getItem(RECOVERY)||"";},hasSession(){return Boolean(storage.getItem(SESSION));},clearSession(){storage.removeItem(SESSION);}
  };
}
