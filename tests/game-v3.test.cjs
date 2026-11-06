const assert=require('node:assert/strict');
const R=require('../game-rules-v3.js');
const E=require('../game-engine-v3.js');
const A=require('../game-arena-v3.js');
const card=num=>({num,name:num,fac:'L',role:'输出'});
const player=(id,side,nums)=>({id,side,cards:nums.map(card)});
const teams=()=>[player('a',0,['003','001','070']),player('b',0,['071','002','030']),player('c',1,['068','019','047']),player('d',1,['069','013','014'])];
assert.deepEqual(R.PUBLIC,['001','071','017','030','003','014','002','022']);
assert.deepEqual(Object.keys(R.ITEMS).sort(),['clarity','guard','heart','speed']);
for(const stats of Object.values(R.STATS))assert.equal(stats.reduce((a,b)=>a+b,0),900);
assert.equal(R.effectiveness('mountain','water'),1.3);
assert.equal(R.effectiveness('water','fire'),1.3);
assert.equal(R.effectiveness('fire','mountain'),1.3);
assert.equal(R.effectiveness('cave','mountain'),1);
assert.equal(R.effectiveness('mountain','cave'),1);
assert.equal(R.validateTeam(['001','001','003']),'小队中的妖怪不能重复');
assert.throws(()=>E.createBattle([player('a',0,['003','003','070']),player('c',1,['068','019','047'])]));
assert.throws(()=>R.equippedSkills({...card('003'),selectedSkills:[0,1,2,4]},6,false));
assert.equal(R.equippedSkills({...card('003'),selectedSkills:[0,1,2,4]},6,true)[3].name,'火云突袭');
let b=E.createBattle(teams(),{now:1000});
assert.equal(E.select(b,'a',{kind:'move',index:0,target:'c'}),true);
assert.equal(E.select(b,'b',{kind:'move',index:0,target:'c'}),true);
b.players[2].team[0].hp=1;
E.timeout(b);
const events=E.resolve(b,()=>.5);
assert(events.some(e=>e.kind==='hit'&&e.actor==='b'&&e.target==='d'),'击败目标后自动转向');
assert.equal(b.phase,'replace');
assert.equal(E.replace(b,'c',1),true);
assert.equal(b.phase,'select');
b=E.createBattle(teams(),{now:1000});
assert.equal(E.select(b,'a',{kind:'switch',index:1}),true);
assert.equal(E.select(b,'c',{kind:'move',index:0,target:'a'}),true);
E.timeout(b);
E.resolve(b,()=>.5);
assert.equal(b.players[0].active,1);
assert(b.players[0].team[1].hp<b.players[0].team[1].stats.hp,'换人先于攻击，攻击落在替补身上');
b=E.createBattle(teams(),{now:1000});
const a=b.players[0];a.team[0].pp.fill(0);
assert.equal(E.defaultCommand(a).kind,'struggle');
assert.equal(E.select(b,'a',{kind:'struggle'}),true);
E.timeout(b);const before=a.team[0].hp;E.resolve(b,()=>.5);assert(a.team[0].hp<before,'奋力一击造成反作用伤害');
b=E.createBattle(teams(),{now:1000});
assert.equal(E.disconnect(b,'a',11000),true);
assert.equal(E.tick(b,50000),'paused');
assert.equal(E.select(b,'b',{kind:'move',index:0,target:'c'}),false);
assert.equal(E.reconnect(b,'a',60000),true);
assert.equal(b.clock.deadline,110000,'暂停期间保留剩余选招时间');
assert.equal(E.tick(b,110000),'timeout');
assert.equal(E.isReady(b),true);
b=E.createBattle(teams(),{now:1000});E.disconnect(b,'c',2000);
assert.equal(E.tick(b,62000),'forfeit');assert.equal(b.winner,0);
const snapshot=JSON.parse(JSON.stringify(b));
assert.equal(snapshot.phase,'over');
assert.equal(snapshot.winner,0);
// 倒下后的等待限时适用于双方，且暂停时不消耗选择时间。
b=E.createBattle(teams(),{now:1000});
b.players[0].team[0].hp=0;b.players[2].team[0].hp=0;b.phase='replace';b.clock.deadline=61000;
assert.equal(E.disconnect(b,'b',11000),true);assert.equal(E.tick(b,70000),'paused');
assert.equal(E.reconnect(b,'b',70000),true);assert.equal(b.clock.deadline,120000);
assert.equal(E.tick(b,120000),'replacement_timeout');assert.equal(b.phase,'select');
assert.equal(b.players[0].active,1);assert.equal(b.players[2].active,1);
// 竞技道具免费且每场独立重置：护身佩只抵挡一次，护心果按体力阈值触发。
let itemTeams=teams();itemTeams[0].cards[0].item='heart';itemTeams[2].cards[0].item='guard';
b=E.createBattle(itemTeams,{now:0});
b.players[0].team[0].hp=Math.floor(b.players[0].team[0].stats.hp/2)+1;
assert(E.select(b,'c',{kind:'move',index:0,target:'a'}));
assert(E.select(b,'a',{kind:'move',index:0,target:'c'}));E.timeout(b);
let itemEvents=E.resolve(b,()=>.5,1000);
assert(itemEvents.some(e=>e.kind==='item'&&e.item==='heart'));
assert(itemEvents.some(e=>e.kind==='item'&&e.item==='guard'));
assert(b.players[0].team[0].itemUsed&&b.players[2].team[0].itemUsed);
assert.equal(E.createBattle(itemTeams,{now:0}).players[0].team[0].itemUsed,false);
// 护身佩只减半首次直接伤害，后续攻击不受影响。
const guardTeams=[player('a',0,['001','003','070']),player('b',1,['001','003','070'])];
function guardHits(withGuard){
  const players=JSON.parse(JSON.stringify(guardTeams));
  if(withGuard)players[1].cards[0].item='guard';
  const match=E.createBattle(players,{now:0}),hits=[],triggers=[];
  for(let i=0;i<2;i++){
    E.timeout(match);
    const events=E.resolve(match,()=>.5,1000+i);
    hits.push(events.find(e=>e.kind==='hit'&&e.target==='b').damage);
    triggers.push(events.filter(e=>e.kind==='item'&&e.item==='guard').length);
  }
  return {hits,triggers};
}
const plainHits=guardHits(false),protectedHits=guardHits(true);
assert.equal(protectedHits.hits[0],Math.floor(plainHits.hits[0]*.5));
assert.equal(protectedHits.hits[1],plainHits.hits[1]);
assert.deepEqual(protectedHits.triggers,[1,0]);
itemTeams=teams();itemTeams[0].cards[0].item='bad';
assert.throws(()=>E.createBattle(itemTeams),/未知竞技道具/);
const drawCards=[{num:'a',rar:'R2'},{num:'b',rar:'R'},{num:'c',rar:'R'},{num:'d',rar:'S'}];
for(const rand of [()=>0,()=>.99]){
  const drawn=R.drawStarter(drawCards,rand);
  assert.equal(new Set(drawn).size,3);
  assert.notEqual(drawCards.find(c=>c.num===drawn[0]).rar,'R');
}
assert.equal(R.catchChance(0,100,'R'),0);
assert(R.catchChance(10,100,'R')>R.catchChance(80,100,'R'));
assert(R.catchChance(10,100,'R')>R.catchChance(10,100,'U'));
assert.equal(R.catchChance(20,100,'S'),.85*.55);
assert.equal(R.catchChance(20,100,'U'),.85*.4);
assert(R.catchChance(20,100,'R2')>R.catchChance(20,100,'S'));
const roam=[{num:'046',fac:'G',rar:'R2'},{num:'003',fac:'G',rar:'U'},{num:'013',fac:'G',rar:'S'}];
assert.equal(R.chooseEncounter(roam,'fire',0,()=>.99).num,'046');
assert.equal(R.chooseEncounter(roam,'fire',10,()=>.999).num,'003');
assert.equal(R.chooseEncounter(roam,'water',0),null);
// 巡山允许较小队伍，成功收服立即结束，失败则仍由对手行动。
const solo=()=>E.createBattle([player('you',0,['003']),player('wild',1,['017'])],{competitive:false,allowItems:true,canCatch:true,level:6,now:0});
let walk=solo();assert(E.select(walk,'you',{kind:'item',item:'gourd'}));E.timeout(walk);
assert(E.resolve(walk,()=>0,1000).some(e=>e.kind==='catch'));assert.equal(walk.captured.num,'017');assert.equal(walk.phase,'over');
walk=solo();assert(E.select(walk,'you',{kind:'item',item:'gourd'}));E.timeout(walk);
let walkEvents=E.resolve(walk,()=>.99,1000);assert(walkEvents.some(e=>e.kind==='catch_failed'));
assert(walkEvents.some(e=>e.kind==='hit'&&e.actor==='wild'),'收服失败后敌方仍行动');
walk=solo();walk.players[0].team[0].hp=10;assert(E.select(walk,'you',{kind:'item',item:'pie'}));E.timeout(walk);
assert(E.resolve(walk,()=>.5,1000).some(e=>e.kind==='heal'));
assert.equal(E.select(E.createBattle(teams()),'a',{kind:'item',item:'pie'}),false,'竞技不能使用消耗道具');

