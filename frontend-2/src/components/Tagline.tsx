import { motion } from 'framer-motion';

export const Tagline: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 2, delay: 9 }}
      className="absolute bottom-20 left-0 right-0 flex justify-center"
    >
      <div className="text-gray-500 text-xs tracking-[0.3em] uppercase">
        <span className="text-eye-red">Dual Perspective</span>
        <span className="text-gray-600 mx-2">·</span>
        <span className="text-eye-blue">Single Vision</span>
      </div>
    </motion.div>
  );
};
