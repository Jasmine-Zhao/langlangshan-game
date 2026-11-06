/* 竞技界面与现有房间中继的适配层。 */
function v3BenchCards(team,active,choice,forced){
  const cards=team.map((m,i)=>{const disabled=i===active||m.hp<=0,selected=choice.bench===i;
    return `<button type="button" class="bench-card ${selected?'selected':''}" data-bench="${i}" aria-pressed="${selected}" ${disabled?'disabled':''}><img src="cards/${m.num}.jpg" alt=""><b>${escapeHTML(m.name)}</b><div class="bar hp ${hpBarCls(m.hp,m.stats.hp)}"><i style="width:${Math.max(0,m.hp/m.stats.hp*100)}%"></i></div><div>HP ${m.hp}/${m.stats.hp}</div><div>${m.hp<=0?'已倒下':i===active?'当前出战':selected?'已选择':'可上场'}</div></button>`;
  }).join('');
  return `<div class="bench-grid">${cards}</div><button type="button" class="btn btn-gold choice-confirm" id="bench-confirm" ${Number.isInteger(choice.bench)&&choice.bench!==active&&team[choice.bench]?.hp>0?'':'disabled'}>确认替换</button>`;
}
function v3BindBench(menu,choice,render,submit){
  const details=menu.querySelector('#bench-picker');if(details)details.addEventListener('toggle',()=>{choice.benchOpen=details.open;});
  menu.querySelectorAll('[data-bench]').forEach(el=>el.addEventListener('click',()=>{choice.bench=+el.dataset.bench;choice.benchOpen=true;render();}));
  const confirm=menu.querySelector('#bench-confirm');if(confirm)confirm.addEventListener('click',()=>submit(choice.bench));
}
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
    B={v3:true,online:true,arena,over:false};NET._v3choice=null;NET._v3ended=false;NET._v3view=null;v3ResetFx();
    scr('battle');LanglangArena.advance(arena);
    await Promise.all(LOBBY.players.filter(p=>!p.ai&&p.pid!==NET.pid).map(p=>sendTo(p.pid,{t:'v3start',side:p.side,code:NET.code})));
    v3Publish();NET._v3timer=setInterval(v3Tick,1000);
  }catch(e){toast('无法开始对战：'+e.message);}
}
function v3StartGuest(d){
  NET.mySide=d.side;NET.code=d.code;NET._v3choice=null;NET._v3ended=false;NET._v3view=null;NET._v3pending=null;v3ResetFx();
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
    LOBBY=saved.lobby;B={v3:true,online:true,arena:saved.arena,over:false,left:(saved.arena.left||[]).includes(HOST_PID)};v3ResetFx();
    LOBBY.players.filter(p=>!p.ai&&p.pid!==HOST_PID).forEach(p=>hostConn(p.pid));
    if(gap>=60000){B.arena.battle.phase='over';B.arena.battle.winner=1-(LOBBY.players.find(p=>p.pid===HOST_PID)?.side||0);B.arena.endReason='forfeit';}
    else if(!Object.keys(B.arena.battle.clock.disconnected).length)B.arena.battle.clock.deadline+=gap;
    if(B.left){tab='map';enterHub();}else scr('battle');relayLoop();relayHeartbeat();boardPublish({code:NET.code,mode:LOBBY.mode,count:LOBBY.players.filter(p=>!p.ai).length});v3Publish();
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
    B={v3:true,online:true,netGuest:true,over:false};v3ResetFx();scr('battle');$('#bt-arena').innerHTML='<div class="resolving">正在恢复对战…</div>';$('#bt-menu').innerHTML='';
    relayLoop();relayHeartbeat();relaySend('host',{t:'v3resume',pid:NET.pid});
    NET._v3timer=setInterval(v3GuestTick,1000);
  });
}
function v3Publish(){
  if(!B||!B.v3||!B.arena)return;
  const a=B.arena;
  v3SaveHostSession();
  for(const p of LOBBY.players){
    if(p.ai||(a.left||[]).includes(p.pid))continue;
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
function v3FxDone(turn){
  if(!B||!B.v3||B.over)return;
  if(NET.isHost){if(B.arena&&LanglangArena.ackPlayback(B.arena,NET.pid,turn))v3Publish();}
  else sendTo(null,{t:'v3fxdone',turn});
}
function v3FxAck(pid,turn){if(B&&B.v3&&B.arena&&LanglangArena.ackPlayback(B.arena,pid,turn))v3Publish();}
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
  if(view.playback||NET._v3fxState?.active){el.textContent='回合结算中';return;}
  const b=view.battle,ids=Object.keys(b.clock.disconnected);
  const until=ids.length?Math.min(...ids.map(id=>b.clock.disconnected[id]+60000)):b.clock.deadline;
  el.textContent=ids.length?`等待重连 ${Math.max(0,Math.ceil((until-Date.now())/1000))} 秒`:`剩余 ${Math.max(0,Math.ceil((until-Date.now())/1000))} 秒`;
}
function v3Finish(){
  if(NET._v3ended||!B||!B.arena)return;
  NET._v3ended=true;B.over=true;v3ClearHostSession();if(NET._v3timer)clearInterval(NET._v3timer);boardUnpublish(NET.code);
  const winner=B.arena.battle.winner;
  for(const p of LOBBY.players)if(!p.ai&&p.pid!==NET.pid&&!(B.arena.left||[]).includes(p.pid))sendTo(p.pid,{t:'v3end',winner,side:p.side,view:LanglangArena.view(B.arena,p.pid)});
  if(B.left){const session=B;setTimeout(()=>{if(B===session){netCleanup();B=null;renderHub();toast('队友的对战已结束');}},30000);return;}
  const me=LOBBY.players.find(p=>p.pid===NET.pid);v3FinalFx(()=>v3ShowResult(winner,me.side));
}
function v3LeaveDefeated(){
  if(!B||!B.v3||B.over||!NET._v3view)return;
  const me=NET._v3view.battle.players.find(p=>p.id===NET.pid);
  if(!me||NET._v3view.battle.players.length!==4||me.team.some(m=>m.hp>0))return;
  const host=NET.isHost;
  if(!window.confirm(host?'离开后放弃本场奖励。作为房主，请保持本页面打开，队友才能继续比赛。确定离开？':'离开后放弃本场奖励，队友继续比赛。确定离开？'))return;
  if(host){
    if(!LanglangArena.leave(B.arena,NET.pid))return;
    B.left=true;if(NET._v3fxState?.token)NET._v3fxState.token.cancelled=true;
    v3Publish();tab='map';enterHub();toast('已离开对战，请保持页面打开');
  }else{
    NET._v3leaving=true;sendTo(null,{t:'v3leave'});toast('正在退出对战…');
    const session=B;setTimeout(()=>{if(B===session&&NET._v3leaving){NET._v3leaving=false;toast('退出未确认，请重试');}},8000);
  }
}
function v3LeaveAck(){
  if(!B||!B.v3||!NET._v3leaving)return;
  NET._v3leaving=false;if(NET._v3fxState?.token)NET._v3fxState.token.cancelled=true;
  netCleanup();B=null;tab='map';enterHub();toast('已离开对战，本场奖励已放弃');
}
function v3EndGuest(d){if(NET._v3ended)return;if(d.view)v3Receive({view:d.view});NET._v3ended=true;v3ClearGuestSession();if(NET._v3timer)clearInterval(NET._v3timer);if(B)B.over=true;if(d.view)v3FinalFx(()=>v3ShowResult(d.winner,d.side));else v3ShowResult(d.winner,d.side);}
function v3FinalFx(result){
  const view=NET._v3view,session=B;
  v3ResetFx();
  NET._v3fxState.lastTurn=(view?.history||[]).slice(-1)[0]?.turn??null;
  if(!view||!session||view.endReason==='forfeit'){result();return;}
  v3Render(view);
  const arena=$('#bt-arena'),menu=$('#bt-menu'),entry=(view.history||[]).slice(-1)[0];
  const events=entry?.events||[],i=v3FinalEventIndex(events);
  const token={cancelled:false};let done=false;
  const finish=()=>{if(done)return;done=true;token.cancelled=true;clearTimeout(timer);if(B===session){v3Render(view);result();}};
  const timer=setTimeout(finish,4500);
  const skip=document.createElement('button');skip.className='btn btn-ghost';skip.textContent='跳过动画';skip.addEventListener('click',finish);menu.appendChild(skip);
  if(i<0){finish();return;}
  const before=i>0&&events[i-1].scene?events[i-1].scene:entry.before;
  Promise.resolve(LanglangFX.play(arena,LanglangFX.plan(view.battle,[events[i]]),{token,before})).then(finish,finish);
}
function v3FinalEventIndex(events){
  for(let i=events.length-1;i>=0;i--){const e=events[i],id=e.kind==='hit'?e.target:(e.kind==='status'||e.kind==='recoil')?e.player:null;if(id&&e.scene?.some(m=>m.id===id&&m.hp<=0))return i;}
  for(let i=events.length-1;i>=0;i--)if(['hit','status','recoil'].includes(events[i].kind))return i;
  return -1;
}
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
function v3ResetFx(){
  if(NET._v3fxState?.token)NET._v3fxState.token.cancelled=true;
  NET._v3fxState={active:false,queue:[],lastTurn:null,token:null,result:null};
}
function v3AfterFx(result){
  const state=NET._v3fxState;
  if(state&&state.active)state.result=result;else result();
}
function v3QueueFx(view,arena){
  const state=NET._v3fxState||(v3ResetFx(),NET._v3fxState),history=view.history||[];
  const entries=state.lastTurn===null?history.slice(-1):history.filter(item=>item.turn>state.lastTurn);
  for(const item of entries){state.queue.push({item,battle:view.battle});state.lastTurn=item.turn;}
  if(state.active||!state.queue.length)return;
  const session=B;state.active=true;
  (async()=>{
    while(state.queue.length&&NET._v3fxState===state&&B===session){
      const {item,battle}=state.queue.shift(),token={cancelled:false};state.token=token;
      try{await LanglangFX.play(arena,LanglangFX.plan(battle,item.events),{token,before:item.before});}
      catch(e){console.error('战斗特效播放失败',e);}
      if(!token.cancelled&&NET._v3fxState===state&&B===session)v3FxDone(item.turn);
    }
    if(NET._v3fxState!==state||B!==session)return;
    state.active=false;state.token=null;
    if(NET._v3view)v3Render(NET._v3view);
    if(state.result){const result=state.result;state.result=null;result();}
  })();
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
  let canTarget=b.phase==='select'&&!b.commands[me.id]&&!paused&&!!skill&&(targetType==='foe'||targetType==='ally');
  const playerLabel=p=>p.id===me.id?'你':p.side===me.side?`队友${mine.length>1?' '+(mine.indexOf(p)+1):''}`:`对手 ${foes.indexOf(p)+1}`;
  const slot=p=>{const m=active(p),targetable=canTarget&&eligible.includes(p)&&m.hp>0,selected=targetable&&choice.target===p.id;
    return `<div class="dslot ${p.id===me.id?'me':''} ${m.hp<=0?'dead':''} ${targetable?'target-available':''} ${selected?'target-selected':''}" data-v3player="${escapeHTML(p.id)}" data-v3hp="${m.hp}" data-v3max="${m.stats.hp}" ${targetable?`data-v3target="${escapeHTML(p.id)}" role="button" tabindex="0" aria-pressed="${selected}"`:''}>
      <img class="dcard" src="cards/${m.num}.jpg" alt=""><div class="dinfo"><div class="dname">${escapeHTML(m.name)} · ${LanglangRules.TYPES[m.type]}</div>
      <div class="bar hp ${hpBarCls(m.hp,m.stats.hp)}"><i style="width:${Math.max(0,m.hp/m.stats.hp*100)}%"></i></div>
      <div class="dsub">HP ${m.hp}/${m.stats.hp} · Lv${m.level}</div><div class="downer">${playerLabel(p)} · ${escapeHTML(p.name)} · ${escapeHTML(LanglangRules.ITEMS[m.item]?.name||'无道具')}${m.itemUsed?'（已触发）':''}</div>
      ${targetable?`<div class="target-label">${selected?'✓ 已选目标':'点击选择目标'}</div>`:''}</div></div>`;};
  const arena=$('#bt-arena');
  // 只刷新操作区，保留正在播放的场地；新的回合进入队列，不截断此前的表演。
  if(!NET._v3fxState?.active)arena.innerHTML=`<div class="bt-hud"><span class="vn">${me.side===0?'蓝方':'红方'} · 竞技对战</span><span class="tn">${view.playback?'回合 '+view.playback.turn+' 结算中':'回合 '+b.turn}</span><span id="v3-clock"></span></div><div class="duel-row duel-foes">${foes.map(slot).join('')}</div><div class="duel-row duel-mine">${mine.map(slot).join('')}</div>`;
  v3QueueFx(view,arena);
  const playing=!!view.playback||!!NET._v3fxState?.active; if(playing)canTarget=false;
  arena.querySelectorAll('[data-v3player]').forEach(el=>{
    const p=b.players.find(x=>x.id===el.dataset.v3player),targetable=p&&canTarget&&eligible.includes(p)&&active(p).hp>0,selected=targetable&&choice.target===p.id;
    el.classList.toggle('target-available',!!targetable);el.classList.toggle('target-selected',!!selected);
    let label=el.querySelector('.target-label');
    if(targetable){
      el.dataset.v3target=p.id;el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-pressed',String(!!selected));
      if(!label){label=document.createElement('div');label.className='target-label';el.querySelector('.dinfo').appendChild(label);}label.textContent=selected?'✓ 已选目标':'点击选择目标';
      const choose=()=>{choice.target=p.id;v3Render(view);$('#scr-battle').scrollTop=0;};el.onclick=choose;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
    }else{delete el.dataset.v3target;el.removeAttribute('role');el.removeAttribute('tabindex');el.removeAttribute('aria-pressed');if(label)label.remove();el.onclick=null;el.onkeydown=null;}
  });
  const shownHistory=playing?view.history.slice(0,-1):view.history;
  const lines=shownHistory.slice(-2).flatMap(x=>x.events.map(e=>v3EventText(e,b)).filter(Boolean).map(t=>`<div>${escapeHTML(t)}</div>`));
  const status=playing?'回合结算中':b.players.map(p=>`${playerLabel(p)} ${b.commands[p.id]?'✓ 已选':active(p).hp<=0?'已倒下':'选择中'}`).join(' · ');
  let ui='';
  if(b.phase==='over')ui='<div class="rm-wait">对战结束</div>';
  else if(paused)ui='<div class="rm-wait">连接中断，对战已暂停，等待重连</div>';
  else if(playing)ui='<div class="rm-wait">回合结算中，等待播放完成…</div>';
  else if(b.players.length===4&&me.team.every(m=>m.hp<=0))ui=`<div class="choice-panel">你的妖怪已全部倒下，队友仍在战斗。可以继续观战，或离开并放弃本场奖励。<div class="choice-actions"><button class="btn btn-ghost" id="v3-leave-defeated" ${NET._v3leaving?'disabled':''}>${NET._v3leaving?'正在退出…':'离开对战'}</button></div></div>`;
  else if(b.phase==='replace'){
    const needs=current.hp<=0&&me.team.some(m=>m.hp>0);
    ui=needs?`<div class="choice-panel">你的妖怪倒下了，请选择替补，不消耗下一回合行动；超时自动选择。${v3BenchCards(me.team,me.active,choice,true)}</div>`:'<div class="rm-wait">等待其他玩家选择替补…</div>';
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
      <div class="skill-grid skill-grid-v3">${current.skills.map((s,i)=>`<button class="skill-card ${i===choice.index?'selected-skill':''}" data-v3move="${i}" aria-pressed="${i===choice.index}" ${current.pp[i]<=0?'disabled':''}><span class="skill-info"><b>${escapeHTML(s.name)}</b><span class="skill-desc">${escapeHTML(s.description||'')}</span><span class="skill-cost">PP ${current.pp[i]}/${s.pp}${s.power?' · 威力 '+s.power:''}</span><span class="skill-availability">${current.pp[i]<=0?'次数耗尽':i===choice.index?'✓ 已选择':'可选择'}</span></span></button>`).join('')}</div>
      ${current.pp.every(n=>n<=0)?'<button class="btn btn-red" id="v3-struggle">奋力一击 · 消耗少量自身体力</button>':''}
      <details class="choice-panel" id="bench-picker" ${choice.benchOpen?'open':''}><summary>替换妖怪 · 消耗本回合行动</summary>${v3BenchCards(me.team,me.active,choice,false)}</details>`;
  }
  const menu=$('#bt-menu');menu.innerHTML=`<div class="pick-status">${status}</div><div class="log-heading">战况速报</div><div class="bt-log">${lines.join('')||(playing?'正在播放本回合…':'对战开始！')}</div>${ui}`;
  function send(cmd){
    if(NET.isHost){v3Command(NET.pid,cmd,b.turn,b.phase);return;}
    if(NET._v3pending)return;
    const pending={turn:b.turn,phase:b.phase};NET._v3pending=pending;v3Render(view);
    sendTo(null,{t:'v3cmd',cmd,turn:b.turn,phase:b.phase});
    setTimeout(()=>{if(NET._v3pending===pending){NET._v3pending=null;if(NET._v3view)v3Render(NET._v3view);toast('尚未收到确认，请重试');}},6000);
  }
  menu.querySelectorAll('[data-v3move]').forEach(el=>el.addEventListener('click',()=>{choice.index=+el.dataset.v3move;choice.target=null;v3Render(view);$('#scr-battle').scrollTop=0;}));
  v3BindBench(menu,choice,()=>v3Render(view),index=>send({kind:b.phase==='replace'?'replace':'switch',index}));
  const confirm=$('#v3-confirm');if(confirm)confirm.addEventListener('click',()=>{if(!skill)return;const cmd={kind:'move',index:choice.index};if(choice.target)cmd.target=choice.target;send(cmd);});
  const struggle=$('#v3-struggle');if(struggle)struggle.addEventListener('click',()=>send({kind:'struggle'}));
  const leave=$('#v3-leave-defeated');if(leave)leave.addEventListener('click',v3LeaveDefeated);
  v3UpdateClock(view);
}
try{
  const host=JSON.parse(sessionStorage.getItem('lls_arena_host_v3')),guest=JSON.parse(sessionStorage.getItem('lls_arena_guest_v3'));
  const saved=host||guest;
  if(saved&&G&&Date.now()-saved.ts<120000){const button=$('#bt-resume-arena');button.style.display='';button.addEventListener('click',host?v3ResumeHost:v3ResumeGuest);}
}catch(_){}
