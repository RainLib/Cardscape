import type { CardDocument } from '../../shared/document';
import type { SkinMesh } from '../../shared/character';
import type { CharacterPanelHost, IKEdit } from '../../shared/character-editor';
import meshTools from '../../renderer/character/character-mesh-tools';
import weights from '../../renderer/character/character-weight-tools';
import poses from '../../renderer/character/character-pose-tools';
import authoring from '../../renderer/character/character-mesh-authoring';
import reduction from '../../renderer/character/character-mesh-reduction';
import motion from '../../renderer/character/character-motion-audit';
import repair from '../../renderer/character/character-weight-repair';
import type { MeshReductionResponse } from '../../shared/mesh-reduction';
import type {
  WeightAuditRequest,
  WeightAuditResponse,
} from '../../shared/weight-audit';

function meshContract(
  doc: CardDocument,
  mesh: SkinMesh,
  host: CharacterPanelHost,
  edit: IKEdit,
) {
  meshTools.insert(mesh, { x: 512, y: 768 }, { document: doc, pin: true });
  weights.paint(mesh, 'root', [{ x: 512, y: 768 }], {
    mode: 'smooth',
    locked: new Set(['root']),
  });
  // @ts-expect-error Locked influences are identified by bone IDs.
  weights.paint(mesh, 'root', [], { locked: new Set([1]) });
  // @ts-expect-error Weight brushes only accept declared modes.
  weights.paint(mesh, 'root', [], { mode: 'blur' });
  // @ts-expect-error Mesh coordinates are numeric source pixels.
  meshTools.insert(mesh, { x: '512', y: 768 });
  // @ts-expect-error Topology edits carry typed FFD actions.
  meshTools.erase(mesh, 0, { document: { actions: ['idle'] } });
  // @ts-expect-error IK solvers are an explicit union.
  edit.solver = 'unknown';
  // @ts-expect-error Joint limits use numeric angles.
  edit.limits = [{ boneId: 'root', min: '-90', max: 90 }];
  host.mutate('Typed layer edit', (next, layer) => {
    if (layer) layer.x = 12;
    // @ts-expect-error Slots preserve their coordinate contract.
    next.slots = [{ id: 'hand', u: '0.5', v: 0.5 }];
  });
  const session = poses.createSession();
  // @ts-expect-error Pose drafts retain a structured action.
  session.restore({ key: 'draft', action: 'idle' });
  const draft = session.snapshot();
  if (draft) {
    const duration: number = draft.action.duration;
    void duration;
  }
}
void meshContract;

function authoringContract(
  doc: CardDocument,
  mesh: SkinMesh,
  reply: MeshReductionResponse,
  weightReply: WeightAuditResponse,
) {
  authoring.fillGroup([mesh], {
    document: doc,
    region: { kind: 'circle', x: 512, y: 768, radius: 60 },
  });
  authoring.fill(mesh, {
    // @ts-expect-error Circle and box regions have different required dimensions.
    region: { kind: 'circle', x: 0, y: 0, width: 60, height: 60 },
  });
  // @ts-expect-error Acceptance callbacks must return a boolean decision.
  authoring.fill(mesh, { accept: () => 'accept' });
  const outline = authoring.outline([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ]);
  // @ts-expect-error A draft surface needs a layer ID before it can enter the rig.
  const saved: SkinMesh = outline;
  reduction.simplify(doc, [mesh], { ratio: 0.7, reference: doc });
  // @ts-expect-error Error thresholds are numeric pixels.
  reduction.settings({ maxError: '0.5' });
  const report = reduction.audit(doc, [mesh])(doc, [mesh]);
  if (report.worst) {
    const vertex: number | null = report.worst.before.vertex;
    // @ts-expect-error Report coordinates remain numeric.
    const seconds: string = report.worst.seconds;
    void vertex;
    void seconds;
  }
  const action = doc.actions?.[0];
  if (action) {
    const collected = motion.audit(doc, action, { collectIssues: true });
    const vertices: number[] = collected.issues.flatMap(
      (issue) => issue.vertices,
    );
    if (collected.firstIssue?.type === 'ik') {
      // @ts-expect-error IK issues do not identify triangle vertices.
      collected.firstIssue.vertices;
    }
    void vertices;
  }
  repair.repair(doc, mesh.layerId, { locked: ['root'] });
  // @ts-expect-error Weight locks use bone IDs.
  repair.repair(doc, mesh.layerId, { locked: [1] });
  if ('progress' in reply) {
    const remaining: number = reply.progress.remaining;
    // @ts-expect-error Progress messages do not contain a final reduction report.
    reply.report;
    void remaining;
  }
  if ('result' in weightReply) {
    const weight: number = weightReply.result.weights[0][0].weight;
    void weight;
  }
  const request: WeightAuditRequest = {
    // @ts-expect-error Only declared worker operations are accepted.
    mode: 'smooth',
    document: doc,
    layerId: mesh.layerId,
  };
  void saved;
  void request;
}
void authoringContract;
