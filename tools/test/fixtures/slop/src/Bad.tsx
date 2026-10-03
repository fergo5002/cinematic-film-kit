import {interpolate, Easing} from 'remotion';
import {OrbitControls} from '@react-three/drei';
export const Bad = ({frame}) => {
  const x = interpolate(frame, [0, 30], [0, 100]);
  const y = Math.random() * 10;
  const t = Date.now();
  const e = Easing.linear;
  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 0 40px #a855f7',
      transform: 'perspective(1200px) rotateX(40deg) scale(0)',
      WebkitBackgroundClip: 'text',
    }}>
      Introducing seamless planning, the future of teams 🚀
    </div>
  );
};
