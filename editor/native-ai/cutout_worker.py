"""Local background segmentation. JSON-line IPC; no image uploads or UI work."""
import base64, io, json, os, sys, time, importlib.util
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
MODEL_HOME = ROOT / 'models' / 'rembg'
os.environ['OMP_NUM_THREADS'] = '4'
MODELS = ('u2netp', 'u2net', 'isnet-general-use')
session = None
session_model = None

def model_file(model):
    return MODEL_HOME / 'models' / model / (model + '.onnx')

def info():
    installed = all(importlib.util.find_spec(n) for n in ('onnxruntime', 'numpy', 'PIL'))
    return {'engine': 'U2Net / ONNX Runtime', 'local': True, 'device': 'cpu',
            'installed': installed, 'available': installed and model_file('u2netp').is_file(),
            'models': [{'id': m, 'available': installed and model_file(m).is_file(),
                        'bytes': model_file(m).stat().st_size if model_file(m).is_file() else 0} for m in MODELS]}

def get_session(model):
    global session, session_model
    if model not in MODELS:
        raise ValueError('不支持的本地抠图模型')
    if not info()['installed']:
        raise ValueError('本地抠图依赖未安装，请运行 npm run cutout:setup')
    if not model_file(model).is_file():
        raise ValueError('本地抠图模型未安装，请运行 npm run cutout:setup')
    cached = session is not None and session_model == model
    if not cached:
        import onnxruntime as ort
        # Keep one model resident; switching models releases the previous session.
        session = None
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(model_file(model)), sess_options=options, providers=['CPUExecutionProvider'])
        session_model = model
    return session, cached

def segment(args):
    from PIL import Image
    import numpy as np
    value = args.get('image', '')
    if not isinstance(value, str) or not value.startswith('data:image/') or len(value) > 45 * 1024 * 1024:
        raise ValueError('抠图需要 32 MB 内的内嵌图像')
    raw = base64.b64decode(value.split(',', 1)[1], validate=True)
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError('抠图图像超过 32 MB')
    image = Image.open(io.BytesIO(raw))
    if image.width * image.height > 16777216 or max(image.size) > 8192:
        raise ValueError('抠图图像超过 16 MP / 8192 像素')
    image = image.convert('RGBA')
    model = args.get('model', 'u2netp')
    if model not in MODELS:
        raise ValueError('不支持的本地抠图模型')
    current, cached = get_session(model)
    # Inference sees a neutral backing; source alpha is multiplied once by Rust.
    neutral = Image.new('RGBA', image.size, (127, 127, 127, 255))
    neutral.alpha_composite(image)
    # U2Net's published RGB normalization and saliency output; no matting JIT imports.
    size = 1024 if model == 'isnet-general-use' else 320
    rgb = np.asarray(neutral.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)).astype(np.float32)
    rgb /= max(float(rgb.max()), 1)
    if model == 'isnet-general-use': rgb -= .5
    else: rgb = (rgb - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    tensor = np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])
    prediction = current.run(None, {current.get_inputs()[0].name: tensor})[0][0, 0]
    low, high = float(prediction.min()), float(prediction.max())
    prediction = (prediction - low) / max(high - low, 1e-8)
    mask = Image.fromarray((prediction * 255).clip(0, 255).astype(np.uint8)).resize(image.size, Image.Resampling.LANCZOS)
    if mask.size != image.size:
        raise ValueError('模型输出尺寸与源图不一致')
    pixels = np.asarray(mask)
    original_alpha = np.asarray(image.getchannel('A'))
    effective = (pixels.astype(np.uint16) * original_alpha.astype(np.uint16) // 255).astype(np.uint8)
    if not np.any(effective > 10):
        raise ValueError('未识别到主体，请使用智能对象选区点选或拖框修正')
    result = io.BytesIO()
    mask.save(result, format='PNG')
    return {'mask': 'data:image/png;base64,' + base64.b64encode(result.getvalue()).decode(),
            'width': image.width, 'height': image.height, 'engine': ('ISNet / ' if model == 'isnet-general-use' else 'U2Net / ') + model,
            'modelCached': cached, 'foregroundPixels': int(np.count_nonzero(effective > 10)),
            'transparentPixels': int(np.count_nonzero(effective < 5))}

for line in sys.stdin:
    request = {}
    started = time.monotonic()
    try:
        if len(line) > 64 * 1024 * 1024:
            raise ValueError('抠图输入过大')
        request = json.loads(line)
        from contextlib import redirect_stdout
        with redirect_stdout(sys.stderr):
            op = request.get('op')
            if op == 'info': result = info()
            elif op == 'segment': result = segment(request.get('args', {}))
            else: raise ValueError('不支持的抠图操作')
        response = {'id': request.get('id'), 'ok': True, 'result': result}
    except Exception as error:
        response = {'id': request.get('id'), 'ok': False, 'error': str(error)}
    response['elapsed_ms'] = (time.monotonic() - started) * 1000
    print(json.dumps(response, allow_nan=False), flush=True)
