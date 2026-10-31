/* 巡山使用与竞技共用的回合规则；存档仍只保存在本机。 */
function v3StartSolo(stage,stageId,team){
  try{
    const own=team.map(m=>({...byNum(m.num),level:m.lvl,instanceId:m.id,selectedSkills:m.selectedSkills||[0,1,2,3]}));
    const foes=stage.foes.map(([num,level])=>({...byNum(num),level}));
    const battle=LanglangBattle.createBattle([{id:'you',name:'你',side:0,cards:own},{id:'wild',name:stage.wild?'野生妖怪':'山头对手',side:1,cards:foes}],{competitive:false,allowItems:true,canCatch:stage.wild});
    battle.players[0].team.forEach(mon=>{
      const saved=team.find(x=>x.id===mon.instanceId),pool=LanglangRules.skillPool(byNum(mon.num));
      mon.hp=Math.max(0,Math.min(mon.stats.hp,saved.hp));
      mon.pp=saved.selectedSkills.map((idx,i)=>Math.max(0,Math.min(mon.skills[i].pp,saved.skillPP?.[idx]??pool[idx].pp)));
    });
    B={v3solo:true,online:false,battle,stage,stageId,wild:stage.wild,tutorial:stageId==='tut',pTeam:team.map(wrap),eTeam:stage.foes.map(makeFoe).map(wrap),over:false,history:[],choice:null};
    coachHide();scr('battle');v3SoloRender();
    B.timer=setInterval(()=>{
      if(!B||!B.v3solo||B.over||B.tutorial)return;
      const result=LanglangBattle.tick(B.battle);
      if(result==='timeout'||result==='replacement_timeout')v3SoloAdvance();else v3SoloClock();
    },1000);
  }catch(e){toast('无法开始巡山：'+e.message);}
}
function v3SoloClock(){const el=$('#solo-clock');if(el&&B&&B.v3solo)el.textContent=B.tutorial?'入门试炼':`剩余 ${Math.max(0,Math.ceil((B.battle.clock.deadline-Date.now())/1000))} 秒`;}
function v3SoloAdvance(){
  if(!B||!B.v3solo||B.over)return;
  const battle=B.battle,enemy=battle.players[1],self=battle.players[0];
  if(battle.phase==='replace'&&LanglangBattle.active(enemy).hp<=0){const i=enemy.team.findIndex(m=>m.hp>0);if(i>=0)LanglangBattle.replace(battle,enemy.id,i);}
  if(battle.phase==='select'&&LanglangBattle.active(enemy).hp>0&&!battle.commands[enemy.id])LanglangBattle.select(battle,enemy.id,LanglangBattle.defaultCommand(enemy));
  if(LanglangBattle.isReady(battle)){
    const turn=battle.turn,events=LanglangBattle.resolve(battle);
    B.history.push({turn,events});B.history=B.history.slice(-4);B.choice=null;
    v3SyncSolo();
    if(battle.phase==='over'){v3SoloFinish();return;}
    if(battle.phase==='replace'&&LanglangBattle.active(enemy).hp<=0){const i=enemy.team.findIndex(m=>m.hp>0);if(i>=0)LanglangBattle.replace(battle,enemy.id,i);}
  }
  v3SoloRender();
}
function v3SyncSolo(){
  if(!B||!B.v3solo)return;
  B.battle.players[0].team.forEach(mon=>{
    const owned=monOf(mon.instanceId);if(!owned)return;owned.hp=mon.hp;
    const pool=LanglangRules.skillPool(byNum(mon.num));owned.skillPP=owned.skillPP||pool.map(s=>s.pp);
    owned.selectedSkills.forEach((idx,i)=>{owned.skillPP[idx]=mon.pp[i];});
  });
  save();
}
function v3SoloFinish(){
  if(!B||!B.v3solo||B.over)return;
  const battle=B.battle;clearInterval(B.timer);
  v3SyncSolo();
  if(battle.captured){
    const caught=mkMon(battle.captured.num,battle.captured.level),duplicate=G.roster.some(m=>m.num===caught.num);
    if(duplicate)G.items.expFruit=(G.items.expFruit||0)+1;else G.roster.push(caught);
    finishBattle({kind:'catch',mon:caught,duplicate});
  }else finishBattle({kind:battle.winner===0?'win':'lose'});
}
function v3SoloCommand(cmd){
  if(!B||!B.v3solo||B.over)return;
  const battle=B.battle;
  if(cmd.kind==='replace'){
    if(LanglangBattle.replace(battle,'you',cmd.index)){B.choice=null;v3SoloAdvance();}return;
  }
  if(cmd.kind==='item'){
    if(!G.items[cmd.item]){toast('道具不足');return;}
    const m=LanglangBattle.active(battle.players[0]);
    if(cmd.item==='pie'&&m.hp>=m.stats.hp){toast('体力已满');return;}
    if(cmd.item==='cleanse'&&!Object.keys(m.status).length){toast('没有需要解除的异常状态');return;}
  }
  if(!LanglangBattle.select(battle,'you',cmd))return;
  if(cmd.kind==='item'){G.items[cmd.item]--;save();}
  v3SoloAdvance();
}
function v3SoloRender(){
  if(!B||!B.v3solo||B.over)return;
  const battle=B.battle,me=battle.players[0],foe=battle.players[1],m=LanglangBattle.active(me),enemy=LanglangBattle.active(foe),key=`${battle.turn}:${battle.phase}:${m.num}`;
  if(!B.choice||B.choice.key!==key)B.choice={key,index:null};
  const choice=B.choice,skill=choice.index===null?null:m.skills[choice.index];
  const slot=(p,cls)=>{const x=LanglangBattle.active(p);return `<div class="dslot ${cls}" data-v3player="${p.id}"><img class="dcard" src="cards/${x.num}.jpg" alt=""><div class="dinfo"><div class="dname">${escapeHTML(x.name)} · ${LanglangRules.TYPES[x.type]}</div><div class="bar hp ${hpBarCls(x.hp,x.stats.hp)}"><i style="width:${x.hp/x.stats.hp*100}%"></i></div><div class="dsub">HP ${x.hp}/${x.stats.hp} · Lv${x.level}</div><div class="downer">${escapeHTML(p.name)}${Object.keys(x.status).length?' · '+Object.keys(x.status).map(k=>k==='burn'?'灼烧':'中毒').join('、'):''}</div></div></div>`;};
  const arena=$('#bt-arena');arena.innerHTML=`<div class="bt-hud"><span class="vn">${escapeHTML(B.stage.name)}</span><span class="tn">回合 ${battle.turn}</span><span id="solo-clock"></span></div><div class="duel-row duel-foes">${slot(foe,'')}</div><div class="duel-row duel-mine">${slot(me,'me')}</div>`;
  const last=B.history[B.history.length-1];
  if(last&&B.animTurn!==last.turn){B.animTurn=last.turn;for(const e of last.events)if(e.kind==='hit')arena.querySelectorAll('[data-v3player]').forEach(el=>{if(el.dataset.v3player===e.actor)el.classList.add('v3-actor');if(el.dataset.v3player===e.target)el.classList.add('v3-hit');});}
  const eventText=e=>{
    if(e.kind==='catch_failed')return '野生妖怪挣脱了葫芦，战斗继续。';
    if(e.kind==='heal')return `疗伤烧饼恢复 ${e.healed} 体力。`;
    if(e.kind==='cleanse')return '清心草解除了异常状态。';
    return v3EventText(e,battle);
  };
  const logs=B.history.slice(-2).flatMap(x=>x.events.map(eventText).filter(Boolean)).map(t=>`<div>${escapeHTML(t)}</div>`).join('');
  let ui='';
  if(battle.phase==='replace'){
    const needs=m.hp<=0&&me.team.some(x=>x.hp>0);
    ui=needs?`<div class="choice-panel">妖怪倒下了，请选择替补；超时自动选择。</div>${me.team.map((x,i)=>x.hp>0?`<button class="row" data-solo-replace="${i}">${escapeHTML(x.name)} · HP ${x.hp}/${x.stats.hp}</button>`:'').join('')}`:'<div class="rm-wait">等待替补上场…</div>';
  }else{
    const target=skill?(skill.target==='self'||skill.target==='ally'?m.name:skill.target==='foes'?'对方全体':enemy.name):'';
    ui=`${B.tutorial?'<div class="choice-panel">选择技能并确认。削弱野生妖怪后，可用葫芦收服。<button class="btn btn-ghost" id="solo-skip">跳过引导</button></div>':''}
      <div class="choice-panel" aria-live="polite">${skill?`已选 <b>${escapeHTML(skill.name)}</b> · 目标 <b>${escapeHTML(target)}</b>`:'选择一个可用技能。'}<div class="choice-actions"><button class="btn btn-gold choice-confirm" id="solo-confirm" ${skill?'':'disabled'}>确认出招</button></div></div>
      <div class="skill-grid">${m.skills.map((s,i)=>`<button class="skill-card ${i===choice.index?'selected-skill':''}" data-solo-move="${i}" aria-pressed="${i===choice.index}" ${m.pp[i]<=0?'disabled':''}><span class="skill-info"><b>${escapeHTML(s.name)}</b><span class="skill-desc">${escapeHTML(s.description||'')}</span><span class="skill-cost">PP ${m.pp[i]}/${s.pp} · ${s.power?'威力 '+s.power:'辅助'}</span><span class="skill-availability">${m.pp[i]<=0?'次数耗尽':i===choice.index?'✓ 已选择':'可选择'}</span></span></button>`).join('')}</div>
      ${m.pp.every(x=>x<=0)?'<button class="btn btn-red" id="solo-struggle">奋力一击 · 消耗少量自身体力</button>':''}
      <details class="choice-panel"><summary>替换妖怪 · 消耗本回合行动</summary>${me.team.map((x,i)=>i!==me.active&&x.hp>0?`<button class="row" data-solo-switch="${i}">${escapeHTML(x.name)} · HP ${x.hp}/${x.stats.hp}</button>`:'').join('')}</details>
      <details class="choice-panel"><summary>使用道具 · 消耗本回合行动</summary>
      ${B.wild?`<button class="row" data-solo-item="gourd" ${!G.items.gourd?'disabled':''}>收妖葫芦 ×${G.items.gourd||0} · 体力越低越容易收服</button>`:''}
      <button class="row" data-solo-item="pie" ${!G.items.pie?'disabled':''}>疗伤烧饼 ×${G.items.pie||0} · 恢复 30% 体力</button>
      <button class="row" data-solo-item="cleanse" ${!G.items.cleanse?'disabled':''}>清心草 ×${G.items.cleanse||0} · 解除异常状态</button></details>
      ${B.wild?'<button class="btn btn-ghost" id="solo-run">离开巡山</button>':''}`;
  }
  const menu=$('#bt-menu');menu.innerHTML=`<div class="log-heading">战况速报</div><div class="bt-log" role="log">${logs||'野生妖怪出现了！'}</div>${ui}`;
  menu.querySelectorAll('[data-solo-move]').forEach(el=>el.addEventListener('click',()=>{choice.index=+el.dataset.soloMove;v3SoloRender();$('#scr-battle').scrollTop=0;}));
  menu.querySelectorAll('[data-solo-replace]').forEach(el=>el.addEventListener('click',()=>v3SoloCommand({kind:'replace',index:+el.dataset.soloReplace})));
  menu.querySelectorAll('[data-solo-switch]').forEach(el=>el.addEventListener('click',()=>v3SoloCommand({kind:'switch',index:+el.dataset.soloSwitch})));
  menu.querySelectorAll('[data-solo-item]').forEach(el=>el.addEventListener('click',()=>v3SoloCommand({kind:'item',item:el.dataset.soloItem})));
  const confirm=$('#solo-confirm');if(confirm)confirm.addEventListener('click',()=>{if(skill)v3SoloCommand({kind:'move',index:choice.index,target:skill.target==='foe'?'wild':skill.target==='ally'?'you':undefined});});
  const struggle=$('#solo-struggle');if(struggle)struggle.addEventListener('click',()=>v3SoloCommand({kind:'struggle'}));
  const skip=$('#solo-skip');if(skip)skip.addEventListener('click',()=>{clearInterval(B.timer);endTutorial();});
  const run=$('#solo-run');if(run)run.addEventListener('click',()=>{clearInterval(B.timer);finishBattle({kind:'run'});});
  v3SoloClock();
}
