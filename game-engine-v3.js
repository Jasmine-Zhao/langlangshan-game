/* v3 回合规则：状态可序列化，不依赖 DOM 或通信实现。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./game-rules-v3.js'));
  else root.LanglangBattle=factory(root.LanglangRules);
})(typeof globalThis==='object'?globalThis:this,function(R){
  'use strict';
  if(!R)throw Error('缺少规则数据');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const living=m=>m&&m.hp>0;
  const stage=n=>n>=0?(2+n)/2:2/(2-n);
  // 只记录展示所需的场上状态，避免特效从回合最终结果倒推血量。
  function scene(b){return b.players.map(p=>{const m=active(p);return {id:p.id,num:m.num,name:m.name,type:m.type,level:m.level,hp:m.hp,maxHp:m.stats.hp};});}
  function emit(b,event){b.events.push({...event,scene:scene(b)});}
  function healItem(b,p){
    const m=active(p);
    if(living(m)&&m.item==='heart'&&!m.itemUsed&&m.hp<=m.stats.hp/2){
      const healed=Math.min(m.stats.hp-m.hp,Math.max(1,Math.floor(m.stats.hp/4)));m.hp+=healed;m.itemUsed=true;
      emit(b,{kind:'item',target:p.id,item:'heart',healed});
    }
  }
  function monster(card,level,competitive){
    const s=R.stats(card,level),skills=R.equippedSkills(card,level,competitive);
    const item=competitive&&card.item?card.item:null;
    if(item&&!R.ITEMS[item])throw Error('未知竞技道具');
    return {num:card.num,name:card.name,instanceId:card.instanceId||null,rarity:card.rar,type:R.typeOf(card),level,stats:s,hp:s.hp,skills,pp:skills.map(x=>x.pp),item,itemUsed:false,mod:{atk:0,def:0,spd:0,accuracy:0,evade:0},modTurns:{},status:{},shield:0};
  }
  function createBattle(players,options={}){
    if(!Array.isArray(players)||players.length<2||players.length>4)throw Error('需要 2 至 4 名玩家');
    const ids=new Set(), sides=[0,0];
    const all=players.map(p=>{
      if(!p.id||ids.has(p.id)||![0,1].includes(p.side))throw Error('玩家编号或阵营无效');
      ids.add(p.id);sides[p.side]++;
      const competitive=options.competitive!==false;
      if(!Array.isArray(p.cards)||!p.cards.length||p.cards.length>3||new Set(p.cards.map(c=>c.num)).size!==p.cards.length||(competitive&&R.validateTeam(p.cards.map(c=>c.num))))throw Error('队伍需要不同的妖怪，竞技时每人 3 只');
      return {id:p.id,side:p.side,name:p.name||p.id,active:0,team:p.cards.map(c=>monster(c,options.level||c.level||30,competitive))};
    });
    if(!sides[0]||sides[0]!==sides[1])throw Error('双方人数必须相同');
    return {players:all,turn:1,commands:{},phase:'select',winner:null,events:[],allowItems:!!options.allowItems,canCatch:!!options.canCatch,captured:null,clock:{deadline:(options.now??Date.now())+60000,disconnected:{},remaining:null}};
  }
  function active(p){return p.team[p.active];}
  function validMove(p,i){return Number.isInteger(i)&&i>=0&&i<active(p).skills.length&&active(p).pp[i]>0;}
  function defaultCommand(p){
    const m=active(p),i=m.skills.findIndex((s,n)=>s.category==='attack'&&m.pp[n]>0);
    if(i>=0)return {kind:'move',index:i};
    const any=m.pp.findIndex(n=>n>0);
    return any>=0?{kind:'move',index:any}:{kind:'struggle'};
  }
  function select(b,pid,cmd){
    if(b.phase!=='select'||b.commands[pid]||Object.keys(b.clock.disconnected).length)return false;
    const p=b.players.find(x=>x.id===pid);if(!p||!living(active(p)))return false;
    if(cmd.kind==='move'){
      if(!validMove(p,cmd.index))return false;
      const s=active(p).skills[cmd.index],t=b.players.find(x=>x.id===cmd.target);
      if(cmd.target&&(!t||!living(active(t))||(s.target==='foe'&&t.side===p.side)||(s.target==='ally'&&t.side!==p.side)))return false;
    }else if(cmd.kind==='switch'){
      if(!Number.isInteger(cmd.index)||cmd.index===p.active||!living(p.team[cmd.index]))return false;
    }else if(cmd.kind==='item'){
      if(!b.allowItems||p.side!==0||!['gourd','pie','cleanse'].includes(cmd.item)||(cmd.item==='gourd'&&!b.canCatch))return false;
    }else if(cmd.kind==='struggle'){
      if(active(p).pp.some(x=>x>0))return false;
    }else return false;
    b.commands[pid]={...cmd};return true;
  }
  function timeout(b){
    for(const p of b.players)if(living(active(p))&&!b.commands[p.id])b.commands[p.id]=defaultCommand(p);
  }
  function isReady(b){return b.phase==='select'&&b.players.every(p=>!living(active(p))||!!b.commands[p.id]);}
  function effect(b,actor,actorPlayer,target,targetPlayer,key,rng){
    if(!key||!living(target))return;
    let blocked=false;
    if(key==='burnChance'||key==='poisonChance'||key==='accuracyChance'){
      if(rng()>=.3)return;
      key=key==='burnChance'?'burn':key==='poisonChance'?'poison':'accuracyDown';
    }
    if(key==='burn'||key==='poison'){
      target.status[key]=3;
      if(target.item==='clarity'&&!target.itemUsed){delete target.status[key];target.itemUsed=true;blocked=true;emit(b,{kind:'item',target:target.name,targetId:targetPlayer?targetPlayer.id:null,item:'clarity'});}
    }
    else if(key==='shield')target.shield=1;
    else if(key==='heal')target.hp=Math.min(target.stats.hp,target.hp+Math.max(1,Math.floor(target.stats.hp*.3)));
    else if(key==='cleanse')target.status={};
    else{
      const changes={defUp:['def',1],atkUp:['atk',1],speedUp:['spd',1],evadeUp:['evade',1],atkDown:['atk',-1],speedDown:['spd',-1],accuracyDown:['accuracy',-1]};
      const c=changes[key];if(c){target.mod[c[0]]=clamp(target.mod[c[0]]+c[1],-3,3);target.modTurns[c[0]]=3;}
    }
    emit(b,{kind:'effect',actor:actor.name,actorId:actorPlayer.id,target:target.name,targetId:targetPlayer?targetPlayer.id:null,effect:key,blocked});
  }
  function execute(b,p,cmd,rng){
    const actor=active(p);if(!living(actor))return;
    const fallback=b.players.find(x=>x.side!==p.side&&living(active(x)));
    const targetPlayer=b.players.find(x=>x.id===cmd.target);
    let skill,index=cmd.index;
    if(cmd.kind==='struggle')skill={name:'奋力一击',category:'attack',target:'foe',power:40,accuracy:100,type:null};
    else if(cmd.kind==='move'&&validMove(p,index)){skill=actor.skills[index];actor.pp[index]--;}
    else return;
    let targets;
    if(skill.target==='self')targets=[p];
    else if(skill.target==='ally')targets=[targetPlayer&&targetPlayer.side===p.side&&living(active(targetPlayer))?targetPlayer:p];
    else if(skill.target==='foes')targets=b.players.filter(x=>x.side!==p.side&&living(active(x)));
    else targets=[targetPlayer&&targetPlayer.side!==p.side&&living(active(targetPlayer))?targetPlayer:fallback].filter(Boolean);
    if(!targets.length)return;
    for(const q of targets){
      const t=active(q),hit=skill.category==='support'?100:clamp(skill.accuracy*stage(actor.mod.accuracy)/stage(t.mod.evade),25,100);
      if(rng()*100>=hit){emit(b,{kind:'miss',actor:p.id,target:q.id,skill:skill.name});continue;}
      if(skill.power){
        const effectiveness=R.effectiveness(skill.type,t.type);
        const modifier=effectiveness*(skill.type===actor.type?1.2:1)*(skill.target==='foes'&&targets.length>1?.75:1);
        let damage=Math.max(1,Math.floor((15+skill.power*actor.stats.atk*stage(actor.mod.atk)/(t.stats.def*stage(t.mod.def))*.5)*modifier*(.9+rng()*.1)));
        if(t.shield){damage=Math.max(1,Math.floor(damage*.5));t.shield=0;}
        if(t.item==='guard'&&!t.itemUsed){damage=Math.max(1,Math.floor(damage*.75));t.itemUsed=true;emit(b,{kind:'item',target:q.id,item:'guard'});}
        t.hp=Math.max(0,t.hp-damage);emit(b,{kind:'hit',actor:p.id,target:q.id,skill:skill.name,damage,effectiveness});
        healItem(b,q);
      }
      effect(b,actor,p,t,q,skill.effect,rng);
    }
    if(cmd.kind==='struggle'){const before=actor.hp;actor.hp=Math.max(0,actor.hp-Math.max(1,Math.floor(actor.stats.hp*.1)));emit(b,{kind:'recoil',player:p.id,damage:before-actor.hp});healItem(b,p);}
  }
  function resolve(b,rng=Math.random,now=Date.now()){
    if(!isReady(b)||Object.keys(b.clock.disconnected).length)throw Error('回合尚未准备完成');
    b.events=[];
    for(const p of b.players){const c=b.commands[p.id];if(c&&c.kind==='switch'&&living(p.team[c.index])){p.active=c.index;emit(b,{kind:'switch',player:p.id,num:active(p).num});}}
    for(const p of b.players){const cmd=b.commands[p.id];if(!cmd||cmd.kind!=='item'||!living(active(p)))continue;
      const m=active(p);
      if(cmd.item==='pie'){const healed=Math.min(m.stats.hp-m.hp,Math.max(1,Math.floor(m.stats.hp*.3)));m.hp+=healed;emit(b,{kind:'heal',player:p.id,healed});}
      else if(cmd.item==='cleanse'){m.status={};emit(b,{kind:'cleanse',player:p.id});}
      else{const foe=b.players.find(q=>q.side!==p.side&&living(active(q))),target=foe&&active(foe);
        if(target&&rng()<R.catchChance(target.hp,target.stats.hp,target.rarity)){
          b.captured={num:target.num,level:target.level};emit(b,{kind:'catch',num:target.num});b.phase='over';b.winner=p.side;return b.events;
        }
        emit(b,{kind:'catch_failed',num:target?.num});
      }
    }
    const order=b.players.filter(p=>b.commands[p.id]&&!['switch','item'].includes(b.commands[p.id].kind)).map(p=>({p,tie:rng(),speed:active(p).stats.spd*stage(active(p).mod.spd)*(active(p).item==='speed'?1.1:1)}));
    order.sort((a,c)=>c.speed-a.speed||c.tie-a.tie);
    for(const x of order)execute(b,x.p,b.commands[x.p.id],rng);
    for(const p of b.players){const m=active(p);if(!living(m))continue;for(const key of ['poison','burn'])if(m.status[key]&&living(m)){const damage=Math.max(1,Math.floor(m.stats.hp*.05));m.hp=Math.max(0,m.hp-damage);m.status[key]--;if(!m.status[key])delete m.status[key];emit(b,{kind:'status',player:p.id,effect:key,damage});healItem(b,p);}}
    for(const p of b.players){const m=active(p);m.shield=0;for(const key of Object.keys(m.modTurns)){if(--m.modTurns[key]<=0){m.mod[key]=0;delete m.modTurns[key];}}}
    const remaining=side=>b.players.some(p=>p.side===side&&p.team.some(living));
    if(!remaining(0)||!remaining(1)){b.phase='over';b.winner=remaining(0)?0:remaining(1)?1:null;return b.events;}
    b.commands={};b.phase=b.players.some(p=>!living(active(p))&&p.team.some(living))?'replace':'select';
    if(b.phase==='select')b.turn++;
    b.clock.deadline=now+60000;
    return b.events;
  }
  function replace(b,pid,index,now=Date.now()){
    if(b.phase!=='replace')return false;
    const p=b.players.find(x=>x.id===pid);if(!p||living(active(p))||!Number.isInteger(index)||!living(p.team[index]))return false;
    p.active=index;
    if(!b.players.some(x=>!living(active(x))&&x.team.some(living))){b.phase='select';b.turn++;b.clock.deadline=now+60000;}
    return true;
  }
  function disconnect(b,pid,now=Date.now()){
    if(b.phase==='over'||!b.players.some(p=>p.id===pid)||b.clock.disconnected[pid]!==undefined)return false;
    if(!Object.keys(b.clock.disconnected).length)b.clock.remaining=Math.max(0,b.clock.deadline-now);
    b.clock.disconnected[pid]=now;return true;
  }
  function reconnect(b,pid,now=Date.now()){
    if(b.phase==='over'||b.clock.disconnected[pid]===undefined||now-b.clock.disconnected[pid]>=60000)return false;
    delete b.clock.disconnected[pid];
    if(!Object.keys(b.clock.disconnected).length){b.clock.deadline=now+b.clock.remaining;b.clock.remaining=null;}
    return true;
  }
  function tick(b,now=Date.now()){
    if(b.phase==='over')return 'over';
    const expired=Object.keys(b.clock.disconnected).filter(id=>now-b.clock.disconnected[id]>=60000);
    if(expired.length){
      const sides=new Set(expired.map(id=>b.players.find(p=>p.id===id).side));
      b.phase='over';b.winner=sides.size===1?1-[...sides][0]:null;return 'forfeit';
    }
    if(Object.keys(b.clock.disconnected).length)return 'paused';
    if(b.phase==='select'&&now>=b.clock.deadline){timeout(b);return 'timeout';}
    if(b.phase==='replace'&&now>=b.clock.deadline){
      for(const p of b.players)if(!living(active(p))&&p.team.some(living))replace(b,p.id,p.team.findIndex(living),now);
      return 'replacement_timeout';
    }
    return 'waiting';
  }
  return Object.freeze({createBattle,active,scene,select,timeout,isReady,resolve,replace,defaultCommand,disconnect,reconnect,tick});
});
