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
async function authToken(t,env){if(!t||t.length>200)return null;const row=await env.DB.prepare("SELECT p.player_id,p.username,p.banned,s.expires_at FROM sessions s JOIN players p ON p.player_id=s.player_id WHERE s.token_hash=?").bind(await hash(t)).first();return row&&!row.banned&&row.expires_at>=Math.floor(Date.now()/1000)?row:null;}
async function auth(req,env){const t=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");return authToken(t,env);}
async function session(env,id){const token=random(32),now=Math.floor(Date.now()/1000);await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();await env.DB.prepare("INSERT INTO sessions(token_hash,player_id,created_at,expires_at) VALUES(?,?,?,?)").bind(await hash(token),id,now,now+SESSION_TTL_SECONDS).run();return{token,expiresAt:now+SESSION_TTL_SECONDS};}
function cors(req,env){const origin=req.headers.get("Origin")||"",allowed=(env.FRONTEND_ORIGIN||"").split(",").map(x=>x.trim());const h={"Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization,X-Creator-Enrollment-Secret,X-Player-Session","Access-Control-Max-Age":"86400"};if(allowed.includes(origin))h["Access-Control-Allow-Origin"]=origin;return h;}
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
async function isCreatorPlayer(env,id){
 const row=await env.DB.prepare("SELECT 1 AS creator FROM creator_passkeys WHERE slot=1 AND player_id=? LIMIT 1").bind(id).first();
 return Boolean(row);
}
function creatorGame(){
 const upgrades=Object.fromEntries(Object.keys(GAME_UPGRADES).map(key=>[key,100000]));
 return {quacks:GAME_CAP,lifetimeQuacks:GAME_CAP,rebirths:GAME_CAP,upgrades,upgradesJson:JSON.stringify(upgrades),clickPower:GAME_CAP,cps:GAME_CAP,creator:true};
}
async function loadGame(env,id){
 if(await isCreatorPlayer(env,id))return creatorGame();
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
 if(await isCreatorPlayer(env,id)){
  const game=creatorGame();
  if(u.pathname==="/api/game/state"&&req.method==="GET")return reply({game});
  if(u.pathname==="/api/game/click"&&req.method==="POST"){
   if(!await limit(env,"gameclick:"+id,12,1))return reply({error:"Click rate limit reached."},429);
   return reply({game});
  }
  if((u.pathname==="/api/game/upgrade"||u.pathname==="/api/game/rebirth")&&req.method==="POST")return reply({game});
 }
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


const ADMIN_RP_ID="rainbowlord16.github.io";
const ADMIN_ORIGIN="https://rainbowlord16.github.io";
const INTENSITY_COMMAND_FAMILIES=new Set(["NUKE","TSAR_NUKE","ORBITAL_LASER","SUPERNOVA","ARMAGEDDON","METEOR","EARTHQUAKE","BLACKHOLE","JUMPSCARE","SCREAMER","DEMON_EYES","HAUNT","STATIC_CRASH","BSOD","FLASHBANG","BLIND","JAIL","FREEZE","FLIP","SPIN","TORNADO_SPIN","GIANT","TINY","ZERO_G","GLITCH","INVERT","ACID","RETRO","DISCO","RAINBOW_STORM","MEGA_STORM","DUCK_STAMPEDE"]);
const INTENSITY_COMMAND_MAX=5000;
const INTENSITY_COMMANDS=Array.from({length:512},(_,i)=>{const family=[...INTENSITY_COMMAND_FAMILIES][Math.floor(i/16)];return family+"_"+String((i%16)+1).padStart(2,"0");});
const ADMIN_COMMANDS=new Set(["NUKE","TSAR_NUKE","ORBITAL_LASER","SUPERNOVA","ARMAGEDDON","METEOR","EARTHQUAKE","BLACKHOLE","JUMPSCARE","SCREAMER","DEMON_EYES","HAUNT","STATIC_CRASH","BSOD","FLASHBANG","BLIND","JAIL","FREEZE","UNFREEZE","FLIP","SPIN","TORNADO_SPIN","GIANT","TINY","ZERO_G","GLITCH","INVERT","ACID","RETRO","DISCO","RAINBOW_STORM","MEGA_STORM","RAIN_GEMS","RAIN_BREAD","CLONE_DUCKS","DUCK_STAMPEDE","RICKROLL","AIRHORN","SIREN","VINE_BOOM","SAD_TROMBONE","CHOIR_BLAST","FAKE_BAN","FAKE_HACK","KICK_WARNING","TAX","WIPE_COMBO","MAX_FEVER","GIVE_PETS","GIFT_GEMS","GIFT_QUACKS","GIFT_EGGS","RICH","REBIRTH_BOOST","VOID_BOOST","UNLOCK_WORLDS","HEAL_BOSS","SLAY_BOSS","SET_WEATHER_BREAD","SET_WEATHER_GEM","SET_WEATHER_CYBER","SET_WEATHER_VOID","SAY","ANNOUNCE","SMITE","ANVIL","LIGHTNING","CONFETTI","HEARTS","SKULL_RAIN","MATRIX","BLUR","SHAKE_SCREEN","RESET_SIZE" ,"CLEAR",...INTENSITY_COMMANDS]);
function cbor(bytes){let p=0;function read(){const h=bytes[p++],m=h>>5,a=h&31;let n;if(a<24)n=a;else if(a===24)n=bytes[p++];else if(a===25){n=(bytes[p]<<8)|bytes[p+1];p+=2;}else if(a===26){n=0;for(let i=0;i<4;i++)n=n*256+bytes[p++];}else if(a===27){n=0;for(let i=0;i<8;i++)n=n*256+bytes[p++];}else throw Error("Unsupported CBOR length");if(m===0)return n;if(m===1)return -1-n;if(m===2){const v=bytes.slice(p,p+n);p+=n;return v;}if(m===3){const v=new TextDecoder().decode(bytes.slice(p,p+n));p+=n;return v;}if(m===4){const v=[];for(let i=0;i<n;i++)v.push(read());return v;}if(m===5){const v=new Map();for(let i=0;i<n;i++)v.set(read(),read());return v;}if(m===7){if(a===20)return false;if(a===21)return true;if(a===22)return null;}throw Error("Unsupported CBOR value");}const value=read();return {value,offset:p};}
const b64u=b=>encodeUrl(b);
const fromB64u=s=>decode(s);
async function challengeCreate(env,purpose){const challenge=random(32),now=Math.floor(Date.now()/1000),expires=now+300;await env.DB.prepare("DELETE FROM admin_challenges WHERE expires_at<?").bind(now).run();await env.DB.prepare("INSERT INTO admin_challenges(challenge_hash,purpose,expires_at) VALUES(?,?,?)").bind(await hash(challenge),purpose,expires).run();return challenge;}
async function challengeConsume(env,challenge,purpose){if(typeof challenge!=="string"||challenge.length>100)return false;const h=await hash(challenge),now=Math.floor(Date.now()/1000),row=await env.DB.prepare("DELETE FROM admin_challenges WHERE challenge_hash=? AND purpose=? AND expires_at>=? RETURNING challenge_hash").bind(h,purpose,now).first();return Boolean(row);}
function clientData(raw,type,challenge){const d=JSON.parse(new TextDecoder().decode(fromB64u(raw)));if(d.type!==type||d.challenge!==challenge||d.origin!==ADMIN_ORIGIN||d.crossOrigin===true)throw Error("WebAuthn origin or challenge check failed.");return d;}
function derToRaw(sig){if(sig.length===64)return sig;if(sig[0]!==0x30)throw Error("Invalid ECDSA signature.");let i=2;if(sig[i++]!==0x02)throw Error("Invalid ECDSA signature.");let rl=sig[i++],r=sig.slice(i,i+rl);i+=rl;if(sig[i++]!==0x02)throw Error("Invalid ECDSA signature.");let sl=sig[i++],s=sig.slice(i,i+sl);const trim=x=>x[0]===0?x.slice(1):x;r=trim(r);s=trim(s);const out=new Uint8Array(64);out.set(r.slice(-32),32-Math.min(32,r.length));out.set(s.slice(-32),64-Math.min(32,s.length));return out;}
function parseAuthData(authData){if(authData.length<37)throw Error("Authenticator data too short.");const rpHash=authData.slice(0,32),flags=authData[32],counter=new DataView(authData.buffer,authData.byteOffset+33,4).getUint32(0);return{rpHash,flags,counter};}
async function verifyRp(authData){const a=parseAuthData(authData),x=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ADMIN_RP_ID)));let d=0;for(let i=0;i<32;i++)d|=x[i]^a.rpHash[i];if(d!==0||(a.flags&1)===0||(a.flags&4)===0)throw Error("Passkey verification failed. Enable device user verification.");return a;}
async function extractCredential(attestation){const decoded=cbor(fromB64u(attestation)).value,authData=decoded.get("authData");if(!(authData instanceof Uint8Array))throw Error("Invalid passkey attestation.");await verifyRp(authData);if((authData[32]&0x40)===0)throw Error("Passkey attestation omitted credential data.");let pos=53;const len=(authData[pos]<<8)|authData[pos+1];pos+=2;const credentialId=authData.slice(pos,pos+len);pos+=len;const cose=cbor(authData.slice(pos)).value;const kty=cose.get(1),alg=cose.get(3),crv=cose.get(-1),x=cose.get(-2),y=cose.get(-3);if(kty!==2||alg!==-7||crv!==1||!(x instanceof Uint8Array)||!(y instanceof Uint8Array)||x.length!==32||y.length!==32)throw Error("Only ES256 passkeys are supported.");return{credentialId:b64u(credentialId),publicKey:{kty:"EC",crv:"P-256",alg:"ES256",ext:true,x:b64u(x),y:b64u(y)},counter:parseAuthData(authData).counter};}
async function getAdminSession(req,env){const t=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");if(!t||t.length>200)return null;const now=Math.floor(Date.now()/1000),row=await env.DB.prepare("SELECT token_hash,expires_at FROM admin_sessions WHERE token_hash=?").bind(await hash(t)).first();return row&&row.expires_at>=now?{tokenHash:row.token_hash,expiresAt:row.expires_at}:null;}
async function adminRoutes(req,env,u){
 const now=Math.floor(Date.now()/1000),secret=req.headers.get("X-Creator-Enrollment-Secret")||"";
 if(u.pathname==="/api/admin/session"&&req.method==="GET"){const a=await getAdminSession(req,env);if(!a)return reply({authenticated:false},401);return reply({authenticated:true,expiresAt:a.expiresAt});}
 if(u.pathname==="/api/admin/identity"&&req.method==="POST"){const a=await getAdminSession(req,env);if(!a)return reply({error:"Creator passkey authentication required."},401);const playerToken=req.headers.get("X-Player-Session")||"",p=await authToken(playerToken,env);if(!p)return reply({error:"Valid anonymous player session required."},401);await env.DB.prepare("UPDATE players SET username=?,updated_at=? WHERE player_id=?").bind("RainbowLord16",now,p.player_id).run();await env.DB.prepare("UPDATE leaderboard SET username=?,updated_at=? WHERE player_id=?").bind("RainbowLord16",now,p.player_id).run();await env.DB.prepare("UPDATE creator_passkeys SET player_id=? WHERE slot=1").bind(p.player_id).run();return reply({player:{id:p.player_id,username:"RainbowLord16"}});}
 if(u.pathname==="/api/admin/passkey/register/options"&&req.method==="POST"){if(!await limit(env,"admin-enroll:"+ip(req),5,60))return reply({error:"Creator enrollment attempts are rate limited."},429);if(!env.CREATOR_ENROLLMENT_SECRET||secret!==env.CREATOR_ENROLLMENT_SECRET)return reply({error:"Creator enrollment is not authorized."},403);if(await env.DB.prepare("SELECT credential_id FROM creator_passkeys LIMIT 1").first())return reply({error:"Creator passkey is already enrolled."},409);const challenge=await challengeCreate(env,"register");return reply({challenge,rp:{id:ADMIN_RP_ID,name:"Duck Quack Creator"},user:{id:b64u(new TextEncoder().encode("creator_rainbowlord16_official")),name:"RainbowLord16",displayName:"RainbowLord16"},pubKeyCredParams:[{type:"public-key",alg:-7}],timeout:60000,attestation:"none",authenticatorSelection:{residentKey:"preferred",userVerification:"required"}});}
 if(u.pathname==="/api/admin/passkey/register/verify"&&req.method==="POST"){if(!env.CREATOR_ENROLLMENT_SECRET||secret!==env.CREATOR_ENROLLMENT_SECRET)return reply({error:"Creator enrollment is not authorized."},403);const b=await readJson(req,16000).catch(()=>null);if(!b?.response?.clientDataJSON||!b?.response?.attestationObject)return reply({error:"Invalid passkey registration response."},400);try{clientData(b.response.clientDataJSON,"webauthn.create",b.challenge);if(!await challengeConsume(env,b.challenge,"register"))return reply({error:"Registration challenge expired."},401);if(await env.DB.prepare("SELECT credential_id FROM creator_passkeys LIMIT 1").first())return reply({error:"Creator passkey is already enrolled."},409);const c=await extractCredential(b.response.attestationObject);await env.DB.prepare("INSERT INTO creator_passkeys(credential_id,public_key_json,sign_count,created_at) VALUES(?,?,?,?)").bind(c.credentialId,JSON.stringify(c.publicKey),c.counter,now).run();return reply({ok:true});}catch(e){return reply({error:e.message||"Passkey registration failed."},400);}}
 if(u.pathname==="/api/admin/passkey/login/options"&&req.method==="POST"){if(!await limit(env,"admin-login:"+ip(req),15,60))return reply({error:"Creator login attempts are rate limited."},429);const rows=await env.DB.prepare("SELECT credential_id FROM creator_passkeys").all();if(!rows.results?.length)return reply({error:"Creator passkey has not been enrolled yet."},404);const challenge=await challengeCreate(env,"login");return reply({challenge,timeout:60000,userVerification:"required",allowCredentials:rows.results.map(x=>({type:"public-key",id:x.credential_id,transports:["internal","hybrid"]}))});}
 if(u.pathname==="/api/admin/passkey/login/verify"&&req.method==="POST"){const b=await readJson(req,12000).catch(()=>null);if(!b?.challenge||!b?.response?.clientDataJSON||!b?.response?.authenticatorData||!b?.response?.signature)return reply({error:"Invalid passkey assertion."},400);try{clientData(b.response.clientDataJSON,"webauthn.get",b.challenge);if(!await challengeConsume(env,b.challenge,"login"))return reply({error:"Login challenge expired."},401);const id=b64u(fromB64u(b.response.rawId||b.id)),row=await env.DB.prepare("SELECT public_key_json,sign_count FROM creator_passkeys WHERE credential_id=?").bind(id).first();if(!row)return reply({error:"Unknown Creator passkey."},401);const ad=fromB64u(b.response.authenticatorData),meta=await verifyRp(ad);if(meta.counter&&row.sign_count&&meta.counter<=row.sign_count)return reply({error:"Passkey counter check failed."},401);const clientHash=new Uint8Array(await crypto.subtle.digest("SHA-256",fromB64u(b.response.clientDataJSON))),signed=new Uint8Array(ad.length+clientHash.length);signed.set(ad);signed.set(clientHash,ad.length);const key=await crypto.subtle.importKey("jwk",JSON.parse(row.public_key_json),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);const ok=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,derToRaw(fromB64u(b.response.signature)),signed);if(!ok)return reply({error:"Passkey signature is invalid."},401);await env.DB.prepare("UPDATE creator_passkeys SET sign_count=? WHERE credential_id=?").bind(meta.counter,id).run();const token=random(32),expires=now+28800;await env.DB.prepare("INSERT INTO admin_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)").bind(await hash(token),now,expires).run();return reply({ok:true,token,expiresAt:expires});}catch(e){return reply({error:e.message||"Passkey login failed."},401);}}
 if(u.pathname==="/api/admin/logout"&&req.method==="POST"){const a=await getAdminSession(req,env);if(a)await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?").bind(a.tokenHash).run();return reply({ok:true});}
 if(u.pathname==="/api/admin/events"&&req.method==="GET"){if(!await limit(env,"admin-events-read:"+ip(req),90,60))return reply({error:"Admin event polling is rate limited."},429);const since=Math.max(0,Math.floor(Number(u.searchParams.get("since"))||0));const rows=since?await env.DB.prepare("SELECT id,event_id AS eventId,type,arg,target_player_id AS targetPlayer,target_label AS targetLabel,message,created_at AS createdAt FROM admin_events WHERE id>? ORDER BY id ASC LIMIT 100").bind(since).all():await env.DB.prepare("SELECT id,event_id AS eventId,type,arg,target_player_id AS targetPlayer,target_label AS targetLabel,message,created_at AS createdAt FROM admin_events ORDER BY id DESC LIMIT 100").all();const events=rows.results||[];if(!since)events.reverse();return reply({events,cursor:events.length?events[events.length-1].id:since});}
 if(u.pathname==="/api/admin/events"&&req.method==="POST"){const a=await getAdminSession(req,env);if(!a)return reply({error:"Creator passkey authentication required."},401);if(!await limit(env,"admin-event",12,10))return reply({error:"Admin command rate limit reached."},429);const b=await readJson(req,1024).catch(()=>null),type=String(b?.type||"").toUpperCase(),rawArg=typeof b?.arg==="string"?b.arg.trim().slice(0,160):"",target=String(b?.target||"ALL").trim();if(!ADMIN_COMMANDS.has(type)||!target||target.length>80)return reply({error:"Unknown command or invalid target."},400);const family=type.replace(/_\d{2}$/,""),isIntensity=INTENSITY_COMMAND_FAMILIES.has(family),isVariant=type!==family&&isIntensity;let arg=rawArg;if(isIntensity){if(rawArg!==""&&!/^\d+$/.test(rawArg))return reply({error:"Intensity must be a whole number from 1 to 5000."},400);const value=rawArg===""?100:Number(rawArg);if(!Number.isSafeInteger(value)||value<1||value>INTENSITY_COMMAND_MAX)return reply({error:"Intensity must be a whole number from 1 to 5000."},400);arg=String(value);}let targetId=null,targetLabel="ALL";if(target.toUpperCase()!=="ALL"){const p=await env.DB.prepare("SELECT player_id,username FROM players WHERE player_id=? OR username=? COLLATE NOCASE LIMIT 1").bind(target,target).first();if(!p)return reply({error:"Target player was not found. Refresh the player list."},404);targetId=p.player_id;targetLabel=p.username;}const eventId=random(16),message=arg?("[RainbowLord16 → "+targetLabel+"] "+type+": "+arg):("[RainbowLord16 → "+targetLabel+"] triggered "+type+"!");const saved=await env.DB.prepare("INSERT INTO admin_events(event_id,type,arg,target_player_id,target_label,message,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id").bind(eventId,type,arg,targetId,targetLabel,message,now).first();await env.DB.prepare("DELETE FROM admin_events WHERE created_at<?").bind(now-604800).run();return reply({event:{id:saved.id,eventId,type,arg,targetPlayer:targetId,targetLabel,message,createdAt:now}},201);}

 if(u.pathname==="/api/admin/gifts"&&req.method==="GET"){
  const a=await getAdminSession(req,env);if(!a)return reply({error:"Creator passkey authentication required."},401);
  if(!await limit(env,"creator-gift-history:"+ip(req),30,60))return reply({error:"Gift history is rate limited."},429);
  const rows=await env.DB.prepare("SELECT g.gift_id AS giftId,g.target_player_id AS targetPlayer,p.username AS targetName,g.resource,g.amount,g.created_at AS createdAt FROM gift_transactions g JOIN players p ON p.player_id=g.target_player_id ORDER BY g.created_at DESC LIMIT 50").all();
  return reply({gifts:rows.results||[]});
 }
 if(u.pathname==="/api/admin/gifts"&&req.method==="POST"){
  const a=await getAdminSession(req,env);if(!a)return reply({error:"Creator passkey authentication required."},401);
  if(!await limit(env,"creator-gift-send",20,60))return reply({error:"Creator gift rate limit reached."},429);
  const b=await readJson(req,1024).catch(()=>null);
  const targetId=typeof b?.targetPlayerId==="string"?b.targetPlayerId.trim():"";
  const resource=typeof b?.resource==="string"?b.resource.toLowerCase():"";
  const amount=b?.amount;
  const requestId=typeof b?.requestId==="string"?b.requestId:"";
  if(!/^PLY-[A-F0-9]{16}$/.test(targetId)||resource!=="quacks"||!Number.isSafeInteger(amount)||amount<1||amount>1000000000||!/^[A-Za-z0-9_-]{16,64}$/.test(requestId))
   return reply({error:"Invalid gift. Only 1 to 1,000,000,000 Quacks can be granted per transaction."},400);
  const creator=await env.DB.prepare("SELECT p.player_id FROM creator_passkeys c JOIN players p ON p.player_id=c.player_id WHERE c.slot=1 AND p.banned=0 LIMIT 1").first();
  if(!creator)return reply({error:"Creator identity is not linked to an active player."},403);
  if(targetId===creator.player_id)return reply({error:"Creator gifts must target another player."},400);
  const target=await env.DB.prepare("SELECT player_id,username,banned FROM players WHERE player_id=?").bind(targetId).first();
  if(!target||target.banned)return reply({error:"Target player was not found or is unavailable."},404);
  const now=Math.floor(Date.now()/1000);
  await env.DB.prepare("INSERT OR IGNORE INTO player_game_state(player_id,quacks,lifetime_quacks,rebirths,upgrades_json,last_accrual,updated_at) VALUES(?,0,0,0,'{}',?,?)").bind(targetId,now,now).run();
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO gift_transactions(gift_id,actor_player_id,target_player_id,resource,amount,created_at,applied) VALUES(?,?,?,?,?,?,0)").bind(requestId,creator.player_id,targetId,resource,amount,now),
    env.DB.prepare("UPDATE player_game_state SET quacks=MIN(quacks+?,?),updated_at=? WHERE player_id=? AND EXISTS(SELECT 1 FROM gift_transactions WHERE gift_id=? AND applied=0)").bind(amount,GAME_CAP,now,targetId,requestId),
    env.DB.prepare("UPDATE gift_transactions SET applied=1 WHERE gift_id=? AND applied=0").bind(requestId)
   ]);
  }catch(e){return reply({error:"Gift transaction could not be completed."},409);}
  const gift=await env.DB.prepare("SELECT gift_id AS giftId,target_player_id AS targetPlayer,resource,amount,created_at AS createdAt,applied FROM gift_transactions WHERE gift_id=?").bind(requestId).first();
  if(!gift||gift.actor_player_id&&gift.actor_player_id!==creator.player_id||gift.targetPlayer!==targetId||gift.resource!==resource||Number(gift.amount)!==amount)
   return reply({error:"Gift request ID was already used for a different transaction."},409);
  if(!gift.applied)return reply({error:"Gift was not applied. Please retry with a new request ID."},409);
  const balance=await env.DB.prepare("SELECT quacks FROM player_game_state WHERE player_id=?").bind(targetId).first();
  return reply({gift:{...gift,targetName:target.username},balance:{quacks:Number(balance?.quacks)||0}},201);
 }
 return null;
}

