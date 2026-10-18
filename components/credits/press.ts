// Press feedback for anything tappable in the credits UI: a 0.97 scale on
// press with a strong ease-out, so the control answers the finger at once.
// Only transform and colours transition — never `all`. Reduced motion keeps
// the colour change and drops the scale.
export const pressable =
  'transition-[transform,background-color,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100';