// 同等级对战中，高等级的体力和伤害应大体同步增长。
function mirrorHit(level){
  const battle=E.createBattle([player('you',0,['001']),player('wild',1,['001'])],{competitive:false,level,now:0});
  E.timeout(battle);
  const hit=E.resolve(battle,()=>.5,1000).find(e=>e.kind==='hit');
  return {damage:hit.damage,maxHp:battle.players[0].team[0].stats.hp};
}
const lowHit=mirrorHit(5),highHit=mirrorHit(30);
assert(highHit.damage>lowHit.damage*2,'高等级伤害应随体力增长');
assert(Math.abs(lowHit.damage/lowHit.maxHp-highHit.damage/highHit.maxHp)<.02,'同等级对战的攻击占体力比例不应随等级大幅降低');
assert(highHit.damage/highHit.maxHp>.17&&highHit.damage/highHit.maxHp<.23,'普通攻击应能在数次命中后击倒对手');
const fourPlayers=[player('a',0,['001']),player('b',0,['001']),player('c',1,['001']),player('d',1,['001'])];
const fourBattle=E.createBattle(fourPlayers,{competitive:false,level:30,now:0});
E.timeout(fourBattle);
const fourHit=E.resolve(fourBattle,()=>.5,1000).find(e=>e.kind==='hit').damage;
assert(Math.abs(fourHit-highHit.damage*1.25)<=1,'四人对战的直接伤害应增加 25%');
for(const level of [5,30]){
  const wildBattle=E.createBattle([player('you',0,['001']),player('wild',1,['001'])],{competitive:false,canCatch:true,allowItems:true,level,now:0});
  const wild=wildBattle.players[1].team[0],initialChance=R.catchChance(wild.hp,wild.stats.hp,wild.rarity);
  E.timeout(wildBattle);E.resolve(wildBattle,()=>.5,1000);
  assert(wild.hp>0&&wild.hp<wild.stats.hp,'普通攻击后野生妖怪应仍有收服机会');
  assert(R.catchChance(wild.hp,wild.stats.hp,wild.rarity)>initialChance,'削弱野生妖怪应提高收服概率');
}

