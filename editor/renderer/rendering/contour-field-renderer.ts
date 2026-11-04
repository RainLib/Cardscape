import type { FrameStyle } from '../../shared/render-models';
import F from '../editing/contour-field-model.ts';
type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Entry {
  key: string;
  texture: WebGLTexture;
  refs: number;
  info: Float32Array;
}
const contexts = new WeakMap<WebGLRenderingContext, Map<string, Entry>>();
/** Unit 7 is reserved by all surface renderers. Owners share one upload per GL
 * context; changing or disposing the last owner releases the physical texture. */
function create(gl: WebGLRenderingContext) {
  let held: Entry | null = null;
  const entries = contexts.get(gl) || new Map<string, Entry>();
  contexts.set(gl, entries);
  function release() {
    if (held && --held.refs === 0) {
      gl.deleteTexture(held.texture);
      entries.delete(held.key);
    }
    held = null;
  }
  function bind(style: FrameStyle, uniforms: Uniforms) {
    const contour = style.contour;
    if (!contour) {
      release();
      gl.uniform1f(uniforms.contourTexture, 0);
      gl.uniform1i(uniforms.contourField, 0);
      return;
    }
    const key = F.key(contour);
    if (held?.key !== key) {
      release();
      let entry = entries.get(key);
      if (!entry) {
        const field = F.create(contour),
          texture = gl.createTexture();
        if (!texture) throw Error('无法创建轮廓距离纹理');
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          field.width,
          field.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          field.data,
        );
        entry = {
          key,
          texture,
          refs: 0,
          info: new Float32Array([
            field.width,
            field.height,
            field.step,
            field.padding,
          ]),
        };
        entries.set(key, entry);
      }
      held = entry;
      held.refs++;
    }
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, held.texture);
    gl.uniform1f(uniforms.contourTexture, 1);
    gl.uniform4fv(uniforms.contourFieldInfo, held.info);
    gl.uniform1i(uniforms.contourField, 7);
    gl.activeTexture(gl.TEXTURE0);
  }
  return { bind, dispose: release };
}
export default { create };
