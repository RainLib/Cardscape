// The Godot include contains the same pure GLSL. Renderer-specific sampling
// and uniform names stay in the two surface shaders.
const laserFoilGLSL = `
float laserHash(vec2 cell) {
  vec3 seed = fract(vec3(cell.xyx) * vec3(.1031, .1079, .0973));
  seed += dot(seed, seed.yzx + 33.33);
  return fract((seed.x + seed.y) * seed.z);
}

float laserNoise(vec2 point) {
  vec2 cell = floor(point), f = fract(point);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(laserHash(cell), laserHash(cell + vec2(1, 0)), f.x),
    mix(laserHash(cell + vec2(0, 1)), laserHash(cell + vec2(1, 1)), f.x), f.y);
}

float laserBell(float value) {
  return exp2(-1.442695 * value * value);
}

float laserLobe(float phase, float exponent) {
  return pow(clamp(.5 + .5 * cos(phase), 0.0, 1.0), exponent);
}

vec3 laserSpectrum(float phase) {
  return .57 + .43 * cos(6.2831853 * (phase + vec3(0, .67, .34)));
}

// Difference of the nearest two sites gives an irregular, continuous seam.
vec2 laserTiles(vec2 point) {
  vec2 cell = floor(point), f = fract(point);
  float closest = 9.0, second = 9.0, face = 0.0;
  for (int row = -1; row <= 1; row++) {
    for (int col = -1; col <= 1; col++) {
      vec2 neighbor = vec2(float(col), float(row));
      vec2 site = cell + neighbor;
      float h = laserHash(site);
      vec2 offset = neighbor + .15 + .7 * vec2(h, laserHash(site + 17.0)) - f;
      float distance2 = dot(offset, offset);
      if (distance2 < closest) {
        second = closest;
        closest = distance2;
        face = h;
      } else {
        second = min(second, distance2);
      }
    }
  }
  return vec2(sqrt(second) - sqrt(closest), face);
}

vec2 laserPattern(vec2 p, float style, float density, float turn, float time) {
  vec2 centered = p - vec2(.5, .75);
  vec2 grid = p * (6.0 + density * 1.4);
  vec2 cell = floor(grid), f = fract(grid) - .5;
  float seed = laserHash(cell);
  if (style < .5) return vec2(1.0, 0.0);
  if (style < 1.5) {
    float sites = 12.0 + density * 1.4;
    vec2 field = p * sites;
    vec2 tile = floor(field), position = fract(field);
    float tint = laserHash(tile + 23.0);
    vec2 center = .23 + .54 * vec2(laserHash(tile + 41.0), laserHash(tile + 67.0));
    float radius = .055 + .16 * tint;
    float distance = length(position - center);
    float active = step(.54, tint) * smoothstep(.27, .65, laserNoise(p * 3.8));
    float shimmer = .26 + .74 * laserLobe(tint * 6.2831853 + turn * 9.0, 2.0);
    float facet = (laserBell((distance - radius) * 52.0) * .58 +
      laserBell(distance / radius * 1.65) * .42) * active * shimmer;
    return vec2(.89 + facet * .46, (tint - .5) * facet * .22);
  }
  if (style < 2.5) {
    float radial = atan(centered.y, centered.x + .00001);
    float ribs = laserLobe(radial * (18.0 + floor(density)) + turn * 4.0, 4.0);
    return vec2(.38 + .95 * ribs, radial * .12 + ribs * .14);
  }
  if (style < 3.5) {
    float pleats = sin(p.y * (10.0 + density) + 2.5 * sin(p.x * 5.7 - turn) + time * .65);
    return vec2(.62 + .41 * pleats * pleats, pleats * .22);
  }
  if (style < 4.5) {
    vec2 lattice = vec2(grid.x - grid.y * .5, grid.y);
    vec2 triangle = fract(lattice);
    float halfCell = step(1.0, triangle.x + triangle.y);
    float facet = laserHash(floor(lattice) + 41.0 * halfCell);
    float flash = laserLobe(facet * 6.28318 + turn * 7.0, 3.0);
    return vec2(.36 + .96 * flash, facet * .8);
  }
  if (style < 5.5) {
    float ribbon = .5 + .5 * sin(7.2 * (p.y + .4 * sin(4.5 * p.x)) - 3.2 * turn);
    return vec2(.88 + .25 * ribbon, ribbon * .42);
  }
  if (style < 6.5 || (style > 9.5 && style < 10.5)) {
    vec2 tiles = laserTiles(p * (4.0 + density) + vec2(.2, .6));
    float seam = laserBell(tiles.x * (style < 6.5 ? 45.0 : 29.0));
    float flash = laserLobe(tiles.y * 6.28318 - turn * 6.0, 5.0);
    if (style < 6.5) return vec2(.28 + seam * 1.08, .05 + seam * .07);
    return vec2(.35 + .82 * flash + seam * .38, tiles.y * .9);
  }
  if (style < 7.5) {
    float a = atan(f.y, f.x + .00001) + seed * 6.28318;
    float petal = .20 + .10 * cos(a * 5.0);
    float stamp = (1.0 - smoothstep(petal - .035, petal + .015, length(f))) * step(.23, seed);
    return vec2(.40 + stamp * .95, .55 + stamp * .18);
  }
  if (style < 8.5) {
    float a = atan(f.y, f.x + .00001) + seed;
    float crystal = pow(abs(cos(3.0 * a)), 16.0) * (1.0 - smoothstep(.11, .43, length(f)));
    float branches = pow(abs(cos(6.0 * a + 3.0 * length(f))), 12.0) * smoothstep(.05, .25, length(f));
    return vec2(.35 + crystal * 1.13 + branches * .24, .26 + crystal * .12);
  }
  if (style < 9.5) {
    float fold = p.y - .63 - .21 * sin(p.x * 6.7 + time * .85 + turn) - .09 * sin(p.x * 14.0 - turn);
    float curtain = laserBell(fold * 5.5) * (.45 + .55 * laserNoise(vec2(p.x * 67.0, p.y * 3.0)));
    return vec2(.22 + 1.18 * curtain, .34 + .24 * clamp(fold, -.5, .5));
  }
  if (style < 11.5) {
    float row = floor(p.y * (28.0 + density * 4.0));
    float shift = step(.69, laserHash(vec2(row, floor(time * 2.0 + turn * 3.0)))) * .24;
    float panel = step(.47, laserHash(vec2(floor((p.x + shift) * 13.0), row)));
    float scan = .5 + .5 * cos(p.y * 343.0);
    return vec2(.24 + panel * .59 + scan * .29, .51 + panel * .31);
  }
  if (style < 12.5) {
    float tongue = laserNoise(vec2(p.x * (8.0 + density), p.y * 3.0 + time * 1.7));
    float height = .25 + tongue * .88;
    float flame = smoothstep(height - .30, height + .05, p.y);
    return vec2(.23 + flame * 1.15, .10 + tongue * .15);
  }
  if (style < 13.5) {
    float z = p.y * (9.0 + density);
    float pulse = .8 + .2 * cos(time * 4.0 + turn * 9.0);
    float kink = mix(laserHash(vec2(floor(z), 3)), laserHash(vec2(floor(z) + 1.0, 3)), fract(z));
    float span = p.x - .46 - .31 * (kink - .5) - turn * .10;
    float arc = laserBell(span * 29.0) + .6 * laserBell((span + .23 * sin(z * .7)) * 55.0);
    return vec2(.22 + .85 * arc * pulse, .53 + arc * .10);
  }
  if (style < 14.5) {
    float diffraction = laserLobe((p.x * .85 + p.y * .46) * (120.0 + density * 23.0) - turn * 15.0, 3.0);
    return vec2(.43 + diffraction * .72, diffraction * .30);
  }
  if (style < 15.5) {
    float height = laserNoise(p * 3.1 + .12 * sin(time)) * 1.3 +
      .42 * laserNoise(p * 7.5) + .3 * length(centered);
    float line = laserLobe(height * (36.0 + density * 7.0) - turn * 2.5, 10.0);
    return vec2(.34 + .80 * line, height * .54);
  }
  float flow = laserNoise(vec2(4.0 * p.x + sin(p.y * 6.0), p.y * 5.0 - time * .3));
  float meniscus = laserLobe(flow * 15.0 + turn * 4.5, 5.0);
  return vec2(.34 + meniscus * 1.08, flow * .20);
}

vec3 laserRelief(vec4 low, vec4 high, float gain) {
  const vec3 luma = vec3(.2126, .7152, .0722);
  float edge = clamp(dot(high.rgb - low.rgb, luma), -.2, .24);
  return vec3(edge * gain * .23 * min(low.a, high.a));
}

vec2 laserView(vec2 angle) {
  return clamp(sin(angle) * vec2(3.3255, -5.4876), vec2(-1.5), vec2(1.5));
}

vec3 laserRefraction(vec2 uv, vec2 view, float time, float style) {
  if (style < 9.5 || style > 11.5) return vec3(0.0);
  if (style < 10.5) {
    vec2 facet = laserTiles(uv * vec2(11.0, 16.5));
    float direction = facet.y * 6.2831853;
    float seam = laserBell(facet.x * 20.0);
    return vec3(vec2(cos(direction), sin(direction)) *
      (.004 + .005 * sin(direction + view.x * 5.0 + view.y * 4.0)), .002 + .006 * seam);
  }
  float row = floor(uv.y * 76.0);
  float gate = laserHash(vec2(row, floor(time * 2.4 + view.x * 4.9)));
  float displaced = step(.785, gate);
  return vec3(displaced * (gate - .9) * .14, 0.0, .002 + .009 * displaced);
}

vec3 laserRefractedRGB(vec4 red, vec4 green, vec4 blue, vec3 original, vec4 toneAdjust) {
  vec3 color = mix(original, vec3(red.r, green.g, blue.b),
    vec3(red.a, green.a, blue.a));
  color = pow(clamp((color - .5) * toneAdjust.y + .5 + toneAdjust.x, 0.0, 1.0), vec3(1.0 / toneAdjust.w));
  return clamp(mix(vec3(dot(color, vec3(.2126, .7152, .0722))), color, toneAdjust.z), 0.0, 1.0);
}

vec3 laserTint(vec3 spectral, float pattern, vec3 highlight) {
  if (pattern > 4.5 && pattern < 5.5) return mix(spectral, vec3(.95, .85, .98), .35);
  if (pattern > 5.5 && pattern < 6.5) return mix(spectral, highlight, .76);
  if (pattern > 6.5 && pattern < 7.5) return mix(spectral, vec3(1.0, .43, .65), .68);
  if (pattern > 7.5 && pattern < 8.5) return mix(spectral, vec3(.52, .84, 1.0), .70);
  if (pattern > 8.5 && pattern < 9.5) return mix(spectral, vec3(.17, .90, .63), .48);
  if (pattern > 11.5 && pattern < 12.5) return mix(spectral, vec3(1.0, .33, .06), .75);
  if (pattern > 15.5) return mix(spectral, vec3(.82, .92, 1.0), .63);
  return spectral;
}

vec3 laserOverlay(vec2 p, float style, float strength, float density, float turn,
  float filmTime, float phase, vec3 highlight) {
  if (strength <= 0.0) return vec3(0.0);
  vec2 stamp = laserPattern(p, style, density, turn, filmTime);
  float envelope = .33 + .67 * laserLobe(phase * 6.2831853 + style * .43, 2.6);
  return laserTint(laserSpectrum(phase + stamp.y), style, highlight) *
    (strength * stamp.x * envelope * .24);
}

vec3 laserSurface(vec3 base, vec2 uv, vec2 view, float time, float density,
  vec4 controls, vec4 modes, vec3 metal, vec3 highlight, float foilSurface, float protection,
  vec3 overlays, vec3 overlayGains, vec2 signatureAnchor) {
  if (dot(controls, vec4(1.0)) + dot(overlayGains, vec3(1.0)) <= 0.0) return base;

  vec2 eye = laserView(view);
  float turn = eye.x * .94 + eye.y * .29;
  vec2 p = vec2(uv.x, uv.y * 1.5);
  float diagonal = dot(uv - .5, vec2(.8, .9)) - turn;
  float band = laserBell(diagonal / .112);
  float core = laserBell((diagonal - .014) / .022);
  float bounce = laserBell((diagonal + .29) / .047);
  vec2 spotOrigin = vec2(.52 - eye.x * .42, .72 - eye.y * .52);
  float spot = laserBell(length(p - spotOrigin) / .265);
  float glass = controls.z * (.235 * band + .208 * core + .084 * bounce + .074 * spot);

  // The cover light runs across the whole card. Equal RGB lift preserves hue,
  // and the brightest channel limits headroom so highlights cannot clip it.
  float headroom = 1.0 - max(base.r, max(base.g, base.b));
  vec3 protectedColor = base + vec3(min(headroom, glass * .49));
  if (protection >= .999) return protectedColor;

  float luma = dot(base, vec3(.299, .587, .114));
  float shadows = 1.0 - smoothstep(.155, .47, luma);
  float warmth = smoothstep(.055, .28, base.r - base.b) *
    smoothstep(.26, .65, base.g);
  float paleMetal = smoothstep(.80, .95, luma) * (1.0 - smoothstep(.12, .37, base.r - base.b));
  float foilArea = max(foilSurface, clamp(.68 * warmth + .38 * paleMetal, 0.0, 1.0));
  vec2 pattern = laserPattern(p, modes.x, density, eye.x + eye.y * .54, time);
  float finePhase = laserNoise(p * 4.35 + vec2(1.2, -.6));
  float phaseA = dot(p, vec2(.81, .49)) + dot(eye, vec2(.54, .29)) + finePhase * .086;
  float phaseB = dot(p, vec2(-.42, .78)) + dot(eye, vec2(-.41, .51)) + pattern.y * .52;
  float lobeA = laserLobe(6.2831853 * (dot(p, vec2(1.21, .84)) - dot(eye, vec2(.51, .26))), 2.0);
  float lobeB = laserLobe(6.2831853 * (dot(p, vec2(-.69, 1.08)) + dot(eye, vec2(.41, -.31))), 1.65);
  vec3 leftFilm = laserTint(laserSpectrum(phaseA + .009 * time), modes.x, highlight);
  vec3 rightFilm = laserTint(laserSpectrum(phaseB), modes.x, highlight);
  vec3 fringe = laserSpectrum(diagonal * 3.7 + .10);

  if (modes.y > .5) {
    metal = mix(metal, vec3(.95, .63, .22), warmth * .68);
    highlight = mix(vec3(.76, .90, 1.0), highlight, .48 + .52 * warmth);
  }

  float grainPhase = (p.x + p.y) * (612.0 + density * 6.1) + dot(eye, vec2(4.8, -2.9));
  float grain = clamp(.5 + .5 * cos(grainPhase), 0.0, 1.0);
  float sheet = (.055 + .945 * shadows) * (1.0 - .71 * foilArea);
  vec3 film = leftFilm * (.017 + .265 * lobeA) +
    rightFilm * (.016 + .235 * lobeB) * (.28 + .72 * pattern.x);
  float overlayPhase = phaseA + .17 * phaseB;
  vec3 stack = laserOverlay(p, overlays.x, overlayGains.x, density, turn, time, overlayPhase, highlight);
  stack += laserOverlay(p, overlays.y, overlayGains.y, density, turn, time, overlayPhase, highlight);
  stack += laserOverlay(p, overlays.z, overlayGains.z, density, turn, time, overlayPhase, highlight);
  vec3 spectral = controls.x * sheet * (film * (.70 + .30 * grain) +
    vec3(.025) * grain * (shadows + foilArea)) + sheet * stack;
  float brushed = laserNoise(vec2((p.x - p.y) * 320.0, (p.x + p.y) * 5.5));
  float foilReflection = laserLobe(6.2831853 * (dot(p, vec2(.88, -.54)) +
    .16 * brushed) + dot(eye, vec2(4.9, -2.8)), 4.1);
  spectral += controls.y * foilArea * (metal * (.074 + .28 * foilReflection) +
    highlight * (.125 * band + .36 * core) + leftFilm * .062 * lobeA);

  vec2 glitter = p * (143.0 + density * 7.7);
  vec2 cell = floor(glitter);
  float seed = laserHash(cell);
  vec2 center = .22 + .56 * vec2(laserHash(cell + 52.0), laserHash(cell + 151.0));
  float flash = laserLobe(6.2831853 * seed + dot(eye, vec2(6.1, 3.7)) + time * .16, 5.8);
  float fleck = laserBell(length(fract(glitter) - center) * (8.5 + 3.0 * seed)) * step(.923, seed);
  spectral += controls.w * fleck * (.028 + 1.60 * flash) * (.17 + .83 * shadows) *
    mix(vec3(.94, .97, 1.0), leftFilm, .13);

  if (modes.z > .5 && signatureAnchor.x >= 0.0) {
    vec2 point = (uv - signatureAnchor) * vec2(1.0, 1.5);
    float radius = length(point);
    float pulse = .44 + .56 * laserLobe(4.4 * time + turn * 5.8, 2.4);
    float arms = laserBell(point.y / .0035) * laserBell(point.x / .076);
    if (modes.z < 2.5) {
      arms += laserBell(point.x / .0035) * laserBell(point.y / .075);
      arms += .37 * laserBell((radius - (.039 + .013 * pulse)) * 235.0);
      arms += .18 * laserBell(radius / .048);
    }
    spectral += controls.w * pulse * arms * (.61 + .39 * band) *
      mix(vec3(1.0), leftFilm, .29);
  } else if (modes.z > .5) {
    vec2 signGrid = p * 5.35, signCell = floor(signGrid);
    vec2 point = abs(fract(signGrid) - .24 - .52 * vec2(laserHash(signCell), laserHash(signCell + 13.0)));
    float arms = laserBell(point.y / .019) * laserBell(point.x / .35);
    if (modes.z < 2.5) arms += laserBell(point.x / .022) * laserBell(point.y / .30);
    float nearSweep = laserBell(diagonal / .105);
    float pulse = .48 + .52 * laserLobe(time * 4.0 + laserHash(signCell) * 6.2831853, 3.0);
    float signLight = modes.z < 1.5 ? smoothstep(.49, .88, luma) : .85;
    spectral += controls.w * highlight * arms * signLight * (pulse * .32 + nearSweep * .87);
  }

  float coverLight = glass * (.84 + .56 * foilArea + .29 * shadows);
  vec3 clearCoat = vec3(.99, .985, .955) * coverLight +
    fringe * controls.z * (.097 * band) * (shadows + foilArea);
  vec3 reflected = min(vec3(1.0), base + (spectral + clearCoat) * (1.0 - .20 * base));
  return mix(reflected, protectedColor, clamp(protection, 0.0, 1.0));
}
`;

export default laserFoilGLSL;