// 巡山烧饼和恢复技能恢复最大体力的 20%；竞技护心果恢复 15%。
walk=solo();walk.players[0].team[0].hp=1;
assert(E.select(walk,'you',{kind:'item',item:'pie'}));E.timeout(walk);
walkEvents=E.resolve(walk,()=>.5,1000);
assert.equal(walkEvents.find(e=>e.kind==='heal').healed,Math.floor(walk.players[0].team[0].stats.hp*.2));
const healBattle=E.createBattle([player('you',0,['030']),player('wild',1,['001'])],{competitive:false,level:30,now:0});
const healer=healBattle.players[0].team[0];healer.hp=1;
assert(E.select(healBattle,'you',{kind:'move',index:2,target:'you'}));E.timeout(healBattle);
const healEvents=E.resolve(healBattle,()=>.5,1000);
const healScene=healEvents.find(e=>e.kind==='effect'&&e.effect==='heal').scene.find(p=>p.id==='you');
assert.equal(healScene.hp,1+Math.floor(healer.stats.hp*.2));
const heartTeam=[player('a',0,['001','003','070']),player('b',1,['001','003','070'])];
heartTeam[0].cards[0].item='heart';
const heartBattle=E.createBattle(heartTeam,{now:0});heartBattle.players[0].team[0].hp=300;
E.timeout(heartBattle);
const heartEvent=E.resolve(heartBattle,()=>.5,1000).find(e=>e.kind==='item'&&e.item==='heart');
assert.equal(heartEvent.healed,Math.floor(heartBattle.players[0].team[0].stats.hp*.15));

