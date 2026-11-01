/* v3 战斗特效层：把引擎事件转成有先后顺序的表演。
   plan() 是纯函数，可在 Node 里测试；play() 只操作 #bt-arena 内的 DOM，不参与同步。 */
(function (root, factory) {
  const fx = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = fx;
  else root.LanglangFX = fx;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  const COLORS = {mountain:'#b8c96d', water:'#75d8f1', fire:'#f5a06a', cave:'#c08cff', none:'#f4cf7c'};
  const EFFECT_LABEL = {
    defUp:'防御提升', atkUp:'攻击提升', speedUp:'速度提升', evadeUp:'闪避提升',
    atkDown:'攻击下降', speedDown:'速度下降', accuracyDown:'命中下降',
    shield:'获得护盾', heal:'生命回复', cleanse:'异常解除', burn:'灼烧', poison:'中毒'
  };
  const DUR = {switch:650, item:600, hit:850, miss:700, effect:600, status:520};
  function reducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function monsterType(battle, playerId) {
    const p = battle && battle.players.find(x => x.id === playerId);
    const m = p && p.team[p.active];
    return m ? m.type : 'none';
  }
  function targetIdOf(event) {
    return event.targetId !== undefined ? event.targetId : event.target;
  }
  // 把一次回合结算的 events 顺序转成表演步骤；伤害类步骤附带剩余伤害，供血条分段回落。
  function plan(battle, events) {
    const steps = [];
    const pending = {};
    const list = Array.isArray(events) ? events : [];
    for (const e of list) {
      const start = steps.length;
      if (e.kind === 'hit') {
        pending[e.target] = (pending[e.target] || 0) + e.damage;
        steps.push({type:'hit', actor:e.actor, target:e.target, skill:e.skill, damage:e.damage, superEffective:e.effectiveness > 1, color:COLORS[monsterType(battle, e.actor)] || COLORS.none});
      } else if (e.kind === 'miss') {
        steps.push({type:'miss', actor:e.actor, target:e.target, skill:e.skill, color:COLORS[monsterType(battle, e.actor)] || COLORS.none});
      } else if (e.kind === 'effect' && !e.blocked) {
        steps.push({type:'effect', actor:e.actorId, target:targetIdOf(e), effect:e.effect, label:EFFECT_LABEL[e.effect] || '效果生效', buff:['defUp','atkUp','speedUp','evadeUp','shield','heal','cleanse'].includes(e.effect)});
      } else if (e.kind === 'status' || e.kind === 'recoil') {
        pending[e.player] = (pending[e.player] || 0) + e.damage;
        steps.push({type:'status', target:e.player, effect:e.effect, damage:e.damage, label:e.kind === 'recoil' ? '反作用力' : e.effect === 'burn' ? '灼烧' : '中毒'});
      } else if (e.kind === 'switch') {
        steps.push({type:'switch', player:e.player, num:e.num});
      } else if (e.kind === 'heal') {
        steps.push({type:'heal', target:e.player, amount:e.healed, label:'疗伤烧饼'});
      } else if (e.kind === 'cleanse') {
        steps.push({type:'cleanse', target:e.player, label:'清心草'});
      } else if (e.kind === 'item') {
        steps.push({type:'item', target:targetIdOf(e), item:e.item, amount:e.healed || 0});
      } else if (e.kind === 'catch' || e.kind === 'catch_failed') {
        steps.push({type:e.kind, num:e.num});
      }
      if (steps.length > start && e.scene) {
        const step = steps[steps.length - 1];
        step.scene = e.scene;
        const actor = e.scene.find(p => p.id === step.actor);
        if (actor && (step.type === 'hit' || step.type === 'miss')) step.color = COLORS[actor.type] || COLORS.none;
      }
    }
    for (const step of steps) if (step.type === 'hit' || step.type === 'status') step.pending = pending[step.target] || 0;
    return steps;
  }
  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function slotEl(arena, id) {
    if (!arena || id === undefined || id === null) return null;
    return arena.querySelector(`[data-v3player="${CSS.escape(String(id))}"]`);
  }
  function center(arena, el) {
    // 锚定卡牌图而不是整个卡槽，避免数字和光环盖住血量与技能文字。
    const art = el.querySelector('.dcard') || el;
    const ar = arena.getBoundingClientRect(), r = art.getBoundingClientRect();
    return {x:r.left + r.width / 2 - ar.left, y:r.top + r.height / 2 - ar.top};
  }
  function showName(arena, text, color) {
    const label = document.createElement('div');
    label.className = 'v3fx-name';
    label.style.setProperty('--fx-color', color);
    label.textContent = text;
    arena.appendChild(label);
    setTimeout(() => label.remove(), 560);
    return label;
  }
  function floatText(arena, el, text, cls, color, offsetY) {
    const c = center(arena, el), num = document.createElement('div');
    num.className = 'v3fx-num ' + (cls || '');
    num.style.setProperty('--tx', c.x + 'px');
    num.style.setProperty('--ty', (c.y + (offsetY || 0)) + 'px');
    if (color) num.style.setProperty('--fx-color', color);
    num.textContent = text;
    arena.appendChild(num);
    setTimeout(() => num.remove(), 950);
    return num;
  }
  function setBar(slot, ratio, animated) {
    const fill = slot.querySelector('.bar.hp i');
    if (!fill) return;
    if (!animated) fill.style.transition = 'none';
    fill.style.width = Math.max(0, Math.min(100, ratio * 100)) + '%';
    if (!animated) { void fill.offsetWidth; fill.style.transition = ''; }
  }
  function applyScene(arena, scene, animated) {
    if (!Array.isArray(scene)) return;
    for (const m of scene) {
      const slot = slotEl(arena, m.id); if (!slot) continue;
      const art = slot.querySelector('.dcard'), name = slot.querySelector('.dname'), sub = slot.querySelector('.dsub');
      if (art) { const source = `cards/${m.num}.jpg`; if (art.getAttribute('src') !== source) art.setAttribute('src', source); }
      if (name) name.textContent = m.name + ' · ' + (root.LanglangRules?.TYPES[m.type] || m.type);
      if (sub) sub.textContent = `HP ${m.hp}/${m.maxHp} · Lv${m.level}`;
      slot.dataset.v3hp = m.hp; slot.dataset.v3max = m.maxHp;
      slot.classList.toggle('dead', m.hp <= 0);
      const bar = slot.querySelector('.bar.hp');
      if (bar) { bar.classList.toggle('low', m.hp <= 0 || m.hp / m.maxHp <= .25); bar.classList.toggle('mid', m.hp > 0 && m.hp / m.maxHp > .25 && m.hp / m.maxHp <= .55); }
      setBar(slot, m.hp / m.maxHp, animated);
    }
  }
  function lunge(slot, dx, dy, reduced) {
    const card = slot.querySelector('.dcard');
    if (!card || reduced || !card.animate) return;
    const len = Math.hypot(dx, dy) || 1;
    card.animate([
      {transform:'translate(0,0)'},
      {transform:`translate(${-dx / len * 8}px,${-dy / len * 8}px)`, offset:.2},
      {transform:`translate(${dx / len * 20}px,${dy / len * 20}px)`, offset:.48},
      {transform:'translate(0,0)'}
    ], {duration:620, easing:'ease-out'});
  }
  function knockback(slot, dx, dy, reduced) {
    const card = slot.querySelector('.dcard');
    if (!card || reduced || !card.animate) return;
    const len = Math.hypot(dx, dy) || 1;
    card.animate([
      {transform:'translate(0,0)'},
      {transform:`translate(${dx / len * 10}px,${dy / len * 10}px)`, offset:.3},
      {transform:`translate(${-dx / len * 5}px,${-dy / len * 5}px)`, offset:.6},
      {transform:'translate(0,0)'}
    ], {duration:300, easing:'ease-out'});
  }
  function tone(freq, duration, delay, type, volume) {
    try { if (typeof root.tone === 'function') root.tone(freq, duration, delay, type, volume); } catch (_) {}
  }
  // 顺序播放一次回合的表演；token.cancelled 会在界面重渲染时打断播放。
  async function play(arena, steps, options) {
    const opts = options || {};
    const token = opts.token || {};
    const reduced = opts.reduced !== undefined ? opts.reduced : reducedMotion();
    const scale = reduced ? .55 : 1;
    const pending = {};
    for (const step of steps) if (step.pending !== undefined) pending[step.target] = step.pending;
    applyScene(arena, opts.before, false);
    for (const step of steps) {
      if (token.cancelled) return;
      const speed = opts.speed || 1;
      if (step.type === 'hit') {
        const actor = slotEl(arena, step.actor), target = slotEl(arena, step.target);
        if (!actor || !target) continue;
        showName(arena, step.skill, step.color);
        tone(step.superEffective ? 100 : 140, .13, 0, 'triangle', .07);
        const a = center(arena, actor), t = center(arena, target);
        const dx = t.x - a.x, dy = t.y - a.y;
        lunge(actor, dx, dy, reduced);
        await wait(280 * scale * speed); if (token.cancelled) return;
        if (actor !== target) {
          knockback(target, dx, dy, reduced);
          if (!reduced) {
            const bolt = document.createElement('div');
            bolt.className = 'v3fx-bolt';
            bolt.style.setProperty('--sx', a.x + 'px');
            bolt.style.setProperty('--sy', a.y + 'px');
            bolt.style.setProperty('--dx', dx + 'px');
            bolt.style.setProperty('--dy', dy + 'px');
            bolt.style.setProperty('--fx-color', step.color);
            arena.appendChild(bolt);
            setTimeout(() => bolt.remove(), 420);
          }
        }
        await wait(220 * scale * speed); if (token.cancelled) return;
        if (!reduced) {
          const impact = document.createElement('div');
          impact.className = 'v3fx-impact';
          impact.style.setProperty('--tx', t.x + 'px');
          impact.style.setProperty('--ty', t.y + 'px');
          impact.style.setProperty('--fx-color', step.color);
          arena.appendChild(impact);
          setTimeout(() => impact.remove(), 420);
        }
        const maxHp = +target.dataset.v3max || 1, finalHp = +target.dataset.v3hp || 0;
        if (step.scene) applyScene(arena, step.scene, true);
        else if (step.pending !== undefined && pending[step.target]) {
          const before = (finalHp + pending[step.target]) / maxHp;
          setBar(target, before, false);
          requestAnimationFrame(() => setBar(target, Math.max(0, before - step.damage / maxHp), true));
          pending[step.target] -= step.damage;
        }
        floatText(arena, target, '−' + step.damage, step.superEffective ? 'super' : '', step.superEffective ? '#ffd77a' : step.color, -20);
        if (step.superEffective) floatText(arena, target, '克制！', 'tag-super', '#ffd77a', -4);
        const knockedOut = step.scene ? step.scene.some(m => m.id === step.target && m.hp <= 0) : finalHp <= 0 && !pending[step.target];
        if (knockedOut) {
          await wait(320 * scale * speed); if (token.cancelled) return;
          target.classList.add('v3fx-ko');
          showName(arena, '倒下！', '#ff9d86');
          tone(70, .45, 0, 'triangle', .1);
          await wait(420 * scale * speed);
          target.classList.remove('v3fx-ko');
        } else await wait(240 * scale * speed);
      } else if (step.type === 'miss') {
        const actor = slotEl(arena, step.actor), target = slotEl(arena, step.target);
        if (!actor || !target) continue;
        showName(arena, step.skill + ' · 未命中', '#c9bda6');
        tone(180, .13, 0, 'triangle', .05);
        lunge(actor, center(arena, target).x - center(arena, actor).x, center(arena, target).y - center(arena, actor).y, reduced);
        floatText(arena, target, '闪避！', 'tag-miss', '#d8cdb4', -12);
        await wait(DUR.miss * scale * speed);
      } else if (step.type === 'effect') {
        const target = slotEl(arena, step.target);
        if (!target) continue;
        applyScene(arena, step.scene, true);
        showName(arena, step.label, step.buff ? '#8de6ad' : '#d4a5ff');
        floatText(arena, target, step.label, step.buff ? 'tag-buff' : 'tag-debuff', step.buff ? '#8de6ad' : '#d4a5ff', -12);
        tone(step.buff ? 660 : 240, .15, 0, 'sine', .05);
        await wait(DUR.effect * scale * speed);
      } else if (step.type === 'status') {
        const target = slotEl(arena, step.target);
        if (!target) continue;
        floatText(arena, target, `${step.label} −${step.damage}`, 'tag-debuff', '#d4a5ff', -12);
        const maxHp = +target.dataset.v3max || 1, finalHp = +target.dataset.v3hp || 0;
        if (step.scene) applyScene(arena, step.scene, true);
        else if (pending[step.target]) {
          const before = (finalHp + pending[step.target]) / maxHp;
          setBar(target, before, false);
          requestAnimationFrame(() => setBar(target, Math.max(0, before - step.damage / maxHp), true));
          pending[step.target] -= step.damage;
        }
        tone(200, .12, 0, 'sawtooth', .04);
        await wait(DUR.status * scale * speed);
      } else if (step.type === 'switch') {
        applyScene(arena, step.scene, false);
        const slot = slotEl(arena, step.player);
        if (slot) {
          showName(arena, '派出了新妖怪', '#ffe09a');
          const card = slot.querySelector('.dcard');
          if (card && !reduced && card.animate) card.animate([{transform:'scale(.55)', filter:'brightness(2)'}, {transform:'scale(1)', filter:'brightness(1)'}], {duration:480, easing:'ease-out'});
          tone(520, .18, 0, 'sine', .06);
        }
        await wait(DUR.switch * scale * speed);
      } else if (step.type === 'heal' || step.type === 'item' || step.type === 'cleanse') {
        applyScene(arena, step.scene, true);
        const target = slotEl(arena, step.target);
        if (target) {
          const text = step.type === 'cleanse' ? '异常解除' : step.amount ? '+' + step.amount : (root.LanglangRules?.ITEMS[step.item]?.name || '道具') + '生效';
          floatText(arena, target, text, 'tag-buff', '#8de6ad', -12);
          tone(720, .16, 0, 'sine', .05); tone(960, .2, .08, 'sine', .04);
        }
        await wait(DUR.item * scale * speed);
      } else if (step.type === 'catch' || step.type === 'catch_failed') {
        showName(arena, step.type === 'catch' ? '收服成功！' : '妖怪挣脱了葫芦！', step.type === 'catch' ? '#6fd3c8' : '#c9bda6');
        tone(step.type === 'catch' ? 660 : 200, .3, 0, 'triangle', .07);
        await wait(800 * scale * speed);
      } else await wait(200 * speed);
      await wait(60 * speed);
    }
  }
  return Object.freeze({COLORS, EFFECT_LABEL, plan, play});
});
