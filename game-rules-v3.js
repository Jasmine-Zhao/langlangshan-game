/* 浪浪山竞技规则草案：不依赖界面，供战斗与联机共享。 */
(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.LanglangRules = rules;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const TYPES = Object.freeze({mountain:'山岭', water:'水府', fire:'炎荒', cave:'幽洞'});
  const COUNTERS = Object.freeze({mountain:'water', water:'fire', fire:'mountain'});
  const PUBLIC = Object.freeze(['001','071','017','030','003','014','002','022']);
  const ITEMS = Object.freeze({
    heart: Object.freeze({name:'护心果',description:'体力降至一半或以下时，恢复最大体力的 15%；每场一次。'}),
    clarity: Object.freeze({name:'清心符',description:'首次陷入灼烧或中毒时自动解除；每场一次。'}),
    speed: Object.freeze({name:'轻身铃',description:'速度提升 10%。'}),
    guard: Object.freeze({name:'护身佩',description:'首次受到直接伤害减少 50%；每场一次。'})
  });
  const FIXED_TYPE = Object.freeze({
    '001':'mountain','071':'mountain','070':'mountain','058':'mountain',
    '017':'water','030':'water','068':'water','069':'water',
    '003':'fire','013':'fire','014':'fire','019':'fire',
    '002':'cave','022':'cave','047':'cave','072':'cave',
    '046':'fire','050':'fire'
  });
  const STATS = Object.freeze({
    '001':[580,110,130,80], '071':[510,145,110,135], '070':[480,145,105,170], '058':[560,130,130,80],
    '017':[520,145,105,130], '030':[570,105,145,80], '068':[530,115,110,145], '069':[560,110,140,90],
    '003':[510,145,100,145], '013':[530,120,110,140], '014':[520,125,120,135], '019':[550,135,125,90],
    '002':[530,130,105,135], '022':[525,120,120,135], '047':[530,120,125,125], '072':[520,100,125,155]
  });
  // 格式：名称、类型、目标、威力、命中、PP、附加效果。
  const moves = {
    '001':[['蛮牛冲撞','attack','foe',55,100,20],['混铁重击','attack','foe',85,90,10],['大王护体','support','self',0,100,10,'defUp'],['群妖庇护','support','ally',0,100,8,'shield']],
    '071':[['虎爪','attack','foe',55,100,20],['猛虎扑击','attack','foe',85,90,10],['震山咆哮','control','foe',0,95,10,'atkDown'],['蓄势待发','support','self',0,100,10,'atkUp']],
    '070':[['巡山突袭','attack','foe',55,100,20],['传令鼓舞','support','ally',0,100,10,'speedUp'],['灵巧闪避','support','self',0,100,10,'evadeUp'],['飞石','attack','foe',75,95,10]],
    '058':[['狮王扑击','attack','foe',55,100,20],['吞天怒吼','attack','foes',55,90,8],['狮王威慑','control','foe',0,95,10,'atkDown'],['稳如泰山','support','self',0,100,10,'defUp']],
    '017':[['九首连击','attack','foe',55,100,20],['碧波冲击','attack','foe',85,90,10],['水雾迷踪','support','self',0,100,10,'evadeUp'],['怒涛翻涌','attack','foes',55,90,8]],
    '030':[['水流冲击','attack','foe',55,100,20],['龙宫水盾','support','ally',0,100,8,'shield'],['碧波回春','support','ally',0,100,8,'heal'],['巨浪拍岸','attack','foes',55,90,8]],
    '068':[['水枪偷袭','attack','foe',55,100,20],['水花迷眼','control','foe',0,90,10,'accuracyDown'],['溜之大吉','support','self',0,100,10,'speedUp'],['鱼叉突刺','attack','foe',80,90,10]],
    '069':[['鱼尾拍击','attack','foe',55,100,20],['硬鳞护身','support','self',0,100,10,'defUp'],['水泡困敌','control','foe',0,95,10,'speedDown'],['护住兄弟','support','ally',0,100,8,'shield']],
    '003':[['火尖枪','attack','foe',55,100,20],['三昧真火','attack','foe',80,90,10,'burnChance'],['火焰护体','support','self',0,100,10,'defUp'],['烈焰燎原','attack','foes',55,90,8]],
    '013':[['黄沙扑面','attack','foe',55,100,20],['三昧神风','attack','foe',80,90,10,'accuracyChance'],['风沙遮眼','control','foe',0,90,10,'accuracyDown'],['黄风护身','support','self',0,100,10,'defUp']],
    '014':[['芭蕉扇','attack','foe',55,100,20],['清风送行','support','ally',0,100,10,'speedUp'],['扇走迷雾','support','ally',0,100,8,'cleanse'],['烈风横扫','attack','foes',55,90,8]],
    '019':[['紫金铃响','attack','foe',55,100,20],['烈焰铃火','attack','foe',80,90,10,'burnChance'],['烟雾护身','support','self',0,100,10,'defUp'],['震铃慑敌','control','foe',0,95,10,'atkDown']],
    '002':[['白骨爪','attack','foe',55,100,20],['白骨幻形','support','self',0,100,10,'evadeUp'],['摄魂迷雾','control','foe',0,95,10,'atkDown'],['白骨幽击','attack','foe',85,90,10]],
    '022':[['狐火','attack','foe',55,100,20],['狐仙祝福','support','ally',0,100,8,'heal'],['迷魂轻语','control','foe',0,95,10,'atkDown'],['幻影护身','support','self',0,100,10,'defUp']],
    '047':[['蛛丝缠绕','control','foe',0,95,10,'speedDown'],['毒牙','attack','foe',65,95,15,'poisonChance'],['蛛网守护','support','ally',0,100,8,'shield'],['毒雾弥漫','attack','foes',55,90,8]],
    '072':[['鬼火一击','attack','foe',55,100,20],['精细照料','support','ally',0,100,8,'heal'],['小鬼扰敌','control','foe',0,95,10,'atkDown'],['机灵闪躲','support','self',0,100,10,'evadeUp']]
  };
  const descriptions = Object.freeze({defUp:'提升自身防御，减少受到的伤害',atkUp:'提升自身攻击，增加造成的伤害',speedUp:'提升目标速度，更容易先出手',evadeUp:'提升自身闪避，更容易躲开攻击',atkDown:'降低对手攻击，减少其造成的伤害',speedDown:'降低对手速度，争取先出手',accuracyDown:'降低对手命中，更容易躲开攻击',shield:'本回合首次受到的直接伤害减半',heal:'恢复目标最大体力的 20%',cleanse:'解除目标的灼烧和中毒',burnChance:'攻击并有 30% 几率造成灼烧',poisonChance:'攻击并有 30% 几率造成中毒',accuracyChance:'攻击并有 30% 几率降低对手命中'});
  function typeOf(card) {
    if (FIXED_TYPE[card.num]) return FIXED_TYPE[card.num];
    return card.fac === 'L' ? 'mountain' : card.fac === 'T' ? 'water' : 'cave';
  }
  function effectiveness(att,def) { return COUNTERS[att] === def ? 1.3 : 1; }
  function stats(card,lvl) {
    const base = STATS[card.num] || (card.role === '防御' ? [560,110,140,90] : card.role === '输出' ? [500,145,110,145] : card.role === '辅助' ? [530,105,125,140] : [520,115,125,140]);
    const factor=(0.6+0.04*lvl)/1.8;
    return {hp:Math.round(base[0]*factor),atk:Math.round(base[1]*factor),def:Math.round(base[2]*factor),spd:Math.round(base[3]*factor)};
  }
  function skillList(card) {
    const type=typeOf(card), basic=type==='mountain'?'山岭冲撞':type==='water'?'水波冲击':type==='fire'?'炎荒烈击':'幽洞奇袭';
    const rows=moves[card.num] || [[basic,'attack','foe',55,100,20],[card.sig||card.name+'绝技','attack','foe',80,90,10],['凝神守护','support','self',0,100,10,'defUp'],['慑敌','control','foe',0,95,10,'atkDown']];
    return rows.map(([name,category,target,power,accuracy,pp,effect])=>({name,category,target,power,accuracy,pp,effect:effect||null,type,description:descriptions[effect]||(target==='foes'?'攻击对方全体':'攻击对方单体')}));
  }
  function skillPool(card) {
    const basic=skillList(card).map(m=>({...m,learnLevel:1}));
    const type=typeOf(card);
    const extras=card.num==='003' ? [
      {name:'火云突袭',category:'attack',target:'foe',power:70,accuracy:100,pp:10,type},
      {name:'余烬再燃',category:'attack',target:'foe',power:50,accuracy:95,pp:10,effect:'burnChance',type}
    ] : card.num==='013' ? [
      {name:'狂沙漫天',category:'attack',target:'foes',power:55,accuracy:90,pp:8,type},
      {name:'借风而行',category:'support',target:'self',power:0,accuracy:100,pp:10,effect:'speedUp',type}
    ] : [
      {name:card.name+'·奇袭',category:'attack',target:'foe',power:70,accuracy:100,pp:10,type},
      {name:card.name+'·护佑',category:'support',target:'ally',power:0,accuracy:100,pp:8,effect:'shield',type}
    ];
    return basic.concat(extras.map((m,i)=>({...m,description:descriptions[m.effect]||'攻击对方',learnLevel:i?20:12})));
  }
  function equippedSkills(card, level, competitive) {
    const pool=skillPool(card), selected=card.selectedSkills||[0,1,2,3];
    if(selected.length!==4||new Set(selected).size!==4||selected.some(i=>!Number.isInteger(i)||!pool[i]||(!competitive&&pool[i].learnLevel>level)))throw Error('技能配置无效');
    return selected.map(i=>pool[i]);
  }
  const INITIAL_LEVEL = Object.freeze({R:5,R2:6,S:7,U:8});
  function drawStarter(cards,rng=Math.random){
    if(!Array.isArray(cards)||new Set(cards.map(c=>c.num)).size<3)throw Error('卡牌不足');
    const picks=[];
    for(let i=0;i<3;i++){
      const candidates=cards.filter(c=>!picks.includes(c.num)&&(i>0||c.rar!=='R'));
      if(!candidates.length)throw Error('缺少 SR 及以上卡牌');
      const weights={R:58,R2:30,S:10,U:2};
      const rarities=['R','R2','S','U'].filter(r=>candidates.some(c=>c.rar===r));
      const total=rarities.reduce((sum,r)=>sum+weights[r],0);
      let roll=clampRandom(rng())*total,rarity=rarities[rarities.length-1];
      for(const r of rarities){roll-=weights[r];if(roll<0){rarity=r;break;}}
      const pool=candidates.filter(c=>c.rar===rarity);
      picks.push(pool[Math.floor(clampRandom(rng())*pool.length)].num);
    }
    return picks;
  }
  function clampRandom(v){return Number.isFinite(v)?Math.max(0,Math.min(.999999999,v)):0;}
  function catchChance(hp,maxHp,rarity){
    if(!Number.isFinite(hp)||!Number.isFinite(maxHp)||hp<=0||maxHp<=0)return 0;
    const base={R:.8,R2:.65,S:.55,U:.4}[rarity]||.5;
    return Math.max(.05,Math.min(.95,(1-Math.min(1,hp/maxHp)*.75)*base));
  }
  function chooseEncounter(cards,type,progress=0,rng=Math.random){
    if(!TYPES[type])throw Error('未知巡山地界');
    const unlocked=Math.max(0,Math.min(10,Math.floor(progress)||0));
    const weights={R:72,R2:24,S:unlocked>=3?3:0,U:unlocked>=7?1:0};
    const candidates=cards.filter(c=>typeOf(c)===type&&weights[c.rar]>0);
    const rarities=['R','R2','S','U'].filter(r=>candidates.some(c=>c.rar===r));
    if(!rarities.length)return null;
    let roll=clampRandom(rng())*rarities.reduce((n,r)=>n+weights[r],0),rarity=rarities[rarities.length-1];
    for(const r of rarities){roll-=weights[r];if(roll<0){rarity=r;break;}}
    const pool=candidates.filter(c=>c.rar===rarity),card=pool[Math.floor(clampRandom(rng())*pool.length)];
    return {num:card.num,level:Math.min(35,5+unlocked*3)};
  }
  function validateTeam(nums) {
    if (!Array.isArray(nums) || nums.length !== 3) return '请选择 3 只妖怪';
    if (new Set(nums).size !== 3) return '小队中的妖怪不能重复';
    return null;
  }
  return Object.freeze({TYPES, COUNTERS, PUBLIC, ITEMS, FIXED_TYPE, STATS, typeOf, effectiveness, stats, skillList, skillPool, equippedSkills, INITIAL_LEVEL, drawStarter, catchChance, chooseEncounter, validateTeam});
});