// 自动对局校验节奏，实际时长仍取决于选招、动画和网络。
for(const mode of [1,2]){
  const testPlayers=(mode===1?[teams()[0],teams()[2]]:teams()).map(p=>({...p,ai:true}));
  const match=A.create(testPlayers,0);let rounds=0;
  while(match.battle.phase!=='over'&&rounds<30){A.advance(match,rounds*1000,()=>.5);rounds++;}
  assert.equal(match.battle.phase,'over',`${mode}v${mode} 对局应在合理回合内结束`);
  assert(rounds>=8&&rounds<=24,`${mode}v${mode} 的普通攻击对局回合数应处于试玩目标范围，实际 ${rounds}`);
}

const overlap=teams();overlap[1].cards[0]=card('003');
assert.doesNotThrow(()=>E.createBattle(overlap),'不同队友可携带相同妖怪');
const S=require('../game-save-v3.js');
const saveCards=[{num:'001',rar:'U',power:10020,fac:'L',role:'防御'},{num:'003',rar:'U',power:9680,fac:'G',role:'输出'},{num:'070',rar:'R',power:6270,fac:'L',role:'输出'}];
const old={coin:420,items:{gourd:2},roster:[{id:1,num:'001',lvl:6,exp:12,hp:600},{id:2,num:'001',lvl:7,exp:0,hp:650},{id:3,num:'070',lvl:5,exp:2,hp:400}],team:[1,2,3],cleared:[0,1]};
const oldText=JSON.stringify(old),saved={lls_save_v2:oldText};
const storage={getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v};
const migrated=S.load(storage,saveCards);
assert.equal(saved.lls_save_v2,oldText,'迁移时不覆盖旧存档');
assert.equal(migrated.roster.length,3,'重复妖怪仍保留在名册');
assert.deepEqual(migrated.team,[1,3]);
assert.equal(migrated.coin,420);
assert.deepEqual(migrated.cleared,[0,1]);
S.save(storage,migrated);
assert.equal(saved.lls_save_v2,oldText);
assert.equal(JSON.parse(saved.lls_save_v3).version,3);
assert.throws(()=>S.migrate({...old,roster:[{id:1,num:'999',lvl:2}]},saveCards));
const fresh=S.fresh(saveCards,()=>0);
assert.equal(new Set(fresh.roster.map(m=>m.num)).size,3);
assert.notEqual(saveCards.find(c=>c.num===fresh.roster[0].num).rar,'R');

assert.throws(()=>S.setTeam(migrated,[1,2,3]),/不同/);
const joined=S.addCaught(migrated,saveCards[1],5);
assert.equal(joined.roster.length,4);
assert.equal(migrated.roster.length,3,'收服不更改原存档对象');
const duplicate=S.addCaught(joined,saveCards[1],5);
assert.equal(duplicate.roster.length,4);assert.equal(duplicate.items.expFruit,1);
assert.equal(joined.items.expFruit,0,'重复收服不更改原存档');
const fed=S.useExperienceFruit(duplicate,4,saveCards);
assert.equal(fed.state.items.expFruit,0);assert.equal(fed.state.roster.find(m=>m.id===4).exp,60);
assert.throws(()=>S.useExperienceFruit(fed.state,4,saveCards),/经验果不足/);
assert.equal(S.setTeam(joined,[1,3,4]).team.length,3);
assert.throws(()=>S.equip(joined,4,[0,1,2,4],saveCards),/技能配置/);
const victory=S.awardVictory(S.setTeam(joined,[1,3,4]),saveCards,15);
assert.equal(victory.changes.length,3);
assert(victory.changes.every(c=>c.to>=c.from));
assert.throws(()=>S.awardVictory(joined,saveCards,NaN));

