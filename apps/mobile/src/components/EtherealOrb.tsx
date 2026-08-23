/**
 * EtherealOrb v5 — Reference-faithful GLSL rebuild
 *
 * Rendering: expo-gl / WebGL (Expo Go compatible)
 *
 * Key visual architecture from reference analysis:
 *  - Large domain-warped FBM clouds at LOW frequency (scale 1.5–2.5)
 *    for the big cyan/violet fluid masses visible inside the sphere
 *  - Fake 3D Fresnel rim via sphere-SDF z-component
 *  - Two drifting internal point lights that illuminate the fluid
 *  - Fine-detail layer embedded inside the main masses (scale ~5–6)
 *  - Depth field to create front/back layering inside the sphere
 *  - Premultiplied alpha — transparent background blends with app dark theme
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { JarvisState } from '@jarvis/shared';

// ─── Public types ─────────────────────────────────────────────────────────────

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface EtherealOrbProps {
  state?: OrbState | JarvisState;
  size?: number;
  audioLevel?: number;
  onPress?: () => void;
  showStatusLabel?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeState(
  s?: OrbState | JarvisState,
): 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' {
  if (!s) return 'idle';
  const v = s.toLowerCase();
  if (v === 'listening') return 'listening';
  if (v === 'thinking' || v === 'processing') return 'thinking';
  if (v === 'speaking') return 'speaking';
  if (v === 'error') return 'error';
  return 'idle';
}

function stateToIndex(s: ReturnType<typeof normalizeState>): number {
  return { idle: 0, listening: 1, thinking: 2, speaking: 3, error: 0 }[s];
}

const STATE_LABEL: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Error',
};

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform float u_time;
uniform float u_state;   // 0=idle 1=listening 2=thinking 3=speaking
uniform float u_audio;   // 0..1 amplitude
uniform float u_pulsePhase; // Monotonically accumulated pulse phase
uniform vec2  u_res;

#define PI  3.14159265359
#define TAU 6.28318530718

// ── Palette (matches design tokens) ───────────────────────────────────────
#define CYAN_BRIGHT  vec3(0.55, 0.97, 1.00)
#define CYAN         vec3(0.00, 0.94, 1.00)
#define CYAN_DEEP    vec3(0.00, 0.25, 0.80)
#define VIOLET_HOT   vec3(0.80, 0.45, 1.00)
#define VIOLET       vec3(0.60, 0.22, 0.90)
#define VIOLET_DEEP  vec3(0.28, 0.00, 0.58)
#define DARK_VOID    vec3(0.008, 0.008, 0.025)

// ── Noise ──────────────────────────────────────────────────────────────────
vec2 hash2(vec2 p) {
  p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453);
}
float gn(vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
  return mix(mix(dot(hash2(i),f),dot(hash2(i+vec2(1,0)),f-vec2(1,0)),u.x),
             mix(dot(hash2(i+vec2(0,1)),f-vec2(0,1)),dot(hash2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p, int o) {
  float v=0.0, a=0.5;
  for(int i=0;i<7;i++){
    if(i>=o) break;
    v+=a*gn(p); p=p*2.1+vec2(1.7,9.2); a*=0.5;
  }
  return v;
}

vec2 rot2(vec2 p, float a) {
  float c=cos(a),s=sin(a);
  return vec2(c*p.x-s*p.y, s*p.x+c*p.y);
}

// ── Main ───────────────────────────────────────────────────────────────────
void main() {

  // Aspect-corrected UV, origin at centre
  vec2 uv = (gl_FragCoord.xy - u_res*0.5) / min(u_res.x, u_res.y);
  float d  = length(uv);

  // ── State weights ────────────────────────────────────────────────────
  float isL = clamp(1.0-abs(u_state-1.0),0.,1.);  // listening
  float isT = clamp(1.0-abs(u_state-2.0),0.,1.);  // thinking
  float isS = clamp(1.0-abs(u_state-3.0),0.,1.);  // speaking
  float audio = clamp(u_audio,0.,1.);

  float t = u_time;

  // ── Uniform Symmetrical Harmonic Pulse ──────────────────────────────
  // Uses accumulated phase from JS: distinct state frequencies, zero transition jitter
  float uniformPulse = 0.5 + 0.5 * sin(u_pulsePhase);

  // Dynamic sphere radius with clearly visible living expansion (~9-10% inflation)
  float R = 0.286 + (uniformPulse * 0.028 + audio * 0.016);

  // ── Sphere masks ─────────────────────────────────────────────────────
  float orbMask = 1.0 - smoothstep(R-0.003, R+0.003, d);
  float intMask = 1.0 - smoothstep(0.0, R, d);

  // ── Fake 3D sphere normal for Fresnel ────────────────────────────────
  float sinPhi  = clamp(d/R, 0.0, 1.0);
  float cosPhi  = sqrt(max(0.0, 1.0 - sinPhi*sinPhi));
  float fresnel = pow(1.0 - cosPhi, 3.0);

  // ── LARGE FLUID MASSES ───────────────────────────────────────────────
  // Domain warp at LOW scale so structures are large and cloud-like.
  // Two independent warp layers per cloud → organic boundary shapes.

  // Cyan cloud
  vec2 wC1 = vec2(fbm(uv*1.6 + t*0.055, 3),
                  fbm(uv*1.6 + vec2(5.2,1.3) + t*0.048, 3));
  vec2 wC2 = vec2(fbm(uv*2.0 + wC1*1.4 + t*0.04, 3),
                  fbm(uv*2.0 + wC1*1.4 + vec2(3.1,7.4) + t*0.036, 3));
  float cField = fbm(uv*2.3 + wC2*1.7 + t*0.07, 4);
  cField = cField*0.5 + 0.5;
  // ── Cyan wave ribbons ──────────────────────────────────────────────
  float cWave = smoothstep(0.54, 0.76, cField);  // Distinct wave body
  float cCore = smoothstep(0.66, 0.84, cField);  // Intense luminous light core
  float cGlow = smoothstep(0.46, 0.62, cField);  // Tight optical glow halo

  // Violet cloud — independent seed, direction, and speed
  vec2 wV1 = vec2(fbm(uv*1.5 + vec2(3.7,8.1) - t*0.042, 3),
                  fbm(uv*1.5 + vec2(1.9,4.4) - t*0.050, 3));
  vec2 wV2 = vec2(fbm(uv*1.9 + wV1*1.3 + vec2(2.1,5.5) - t*0.033, 3),
                  fbm(uv*1.9 + wV1*1.3 + vec2(7.2,0.8) - t*0.038, 3));
  float vField = fbm(uv*2.1 + wV2*1.5 - t*0.055, 4);
  vField = vField*0.5 + 0.5;

  // ── Violet wave ribbons ────────────────────────────────────────────
  float vWave = smoothstep(0.53, 0.74, vField);  // Distinct wave body
  float vCore = smoothstep(0.65, 0.82, vField);  // Intense luminous light core
  float vGlow = smoothstep(0.45, 0.60, vField);  // Tight optical glow halo

  // ── DEPTH FIELD ──────────────────────────────────────────────────────
  float depthN = fbm(uv*1.2 + vec2(7.3,2.1) + t*0.028, 3)*0.5+0.5;
  float depth  = smoothstep(0.32, 0.68, depthN);

  // ── FINE DETAIL / FILAMENTS (Crisp Luminous Ribbons) ─────────────────
  vec2 wF = vec2(fbm(uv*5.5 + t*0.20, 3),
                 fbm(uv*5.5 + vec2(4.1,2.9) + t*0.17, 3));
  float fField = fbm(uv*6.5 + wF*1.1 + t*0.15, 5)*0.5+0.5;
  float filament = pow(smoothstep(0.68, 0.84, fField), 3.0);

  // ── INTERNAL POINT LIGHTS ────────────────────────────────────────────
  vec2  lA  = vec2(sin(t*0.130)*R*0.45, cos(t*0.110)*R*0.38);
  float litA = 1.0 / (1.0 + 20.0*(dot(uv-lA,uv-lA)/(R*R)));

  vec2  lB  = vec2(cos(t*0.092+2.10)*R*0.42, sin(t*0.081+1.30)*R*0.42);
  float litB = 1.0 / (1.0 + 24.0*(dot(uv-lB,uv-lB)/(R*R)));

  // ─────────────────────────────────────────────────────────────────────
  // COMPOSITING
  // ─────────────────────────────────────────────────────────────────────

  vec3  col   = vec3(0.0);
  float alpha = 0.0;

  // ── INTERIOR SPHERE ──────────────────────────────────────────────────
  if (orbMask > 0.001) {

    // Pure deep dark obsidian cavity (clean empty space)
    vec3 base = DARK_VOID * (0.15 + 0.20*fresnel);

    // ── Cyan Glowing Fluid Wave ───────────────────────────────────────
    float cInt = (0.85 + isL*0.40 + isS*0.30 + audio*0.30) * intMask;
    
    // Wave optical glow (ambient light around the wave)
    vec3  cOpticalGlow = CYAN * cGlow * 0.45 * cInt;
    // Wave body (vivid cyan luminous fluid)
    vec3  cBody = mix(CYAN_DEEP, CYAN, cWave) * cWave * 1.6 * cInt;
    cBody += CYAN_BRIGHT * litA * cWave * 0.35 * cInt;
    // Incandescent Core (pure white/bright cyan emitting light)
    vec3  cEmission = vec3(0.92, 0.99, 1.0) * cCore * 2.8 * cInt;
    
    vec3 cTotal = (cOpticalGlow + cBody + cEmission) * (0.45 + 0.55*depth);

    // ── Violet Glowing Fluid Wave ─────────────────────────────────────
    float vInt = (0.75 + isT*0.70 + 0.20 + audio*0.20) * intMask;
    
    // Wave optical glow
    vec3  vOpticalGlow = VIOLET * vGlow * 0.35 * vInt;
    // Wave body (vivid violet luminous fluid)
    vec3  vBody = mix(VIOLET_DEEP, VIOLET, vWave) * vWave * 1.5 * vInt;
    vBody += VIOLET_HOT * litB * vWave * 0.30 * vInt;
    // Incandescent Core (pure white/magenta emitting light)
    vec3  vEmission = vec3(0.98, 0.85, 1.0) * vCore * 2.4 * vInt;
    
    vec3 vTotal = (vOpticalGlow + vBody + vEmission) * (0.40 + 0.60*(1.0-depth));

    // ── Fine Luminous Filaments ──────────────────────────────────────
    float fInt = (0.80 + isL*0.30 + isS*(0.35+audio*0.45)) * intMask;
    vec3  fCol = mix(CYAN_BRIGHT, VIOLET_HOT, 0.30+0.30*sin(t*0.30+uv.x*4.5));
    vec3  fWaveEnergy = fCol * filament * 2.2 * fInt * depth;
    vec3  fHotGlow = vec3(0.95, 1.0, 1.0) * pow(filament, 1.8) * 2.0 * fInt * depth;

    // ── Fresnel rim (Subtle glass edge reflection) ───────────────────
    float rimAngle = atan(uv.y, uv.x);
    float rimCyan  = 0.48 + 0.42*sin(rimAngle + t*0.12);
    vec3  rimCol   = mix(VIOLET*0.50, CYAN*0.80, rimCyan);
    vec3  rimEnergy = rimCol * fresnel * 0.22 * orbMask;

    // ── Compose interior: Clean dark void + bright glowing waves ──────
    vec3 inner = base + cTotal + vTotal + fWaveEnergy + fHotGlow + rimEnergy;

    // ── Uniform Pulse Modulation of Internal Light ───────────────────
    float lightPulse = 1.0 + uniformPulse * 0.40 + audio * 0.35;
    inner *= lightPulse;

    // Smooth tone map preserving intense glow contrast against dark void
    inner = inner / (inner + 0.36);
    inner = pow(max(inner, vec3(0.0)), vec3(1.0/2.2));

    col   = mix(col, inner, orbMask);
    alpha = max(alpha, orbMask);
  }

  // ── ATMOSPHERIC BLOOM — 3 soft layers, breathing with the pulse ─────
  float edgeDist = max(d - R, 0.0);

  // Layer 1: tight inner halo (bright, close to sphere surface)
  float bloom1  = exp(-edgeDist / (R * 0.18));
  // Layer 2: medium diffusion (the visible glow)
  float bloom2  = exp(-edgeDist / (R * 0.55));
  // Layer 3: vast outer atmosphere (almost invisible, avoids hard cutoff)
  float bloom3  = exp(-edgeDist / (R * 1.40));

  float bCyanW  = 0.60 + isL*0.28 + isS*0.18;
  float bViolW  = 0.42 + isT*0.50;
  vec3  bHue    = mix(CYAN*bCyanW, VIOLET*bViolW, 0.35 + 0.22*sin(t*0.22));
  
  // Pulse modulation on atmospheric radiance
  float bloomPulse = 1.0 + uniformPulse * 0.42 + audio * 0.40;
  vec3  bCol    = bHue * (bloom1*0.30 + bloom2*0.18 + bloom3*0.07) * bloomPulse;
  float bAlpha  = (bloom1*0.22 + bloom2*0.14 + bloom3*0.05) * bloomPulse;

  // Only outside sphere (inside is handled by interior composite)
  col   += bCol  * (1.0 - orbMask);
  alpha += bAlpha * (1.0 - orbMask);

  // ── Soft sphere-edge rim bleed (replaces hard ring cutoff) ───────────
  // A wide soft glow right at the sphere boundary, both inside and outside
  float rimBleed = exp(-pow(abs(d - R) / (R * 0.12), 2.0)) * 0.55;
  float rimAngle2 = atan(uv.y, uv.x);
  float rimHue2   = 0.50 + 0.40*sin(rimAngle2 + t*0.11);
  vec3  rimBleedCol = mix(VIOLET*0.75, CYAN*1.0, rimHue2);
  col   += rimBleedCol * rimBleed * 0.12;
  alpha += rimBleed * 0.10;

  // ── PARTICLES ────────────────────────────────────────────────────────
  for (int i = 0; i < 5; i++) {
    float fi  = float(i);
    float pa  = t*(0.078+fi*0.019) + fi*TAU/5.0;
    float pr  = R*(1.15 + fi*0.045);
    float ptilt = fi*0.58 + 0.30;
    vec2  pp  = rot2(vec2(cos(pa)*pr, sin(pa)*pr*cos(ptilt)), fi*0.72);
    float pD  = length(uv - pp);
    float pt  = exp(-pD*pD/0.000042);
    float pA  = (0.28+0.18*sin(t*1.1+fi)) * mix(1.0, 0.30, orbMask);
    col   += ((mod(fi,2.0)<1.0)?CYAN:VIOLET) * pt * pA;
    alpha += pt * pA * 0.50;
  }

  alpha = clamp(alpha, 0.0, 1.0);
  // Pre-multiplied alpha output for gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function EtherealOrb({
  state: stateProp,
  size = 220,
  audioLevel = 0,
  onPress,
  showStatusLabel = true,
}: EtherealOrbProps) {
  const normState  = normalizeState(stateProp);
  const stateIndex = stateToIndex(normState);

  const glRef          = useRef<ExpoWebGLRenderingContext | null>(null);
  const rafRef         = useRef<number>(0);
  const startRef       = useRef<number>(0);
  // Target values (updated instantly on prop change)
  const stateRef       = useRef<number>(stateIndex);
  const audioRef       = useRef<number>(audioLevel);
  // Smoothed values (lerped each frame — drive the uniforms)
  const smoothStateRef = useRef<number>(stateIndex);
  const smoothAudioRef = useRef<number>(audioLevel);
  // Monotonically accumulated pulse phase (0 frequency spikes on transition)
  const phaseRef       = useRef<number>(0);
  const lastTimeRef    = useRef<number>(0);
  const smoothFreqRef  = useRef<number>(1.25);

  useEffect(() => { stateRef.current = stateIndex; }, [stateIndex]);
  useEffect(() => { audioRef.current = audioLevel; }, [audioLevel]);

  const programRef = useRef<WebGLProgram | null>(null);
  const uloc = useRef<{
    time: WebGLUniformLocation | null;
    state: WebGLUniformLocation | null;
    audio: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    pulsePhase: WebGLUniformLocation | null;
  }>({ time: null, state: null, audio: null, res: null, pulsePhase: null });

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;

    function compile(type: number, src: string): WebGLShader {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[EtherealOrb] Shader compile error:', gl.getShaderInfoLog(sh));
      }
      return sh;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[EtherealOrb] Program link error:', gl.getProgramInfoLog(prog));
    }
    programRef.current = prog;

    // Full-screen quad (two triangles)
    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const buf   = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uloc.current = {
      time:       gl.getUniformLocation(prog, 'u_time'),
      state:      gl.getUniformLocation(prog, 'u_state'),
      audio:      gl.getUniformLocation(prog, 'u_audio'),
      res:        gl.getUniformLocation(prog, 'u_res'),
      pulsePhase: gl.getUniformLocation(prog, 'u_pulsePhase'),
    };

    // Premultiplied alpha blending — background stays transparent
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    gl.useProgram(prog);
    gl.uniform2f(uloc.current.res, gl.drawingBufferWidth, gl.drawingBufferHeight);

    startRef.current = Date.now();
    lastTimeRef.current = Date.now();

    function render() {
      if (!glRef.current) return;
      const g = glRef.current;
      const u = uloc.current;
      const now = Date.now();
      const elapsed = (now - startRef.current) / 1000;
      const dt = Math.min((now - (lastTimeRef.current || now)) / 1000, 0.05);
      lastTimeRef.current = now;

      // ── Smooth state transition (~1.5 s lerp at 60 fps) ────────────────
      smoothStateRef.current +=
        (stateRef.current - smoothStateRef.current) * 0.022;
      smoothAudioRef.current +=
        (audioRef.current - smoothAudioRef.current) * 0.12;

      // ── Distinct pulse frequencies per state (Accumulated Phase) ───────
      // idle (0): 1.25 rad/s (calm breathing ~5s period)
      // listening (1): 1.65 rad/s (alert attentive breathing ~3.8s period)
      // thinking (2): 2.05 rad/s (faster processing pulse ~3.0s period)
      // speaking (3): 1.70 rad/s (expressive speech rhythm ~3.7s period)
      const s = smoothStateRef.current;
      const isIdle = Math.max(0, 1 - s);
      const isListening = Math.max(0, 1 - Math.abs(s - 1));
      const isThinking = Math.max(0, 1 - Math.abs(s - 2));
      const isSpeaking = Math.max(0, 1 - Math.abs(s - 3));
      const targetFreq = isIdle * 1.25 + isListening * 1.65 + isThinking * 2.05 + isSpeaking * 1.70;

      // Frequency glides smoothly across states without any phase surge or acceleration
      smoothFreqRef.current += (targetFreq - smoothFreqRef.current) * 0.03;
      phaseRef.current += smoothFreqRef.current * dt;

      g.clear(g.COLOR_BUFFER_BIT);
      g.useProgram(programRef.current);
      g.uniform1f(u.time,       elapsed);
      g.uniform1f(u.state,      smoothStateRef.current);
      g.uniform1f(u.audio,      smoothAudioRef.current);
      g.uniform1f(u.pulsePhase, phaseRef.current);
      g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      g.endFrameEXP();

      rafRef.current = requestAnimationFrame(render);
    }

    render();
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    glRef.current = null;
  }, []);

  const label = STATE_LABEL[normState] ?? 'Ready';
  const glSize = size * 1.5;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.wrapper, { width: glSize, height: glSize }]}
    >
      <GLView
        style={[styles.gl, { width: glSize, height: glSize }]}
        onContextCreate={onContextCreate}
      />
      {showStatusLabel && (
        <View style={styles.labelRow} pointerEvents="none">
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  gl: {
    backgroundColor: 'transparent',
  },
  labelRow: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  label: {
    color: 'rgba(0,240,255,0.72)',
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
});
