import { Variants } from 'framer-motion';

// Character container animations
export const containerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 2,
      ease: 'easeInOut',
    },
  },
};

// Text animations
export const textVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 1.5,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.8,
    },
  },
};

// Head outline drawing animation
// Head outline drawing animation - for ellipse
export const headVariants: Variants = {
    hidden: {
        pathLength: 0,
        opacity: 0,
    },
    visible: {
        pathLength: 1,
        opacity: 1,
        transition: {
            pathLength: { duration: 2, ease: 'easeInOut' },
            opacity: { duration: 0.5 },
        },
    },
};

// Eye socket drawing
export const eyeSocketVariants: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 1, ease: 'easeInOut', delay: 0.5 },
      opacity: { duration: 0.3, delay: 0.5 },
    },
  },
};

// Mouth variants - updated for larger scale
export const mouthVariants: Variants = {
    hidden: {
        pathLength: 0,
        opacity: 0,
    },
    visible: {
        pathLength: 1,
        opacity: 1,
        transition: {
            pathLength: { duration: 0.8, ease: 'easeInOut', delay: 0.8 },
            opacity: { duration: 0.3, delay: 0.8 },
        },
    },
    yawn: {
        d: 'M 200 320 Q 250 370 300 320',
        transition: {
            duration: 1.5,
            ease: 'easeInOut',
            delay: 2,
        },
    },
    neutral: {
        d: 'M 200 320 L 300 320',
        transition: {
            duration: 1,
            ease: 'easeInOut',
        },
    },
};

// Head tilt for yawn
export const headTiltVariants: Variants = {
  neutral: {
    rotate: 0,
    y: 0,
  },
  yawn: {
    rotate: -5,
    y: -3,
    transition: {
      duration: 1.5,
      ease: 'easeInOut',
      delay: 2,
    },
  },
  awake: {
    rotate: 0,
    y: 0,
    transition: {
      duration: 1,
      ease: 'easeInOut',
    },
  },
};

// Eyelid animations - adjusted for larger eyes
export const eyelidTopVariants: Variants = {
    closed: {
        y: 0,
    },
    opening: {
        y: -70,
        transition: {
            duration: 1.5,
            ease: 'easeOut',
            delay: 5,
        },
    },
};

export const eyelidBottomVariants: Variants = {
    closed: {
        y: 0,
    },
    opening: {
        y: 70,
        transition: {
            duration: 1.5,
            ease: 'easeOut',
            delay: 5,
        },
    },
};

// Eye glow (the colored part)
export const eyeGlowVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.5,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 1.2,
      ease: 'easeOut',
      delay: 6.5,
    },
  },
};

// Breathing animation for idle state
export const breathingVariants: Variants = {
  breathe: {
    y: [-2, 0, -2],
    transition: {
      duration: 3,
      ease: 'easeInOut',
      repeat: Infinity,
      delay: 8,
    },
  },
};

// Eye pulse (subtle)
export const eyePulseVariants: Variants = {
  pulse: {
    opacity: [0.9, 1, 0.9],
    transition: {
      duration: 3,
      ease: 'easeInOut',
      repeat: Infinity,
      delay: 8,
    },
  },
};

// Blink animation
export const blinkVariants: Variants = {
  blink: {
    scaleY: [1, 0.1, 1],
    transition: {
      duration: 0.15,
      ease: 'easeInOut',
    },
  },
};

// Waveform bars for speaking
export const waveformBarVariants = {
  idle: {
    scaleY: 0.3,
  },
  active: (amplitude: number) => ({
    scaleY: amplitude,
    transition: {
      duration: 0.1,
      ease: 'linear',
    },
  }),
};
