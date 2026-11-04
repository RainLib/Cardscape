import type { CardDocument } from '../../shared/document';
import type { CharacterAction } from '../../shared/character';
import C from '../workshop/component-model.ts';
import Physics from '../rendering/particle-physics-model.ts';
interface ParticleEditorHost {
  current(): {
    document: CardDocument | null;
    action: CharacterAction | null;
    seconds: number;
    busy: boolean;
  };
  mutate(
    label: string,
    change: (document: CardDocument, action: CharacterAction) => void,
  ): void;
  say(message: string): void;
}
/** Separate event authoring from timeline transport and numeric tracks. */
export function createActionParticleEditor(
  host: ParticleEditorHost,
  document: Document,
) {
  const element = document.createElement('details');
  element.id = 'timeline-particles';
  const summary = document.createElement('summary');
  summary.textContent = '动作粒子事件';
  element.append(summary);
  const note = document.createElement('p');
  note.textContent =
    '事件可叠加，定位、暂停和重播可复现。发射坐标使用静止画幅；卡牌空间模式保留出生位置，整卡翻转仍同步。';
  element.append(note);
  const select = document.createElement('select');
  select.id = 'timeline-particle-event';
  select.setAttribute('aria-label', '当前粒子事件');
  element.append(select);
  const fields = document.createElement('fieldset');
  element.append(fields);
  const input = (
    label: string,
    type: string,
    min?: string,
    max?: string,
    step?: string,
  ) => {
    const row = document.createElement('label');
    row.textContent = label;
    const control = document.createElement('input');
    control.type = type;
    control.setAttribute('aria-label', label);
    if (min) control.min = min;
    if (max) control.max = max;
    if (step) control.step = step;
    row.append(control);
    fields.append(row);
    return control;
  };
  const name = input('事件名称', 'text'),
    start = input('触发时间（秒）', 'number', '0', undefined, '.01'),
    duration = input('粒子持续（秒）', 'number', '.08', '12', '.01');
  const stopEmission = input('提前停止发射', 'checkbox'),
    emissionDuration = input('发射时长（秒）', 'number', '0', '12', '.01'),
    trail = input('连续剑痕', 'checkbox'),
    trailDuration = input('剑痕留存（秒）', 'number', '.04', '2', '.01'),
    trailSegments = input('剑痕网格段数', 'number', '4', '64', '1');
  const trailNote = document.createElement('p');
  trailNote.textContent =
    '连续剑痕按骨骼历史姿态连接成带，使用发射坐标、尺寸、颜色和层级；需绑定骨骼。粒子外观、速度及爆发仅用于普通粒子。';
  fields.append(trailNote);
  const visual = document.createElement('select');
  visual.setAttribute('aria-label', '事件粒子外观');
  for (const value of C.particleVisuals) {
    const option = document.createElement('option');
    option.value = option.textContent = value;
    visual.append(option);
  }
  fields.append(visual);
  const color = input('粒子颜色', 'color'),
    count = input('粒子数量', 'number', '1', '256', '1'),
    size = input('粒子尺寸', 'number', '.002', '.08', '.001');
  const enabled = input('启用此粒子事件', 'checkbox'),
    lifetime = input('粒子寿命（秒）', 'number', '.3', '12', '.01'),
    speed = input('粒子速度', 'number', '0', '2', '.01'),
    spread = input('粒子扩散', 'number', '0', '2', '.01'),
    stretch = input('粒子拉伸', 'number', '1', '8', '.1'),
    opacity = input('粒子透明度', 'number', '0', '1', '.01'),
    radius = input('粒子环绕半径', 'number', '0', '.2', '.001');
  function choices(
    label: string,
    options: ReadonlyArray<readonly [string, string]>,
  ) {
    const row = document.createElement('label');
    row.textContent = label;
    const control = document.createElement('select');
    control.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      control.append(option);
    }
    row.append(control);
    fields.append(row);
    return control;
  }
  const space = choices('粒子模拟空间', [
      ['bone', '整体跟随骨骼'],
      ['card', '出生后留在卡牌空间'],
      ['world', '出生后留在世界空间'],
    ]),
    blend = choices('事件粒子混合', [
      ['add', '叠加发光'],
      ['normal', '普通透明'],
    ]),
    placement = choices('事件粒子层级', [
      ['behind', '卡牌后方'],
      ['surface', '发射源表面'],
      ['front', '发射源前方'],
    ]),
    trajectory = choices('事件粒子轨迹', [
      ['outward', '向外扩散'],
      ['halo', '沿边环绕'],
      ['float', '漂浮'],
      ['field', '粒子场'],
    ]);
  const revealEnabled = input('启用事件爆发', 'checkbox'),
    revealOnly = input('仅显示爆发粒子', 'checkbox'),
    revealDuration = input('爆发持续（秒）', 'number', '.08', '2', '.01'),
    revealCount = input('爆发粒子数量', 'number', '1', '128', '1'),
    revealTravel = input('爆发扩散距离', 'number', '0', '3', '.01'),
    revealStagger = input('爆发错开比例', 'number', '0', '.8', '.01');
  const revealProfile = choices('事件爆发方式', [
    ['burst', '同时爆发'],
    ['trails', '分批射线'],
  ]);
  const sprite = input('事件粒子 PNG', 'file');
  sprite.accept = 'image/png,.png';
  const spriteTint = input('事件 PNG 染色', 'checkbox');
  const preset = choices('动作粒子预设', [
    ['', '选择预设'],
    ['blade', '剑锋拖光'],
    ['charge', '掌心聚能'],
    ['burst', '冲击爆发'],
    ['embers', '飘散火星'],
  ]);
  const u = input('发射 X %', 'number', '0', '100', '.1'),
    v = input('发射 Y %', 'number', '0', '100', '.1');
  const physicsEnabled = input('启用重力与平面碰撞', 'checkbox');
  const physicsGroup = document.createElement('details');
  const physicsTitle = document.createElement('summary');
  physicsTitle.textContent = '物理轨迹与碰撞面';
  physicsGroup.append(physicsTitle);
  fields.append(physicsGroup);
  const physical = (label: string, min: string, max: string, step = '.01') => {
    const control = input(label, 'number', min, max, step);
    physicsGroup.append(control.parentElement!);
    return control;
  };
  const axes = ['X', 'Y', 'Z'] as const;
  const initialVelocity = axes.map((axis) =>
    physical('初速度 ' + axis, '-10', '10'),
  );
  const velocitySpread = axes.map((axis) =>
    physical('速度随机范围 ' + axis, '0', '10'),
  );
  const gravity = axes.map((axis) => physical('重力 ' + axis, '-20', '20'));
  const collisionRadius = physical('碰撞半径（卡宽）', '0', '.2', '.001');
  const restitution = physical('反弹系数', '0', '1');
  const friction = physical('碰撞切向衰减', '0', '1');
  const maxBounces = physical('允许反弹次数', '0', '32', '1');
  const response = choices('命中响应', [
    ['bounce', '反弹'],
    ['slide', '滑动'],
    ['kill', '消散'],
  ]);
  physicsGroup.append(response.parentElement!);
  const planeSelect = choices('当前碰撞平面', []);
  physicsGroup.append(planeSelect.parentElement!);
  const planeNormal = axes.map((axis) =>
    physical('平面法线 ' + axis, '-1', '1', '.1'),
  );
  const planeDistance = physical('平面距离（卡宽）', '-10', '10');
  const addPlane = document.createElement('button'),
    removePlane = document.createElement('button');
  addPlane.type = removePlane.type = 'button';
  addPlane.textContent = '添加碰撞平面';
  removePlane.textContent = '删除碰撞平面';
  physicsGroup.append(addPlane, removePlane);
  const physicsNote = document.createElement('p');
  physicsNote.textContent =
    '初速度从发射源坐标变换；重力和碰撞面使用卡牌／世界空间，法线指向可活动一侧。启用后替代原轨迹参数，外观保留。默认地面高度 -0.6 卡宽。';
  physicsGroup.append(physicsNote);
  const bone = document.createElement('select');
  bone.setAttribute('aria-label', '跟随骨骼');
  fields.append(bone);
  const add = document.createElement('button'),
    remove = document.createElement('button'),
    copy = document.createElement('button');
  for (const button of [add, remove, copy]) button.type = 'button';
  add.id = 'timeline-particle-add';
  remove.id = 'timeline-particle-delete';
  copy.id = 'timeline-particle-copy';
  add.textContent = '在当前时间添加';
  remove.textContent = '删除事件';
  copy.textContent = '使用当前粒子面板设置';
  element.append(add, remove, copy);
  let selected = '',
    source = '';
  function change(
    label: string,
    fn: (action: CharacterAction, doc: CardDocument) => void,
  ) {
    try {
      host.mutate(label, (doc, action) => fn(action, doc));
    } catch (e) {
      host.say(e instanceof Error ? e.message : String(e));
    }
    refresh();
  }
  function refresh() {
    const state = host.current(),
      action = state.action,
      events = action?.particleEvents || [];
    if (!events.some((e) => e.id === selected)) selected = events[0]?.id || '';
    const key = JSON.stringify([
      action?.id,
      events,
      state.document?.characterRig?.bones,
    ]);
    if (key !== source) {
      source = key;
      select.replaceChildren(
        ...events.map((e) => {
          const option = document.createElement('option');
          option.value = e.id;
          option.textContent = `${e.name} · ${(e.at * (action?.duration || 1)).toFixed(2)}s`;
          return option;
        }),
      );
      bone.replaceChildren(
        ...[
          ['', '不跟随骨骼'],
          ...(state.document?.characterRig?.bones || []).map((b) => [
            b.id,
            b.name,
          ]),
        ].map(([id, label]) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = label;
          return option;
        }),
      );
    }
    select.value = selected;
    const event = events.find((e) => e.id === selected);
    fields.disabled = state.busy || !event;
    select.disabled = state.busy || !events.length;
    add.disabled = state.busy || !action || events.length >= 16;
    remove.disabled = copy.disabled = state.busy || !event;
    if (!event || !action) return;
    const set = (
      control: HTMLInputElement | HTMLSelectElement,
      value: string | number,
    ) => {
      if (document.activeElement !== control) control.value = String(value);
    };
    set(name, event.name);
    set(start, event.at * action.duration);
    set(duration, event.duration);
    stopEmission.checked = event.emissionDuration !== undefined;
    set(emissionDuration, event.emissionDuration ?? event.duration);
    emissionDuration.disabled = !stopEmission.checked;
    trail.checked = !!event.trail;
    trail.disabled = !!event.physics;
    physicsEnabled.checked = !!event.physics;
    physicsEnabled.disabled = !!event.trail;
    const physics = event.physics || Physics.defaults();
    const physicsControls = [
      ...initialVelocity,
      ...velocitySpread,
      ...gravity,
      collisionRadius,
      restitution,
      friction,
      maxBounces,
      response,
      planeSelect,
    ];
    for (const control of physicsControls) control.disabled = !event.physics;
    for (let axis = 0; axis < 3; axis++) {
      set(initialVelocity[axis], physics.velocity[axis]);
      set(velocitySpread[axis], physics.spread[axis]);
      set(gravity[axis], physics.gravity[axis]);
    }
    set(collisionRadius, physics.radius);
    set(restitution, physics.restitution);
    set(friction, physics.friction);
    set(maxBounces, physics.maxBounces);
    set(response, physics.response);
    const previousPlane = planeSelect.value;
    planeSelect.replaceChildren(
      ...physics.planes.map((plane) => {
        const option = document.createElement('option');
        option.value = option.textContent = plane.id;
        return option;
      }),
    );
    planeSelect.value = physics.planes.some((p) => p.id === previousPlane)
      ? previousPlane
      : physics.planes[0]?.id || '';
    const plane = physics.planes.find((p) => p.id === planeSelect.value);
    for (let axis = 0; axis < 3; axis++) {
      set(planeNormal[axis], plane?.normal[axis] ?? (axis === 1 ? 1 : 0));
      planeNormal[axis].disabled = !event.physics || !plane;
    }
    set(planeDistance, plane?.distance ?? -0.6);
    planeDistance.disabled = !event.physics || !plane;
    addPlane.disabled = !event.physics || physics.planes.length >= 8;
    removePlane.disabled = !event.physics || !plane;
    set(trailDuration, event.trail?.duration ?? 0.25);
    set(trailSegments, event.trail?.segments ?? 32);
    trailDuration.disabled = trailSegments.disabled = !event.trail;
    set(visual, event.particles.visual);
    set(color, event.particles.color);
    set(count, event.particles.count);
    set(size, event.particles.size);
    set(u, (event.particles.emitter?.u ?? 0.5) * 100);
    set(v, (event.particles.emitter?.v ?? 0.5) * 100);
    set(bone, event.boneId || '');
    enabled.checked = event.particles.enabled;
    set(lifetime, event.particles.lifetime);
    set(speed, event.particles.speed);
    set(spread, event.particles.spread);
    set(stretch, event.particles.stretch);
    set(opacity, event.particles.opacity);
    set(radius, event.particles.radius);
    set(space, event.simulationSpace || 'bone');
    set(blend, event.particles.blend);
    set(placement, event.particles.placement);
    set(trajectory, event.particles.trajectory);
    const reveal = event.particles.reveal;
    revealEnabled.checked = reveal.enabled;
    revealOnly.checked = reveal.only;
    set(revealDuration, reveal.duration);
    set(revealCount, reveal.count);
    set(revealTravel, reveal.travel);
    set(revealStagger, reveal.stagger);
    set(revealProfile, reveal.profile);
    spriteTint.checked = event.particles.spriteTint;
  }
  select.onchange = () => {
    selected = select.value;
    refresh();
  };
  planeSelect.onchange = refresh;
  physicsEnabled.onchange = () =>
    change('修改粒子物理模式', (action) => {
      const event = action.particleEvents?.find((e) => e.id === selected);
      if (!event) return;
      if (physicsEnabled.checked) {
        event.physics = Physics.defaults();
        if (event.simulationSpace !== 'world') event.simulationSpace = 'card';
      } else delete event.physics;
    });
  const changePhysics = (
    label: string,
    mutate: (
      p: NonNullable<
        import('../../shared/character').ActionParticleEvent['physics']
      >,
    ) => void,
  ) =>
    change(label, (action) => {
      const event = action.particleEvents?.find((e) => e.id === selected);
      if (event?.physics) mutate(event.physics);
    });
  for (const control of [
    ...initialVelocity,
    ...velocitySpread,
    ...gravity,
    collisionRadius,
    restitution,
    friction,
    maxBounces,
    response,
    ...planeNormal,
    planeDistance,
  ])
    control.onchange = () => {
      if (!control.validity.valid) return;
      changePhysics('修改粒子物理参数', (p) => {
        p.velocity = initialVelocity.map((c) =>
          Number(c.value),
        ) as typeof p.velocity;
        p.spread = velocitySpread.map((c) =>
          Number(c.value),
        ) as typeof p.spread;
        p.gravity = gravity.map((c) => Number(c.value)) as typeof p.gravity;
        p.radius = Number(collisionRadius.value);
        p.restitution = Number(restitution.value);
        p.friction = Number(friction.value);
        p.maxBounces = Number(maxBounces.value);
        p.response = response.value as typeof p.response;
        const plane = p.planes.find((p) => p.id === planeSelect.value);
        if (plane) {
          plane.normal = planeNormal.map((c) =>
            Number(c.value),
          ) as typeof plane.normal;
          plane.distance = Number(planeDistance.value);
        }
      });
    };
  addPlane.onclick = () =>
    changePhysics('添加粒子碰撞平面', (p) => {
      let n = 1;
      while (p.planes.some((plane) => plane.id === 'plane-' + n)) n++;
      p.planes.push({ id: 'plane-' + n, normal: [1, 0, 0], distance: -0.5 });
    });
  removePlane.onclick = () =>
    changePhysics('删除粒子碰撞平面', (p) => {
      p.planes = p.planes.filter((plane) => plane.id !== planeSelect.value);
    });
  add.onclick = () =>
    change('添加动作粒子', (action, doc) => {
      selected = 'event-' + crypto.randomUUID();
      const at = Math.max(
          0,
          Math.min(1, host.current().seconds / action.duration),
        ),
        remaining = action.duration * (1 - at);
      if (remaining < 0.08) throw Error('动作剩余时间不足 0.08 秒');
      action.particleEvents ||= [];
      action.particleEvents.push({
        id: selected,
        name: '动作闪光',
        at,
        duration: Math.min(0.6, remaining),
        particles: C.particles({
          ...doc.particles,
          enabled: true,
          placement: 'surface',
          emitter: { target: 'card', shape: 'point', u: 0.5, v: 0.5 },
          reveal: {
            enabled: true,
            only: true,
            duration: Math.min(0.6, remaining),
          },
        }),
      });
    });
  remove.onclick = () =>
    change('删除动作粒子', (action) => {
      action.particleEvents = action.particleEvents?.filter(
        (e) => e.id !== selected,
      );
      if (!action.particleEvents?.length) delete action.particleEvents;
    });
  copy.onclick = () =>
    change('复制粒子设置到动作事件', (action, doc) => {
      const event = action.particleEvents?.find((e) => e.id === selected);
      if (event) event.particles = structuredClone(C.particles(doc.particles));
    });
  for (const control of [
    name,
    start,
    duration,
    visual,
    color,
    count,
    size,
    u,
    v,
    bone,
    enabled,
    lifetime,
    speed,
    spread,
    stretch,
    opacity,
    radius,
    space,
    blend,
    placement,
    trajectory,
    revealEnabled,
    revealOnly,
    revealDuration,
    revealCount,
    revealTravel,
    revealStagger,
    revealProfile,
    spriteTint,
    stopEmission,
    emissionDuration,
    trail,
    trailDuration,
    trailSegments,
  ])
    control.onchange = () => {
      if (!control.validity.valid) return;
      change('修改动作粒子', (action) => {
        const event = action.particleEvents?.find((e) => e.id === selected);
        if (!event) return;
        event.name = name.value;
        event.at = Number(start.value) / action.duration;
        event.duration = Number(duration.value);
        if (stopEmission.checked)
          event.emissionDuration = Math.min(
            event.duration,
            Number(emissionDuration.value),
          );
        else delete event.emissionDuration;
        if (trail.checked)
          event.trail = {
            duration: Number(trailDuration.value),
            segments: Number(trailSegments.value),
          };
        else delete event.trail;
        event.particles = C.particles({
          ...event.particles,
          visual: visual.value,
          color: color.value,
          count: Number(count.value),
          size: Number(size.value),
          enabled: enabled.checked,
          lifetime: Number(lifetime.value),
          speed: Number(speed.value),
          spread: Number(spread.value),
          stretch: Number(stretch.value),
          opacity: Number(opacity.value),
          radius: Number(radius.value),
          blend: blend.value,
          placement: placement.value,
          trajectory: trajectory.value,
          spriteTint: spriteTint.checked,
          reveal: {
            ...event.particles.reveal,
            enabled: revealEnabled.checked,
            only: revealOnly.checked,
            duration: Number(revealDuration.value),
            count: Number(revealCount.value),
            travel: Number(revealTravel.value),
            stagger: Number(revealStagger.value),
            profile: revealProfile.value,
          },
          emitter: {
            ...event.particles.emitter,
            u: Number(u.value) / 100,
            v: Number(v.value) / 100,
          },
        });
        if (bone.value) event.boneId = bone.value;
        else delete event.boneId;
        if (space.value === 'card' || space.value === 'world')
          event.simulationSpace = space.value;
        else delete event.simulationSpace;
      });
    };
  preset.onchange = () => {
    const value = preset.value;
    if (!value) return;
    change('应用动作粒子预设', (action) => {
      const event = action.particleEvents?.find((e) => e.id === selected);
      if (!event) return;
      const burst = value === 'burst';
      event.particles = C.particles({
        ...event.particles,
        enabled: true,
        visual:
          value === 'blade'
            ? 'streak'
            : value === 'embers'
              ? 'ember'
              : 'glimmer',
        color:
          value === 'embers'
            ? '#ff9b46'
            : value === 'blade'
              ? '#91deff'
              : '#a3f2ff',
        placement: 'surface',
        blend: 'add',
        count: 40,
        lifetime: value === 'blade' ? 0.5 : 1,
        speed: value === 'charge' ? 0.02 : 0.16,
        spread: value === 'blade' ? 0.08 : 0.25,
        size: value === 'blade' ? 0.009 : 0.016,
        stretch: value === 'blade' ? 5 : 1,
        opacity: 0.85,
        trajectory: 'outward',
        reveal: {
          ...C.revealDefaults,
          enabled: burst,
          only: burst,
          duration: Math.min(1, event.duration),
          profile: 'trails',
          stagger: 0.35,
        },
      });
      event.simulationSpace =
        value === 'blade' || value === 'embers' ? 'card' : 'bone';
    });
    preset.value = '';
  };
  sprite.onchange = async () => {
    const file = sprite.files?.[0];
    const state = host.current(),
      actionId = state.action?.id,
      eventId = selected,
      documentId = state.document?.id;
    sprite.value = '';
    if (!file || !actionId || !eventId) return;
    try {
      if (file.size > 1124980) throw Error('粒子 PNG 过大');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(Error('无法读取粒子 PNG'));
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(Error('无法读取粒子 PNG'));
        reader.readAsDataURL(file);
      });
      C.validateSprite(data);
      const decoded = await createImageBitmap(file);
      decoded.close();
      const current = host.current();
      if (
        current.document?.id !== documentId ||
        current.action?.id !== actionId ||
        current.busy ||
        selected !== eventId
      )
        return;
      change('导入动作粒子 PNG', (action) => {
        const event = action.particleEvents?.find((e) => e.id === eventId);
        if (event)
          event.particles = C.particles({
            ...event.particles,
            sprite: data,
            visual: 'sprite',
          });
      });
    } catch (e) {
      host.say(e instanceof Error ? e.message : String(e));
    }
  };
  return { element, refresh };
}
