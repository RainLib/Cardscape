import type { DropState, CapturedResource } from '../../shared/workshop';
/* Only pinned component references cross a drag; source pixels stay in the library. */
import importedCardWorkshop from './workshop-model.ts';

const api = (() => {
  'use strict';
  function capture(
    state: DropState,
    resourceId: string,
    version?: number,
  ): CapturedResource {
    if (state.workshop?.editingAsset)
      throw Error('请先返回正面卡片，再应用组件');
    if (state.busy || !state.workshop || !state.document)
      throw Error('请先结束当前编辑或处理');
    const r = importedCardWorkshop.resource(state.workshop, resourceId);
    if (!importedCardWorkshop.kinds[r.kind])
      throw Error('该条目不能作为组件应用');
    const pinned = version || r.versions.at(-1)?.version;
    if (!pinned) throw Error('资源版本不存在');
    importedCardWorkshop.version(state.workshop, {
      resourceId,
      version: pinned,
    });
    return {
      projectId: state.workshop.id,
      documentToken: state.documentToken,
      revision: state.revision,
      resourceId,
      version: pinned,
      kind: r.kind,
      name: r.name,
    };
  }
  function plan(
    state: DropState,
    source: CapturedResource,
    cardId = state.workshop?.activeCardId,
  ) {
    if (state.workshop?.editingAsset)
      throw Error('请先返回正面卡片，再应用组件');
    if (state.busy || !state.workshop || !state.document)
      throw Error('请先结束当前编辑或处理');
    if (source.projectId !== state.workshop.id)
      throw Error('工坊已切换，请重新拖动');
    if (
      source.documentToken !== state.documentToken ||
      source.revision !== state.revision
    )
      throw Error('工程已变化，请重新拖动');
    const r = importedCardWorkshop.resource(state.workshop, source.resourceId);
    if (
      r.kind !== source.kind ||
      !importedCardWorkshop.kinds[r.kind] ||
      !Number.isSafeInteger(source.version)
    )
      throw Error('组件分类或版本无效');
    importedCardWorkshop.version(state.workshop, {
      resourceId: r.id,
      version: source.version,
    });
    const card = importedCardWorkshop.card(state.workshop, cardId),
      b = card.bindings[r.kind];
    return {
      changed: b?.resourceId !== r.id || b?.version !== source.version,
      kind: r.kind,
      name: r.name,
      cardId: card.id,
      cardName: card.name,
      args: {
        kind: r.kind,
        resourceId: r.id,
        version: source.version,
        ids: [card.id],
      },
    };
  }
  return { capture, plan };
})();

export default api;
