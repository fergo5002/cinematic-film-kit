import {interpolate} from 'remotion';
import {EASE} from './ease';
export const Good = ({frame}) => {
  const x = interpolate(frame, [0, 30], [0, 100], {easing: EASE.out, extrapolateRight: 'clamp'});
  // slop-lint-ignore no-linear-motion -- progress bar must read as linear
  const p = interpolate(frame, [0, 90], [0, 1]);
  return <div style={{fontFamily: 'Newsreader', background: '#1B1D21', transform: `scale(${0.96 + 0.04 * x})`}}>Every frame lands on the beat.</div>;
};
