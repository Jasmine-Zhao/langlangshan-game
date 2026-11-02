const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// 直接测试竞技界面的调度：重绘和新回合不能截断正在播放的特效。
async function main(){
  const playing=[];
  const ctx={
    console,sessionStorage:{getItem:()=>null},G:null,NET:{_v3view:null},B:{v3:true},sendTo:()=>{},
    LanglangFX:{plan:(_battle,events)=>events,play:(_arena,events,options)=>new Promise(resolve=>playing.push({events,options,resolve}))}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../game-arena-ui-v3.js'),'utf8'),ctx);
  ctx.v3ResetFx();
  const arena={},first={battle:{},history:[{turn:1,before:['before-1'],events:['hit-1']}]};
  const next={battle:{},history:[...first.history,{turn:2,before:['before-2'],events:['hit-2']}]};
  ctx.v3QueueFx(first,arena);
  assert.equal(playing.length,1);
  ctx.v3QueueFx(first,arena); // 一次界面重绘不应重复播放或取消。
  ctx.v3QueueFx(next,arena);
  assert.equal(playing.length,1);
  assert.equal(playing[0].options.token.cancelled,false);
  assert.equal(ctx.NET._v3fxState.queue.length,1);
  let results=0;ctx.v3AfterFx(()=>results++);
  assert.equal(results,0,'最后一击播放期间不能显示结算');
  playing[0].resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(playing.length,2,'新回合应在上一回合结束后播放');
  assert.equal(playing[1].events[0],'hit-2');
  assert.equal(playing[1].options.before[0],'before-2');
  assert.equal(results,0);
  playing[1].resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.NET._v3fxState.active,false);
  assert.equal(results,1,'所有特效完成后只显示一次结算');

  ctx.v3ResetFx();ctx.v3QueueFx(first,arena);
  const old=ctx.NET._v3fxState;ctx.v3ResetFx();
  assert.equal(old.token.cancelled,true,'开始新对局时应取消旧对局的播放');
  playing[2].resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.NET._v3fxState.active,false);
  // 结束时不等待旧回放，只播放最后击倒，跳过后只结算一次。
  const buttons=[],arenaEl={},menuEl={appendChild:el=>buttons.push(el)};
  ctx.setTimeout=setTimeout;ctx.clearTimeout=clearTimeout;
  ctx.document={createElement:()=>({addEventListener(_name,fn){this.click=fn;}})};
  ctx.$=sel=>sel==='#bt-arena'?arenaEl:menuEl;
  ctx.v3Render=()=>{};
  ctx.NET._v3view={battle:{},history:[{turn:3,before:[{id:'c',hp:20}],events:[
    {kind:'hit',target:'c',scene:[{id:'c',hp:0}]},
    {kind:'status',player:'a',scene:[{id:'a',hp:20}]}
  ]}]};
  ctx.B.over=true;let finalResults=0;
  ctx.v3FinalFx(()=>finalResults++);
  assert.equal(playing.at(-1).events.length,1);
  assert.equal(playing.at(-1).events[0].kind,'hit','应展示最后的击倒，而非其后未致死的状态伤害');
  buttons.at(-1).click();assert.equal(finalResults,1,'跳过应立即显示结果');
  playing.at(-1).resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(finalResults,1,'跳过后播放完成不能重复结算');
  console.log('v3 战斗特效队列检查通过');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
