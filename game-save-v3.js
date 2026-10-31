/* 本机存档迁移。迁移结果写入新键，原 v2 存档保持不变。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./game-rules-v3.js'));
  else root.LanglangSave=factory(root.LanglangRules);
})(typeof globalThis==='object'?globalThis:this,function(R){
  'use strict';
  const KEY='lls_save_v3', OLD_KEY='lls_save_v2';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function lookup(cards){return new Map(cards.map(c=>[c.num,c]));}
  function fresh(cards,rng=Math.random){
    const byNum=lookup(cards),nums=R.drawStarter(cards,rng);
    const roster=nums.map((num,i)=>{
      const c=byNum.get(num),lvl=R.INITIAL_LEVEL[c.rar]||5;
      return {id:i+1,num,lvl,exp:0,hp:R.stats(c,lvl).hp,selectedSkills:[0,1,2,3]};
    });
    return {version:3,coin:500,items:{gourd:3,pie:3,puddin:1,expFruit:0},roster,team:roster.map(m=>m.id),cleared:[],done:false,tut:false};
  }
  function migrate(old,cards){
    if(!old||!Array.isArray(old.roster)||!Array.isArray(old.team))throw Error('旧存档格式无效');
    const next=copy(old),byNum=lookup(cards),ids=new Set();
    next.roster.forEach(m=>{
      const c=byNum.get(m.num);
      if(!c||!Number.isInteger(m.id)||ids.has(m.id)||!Number.isFinite(m.lvl)||m.lvl<1)throw Error('旧存档含未知妖怪或无效编号');
      ids.add(m.id);
      const oldMax=Math.round(c.power/10*(.6+m.lvl*.04));
      const max=R.stats(c,m.lvl).hp,ratio=Number.isFinite(m.hp)&&oldMax>0?Math.max(0,Math.min(1,m.hp/oldMax)):1;
      m.hp=Math.round(max*ratio);m.exp=Number.isFinite(m.exp)?Math.max(0,m.exp):0;
      m.selectedSkills=[0,1,2,3];delete m.pp;
    });
    const mons=new Map(next.roster.map(m=>[m.id,m])),used=new Set();
    next.team=next.team.filter(id=>{
      const m=mons.get(id);if(!m||used.has(m.num))return false;used.add(m.num);return true;
    }).slice(0,3);
    next.items=next.items||{};next.items.expFruit=Number.isInteger(next.items.expFruit)?Math.max(0,next.items.expFruit):0;
    next.version=3;return next;
  }
  function addCaught(state,card,lvl){
    if(!card||!Number.isInteger(lvl)||lvl<1)throw Error('收服数据无效');
    const next=copy(state);
    if(next.roster.some(m=>m.num===card.num)){
      next.items=next.items||{};next.items.expFruit=(next.items.expFruit||0)+1;return next;
    }
    const id=next.roster.reduce((n,m)=>Math.max(n,m.id||0),0)+1;
    next.roster.push({id,num:card.num,lvl,exp:0,hp:R.stats(card,lvl).hp,selectedSkills:[0,1,2,3]});
    return next;
  }
  function setTeam(state,ids){
    const next=copy(state),monsters=ids.map(id=>next.roster.find(m=>m.id===id));
    if(monsters.some(m=>!m)||R.validateTeam(monsters.map(m=>m.num)))throw Error('小队需要 3 只不同的妖怪');
    next.team=ids.slice();return next;
  }
  function equip(state,id,indices,cards){
    const next=copy(state),m=next.roster.find(x=>x.id===id),c=m&&lookup(cards).get(m.num);
    if(!c)throw Error('妖怪不存在');
    R.equippedSkills({...c,selectedSkills:indices},m.lvl,false);
    m.selectedSkills=indices.slice();return next;
  }
  function experienceNeeded(lvl){return 20+lvl*12;}
  function useExperienceFruit(state,id,cards){
    const next=copy(state),m=next.roster.find(x=>x.id===id),c=m&&lookup(cards).get(m.num);
    if(!c)throw Error('妖怪不存在');
    if(!next.items||!Number.isInteger(next.items.expFruit)||next.items.expFruit<1)throw Error('经验果不足');
    if(m.lvl>=60)throw Error('妖怪已达最高等级');
    next.items.expFruit--;const before=m.lvl;m.exp+=60;
    while(m.lvl<60&&m.exp>=experienceNeeded(m.lvl)){m.exp-=experienceNeeded(m.lvl);m.lvl++;}
    if(m.lvl>before&&m.hp>0){const oldMax=R.stats(c,before).hp,newMax=R.stats(c,m.lvl).hp;m.hp=Math.min(newMax,m.hp+newMax-oldMax);}
    return {state:next,from:before,to:m.lvl,learned:R.skillPool(c).filter(skill=>skill.learnLevel>before&&skill.learnLevel<=m.lvl).map(skill=>skill.name)};
  }
  function awardVictory(state,cards,opponentLevel){
    if(!Number.isFinite(opponentLevel)||opponentLevel<1)throw Error('对手等级无效');
    const next=copy(state),byNum=lookup(cards),changes=[];
    for(const id of next.team){
      const m=next.roster.find(x=>x.id===id),c=m&&byNum.get(m.num);if(!c)throw Error('队伍含未知妖怪');
      const gain=Math.max(10,Math.round(25+opponentLevel*6+Math.max(0,opponentLevel-m.lvl)*3));
      m.exp+=gain;const before=m.lvl;
      while(m.lvl<60&&m.exp>=experienceNeeded(m.lvl)){m.exp-=experienceNeeded(m.lvl);m.lvl++;}
      m.hp=R.stats(c,m.lvl).hp;
      changes.push({id,gain,from:before,to:m.lvl,learned:R.skillPool(c).filter(skill=>skill.learnLevel>before&&skill.learnLevel<=m.lvl).map(skill=>skill.name)});
    }
    return {state:next,changes};
  }
  function load(storage,cards){
    const raw=storage.getItem(KEY);
    if(raw){const save=JSON.parse(raw);if(save.version!==3||!Array.isArray(save.roster)||!Array.isArray(save.team))throw Error('新存档格式无效');return save;}
    const legacy=storage.getItem(OLD_KEY);return legacy?migrate(JSON.parse(legacy),cards):null;
  }
  function save(storage,state){
    if(!state||state.version!==3)throw Error('拒绝写入无效存档');
    storage.setItem(KEY,JSON.stringify(state));
  }
  return Object.freeze({KEY,OLD_KEY,fresh,migrate,addCaught,setTeam,equip,experienceNeeded,useExperienceFruit,awardVictory,load,save});
});
