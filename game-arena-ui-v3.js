/* 竞技界面与现有房间中继的适配层。 */
async function v3StartHost(){
  const per=LOBBY.mode==='2v2'?2:1,sides=[0,1].map(s=>LOBBY.players.filter(p=>p.side===s));
  if(sides.some(ps=>ps.length!==per)){toast(per===2?'2v2 需要双方各两位玩家或 AI':'1v1 需要双方各一位玩家');return;}
  try{
    const players=LOBBY.players.map(p=>({id:p.pid,name:p.name,side:p.side,ai:p.ai,cards:selectedCards(p).map(n=>{
      const card=byNum(n),cfg=p.loadout?.[n]||{skills:[0,1,2,3],item:null};
      if(!card)throw Error('队伍含未知妖怪');
      return {...card,selectedSkills:cfg.skills,item:cfg.item};
    })}));
    const arena=LanglangArena.create(players);
    B={v3:true,online:true,arena,over:false};NET._v3choice=null;NET._v3ended=false;NET._v3view=null;NET._v3animTurn=null;
    scr('battle');LanglangArena.advance(arena);
    await Promise.all(LOBBY.players.filter(p=>!p.ai&&p.pid!==NET.pid).map(p=>sendTo(p.pid,{t:'v3start',side:p.side,code:NET.code})));
    v3Publish();NET._v3timer=setInterval(v3Tick,1000);
  }catch(e){toast('无法开始对战：'+e.message);}
}
function v3StartGuest(d){
  NET.mySide=d.side;NET.code=d.code;NET._v3choice=null;NET._v3ended=false;NET._v3view=null;NET._v3animTurn=null;NET._v3pending=null;
  B={v3:true,online:true,netGuest:true,over:false};scr('battle');
  v3SaveGuestSession();
  $('#bt-arena').innerHTML='<div class="resolving">正在进入竞技对战…</div>';$('#bt-menu').innerHTML='';
  if(NET._v3timer)clearInterval(NET._v3timer);NET._v3timer=setInterval(v3GuestTick,1000);
}
function v3Receive(d){
  if(!B||!B.v3||!d.view||(NET._v3view&&d.view.revision<NET._v3view.revision))return;
  NET._v3view=d.view;
  if(d.view.battle.commands[NET.pid]||(NET._v3pending&&(NET._v3pending.turn!==d.view.battle.turn||NET._v3pending.phase!==d.view.battle.phase)))NET._v3pending=null;
  v3Render(d.view);
}
function v3SaveGuestSession(){
  if(NET.isHost||!NET.code||!NET.pid||!B||!B.v3||B.over)return;
  try{sessionStorage.setItem('lls_arena_guest_v3',JSON.stringify({code:NET.code,pid:NET.pid,side:NET.mySide,cursor:NET._lastId||0,ts:Date.now()}));}catch(_){}
}
function v3ClearGuestSession(){try{sessionStorage.removeItem('lls_arena_guest_v3');}catch(_){}}
function v3SaveHostSession(){
  if(!NET.isHost||!B||!B.v3||!B.arena||B.over||!LOBBY)return;
  try{sessionStorage.setItem('lls_arena_host_v3',JSON.stringify({code:NET.code,cursor:NET._lastId||0,arena:B.arena,lobby:LOBBY,ts:Date.now()}));}catch(e){console.error('无法保存对战恢复状态',e);}
}
function v3ClearHostSession(){try{sessionStorage.removeItem('lls_arena_host_v3');}catch(_){}}
function v3ResumeHost(){
  let saved;try{saved=JSON.parse(sessionStorage.getItem('lls_arena_host_v3'));}catch(_){return;}
  if(!saved||!G||!saved.arena||!saved.lobby){toast('未找到可以恢复的对战');return;}
  netInit(ok=>{if(!ok)return;
    const now=Date.now(),gap=Math.max(0,now-saved.ts);
    NET.code=saved.code;NET.pid=HOST_PID;NET.isHost=true;NET.peer={relay:true};NET.conns=[];NET._lastId=saved.cursor||0;NET._busy=false;NET._v3ended=false;NET._v3view=null;
    LOBBY=saved.lobby;B={v3:true,online:true,arena:saved.arena,over:false};
    LOBBY.players.filter(p=>!p.ai&&p.pid!==HOST_PID).forEach(p=>hostConn(p.pid));
    if(gap>=60000){B.arena.battle.phase='over';B.arena.battle.winner=1-(LOBBY.players.find(p=>p.pid===HOST_PID)?.side||0);}
    else if(!Object.keys(B.arena.battle.clock.disconnected).length)B.arena.battle.clock.deadline+=gap;
    scr('battle');relayLoop();relayHeartbeat();boardPublish({code:NET.code,mode:LOBBY.mode,count:LOBBY.players.filter(p=>!p.ai).length});v3Publish();
    if(!B.over)NET._v3timer=setInterval(v3Tick,1000);
  });
}
function v3RelayError(){if(B&&B.v3&&!B.over&&!NET._relayBadSince)NET._relayBadSince=Date.now();}
function v3RelayOk(){
  NET._lastPollOk=Date.now();
  if(!NET._relayBadSince)return;
  NET._relayBadSince=0;
  if(!B||!B.v3||B.over)return;
  if(NET.isHost&&B.arena&&B.arena.battle.clock.disconnected[HOST_PID]!==undefined)v3Reconnect(HOST_PID);
  if(!NET.isHost&&NET._networkPaused){NET._networkPaused=false;relaySend('host',{t:'v3resume',pid:NET.pid});if(NET._v3view)v3Render(NET._v3view);}
}
function v3CheckHostHeartbeat(row){
  if(!B||!B.v3||NET.isHost||B.over||!row?.updated_at)return;
  const age=Date.now()-new Date(row.updated_at).getTime(),offline=age>=20000;
  if(offline!==!!NET._hostOffline){NET._hostOffline=offline;if(NET._v3view)v3Render(NET._v3view);}
  if(age>=80000&&!NET._networkPaused&&NET._lastPollOk&&Date.now()-NET._lastPollOk<10000)v3EndGuest({winner:NET.mySide,side:NET.mySide});
}
function v3ResumeGuest(){
  let old;try{old=JSON.parse(sessionStorage.getItem('lls_arena_guest_v3'));}catch(_){return;}
  if(!old||!G||!old.code||!old.pid){toast('未找到可以恢复的对战');return;}
  netInit(ok=>{if(!ok)return;
    NET.code=old.code;NET.pid=old.pid;NET.isHost=false;NET.mySide=old.side;NET.peer={relay:true};NET.host={open:true,send:m=>relaySend('host',m)};
    NET.conns=[];NET._lastId=old.cursor||0;NET._busy=false;NET._v3view=null;NET._v3choice=null;NET._v3ended=false;
    B={v3:true,online:true,netGuest:true,over:false};scr('battle');$('#bt-arena').innerHTML='<div class="resolving">正在恢复对战…</div>';$('#bt-menu').innerHTML='';
    relayLoop();relayHeartbeat();relaySend('host',{t:'v3resume',pid:NET.pid});
    NET._v3timer=setInterval(v3GuestTick,1000);
  });
}
function v3Publish(){
  if(!B||!B.v3||!B.arena)return;
  const a=B.arena;
  v3SaveHostSession();
  for(const p of LOBBY.players){
    if(p.ai)continue;
    const view=LanglangArena.view(a,p.pid);
    if(p.pid===NET.pid){NET._v3view=view;v3Render(view);}
    else sendTo(p.pid,{t:'v3snap',view});
  }
  if(a.battle.phase==='over')v3Finish();
}
function v3Command(pid,cmd,turn,phase){
  if(!B||!B.v3||!B.arena||B.over)return;
  if(turn!==undefined&&(turn!==B.arena.battle.turn||phase!==B.arena.battle.phase)){v3Publish();return;}
  LanglangArena.command(B.arena,pid,cmd);v3Publish();
}
function v3Disconnect(pid){
  if(LanglangArena.disconnect(B.arena,pid)){toast('玩家已断线，等待重连');v3Publish();}
}
function v3Reconnect(pid){
  if(LanglangArena.reconnect(B.arena,pid)){toast('玩家已重新连接');v3Publish();}
}
function v3Tick(){
  if(!B||!B.v3||!B.arena||B.over)return;
  const before=B.arena.revision;
  if(NET._relayBadSince&&Date.now()-NET._relayBadSince>=6000&&B.arena.battle.clock.disconnected[HOST_PID]===undefined)LanglangArena.disconnect(B.arena,HOST_PID);
  const result=LanglangArena.tick(B.arena);
  if(B.arena.revision!==before||result==='forfeit')v3Publish();
  else v3UpdateClock(NET._v3view);
  v3SaveHostSession();
}
function v3GuestTick(){
  if(!B||!B.v3||B.over)return;
  if(NET._relayBadSince&&Date.now()-NET._relayBadSince>=6000&&!NET._networkPaused){NET._networkPaused=true;if(NET._v3view)v3Render(NET._v3view);}
  v3UpdateClock(NET._v3view);
}
function v3UpdateClock(view){
  const el=$('#v3-clock');if(!el||!view)return;
  if(NET._networkPaused){el.textContent='网络连接中断';return;}
  if(NET._hostOffline){el.textContent='等待房主重连';return;}
  const b=view.battle,ids=Object.keys(b.clock.disconnected);
  const until=ids.length?Math.min(...ids.map(id=>b.clock.disconnected[id]+60000)):b.clock.deadline;
  el.textContent=ids.length?`等待重连 ${Math.max(0,Math.ceil((until-Date.now())/1000))} 秒`:`剩余 ${Math.max(0,Math.ceil((until-Date.now())/1000))} 秒`;
}
function v3Finish(){
  if(NET._v3ended||!B||!B.arena)return;
  NET._v3ended=true;B.over=true;v3ClearHostSession();if(NET._v3timer)clearInterval(NET._v3timer);boardUnpublish(NET.code);
  const winner=B.arena.battle.winner;
  for(const p of LOBBY.players)if(!p.ai&&p.pid!==NET.pid)sendTo(p.pid,{t:'v3end',winner,side:p.side});
  const me=LOBBY.players.find(p=>p.pid===NET.pid);v3ShowResult(winner,me.side);
}
function v3EndGuest(d){if(NET._v3ended)return;NET._v3ended=true;v3ClearGuestSession();if(NET._v3timer)clearInterval(NET._v3timer);if(B)B.over=true;v3ShowResult(d.winner,d.side);}
function v3ShowResult(winner,side){
  const draw=winner===null,win=winner===side,reward=draw?80:win?150:40;
  $('#res-title').textContent=draw?'平局':win?'胜利！':'败北…';$('#res-title').className='res-t '+(win?'':'lose');
  $('#res-lines').innerHTML=`<div>${draw?'双方同时失去战斗能力':winner===0?'蓝方获胜':'红方获胜'}</div><div>山核桃 +${reward}</div>`;
  G.coin+=reward;save();NET._done=true;ovl('ovl-result',true);
}
function v3EventText(event,b){
  const name=id=>{const p=b.players.find(p=>p.id===id);if(!p)return id;const same=b.players.filter(x=>x.side===p.side);return `${p.side===0?'蓝方':'红方'}${same.length>1?same.indexOf(p)+1:''}·${p.name}`;};
  if(event.kind==='hit')return `${name(event.actor)} 使用 ${event.skill}，对 ${name(event.target)} 造成 ${event.damage} 点伤害${event.effectiveness>1?'（克制）':''}`;
  if(event.kind==='miss')return `${name(event.actor)} 的 ${event.skill} 未命中`;
  if(event.kind==='switch')return `${name(event.player)} 派出了 ${byNum(event.num).name}`;
  if(event.kind==='item')return `${name(event.target)} 的 ${LanglangRules.ITEMS[event.item]?.name||'道具'} 生效${event.healed?'，恢复 '+event.healed+' 体力':''}`;
  if(event.kind==='status')return `${name(event.player)} 受到 ${event.effect==='burn'?'灼烧':'中毒'}伤害 ${event.damage}`;
  if(event.kind==='effect')return `${event.actor} 的技能效果生效`;
  return '';
}
function v3Render(view){
  if(!view||!B||!B.v3)return;
  const b=view.battle,me=b.players.find(p=>p.id===NET.pid);if(!me)return;
  const mine=b.players.filter(p=>p.side===me.side),foes=b.players.filter(p=>p.side!==me.side),active=p=>p.team[p.active];
  const current=active(me),key=`${b.turn}:${b.phase}:${current.num}`;
  if(!NET._v3choice||NET._v3choice.key!==key)NET._v3choice={key,index:null,target:null};
  const choice=NET._v3choice,skill=choice.index===null?null:current.skills[choice.index],paused=Object.keys(b.clock.disconnected).length>0||NET._networkPaused||NET._hostOffline;
  const targetType=skill?.target,eligible=targetType==='foe'?foes:targetType==='ally'?mine:[],living=eligible.filter(p=>active(p).hp>0);
  if(living.length===1)choice.target=living[0].id;
  if(choice.target&&!living.some(p=>p.id===choice.target))choice.target=null;
  const canTarget=b.phase==='select'&&!b.commands[me.id]&&!paused&&!!skill&&(targetType==='foe'||targetType==='ally');
  const playerLabel=p=>p.id===me.id?'你':p.side===me.side?`队友${mine.length>1?' '+(mine.indexOf(p)+1):''}`:`对手 ${foes.indexOf(p)+1}`;
  const slot=p=>{const m=active(p),targetable=canTarget&&eligible.includes(p)&&m.hp>0,selected=targetable&&choice.target===p.id;
    return `<div class="dslot ${p.id===me.id?'me':''} ${m.hp<=0?'dead':''} ${targetable?'target-available':''} ${selected?'target-selected':''}" data-v3player="${escapeHTML(p.id)}" ${targetable?`data-v3target="${escapeHTML(p.id)}" role="button" tabindex="0" aria-pressed="${selected}"`:''}>
      <img class="dcard" src="cards/${m.num}.jpg" alt=""><div class="dinfo"><div class="dname">${escapeHTML(m.name)} · ${LanglangRules.TYPES[m.type]}</div>
      <div class="bar hp ${hpBarCls(m.hp,m.stats.hp)}"><i style="width:${Math.max(0,m.hp/m.stats.hp*100)}%"></i></div>
      <div class="dsub">HP ${m.hp}/${m.stats.hp} · Lv${m.level}</div><div class="downer">${playerLabel(p)} · ${escapeHTML(p.name)} · ${escapeHTML(LanglangRules.ITEMS[m.item]?.name||'无道具')}${m.itemUsed?'（已触发）':''}</div>
      ${targetable?`<div class="target-label">${selected?'✓ 已选目标':'点击选择目标'}</div>`:''}</div></div>`;};
  const arena=$('#bt-arena');arena.innerHTML=`<div class="bt-hud"><span class="vn">${me.side===0?'蓝方':'红方'} · 竞技对战</span><span class="tn">回合 ${b.turn}</span><span id="v3-clock"></span></div><div class="duel-row duel-foes">${foes.map(slot).join('')}</div><div class="duel-row duel-mine">${mine.map(slot).join('')}</div>`;
  const last=view.history[view.history.length-1];
  if(last&&NET._v3animTurn!==last.turn){
    NET._v3animTurn=last.turn;
    for(const event of last.events)if(event.kind==='hit'){
      arena.querySelectorAll('[data-v3player]').forEach(el=>{if(el.dataset.v3player===event.actor)el.classList.add('v3-actor');if(el.dataset.v3player===event.target)el.classList.add('v3-hit');});
    }
  }
  arena.querySelectorAll('[data-v3target]').forEach(el=>{
    const choose=()=>{choice.target=el.dataset.v3target;v3Render(view);$('#scr-battle').scrollTop=0;};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
  });
  const lines=view.history.slice(-2).flatMap(x=>x.events.map(e=>v3EventText(e,b)).filter(Boolean).map(t=>`<div>${escapeHTML(t)}</div>`));
  const status=b.players.map(p=>`${playerLabel(p)} ${b.commands[p.id]?'✓ 已选':active(p).hp<=0?'已倒下':'选择中'}`).join(' · ');
  let ui='';
  if(b.phase==='over')ui='<div class="rm-wait">对战结束</div>';
  else if(paused)ui='<div class="rm-wait">连接中断，对战已暂停，等待重连</div>';
  else if(b.phase==='replace'){
    const needs=current.hp<=0&&me.team.some(m=>m.hp>0);
    ui=needs?`<div class="choice-panel">你的妖怪倒下了，请选择替补；超时自动派出第一只存活妖怪。</div><div class="sublist">${me.team.map((m,i)=>m.hp>0?`<button class="row" data-v3replace="${i}">${escapeHTML(m.name)} · HP ${m.hp}/${m.stats.hp}</button>`:'').join('')}</div>`:'<div class="rm-wait">等待其他玩家选择替补…</div>';
  }else if(current.hp<=0)ui='<div class="rm-wait">你的妖怪已全部倒下，等待队友继续对战。</div>';
  else if(b.commands[me.id]){
    const cmd=b.commands[me.id],selected=cmd.kind==='move'?current.skills[cmd.index]?.name:cmd.kind==='switch'?`换上 ${me.team[cmd.index]?.name}`:'奋力一击';
    const target=cmd.target&&b.players.find(p=>p.id===cmd.target);
    ui=`<div class="rm-wait">已提交：${escapeHTML(selected||'行动')}${target?' → '+escapeHTML(active(target).name):''}<br>等待其他玩家…</div>`;
  }
  else if(NET._v3pending)ui='<div class="rm-wait">正在提交行动…</div>';
  else{
    const targetName=targetType==='self'?current.name:targetType==='foes'?'对方全体':choice.target?active(b.players.find(p=>p.id===choice.target)).name:'请选择目标';
    const ready=skill&&((targetType!=='foe'&&targetType!=='ally')||choice.target);
    ui=`<div class="choice-panel" aria-live="polite">${skill?`已选 <b>${escapeHTML(skill.name)}</b> · 目标 <b>${escapeHTML(targetName)}</b>`:'选择技能，再选择目标。'}<div class="choice-actions"><button class="btn btn-gold choice-confirm" id="v3-confirm" ${ready?'':'disabled'}>确认出招</button></div></div>
      <div class="skill-grid">${current.skills.map((s,i)=>`<button class="skill-card ${i===choice.index?'selected-skill':''}" data-v3move="${i}" aria-pressed="${i===choice.index}" ${current.pp[i]<=0?'disabled':''}><span class="skill-info"><b>${escapeHTML(s.name)}</b><span class="skill-desc">${escapeHTML(s.description||'')}</span><span class="skill-cost">PP ${current.pp[i]}/${s.pp} · ${s.power?'威力 '+s.power:'辅助'}</span><span class="skill-availability">${current.pp[i]<=0?'次数耗尽':i===choice.index?'✓ 已选择':'可选择'}</span></span></button>`).join('')}</div>
      ${current.pp.every(n=>n<=0)?'<button class="btn btn-red" id="v3-struggle">奋力一击 · 消耗少量自身体力</button>':''}
      <details class="choice-panel"><summary>替换妖怪 · 消耗本回合行动</summary>${me.team.map((m,i)=>i!==me.active&&m.hp>0?`<button class="row" data-v3switch="${i}">${escapeHTML(m.name)} · HP ${m.hp}/${m.stats.hp}</button>`:'').join('')}</details>`;
  }
  const menu=$('#bt-menu');menu.innerHTML=`<div class="pick-status">${status}</div><div class="log-heading">战况速报</div><div class="bt-log">${lines.join('')||'对战开始！'}</div>${ui}`;
  function send(cmd){
    if(NET.isHost){v3Command(NET.pid,cmd,b.turn,b.phase);return;}
    if(NET._v3pending)return;
    const pending={turn:b.turn,phase:b.phase};NET._v3pending=pending;v3Render(view);
    sendTo(null,{t:'v3cmd',cmd,turn:b.turn,phase:b.phase});
    setTimeout(()=>{if(NET._v3pending===pending){NET._v3pending=null;if(NET._v3view)v3Render(NET._v3view);toast('尚未收到确认，请重试');}},6000);
  }
  menu.querySelectorAll('[data-v3move]').forEach(el=>el.addEventListener('click',()=>{choice.index=+el.dataset.v3move;choice.target=null;v3Render(view);$('#scr-battle').scrollTop=0;}));
  menu.querySelectorAll('[data-v3replace]').forEach(el=>el.addEventListener('click',()=>send({kind:'replace',index:+el.dataset.v3replace})));
  menu.querySelectorAll('[data-v3switch]').forEach(el=>el.addEventListener('click',()=>send({kind:'switch',index:+el.dataset.v3switch})));
  const confirm=$('#v3-confirm');if(confirm)confirm.addEventListener('click',()=>{if(!skill)return;const cmd={kind:'move',index:choice.index};if(choice.target)cmd.target=choice.target;send(cmd);});
  const struggle=$('#v3-struggle');if(struggle)struggle.addEventListener('click',()=>send({kind:'struggle'}));
  v3UpdateClock(view);
}
try{
  const host=JSON.parse(sessionStorage.getItem('lls_arena_host_v3')),guest=JSON.parse(sessionStorage.getItem('lls_arena_guest_v3'));
  const saved=host||guest;
  if(saved&&G&&Date.now()-saved.ts<120000){const button=$('#bt-resume-arena');button.style.display='';button.addEventListener('click',host?v3ResumeHost:v3ResumeGuest);}
}catch(_){}
