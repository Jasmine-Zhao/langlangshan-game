// 粗略比较公共妖怪单挑；不模拟换人、道具、辅助技能或 2v2 配合。
const R=require('../game-rules-v3.js');
const E=require('../game-engine-v3.js');
const names={'001':'牛魔王','071':'虎先锋','017':'九头虫','030':'万圣龙王','003':'红孩儿','014':'铁扇公主','002':'白骨精','022':'玉面狐狸'};
const cards=R.PUBLIC.map(num=>({num,name:names[num],fac:'L',role:'输出'}));
let seed=12345678;
function rng(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
for(const first of cards){
  let wins=0,losses=0,turns=0;
  for(const second of cards){
    if(first.num===second.num)continue;
    for(let sample=0;sample<300;sample++){
      const team=c=>[{...c,selectedSkills:[0,1,2,4]},...cards.filter(x=>x.num!==c.num).slice(0,2)];
      const battle=E.createBattle([{id:'a',side:0,cards:team(first)},{id:'b',side:1,cards:team(second)}],{competitive:true,level:30,now:0});
      // 保留竞技配招规则，仅让首只妖怪参战。
      for(const p of battle.players)for(const m of p.team.slice(1))m.hp=0;
      while(battle.phase!=='over'&&battle.turn<100){
        for(const p of battle.players){
          const m=E.active(p);
          const attacks=m.skills.map((skill,index)=>({skill,index})).filter(x=>x.skill.category==='attack'&&m.pp[x.index]);
          attacks.sort((a,b)=>b.skill.power*b.skill.accuracy-a.skill.power*a.skill.accuracy);
          E.select(battle,p.id,attacks.length?{kind:'move',index:attacks[0].index}:{kind:'struggle'});
        }
        E.resolve(battle,rng,0);
      }
      if(battle.phase!=='over')throw Error('单挑未能结束');
      turns+=battle.turn;
      if(battle.winner===0)wins++;
      else if(battle.winner===1)losses++;
    }
  }
  console.log(`${first.name}: 胜率 ${(100*wins/(wins+losses)).toFixed(1)}%，平均 ${(turns/(wins+losses)).toFixed(1)} 回合`);
}
