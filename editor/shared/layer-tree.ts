export interface LayerReference {
  type: 'layer';
  id: string;
}
export interface LayerGroup {
  type: 'group';
  id: string;
  name: string;
  children: LayerNode[];
}
export type LayerNode = LayerReference | LayerGroup;