// 调度器只接受玩家自己的行动，等待全部提交，并隐藏其他玩家的选招。
const competitors=teams();competitors[1].ai=true;competitors[3].ai=true;
let arena=A.create(competitors,1000);A.advance(arena,1000,()=>.5);
assert.equal(A.command(arena,'b',{kind:'move',index:0,target:'c'},1000,()=>.5),false);
assert.equal(A.command(arena,'a',{kind:'move',index:1,target:'c'},1000,()=>.5),true);
assert.deepEqual(A.view(arena,'c').battle.commands.a,{submitted:true});
assert.throws(()=>A.view(arena,'outsider'),/玩家不在/);
assert.equal(A.command(arena,'c',{kind:'move',index:0,target:'a'},1000,()=>.5),true);
assert.equal(arena.battle.turn,2);assert.equal(arena.history.length,1);
assert(arena.playback,'回合结算后应等待真人播放完成');
assert.equal(A.command(arena,'a',{kind:'move',index:0},1001,()=>.5),false,'播放期间不能提交下一回合');
assert.equal(A.ackPlayback(arena,'a',1,2000),true);
assert(arena.playback,'仍有玩家播放时不能开放操作');
assert.equal(A.ackPlayback(arena,'c',1,3000),true);
assert.equal(arena.playback,null);assert.equal(arena.battle.clock.deadline,63000,'所有人播放完成后才开始选招计时');
assert.equal(A.disconnect(arena,'c',2000),true);
assert.equal(A.tick(arena,61999,()=>.5),'paused');
assert.equal(A.tick(arena,62000,()=>.5),'forfeit');
assert.equal(arena.battle.winner,0);
{
  const competitors=teams();competitors[1].ai=true;competitors[3].ai=true;
  const slow=A.create(competitors,0);
  A.command(slow,'a',{kind:'move',index:0},100,()=>.5);A.command(slow,'c',{kind:'move',index:0},100,()=>.5);
  assert.equal(A.tick(slow,15099,()=>.5),'playback');
  A.tick(slow,15100,()=>.5);assert.equal(slow.playback,null);assert.equal(slow.battle.clock.deadline,75100,'播放等待超过上限后开放操作');
  const gone=slow.battle.players.find(p=>p.id==='a');gone.team.forEach(m=>{m.hp=0;});
  assert(A.leave(slow,'a',16000),'2v2 已出局玩家可退出');
  assert(slow.left.includes('a'));assert.equal(slow.battle.phase,'select');
  assert.equal(A.leave(slow,'c',16000),false,'仍有妖怪的玩家不能按出局退出');
}
// 自动对局应在有限回合内结束，且血量始终在合理范围内。
for(let match=0;match<20;match++){
  arena=A.create(teams().map(p=>({...p,ai:true})),0);
  for(let n=0;n<250&&arena.battle.phase!=='over';n++){
    A.advance(arena,n*1000,Math.random);
    for(const p of arena.battle.players)for(const m of p.team)assert(m.hp>=0&&m.hp<=m.stats.hp);
  }
  assert.equal(arena.battle.phase,'over','自动对局不应无限循环');
}

console.log('v3 规则与存档检查通过');

// 特效计划：把引擎事件按原顺序转成表演步骤，并携带伤害与目标定位信息。
const FX=require('../game-fx-v3.js');
{
  const fx_teams=teams();
  const fb=E.createBattle(fx_teams,{now:1000,competitive:false});
  const b0=fb.players[0],c0=fb.players[2];
  fb.events.length=0;
  fb.events.push({kind:'switch',player:'a',num:'001'});
  fb.events.push({kind:'hit',actor:'a',target:'c',skill:'火尖枪',damage:42,effectiveness:1.3});
  fb.events.push({kind:'hit',actor:'a',target:'d',skill:'烈焰燎原',damage:30,effectiveness:1});
  fb.events.push({kind:'miss',actor:'c',target:'a',skill:'水枪偷袭'});
  fb.events.push({kind:'effect',actor:'野生妖怪',actorId:'c',target:'你',targetId:'a',effect:'atkDown'});
  fb.events.push({kind:'status',player:'a',effect:'burn',damage:15});
  fb.events.push({kind:'item',target:'你',targetId:'a',item:'clarity'});
  fb.events.push({kind:'heal',player:'a',healed:50});
  fb.events.push({kind:'catch_failed',num:'068'});
  const steps=FX.plan(fb,fb.events);
  assert.deepEqual(steps.map(s=>s.type),['switch','hit','hit','miss','effect','status','item','heal','catch_failed']);
  const hits=steps.filter(s=>s.type==='hit');
  assert.equal(hits[0].superEffective,true,'克制命中应标记');
  assert.equal(hits[1].superEffective,false);
  assert.deepEqual(hits.map(s=>s.target),['c','d'],'2v2 多目标按结算顺序逐个表演');
  assert.equal(hits[0].color,FX.COLORS.fire,'弹道颜色来自出招者当前妖怪属性');
  assert.equal(hits[0].pending,42,'pending 为该目标剩余总伤害，供血条分段回落');
  assert.equal(steps.find(s=>s.type==='status').pending,15);
  assert.equal(steps.find(s=>s.type==='effect').target,'a','效果事件应携带目标玩家 ID');
  assert.equal(steps.find(s=>s.type==='effect').buff,false);
  assert.equal(FX.plan(fb,[]).length,0);
  assert.equal(FX.plan(fb).length,0,'事件缺失时应返回空计划');
}

