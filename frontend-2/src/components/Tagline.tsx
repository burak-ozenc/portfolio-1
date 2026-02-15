import { motion } from 'framer-motion';

export const Tagline: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 2, delay: 9 }}
      className="absolute bottom-20 md:bottom-20 bottom-4 left-0 right-0 flex justify-center px-4"
    >
      <div className="text-xs tracking-[0.3em] uppercase text-center">
        <span className="text-blue-900">Dual Perspective</span>
        <span className="text-gray-600 mx-2">·</span>
        <span className="text-red-900">Single Vision</span>
      </div>
    </motion.div>
  );
};
