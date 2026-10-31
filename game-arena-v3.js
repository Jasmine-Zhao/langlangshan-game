/* 主机侧竞技回合调度：不依赖网络与页面，便于同步和测试。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./game-engine-v3.js'));
  else root.LanglangArena=factory(root.LanglangBattle);
})(typeof globalThis==='object'?globalThis:this,function(E){
  'use strict';
  if(!E)throw Error('缺少对战引擎');
  function create(players,now=Date.now()){
    const battle=E.createBattle(players,{now,competitive:true,level:30});
    return {battle,ai:players.filter(p=>p.ai).map(p=>p.id),history:[],revision:0};
  }
  function aiChoose(arena,now){
    const b=arena.battle;
    if(Object.keys(b.clock.disconnected).length)return;
    if(b.phase==='replace')for(const p of b.players){
      if(arena.ai.includes(p.id)&&E.active(p).hp<=0){
        const idx=p.team.findIndex(m=>m.hp>0);if(idx>=0)E.replace(b,p.id,idx,now);
      }
    }
    if(b.phase==='select')for(const p of b.players){
      if(arena.ai.includes(p.id)&&E.active(p).hp>0&&!b.commands[p.id])E.select(b,p.id,E.defaultCommand(p));
    }
  }
  function advance(arena,now=Date.now(),rng=Math.random){
    const b=arena.battle;
    aiChoose(arena,now);
    if(E.isReady(b)&&!Object.keys(b.clock.disconnected).length){
      const turn=b.turn,events=E.resolve(b,rng,now);
      arena.history.push({turn,events});arena.history=arena.history.slice(-20);
      aiChoose(arena,now);
    }
    arena.revision++;
    return b.phase;
  }
  function command(arena,id,cmd,now=Date.now(),rng=Math.random){
    if(!cmd||arena.ai.includes(id))return false;
    const b=arena.battle;
    let ok=false;
    if(b.phase==='replace'&&cmd.kind==='replace'&&!Object.keys(b.clock.disconnected).length)ok=E.replace(b,id,cmd.index,now);
    else if(b.phase==='select')ok=E.select(b,id,cmd);
    if(ok)advance(arena,now,rng);
    return ok;
  }
  function tick(arena,now=Date.now(),rng=Math.random){
    const result=E.tick(arena.battle,now);
    if(result==='timeout'||result==='replacement_timeout')advance(arena,now,rng);
    else if(result==='forfeit')arena.revision++;
    else if(result==='waiting'&&E.isReady(arena.battle)&&!Object.keys(arena.battle.clock.disconnected).length)advance(arena,now,rng);
    return result;
  }
  function disconnect(arena,id,now=Date.now()){
    if(arena.ai.includes(id))return false;
    const ok=E.disconnect(arena.battle,id,now);if(ok)arena.revision++;return ok;
  }
  function reconnect(arena,id,now=Date.now(),rng=Math.random){
    const ok=E.reconnect(arena.battle,id,now);if(ok)advance(arena,now,rng);return ok;
  }
  function view(arena,id){
    if(!arena.battle.players.some(p=>p.id===id))throw Error('玩家不在对战中');
    const result=JSON.parse(JSON.stringify(arena));
    for(const pid of Object.keys(result.battle.commands))if(pid!==id)result.battle.commands[pid]={submitted:true};
    return result;
  }
  return Object.freeze({create,advance,command,tick,disconnect,reconnect,view});
});