// 展示快照应保留受击、回血和换人发生时的状态，而不是从回合最终血量倒推。
{
  const ps=teams();ps[0].cards[0].item='heart';
  const battle=E.createBattle(ps,{now:0});
  const original=battle.players[0].team[0];original.hp=Math.floor(original.stats.hp/2)+1;
  const beforeScene=E.scene(battle);
  assert(E.select(battle,'c',{kind:'move',index:0,target:'a'}));
  E.timeout(battle);
  const ev=E.resolve(battle,()=>.5,1000),hitIndex=ev.findIndex(e=>e.kind==='hit'&&e.target==='a'),healIndex=ev.findIndex(e=>e.kind==='item'&&e.item==='heart');
  assert(hitIndex>=0&&healIndex>hitIndex);
  const hp=(event,id)=>event.scene.find(p=>p.id===id).hp;
  assert(hp(ev[hitIndex],'a')<beforeScene.find(p=>p.id==='a').hp,'受击快照应记录扣血');
  assert.equal(hp(ev[healIndex],'a'),hp(ev[hitIndex],'a')+ev[healIndex].healed,'回血快照应反映实际回血');
  const steps=FX.plan(battle,ev);
  assert.equal(steps.find(s=>s.type==='item'&&s.item==='heart').scene.find(p=>p.id==='a').hp,hp(ev[healIndex],'a'));

  const switchBattle=E.createBattle(teams(),{now:0});
  const initial=E.scene(switchBattle).find(p=>p.id==='a').num;
  assert(E.select(switchBattle,'a',{kind:'switch',index:1}));E.timeout(switchBattle);
  const switchEvents=E.resolve(switchBattle,()=>.5,1000),switchEvent=switchEvents.find(e=>e.kind==='switch');
  assert.notEqual(switchEvent.scene.find(p=>p.id==='a').num,initial,'换人事件快照应显示新妖怪');
}
{
  const arena=A.create(teams(),0);
  A.command(arena,'a',{kind:'move',index:0,target:'c'},1,()=>.5);
  E.timeout(arena.battle);A.advance(arena,2,()=>.5);
  assert.equal(arena.history[0].before.find(p=>p.id==='c').hp,arena.battle.players[2].team[0].stats.hp,'回合历史应保存播放前血量');
}
{
  const ps=teams();ps[0].cards[0].item='clarity';
  const battle=E.createBattle(ps,{now:0}),attacker=battle.players[2].team[0];
  attacker.stats.spd=10000;attacker.skills[0]={name:'灼烧测试',category:'support',target:'foe',effect:'burn',pp:10};
  assert(E.select(battle,'c',{kind:'move',index:0,target:'a'}));E.timeout(battle);
  const ev=E.resolve(battle,()=>.5,1000),effect=ev.find(e=>e.kind==='effect'&&e.actorId==='c');
  assert.equal(effect.blocked,true);assert.equal(battle.players[0].team[0].status.burn,undefined);
  assert(FX.plan(battle,ev).some(s=>s.type==='item'&&s.item==='clarity'));
  assert(!FX.plan(battle,ev).some(s=>s.type==='effect'&&s.effect==='burn'),'清心符解除异常后不应再展示灼烧生效');
}
