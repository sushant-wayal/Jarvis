import { JarvisState } from '@jarvis/shared';
import * as React from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../theme/tokens';

export interface ShaderOrbProps {
  state: JarvisState;
  audioLevel?: number;
  size?: number;
}

export function ShaderOrb({
  state,
  audioLevel = 0,
  size = 300,
}: ShaderOrbProps): React.ReactElement {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Inject exact CSS keyframes for pulse-glow on web
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'jarvis-orb-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = `
        @keyframes pulse-glow {
          0% {
            box-shadow: 0 0 80px 20px rgba(125, 244, 255, 0.12), inset 0 0 40px rgba(0, 240, 255, 0.2);
            transform: scale(0.98);
          }
          100% {
            box-shadow: 0 0 140px 45px rgba(125, 244, 255, 0.28), inset 0 0 80px rgba(0, 240, 255, 0.4);
            transform: scale(1.03);
          }
        }
        @keyframes pulse-listening {
          0% {
            box-shadow: 0 0 90px 30px rgba(0, 240, 255, 0.3), inset 0 0 60px rgba(0, 240, 255, 0.5);
            transform: scale(1.0);
          }
          100% {
            box-shadow: 0 0 160px 60px rgba(0, 240, 255, 0.5), inset 0 0 100px rgba(0, 240, 255, 0.7);
            transform: scale(1.12);
          }
        }
        @keyframes pulse-speaking {
          0% {
            box-shadow: 0 0 70px 25px rgba(0, 219, 233, 0.25), inset 0 0 50px rgba(0, 219, 233, 0.35);
            transform: scale(0.96);
          }
          50% {
            box-shadow: 0 0 130px 45px rgba(0, 219, 233, 0.45), inset 0 0 80px rgba(0, 219, 233, 0.55);
            transform: scale(1.06);
          }
          100% {
            box-shadow: 0 0 70px 25px rgba(0, 219, 233, 0.25), inset 0 0 50px rgba(0, 219, 233, 0.35);
            transform: scale(0.96);
          }
        }
        .stitch-orb-glow {
          box-shadow: 0 0 100px 30px rgba(125, 244, 255, 0.18);
          animation: pulse-glow 4s infinite alternate ease-in-out;
        }
        .stitch-orb-listening {
          animation: pulse-listening 0.6s infinite alternate ease-in-out;
        }
        .stitch-orb-speaking {
          animation: pulse-speaking 1.4s infinite ease-in-out;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  // WebGL Shader execution matching Shader.html / Home.html
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return;

    function syncSize() {
      if (!canvas) return;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const w = Math.round(size * dpr);
      const h = Math.round(size * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    syncSize();

    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

    const fs = `precision highp float;
varying vec2 v_texCoord;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_state; // 0=idle, 1=listening, 2=processing, 3=speaking

void main() {
    vec2 uv = v_texCoord;
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(uv, center);
    
    // Smooth pulse for the orb
    float pulseSpeed = u_state > 0.5 && u_state < 1.5 ? 4.0 : u_state > 2.5 ? 2.5 : 1.5;
    float pulseAmp = u_state > 0.5 && u_state < 1.5 ? 0.12 : 0.06;
    float pulse = pulseAmp * sin(u_time * pulseSpeed) + (1.0 - pulseAmp);
    float orb = smoothstep(0.35 * pulse, 0.24 * pulse, dist);
    
    // Inner glow
    float glow = smoothstep(0.5, 0.0, dist);
    
    // Ethereal color shift
    vec3 color1 = vec3(0.0, 0.94, 1.0); // Cyan
    vec3 color2 = vec3(0.66, 0.33, 0.97); // Purple
    if (u_state > 2.5) {
      color2 = vec3(0.0, 0.9, 0.7); // Emerald cyan for speaking
    } else if (u_state > 1.5 && u_state < 2.5) {
      color1 = vec3(0.7, 0.2, 1.0); // Deep Violet for processing
    }
    
    vec3 finalColor = mix(color1, color2, 0.5 + 0.5 * sin(u_time * 1.2 + dist * 5.0));
    
    gl_FragColor = vec4(finalColor * (orb + glow * 0.45), (orb + glow * 0.25) * 0.88);
}`;

    function cs(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uState = gl.getUniformLocation(prog, 'u_state');

    function render(t: number) {
      if (!canvas || !gl) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uState) {
        const sVal = state === 'LISTENING' ? 1 : state === 'THINKING' ? 2 : state === 'SPEAKING' ? 3 : 0;
        gl.uniform1f(uState, sVal);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(render);
    }
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [state, size]);

  // Native Animations Loop
  React.useEffect(() => {
    if (state === 'LISTENING') {
      const listenLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12 + Math.min(audioLevel * 0.3, 0.35),
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.98,
            duration: 180,
            useNativeDriver: true,
          }),
        ])
      );
      listenLoop.start();
      return () => listenLoop.stop();
    } else if (state === 'THINKING' || state === 'PROCESSING') {
      const rotateLoop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotateLoop.start();
      return () => rotateLoop.stop();
    } else if (state === 'SPEAKING') {
      const speakLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 320,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.96,
            duration: 320,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      speakLoop.start();
      return () => speakLoop.stop();
    } else {
      // Idle pulse
      const idleLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.96,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      idleLoop.start();
      return () => idleLoop.stop();
    }
  }, [state, audioLevel, pulseAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getWebOrbClass = () => {
    if (state === 'LISTENING') return 'stitch-orb-listening';
    if (state === 'SPEAKING') return 'stitch-orb-speaking';
    return 'stitch-orb-glow';
  };

  return (
    <View style={[styles.outerGlowContainer, { width: size, height: size }]}>
      {/* Outer Glow Orb Layer */}
      <Animated.View
        // @ts-ignore on web className passes to DOM
        className={Platform.OS === 'web' ? getWebOrbClass() : undefined}
        style={[
          styles.orbShell,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: pulseAnim }, { rotate: spin }],
          },
        ]}
      >
        {Platform.OS === 'web' ? (
          <div
            style={{
              position: 'relative',
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mixBlendMode: 'screen',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                display: 'block',
                width: size,
                height: size,
                borderRadius: size / 2,
              }}
            />
            {/* Core Highlight matching Home.html line 323 */}
            <div
              style={{
                position: 'absolute',
                width: size * 0.35,
                height: size * 0.35,
                borderRadius: '50%',
                backgroundColor: '#7df4ff',
                filter: 'blur(50px)',
                opacity: 0.35,
                pointerEvents: 'none',
              }}
            />
          </div>
        ) : (
          <View
            style={[
              styles.nativeOrbWrapper,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
              },
            ]}
          >
            {/* Layered fluid gradient for native */}
            <View
              style={[
                styles.nativeGradientRing,
                {
                  width: size * 0.85,
                  height: size * 0.85,
                  borderRadius: (size * 0.85) / 2,
                  backgroundColor:
                    state === 'THINKING'
                      ? colors.secondary
                      : colors.primaryContainer,
                },
              ]}
            />
            <View
              style={[
                styles.nativeInnerCore,
                {
                  width: size * 0.55,
                  height: size * 0.55,
                  borderRadius: (size * 0.55) / 2,
                },
              ]}
            />
            {/* Core Highlight */}
            <View
              style={[
                styles.nativeHighlight,
                {
                  width: size * 0.3,
                  height: size * 0.3,
                  borderRadius: (size * 0.3) / 2,
                },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerGlowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  orbShell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    overflow: 'visible',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 12,
  },
  nativeOrbWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderColor: 'rgba(125, 244, 255, 0.3)',
    borderWidth: 1.5,
  },
  nativeGradientRing: {
    position: 'absolute',
    opacity: 0.5,
  },
  nativeInnerCore: {
    backgroundColor: colors.primaryFixed,
    opacity: 0.85,
  },
  nativeHighlight: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    opacity: 0.4,
  },
});
