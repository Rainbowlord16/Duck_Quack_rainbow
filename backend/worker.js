const SESSION_TTL_SECONDS=2592000;
const USERNAME_RE=/^[\p{L}\p{N}_ -]{2,22}$/u;
const RESERVED=new Set(["creator","admin","administrator","system","moderator","rainbowlord","rainbowlord16"]);
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const encode=b=>{let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s);};
const encodeUrl=b=>{let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");};
const decode=s=>{const b=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));};
const random=n=>{const b=new Uint8Array(n);crypto.getRandomValues(b);return encodeUrl(b);};
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const ip=r=>r.headers.get("CF-Connecting-IP")||"unknown";
async function readJson(req,maxBytes=4096){const len=Number(req.headers.get("Content-Length")||0);if(len>maxBytes)throw new Error("body-too-large");const reader=req.body?.getReader();if(!reader)return {};const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error("body-too-large");}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(all));}
async function limit(env,key,max,seconds){const id=env.RATE_LIMITER.idFromName(key);const r=await env.RATE_LIMITER.get(id).fetch("https://limit/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({max,seconds})});return r.ok;}
function username(v){if(typeof v!=="string")return null;const n=v.normalize("NFKC").trim().replace(/\s+/g," ");return USERNAME_RE.test(n)&&!RESERVED.has(n.toLowerCase())?n:null;}
async function auth(req,env){const t=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");if(!t||t.length>200)return null;const row=await env.DB.prepare("SELECT p.player_id,p.username,p.banned,s.expires_at FROM sessions s JOIN players p ON p.player_id=s.player_id WHERE s.token_hash=?").bind(await hash(t)).first();return row&&!row.banned&&row.expires_at>=Math.floor(Date.now()/1000)?row:null;}
async function session(env,id){const token=random(32),now=Math.floor(Date.now()/1000);await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();await env.DB.prepare("INSERT INTO sessions(token_hash,player_id,created_at,expires_at) VALUES(?,?,?,?)").bind(await hash(token),id,now,now+SESSION_TTL_SECONDS).run();return{token,expiresAt:now+SESSION_TTL_SECONDS};}
function cors(req,env){const origin=req.headers.get("Origin")||"",allowed=(env.FRONTEND_ORIGIN||"").split(",").map(x=>x.trim());const h={"Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Access-Control-Max-Age":"86400"};if(allowed.includes(origin))h["Access-Control-Allow-Origin"]=origin;return h;}
async function bootstrap(req,env){if(!await limit(env,"new:"+ip(req),8,3600))return reply({error:"Too many new sessions. Try again later."},429);const id="PLY-"+[...crypto.getRandomValues(new Uint8Array(8))].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase(),key=random(32),now=Math.floor(Date.now()/1000),name="DuckGuest_"+id.slice(-4);await env.DB.prepare("INSERT INTO players(player_id,username,recovery_hash,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,name,await hash(key),now,now).run();await env.DB.prepare("INSERT INTO leaderboard(player_id,username,lifetime_quacks,rebirths,updated_at) VALUES(?,?,0,0,?)").bind(id,name,now).run();const s=await session(env,id),recoveryCode=encode(new TextEncoder().encode(JSON.stringify({v:1,id,key})));return reply({player:{id,username:name},session:s,recoveryCode},201);}
async function recover(req,env){if(!await limit(env,"recover:"+ip(req),10,3600))return reply({error:"Too many recovery attempts. Try later."},429);const b=await readJson(req,3072).catch(()=>null);if(typeof b?.recoveryCode!=="string"||b.recoveryCode.length>2048)return reply({error:"Invalid recovery code."},400);let p;try{p=JSON.parse(new TextDecoder().decode(decode(b.recoveryCode)));}catch{return reply({error:"Invalid recovery code."},400);}if(p?.v!==1||!/^PLY-[A-F0-9]{16}$/.test(p.id||"")||!/^[A-Za-z0-9_-]{43}$/.test(p.key||""))return reply({error:"Invalid recovery code."},400);const row=await env.DB.prepare("SELECT username,recovery_hash,banned FROM players WHERE player_id=?").bind(p.id).first();const a=await hash(p.key),z=row?.recovery_hash||"0".repeat(64);let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^z.charCodeAt(i);if(!row||row.banned||diff!==0)return reply({error:"Recovery code not accepted."},401);return reply({player:{id:p.id,username:row.username},session:await session(env,p.id)});}

const GAME_UPGRADES={
 beak:{base:15,growth:1.15,val:2,type:"click"},
 crumbs:{base:45,growth:1.16,val:3,type:"cps"},
 megaphone:{base:260,growth:1.17,val:12,type:"click"},
 feeder:{base:900,growth:1.18,val:28,type:"cps"},
 vocal:{base:4200,growth:1.19,val:85,type:"click"},
 bakery:{base:18500,growth:1.20,val:240,type:"cps"},
 echo:{base:95000,growth:1.21,val:750,type:"click"},
 fleet:{base:480000,growth:1.22,val:2400,type:"cps"}
};
const GAME_CAP=9007199254740991;
const safeInt=n=>Math.max(0,Math.min(GAME_CAP,Math.floor(Number.isFinite(n)?n:0)));
async function loadGame(env,id){
 const now=Math.floor(Date.now()/1000);
 await env.DB.prepare("INSERT OR IGNORE INTO player_game_state(player_id,quacks,lifetime_quacks,rebirths,upgrades_json,last_accrual,updated_at) VALUES(?,0,0,0,'{}',?,?)").bind(id,now,now).run();
 let g=await env.DB.prepare("SELECT * FROM player_game_state WHERE player_id=?").bind(id).first();
 let upgrades={};try{upgrades=JSON.parse(g.upgrades_json||"{}");}catch{}
 const levels={};for(const [k,v] of Object.entries(GAME_UPGRADES))levels[k]=Math.max(0,Math.min(100000,Math.floor(Number(upgrades[k])||0)));
 const elapsed=Math.max(0,Math.min(30,now-Number(g.last_accrual||now)));
 let cps=0;for(const [k,v] of Object.entries(GAME_UPGRADES))if(v.type==="cps")cps+=levels[k]*v.val;
 const earned=safeInt(cps*elapsed),oldLast=Number(g.last_accrual||now);
 if(earned>0){
  await env.DB.prepare("UPDATE player_game_state SET quacks=MIN(quacks+?,?),lifetime_quacks=MIN(lifetime_quacks+?,?),last_accrual=?,updated_at=? WHERE player_id=? AND last_accrual=?").bind(earned,GAME_CAP,earned,GAME_CAP,now,now,id,oldLast).run();
 }else{
  await env.DB.prepare("UPDATE player_game_state SET last_accrual=?,updated_at=? WHERE player_id=? AND last_accrual=?").bind(now,now,id,oldLast).run();
 }
 const fresh=await env.DB.prepare("SELECT quacks,lifetime_quacks,rebirths,upgrades_json FROM player_game_state WHERE player_id=?").bind(id).first();
 let freshUpgrades={};try{freshUpgrades=JSON.parse(fresh.upgrades_json||"{}");}catch{}
 const freshLevels={};for(const k of Object.keys(GAME_UPGRADES))freshLevels[k]=Math.max(0,Math.min(100000,Math.floor(Number(freshUpgrades[k])||0)));
 const freshCps=safeInt(Object.entries(GAME_UPGRADES).reduce((n,[k,v])=>n+(v.type==="cps"?freshLevels[k]*v.val:0),0));
 if(earned>0)await env.DB.prepare("UPDATE leaderboard SET lifetime_quacks=(SELECT lifetime_quacks FROM player_game_state WHERE player_id=?),rebirths=(SELECT rebirths FROM player_game_state WHERE player_id=?),updated_at=? WHERE player_id=?").bind(id,id,now,id).run();
 return {quacks:Number(fresh.quacks),lifetimeQuacks:Number(fresh.lifetime_quacks),rebirths:Number(fresh.rebirths)||0,upgrades:freshLevels,upgradesJson:fresh.upgrades_json,clickPower:safeInt(1+Object.entries(GAME_UPGRADES).reduce((n,[k,v])=>n+(v.type==="click"?freshLevels[k]*v.val:0),0)),cps:freshCps};
}
async function gameApi(req,env,p,u){
 const now=Math.floor(Date.now()/1000),id=p.player_id;
 if(u.pathname==="/api/game/state"&&req.method==="GET")return reply({game:await loadGame(env,id)});
 if(u.pathname==="/api/game/click"&&req.method==="POST"){
  if(!await limit(env,"gameclick:"+id,12,1))return reply({error:"Click rate limit reached."},429);
  const g=await loadGame(env,id),gain=Math.max(1,g.clickPower);
  const fresh=await env.DB.prepare("UPDATE player_game_state SET quacks=MIN(quacks+?,?),lifetime_quacks=MIN(lifetime_quacks+?,?),updated_at=? WHERE player_id=? RETURNING quacks,lifetime_quacks,rebirths").bind(gain,GAME_CAP,gain,GAME_CAP,now,id).first();
  await env.DB.prepare("UPDATE leaderboard SET lifetime_quacks=(SELECT lifetime_quacks FROM player_game_state WHERE player_id=?),rebirths=(SELECT rebirths FROM player_game_state WHERE player_id=?),updated_at=? WHERE player_id=?").bind(id,id,now,id).run();
  return reply({game:{...g,quacks:Number(fresh.quacks),lifetimeQuacks:Number(fresh.lifetime_quacks),clickPower:gain}},200);
 }
 if(u.pathname==="/api/game/upgrade"&&req.method==="POST"){
  if(!await limit(env,"gameupgrade:"+id,8,10))return reply({error:"Upgrade rate limit reached."},429);
  const b=await readJson(req,512).catch(()=>null),key=b?.upgrade,def=GAME_UPGRADES[key];
  if(!def)return reply({error:"Unknown upgrade."},400);
  const g=await loadGame(env,id),level=g.upgrades[key]||0;
  const cost=safeInt(Math.floor(def.base*Math.pow(def.growth,level)));
  if(!Number.isSafeInteger(cost)||cost<1||g.quacks<cost)return reply({error:"Not enough server-verified Quacks."},409);
  const upgrades={...g.upgrades,[key]:level+1},quacks=g.quacks-cost;
  const saved=await env.DB.prepare("UPDATE player_game_state SET quacks=quacks-?,upgrades_json=?,updated_at=? WHERE player_id=? AND quacks>=? AND upgrades_json=?").bind(cost,JSON.stringify(upgrades),now,id,cost,g.upgradesJson).run();
  if(!saved.meta?.changes)return reply({error:"Game state changed. Retry the upgrade."},409);
  return reply({game:{...g,quacks,upgrades,cps:safeInt(Object.entries(GAME_UPGRADES).reduce((n,[k,v])=>n+(v.type==="cps"?upgrades[k]*v.val:0),0)),clickPower:safeInt(1+Object.entries(GAME_UPGRADES).reduce((n,[k,v])=>n+(v.type==="click"?upgrades[k]*v.val:0),0))}});
 }
 if(u.pathname==="/api/game/rebirth"&&req.method==="POST"){
  const g=await loadGame(env,id),required=50000*Math.pow(2.4,g.rebirths);
  if(!Number.isSafeInteger(required)||g.quacks<required)return reply({error:"Rebirth requirement not met on the server."},409);
  const rebirths=g.rebirths+1;
  const saved=await env.DB.prepare("UPDATE player_game_state SET quacks=0,rebirths=?,upgrades_json='{}',last_accrual=?,updated_at=? WHERE player_id=? AND rebirths=? AND quacks>=? AND upgrades_json=?").bind(rebirths,now,now,id,g.rebirths,required,g.upgradesJson).run();
  if(!saved.meta?.changes)return reply({error:"Game state changed. Retry rebirth."},409);
  await env.DB.prepare("UPDATE leaderboard SET lifetime_quacks=(SELECT lifetime_quacks FROM player_game_state WHERE player_id=?),rebirths=(SELECT rebirths FROM player_game_state WHERE player_id=?),updated_at=? WHERE player_id=?").bind(id,id,now,id).run();
  return reply({game:{...g,quacks:0,rebirths,upgrades:{},clickPower:1,cps:0}});
 }
 return null;
}

export default{async fetch(req,env){const h=cors(req,env);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});const u=new URL(req.url);let r;try{if(u.pathname==="/api/health"&&req.method==="GET")r=reply({ok:true,service:"duck-quack-api",version:1});else if(u.pathname==="/api/session"&&req.method==="POST")r=await bootstrap(req,env);else if(u.pathname==="/api/session/recover"&&req.method==="POST")r=await recover(req,env);else if(u.pathname==="/api/leaderboard"&&req.method==="GET"){if(!await limit(env,"leaderboard:"+ip(req),90,60))r=reply({error:"Leaderboard refresh limit reached."},429);else{const rows=await env.DB.prepare("SELECT player_id,username,lifetime_quacks,rebirths,updated_at FROM leaderboard ORDER BY lifetime_quacks DESC,updated_at ASC LIMIT 100").all();r=reply({entries:rows.results||[]});}}else{const p=await auth(req,env);if(!p)r=reply({error:"Valid anonymous player session required."},401);else if(u.pathname.startsWith("/api/game/"))r=await gameApi(req,env,p,u)||reply({error:"Not found."},404);else if(u.pathname==="/api/me"&&req.method==="GET")r=reply({player:{id:p.player_id,username:p.username}});else if(u.pathname==="/api/me"&&req.method==="POST"){const b=await readJson(req,512).catch(()=>null),n=username(b?.username);if(!n)r=reply({error:"Username must be 2-22 letters, numbers, spaces, _ or -, and cannot be reserved."},400);else if(!await limit(env,"rename:"+p.player_id,5,3600))r=reply({error:"Username changes are temporarily limited."},429);else{await env.DB.prepare("UPDATE players SET username=?,updated_at=? WHERE player_id=?").bind(n,Math.floor(Date.now()/1000),p.player_id).run();await env.DB.prepare("UPDATE leaderboard SET username=?,updated_at=? WHERE player_id=?").bind(n,Math.floor(Date.now()/1000),p.player_id).run();r=reply({player:{id:p.player_id,username:n}});}}else if(u.pathname==="/api/chat"&&req.method==="GET"){if(!await limit(env,"chatread:"+p.player_id,60,60))r=reply({error:"Chat refresh limit reached."},429);else{const since=Number(u.searchParams.get("since")||0);const rows=Number.isFinite(since)&&since>0?await env.DB.prepare("SELECT message_id AS id,player_id AS playerId,username,body AS text,created_at AS createdAt FROM chat_messages WHERE created_at > ? ORDER BY created_at ASC LIMIT 100").bind(Math.floor(since)).all():await env.DB.prepare("SELECT message_id AS id,player_id AS playerId,username,body AS text,created_at AS createdAt FROM chat_messages ORDER BY created_at DESC LIMIT 50").all();r=reply({messages:since>0?(rows.results||[]):(rows.results||[]).reverse()});}}else if(u.pathname==="/api/chat"&&req.method==="POST"){const b=await readJson(req,2048).catch(()=>null),text=typeof b?.text==="string"?b.text.normalize("NFKC").trim():"";if(!text||text.length>280)r=reply({error:"Message must be 1-280 characters."},400);else if(!await limit(env,"chat:"+p.player_id,8,10)||!await limit(env,"chatip:"+ip(req),30,10))r=reply({error:"Chat rate limit reached."},429);else{const id=random(16),createdAt=Math.floor(Date.now()/1000),m={id,playerId:p.player_id,username:p.username,text,createdAt};await env.DB.prepare("INSERT INTO chat_messages(message_id,player_id,username,body,created_at) VALUES(?,?,?,?,?)").bind(id,p.player_id,p.username,text,createdAt).run();await env.DB.prepare("DELETE FROM chat_messages WHERE created_at < ?").bind(createdAt-2592000).run();r=reply({message:m},201);}}else r=reply({error:"Not found."},404);}}catch(e){r=reply({error:e?.message==="body-too-large"?"Request body too large.":"Internal server error."},e?.message==="body-too-large"?413:500);}const out=new Headers(r.headers);for(const[k,v]of Object.entries(h))out.set(k,v);return new Response(r.body,{status:r.status,headers:out});}};
export class RateLimiter{constructor(state){this.state=state;}async fetch(req){const {max,seconds}=await req.json(),now=Math.floor(Date.now()/1000);let b=await this.state.storage.get("b");if(!b||now-b.start>=seconds)b={start:now,count:0};b.count++;await this.state.storage.put("b",b);return reply({allowed:b.count<=max},b.count<=max?200:429);}}

