import assert from 'node:assert/strict';
import { smokeCharacterViews } from './smoke-character-views.mts';
import { smokeCharacterTimeline } from './smoke-character-timeline.mts';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';
import type {
  MeshReductionRequest,
  MeshReductionResponse,
} from '../shared/mesh-reduction';

export async function smokeCharacterEditing(page: Page): Promise<void> {
  const original = await page.evaluate(() => {
    const doc = window.cardEditorHost.state().document;
    return {
      rig: structuredClone(doc.characterRig),
      actions: structuredClone(doc.actions),
    };
  });
  try {
    await page.evaluate(() => {
      const host = window.cardEditorHost;
      if (
        !host.mutate('Mesh editing smoke fixture', (doc: CardDocument) => {
          const layer = doc.layers.find((layer) => layer.kind === 'foreground');
          if (!layer) throw Error('Mesh smoke requires a foreground layer');
          const vertices: number[] = [],
            uv: number[] = [],
            triangles: number[] = [];
          for (let y = 0; y <= 2; y++)
            for (let x = 0; x <= 2; x++) {
              vertices.push(x * 512, y * 768);
              uv.push(x / 2, y / 2);
            }
          for (let y = 0; y < 2; y++)
            for (let x = 0; x < 2; x++) {
              const a = y * 3 + x;
              triangles.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
            }
          doc.characterRig = {
            schema: 'card-character-rig/1',
            bones: [
              {
                id: 'arm',
                name: 'Arm',
                parentId: 'root',
                x: 200,
                y: 0,
                rotation: 0,
                scale: 1,
              },
              {
                id: 'root',
                name: 'Root',
                parentId: null,
                x: 512,
                y: 768,
                rotation: 0,
                scale: 1,
              },
            ],
            bindings: [{ layerId: layer.id, boneId: 'root' }],
            meshes: [
              {
                layerId: layer.id,
                vertices,
                uv,
                triangles,
                weights: Array.from({ length: 9 }, () => [
                  { boneId: 'root', weight: 0.6 },
                  { boneId: 'arm', weight: 0.4 },
                ]),
                morphs: [],
              },
            ],
          };
          doc.actions = [
            {
              id: 'idle',
              name: 'Idle',
              duration: 1,
              event: 'idle',
              loop: false,
              motion: 1,
              emission: 1,
              bend: 0,
              boneTracks: {
                arm: {
                  rotation: [
                    { at: 0, value: 0 },
                    { at: 1, value: 40 },
                  ],
                },
                root: {
                  rotation: [
                    { at: 0, value: 0 },
                    { at: 1, value: 20 },
                  ],
                },
              },
            },
          ];
        })
      )
        throw Error('Mesh fixture transaction was rejected');
      window.atelierWorkspace.panel('motion', false);
      window.atelierCharacterAdvanced.refresh();
      const spacing = document.getElementById(
        'skin-spacing',
      ) as HTMLInputElement;
      spacing.value = '256';
      (
        document.getElementById('skin-motion-quality') as HTMLInputElement
      ).checked = true;
      const before = host.state().revision;
      (document.getElementById('skin-fill') as HTMLButtonElement).click();
      const mesh = host.state().document.characterRig.meshes[0];
      if (host.state().revision <= before || mesh.weights.length <= 9)
        throw Error('Mesh fill did not commit new vertices');
      if (mesh.vertices.slice(0, 6).join(',') !== '0,0,512,0,1024,0')
        throw Error('Mesh fill moved existing vertices');
      window.atelierCharacterAdvanced.selectVertex(0);
      (document.getElementById('skin-pin') as HTMLButtonElement).click();
      if (
        !host.state().document.characterRig.meshes[0].topology.pins.includes(0)
      )
        throw Error('Mesh pin was not committed');
      window.atelierWeightAudit.run(host.state().layer.id);
    });
    await page.waitForFunction(
      () =>
        document.getElementById('character-weight-audit')?.dataset.ok ===
        'true',
      null,
      { timeout: 30000, polling: 100 },
    );
    const reduced = await page.evaluate(async () => {
      const host = window.cardEditorHost,
        revision = host.state().revision,
        doc = host.state().document;
      const request: MeshReductionRequest = {
        document: {
          layers: doc.layers.map(({ src, ...layer }) => layer),
          slots: doc.slots,
          characterRig: doc.characterRig,
          actions: doc.actions,
        },
        ids: doc.characterRig.meshes.map((mesh) => mesh.layerId),
        options: {
          ratio: 0.8,
          maxError: 0.01,
          maxBoundaryError: 0,
          maxWeightError: 0,
        },
      };
      const result = await new Promise<MeshReductionResponse>(
        (resolve, reject) => {
          const worker = new Worker('character-mesh-reduction-worker.js');
          const timer = setTimeout(() => {
            worker.terminate();
            reject(Error('Reduction smoke timed out'));
          }, 30000);
          worker.onerror = (error) => {
            clearTimeout(timer);
            worker.terminate();
            reject(Error(error.message));
          };
          worker.onmessage = ({
            data,
          }: MessageEvent<MeshReductionResponse>) => {
            if ('progress' in data) return;
            clearTimeout(timer);
            worker.terminate();
            resolve(data);
          };
          worker.postMessage(request);
        },
      );
      if (host.state().revision !== revision)
        throw Error('A worker edited the live document');
      return result;
    });
    if ('error' in reduced) throw Error(reduced.error);
    assert.ok('report' in reduced);
    assert.equal(reduced.report.folds, 0);
    assert.ok(reduced.report.removed > 0);
    assert.ok(reduced.report.afterVertices < reduced.report.beforeVertices);
    console.log('SMOKE_MESH_AND_WEIGHT_PASSED');
    await smokeCharacterViews(page);
    await smokeCharacterTimeline(page);
  } finally {
    await page.evaluate(({ rig, actions }) => {
      window.cardEditorHost.mutate(
        'Restore mesh smoke document',
        (doc: CardDocument) => {
          if (rig) doc.characterRig = rig;
          else delete doc.characterRig;
          doc.actions = actions;
        },
      );
      window.atelierWeightAudit.refresh();
      window.atelierCharacterAdvanced.refresh();
      window.atelierWorkspace.panel('properties', false);
    }, original);
  }
}
