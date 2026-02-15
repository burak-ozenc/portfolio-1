import { motion, AnimatePresence } from 'framer-motion';
import {textVariants} from "./Character/animations.ts";


interface StatusTextProps {
  state: 'warming' | 'ready' | 'listening' | 'speaking' | 'thinking';
}

export const StatusText: React.FC<StatusTextProps> = ({ state }) => {
  const getText = () => {
    switch (state) {
      case 'warming':
        return 'Connecting...';
      case 'ready':
        return (
          <>
            <span className="text-eye-blue">Ready</span>
            {' '}
            <span className="text-eye-red">to chat</span>
          </>
        );
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      default:
        return '';
    }
  };

  return (
    <div className="absolute top-32 left-0 right-0 flex justify-center px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          variants={textVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="text-gray-400 text-sm tracking-widest uppercase terminal-glow text-center"
        >
          {getText()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