export default{async fetch(req,env){const h=cors(req,env);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});const u=new URL(req.url);let r;try{if(u.pathname==="/api/health"&&req.method==="GET")r=reply({ok:true,service:"duck-quack-api",version:1});else if(u.pathname==="/api/session"&&req.method==="POST")r=await bootstrap(req,env);else if(u.pathname==="/api/session/recover"&&req.method==="POST")r=await recover(req,env);else if(u.pathname.startsWith("/api/admin/"))r=await adminRoutes(req,env,u)||reply({error:"Not found."},404);else if(u.pathname==="/api/leaderboard"&&req.method==="GET"){if(!await limit(env,"leaderboard:"+ip(req),90,60))r=reply({error:"Leaderboard refresh limit reached."},429);else{const rows=await env.DB.prepare("SELECT l.player_id,l.username,COALESCE(g.quacks,0) AS quacks,l.lifetime_quacks,l.rebirths,l.updated_at,0 AS creator FROM leaderboard l LEFT JOIN player_game_state g ON g.player_id=l.player_id ORDER BY l.lifetime_quacks DESC,l.updated_at ASC LIMIT 100").all();const creator=await env.DB.prepare("SELECT p.player_id,p.username,9007199254740991 AS quacks,9007199254740991 AS lifetime_quacks,9007199254740991 AS rebirths,COALESCE(l.updated_at,0) AS updated_at,1 AS creator FROM creator_passkeys c JOIN players p ON p.player_id=c.player_id LEFT JOIN leaderboard l ON l.player_id=p.player_id WHERE c.slot=1 AND p.banned=0 LIMIT 1").first();const entries=(rows.results||[]).filter(x=>x.player_id!==creator?.player_id);if(creator)entries.unshift(creator);r=reply({entries});}}else{const p=await auth(req,env);if(!p)r=reply({error:"Valid anonymous player session required."},401);else if(u.pathname.startsWith("/api/game/"))r=await gameApi(req,env,p,u)||reply({error:"Not found."},404);else if(u.pathname==="/api/me"&&req.method==="GET")r=reply({player:{id:p.player_id,username:p.username}});else if(u.pathname==="/api/me"&&req.method==="POST"){const b=await readJson(req,512).catch(()=>null),n=username(b?.username);if(!n)r=reply({error:"Username must be 2-22 letters, numbers, spaces, _ or -, and cannot be reserved."},400);else if(!await limit(env,"rename:"+p.player_id,5,3600))r=reply({error:"Username changes are temporarily limited."},429);else{await env.DB.prepare("UPDATE players SET username=?,updated_at=? WHERE player_id=?").bind(n,Math.floor(Date.now()/1000),p.player_id).run();await env.DB.prepare("UPDATE leaderboard SET username=?,updated_at=? WHERE player_id=?").bind(n,Math.floor(Date.now()/1000),p.player_id).run();r=reply({player:{id:p.player_id,username:n}});}}else if(u.pathname==="/api/chat"&&req.method==="GET"){if(!await limit(env,"chatread:"+p.player_id,60,60))r=reply({error:"Chat refresh limit reached."},429);else{const since=Number(u.searchParams.get("since")||0);const rows=Number.isFinite(since)&&since>0?await env.DB.prepare("SELECT message_id AS id,player_id AS playerId,username,body AS text,created_at AS createdAt FROM chat_messages WHERE created_at > ? ORDER BY created_at ASC LIMIT 100").bind(Math.floor(since)).all():await env.DB.prepare("SELECT message_id AS id,player_id AS playerId,username,body AS text,created_at AS createdAt FROM chat_messages ORDER BY created_at DESC LIMIT 50").all();r=reply({messages:since>0?(rows.results||[]):(rows.results||[]).reverse()});}}else if(u.pathname==="/api/chat"&&req.method==="POST"){const b=await readJson(req,2048).catch(()=>null),text=typeof b?.text==="string"?b.text.normalize("NFKC").trim():"";if(!text||text.length>280)r=reply({error:"Message must be 1-280 characters."},400);else if(!await limit(env,"chat:"+p.player_id,8,10)||!await limit(env,"chatip:"+ip(req),30,10))r=reply({error:"Chat rate limit reached."},429);else{const id=random(16),createdAt=Math.floor(Date.now()/1000),m={id,playerId:p.player_id,username:p.username,text,createdAt};await env.DB.prepare("INSERT INTO chat_messages(message_id,player_id,username,body,created_at) VALUES(?,?,?,?,?)").bind(id,p.player_id,p.username,text,createdAt).run();await env.DB.prepare("DELETE FROM chat_messages WHERE created_at < ?").bind(createdAt-2592000).run();r=reply({message:m},201);}}else r=reply({error:"Not found."},404);}}catch(e){r=reply({error:e?.message==="body-too-large"?"Request body too large.":"Internal server error."},e?.message==="body-too-large"?413:500);}const out=new Headers(r.headers);for(const[k,v]of Object.entries(h))out.set(k,v);return new Response(r.body,{status:r.status,headers:out});}};
export class RateLimiter{constructor(state){this.state=state;}async fetch(req){const {max,seconds}=await req.json(),now=Math.floor(Date.now()/1000);let b=await this.state.storage.get("b");if(!b||now-b.start>=seconds)b={start:now,count:0};b.count++;await this.state.storage.put("b",b);return reply({allowed:b.count<=max},b.count<=max?200:429);}}

