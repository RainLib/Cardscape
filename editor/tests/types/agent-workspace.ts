import type {
  EditorCommand,
  ChatSession,
  AuthoringTools,
} from '../../shared/agent';
import type { AgentUIHost } from '../../shared/agent-ui';
import type { WorkspaceHost } from '../../shared/workspace';
import { sessionData } from '../../electron/chat-model';

async function contracts(
  host: AgentUIHost,
  workspace: WorkspaceHost,
  tools: AuthoringTools,
  input: unknown,
) {
  const commands: EditorCommand[] = [
    { op: 'characterPart', layerId: 'arm', part: 'arm' },
    { op: 'pivot', layerId: 'arm', u: 0.5 },
    {
      op: 'mask',
      layerId: 'body',
      name: 'motion',
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    },
    { op: 'actionSettings', actionId: 'idle', duration: 2, loop: true },
  ];
  // @ts-expect-error Numeric action durations cannot be supplied as strings.
  commands.push({ op: 'actionSettings', actionId: 'idle', duration: '2' });
  // @ts-expect-error Authoring commands must name their target layer.
  commands.push({ op: 'pivot', u: 0.5 });
  // @ts-expect-error Unsupported operations are rejected by the command vocabulary.
  commands.push({ op: 'deleteAll' });
  const session: ChatSession = await host.invoke('agent-chat-status', {
    id: 'chat',
  });
  session.messages[0].text.toUpperCase();
  // @ts-expect-error Message text is always decoded as a string.
  session.messages[0].text.toFixed();
  // @ts-expect-error Persisted session state has a bounded vocabulary.
  session.state = 'ready';
  const parsed = sessionData(input, 'chat');
  // @ts-expect-error Persisted usage remains opaque until its provider-specific decoder.
  parsed.usage.input_tokens.toFixed();
  const stats = await tools.process('mask_stats', { image: 'png' });
  stats.active_pixels.toFixed();
  // @ts-expect-error A mask statistics response is not an image response.
  stats.image.toUpperCase();
  const image = await tools.process('underpaint', { image: 'png' });
  image.addedMask.toUpperCase();
  workspace.mutate('Edit action', (doc) => (doc.actions[0].duration = 2));
  // @ts-expect-error Workspace edits preserve typed action fields.
  workspace.mutate('Bad action', (doc) => (doc.actions[0].loop = 'yes'));
}
void contracts;
