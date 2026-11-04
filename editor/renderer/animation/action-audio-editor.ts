import AudioModel from './action-audio-model.ts';
import type { ActionAudioEvent, CharacterAction } from '../../shared/character';
import type { CardDocument } from '../../shared/document';
import type { PreviewAPI } from '../../shared/preview';
interface Host {
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
export function createActionAudioEditor(host: Host, document: Document) {
  const element = document.createElement('details');
  element.id = 'timeline-audio';
  const summary = document.createElement('summary');
  summary.textContent = '动作音效事件';
  element.append(summary);
  const note = document.createElement('p');
  note.textContent =
    '导入 WAV、MP3 或 Ogg Vorbis，解码后保存为跨平台 PCM WAV（最长 30 秒）。启用试听后随动作播放，暂停及定位保持同步；默认静音。';
  element.append(note);
  const enable = document.createElement('button');
  enable.type = 'button';
  enable.textContent = '启用音效试听';
  element.append(enable);
  enable.onclick = async () => {
    const preview = (window as unknown as { cardPreview: PreviewAPI })
      .cardPreview;
    const value = await preview.setAudioEnabled(
      !preview.getAudioState().enabled,
    );
    enable.textContent = value ? '关闭音效试听' : '启用音效试听';
    if (!value && preview.getAudioState().error)
      host.say(preview.getAudioState().error);
  };
  const select = document.createElement('select');
  select.setAttribute('aria-label', '当前音效事件');
  element.append(select);
  const fields = document.createElement('fieldset');
  element.append(fields);
  function field(
    label: string,
    type: string,
    min?: string,
    max?: string,
    step?: string,
  ) {
    const row = document.createElement('label');
    row.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.setAttribute('aria-label', label);
    if (min) input.min = min;
    if (max) input.max = max;
    if (step) input.step = step;
    row.append(input);
    fields.append(row);
    return input;
  }
  const name = field('音效事件名称', 'text'),
    at = field('音效触发（秒）', 'number', '0', undefined, '.01'),
    duration = field('音效持续（秒）', 'number', '.02', '30', '.01'),
    offset = field('音效裁剪起点（秒）', 'number', '0', '30', '.01'),
    volume = field('音效音量', 'number', '0', '1', '.01'),
    rate = field('音效速度', 'number', '.25', '4', '.05'),
    loop = field('循环音效素材', 'checkbox'),
    enabled = field('启用此音效事件', 'checkbox');
  name.maxLength = 120;
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg';
  file.setAttribute('aria-label', '导入动作音效');
  element.append(file);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '删除音效事件';
  element.append(remove);
  const sourceNote = document.createElement('p');
  element.append(sourceNote);
  let selected = '';
  function change(
    label: string,
    mutate: (event: ActionAudioEvent, action: CharacterAction) => void,
  ) {
    host.mutate(label, (_d, action) => {
      const event = action.audioEvents?.find((e) => e.id === selected);
      if (event) {
        mutate(event, action);
        AudioModel.validate(action);
      }
    });
  }
  function numeric(
    input: HTMLInputElement,
    set: (event: ActionAudioEvent, action: CharacterAction, n: number) => void,
  ) {
    input.onchange = () => {
      if (input.value !== '' && input.validity.valid)
        change('编辑动作音效', (event, action) =>
          set(event, action, Number(input.value)),
        );
    };
  }
  name.onchange = () =>
    change('修改音效事件名称', (e) => {
      e.name = name.value;
    });
  numeric(at, (e, a, n) => {
    e.at = n / a.duration;
  });
  numeric(duration, (e, _a, n) => {
    e.duration = n;
  });
  numeric(offset, (e, _a, n) => {
    e.offset = n;
  });
  numeric(volume, (e, _a, n) => {
    e.volume = n;
  });
  numeric(rate, (e, _a, n) => {
    e.playbackRate = n;
  });
  loop.onchange = () =>
    change('切换素材循环', (e) => {
      e.loop = loop.checked;
    });
  enabled.onchange = () =>
    change('切换音效事件', (e) => {
      e.enabled = enabled.checked;
    });
  select.onchange = () => {
    selected = select.value;
    refresh();
  };
  remove.onclick = () =>
    host.mutate('删除音效事件', (_d, a) => {
      a.audioEvents = (a.audioEvents || []).filter((e) => e.id !== selected);
      if (!a.audioEvents.length) delete a.audioEvents;
    });
  function refresh() {
    const state = host.current(),
      events = state.action?.audioEvents || [];
    if (!events.some((e) => e.id === selected)) selected = events[0]?.id || '';
    select.replaceChildren();
    for (const e of events) {
      const option = document.createElement('option');
      option.value = e.id;
      option.textContent = e.name;
      select.append(option);
    }
    select.value = selected;
    const event = events.find((e) => e.id === selected);
    fields.disabled = !event || state.busy;
    file.disabled = !state.action || state.busy || events.length >= 16;
    remove.disabled = !event || state.busy;
    if (!event) {
      sourceNote.textContent = '在当前动作时间导入素材以创建事件。';
      return;
    }
    name.value = event.name;
    at.value = String(event.at * state.action!.duration);
    at.max = String(state.action!.duration - event.duration);
    duration.value = String(event.duration);
    duration.max = String(
      Math.min(30, state.action!.duration * (1 - event.at)),
    );
    offset.value = String(event.offset);
    offset.max = String(event.sourceDuration - 0.01);
    volume.value = String(event.volume);
    rate.value = String(event.playbackRate);
    loop.checked = event.loop;
    enabled.checked = event.enabled;
    sourceNote.textContent = `素材 ${event.sourceDuration.toFixed(2)} 秒；非循环在素材播完或事件结束时停止。`;
  }
  file.onchange = async () => {
    const source = file.files?.[0],
      state = host.current(),
      documentId = state.document?.id,
      actionId = state.action?.id;
    file.value = '';
    if (!source || !actionId) return;
    let context: AudioContext | null = null;
    try {
      if (source.size > AudioModel.limits.bytes)
        throw Error('音效素材超过 8 MiB');
      context = new AudioContext({ sampleRate: 48000 });
      const decoded = await context.decodeAudioData(await source.arrayBuffer());
      const bytes = AudioModel.pcm(
        Array.from({ length: decoded.numberOfChannels }, (_, i) =>
          decoded.getChannelData(i),
        ),
        decoded.sampleRate,
      );
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(Error('无法编码音效'));
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(Error('无法编码音效'));
        reader.readAsDataURL(new Blob([bytes.buffer], { type: 'audio/wav' }));
      });
      const current = host.current();
      if (
        current.document?.id !== documentId ||
        current.action?.id !== actionId ||
        current.busy
      )
        return;
      const id = 'audio-' + crypto.randomUUID();
      host.mutate('导入动作音效', (_d, action) => {
        const start = Math.max(
          0,
          Math.min(action.duration - 0.02, state.seconds),
        );
        const event: ActionAudioEvent = {
          id,
          name: source.name.slice(0, 120),
          src,
          sourceDuration: decoded.duration,
          at: start / action.duration,
          duration: Math.min(decoded.duration, action.duration - start),
          offset: 0,
          volume: 0.65,
          playbackRate: 1,
          loop: false,
          enabled: true,
        };
        action.audioEvents = [...(action.audioEvents || []), event];
        AudioModel.validate(action);
        selected = id;
      });
    } catch (reason) {
      host.say(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (context) await context.close().catch(() => {});
    }
  };
  return { element, refresh };
}
