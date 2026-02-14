import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';

interface NoiseDetectionProps {
  isActive: boolean;
}

export const NoiseDetection: React.FC<NoiseDetectionProps> = ({ isActive }) => {
  const [noiseDetected, setNoiseDetected] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    // TODO: Integrate aicoustics SDK here
    // For now, this is a placeholder that simulates noise detection
    
    // Example SDK integration would look like:
    // import { AicousticsSDK } from 'aicoustics';
    // const sdk = new AicousticsSDK({ apiKey: 'YOUR_KEY' });
    // const noiseLevel = await sdk.getNoiseLevel();
    // if (noiseLevel > threshold) {
    //   setNoiseDetected(true);
    //   sdk.enableNoiseReduction();
    // }

    // Placeholder: simulate noise check
    const checkNoise = async () => {
      // Replace this with actual SDK call
      const simulatedNoiseLevel = Math.random();
      const threshold = 0.7;

      if (simulatedNoiseLevel > threshold) {
        setNoiseDetected(true);
        setShowNotification(true);
        
        // Auto-dismiss notification after 2 seconds
        setTimeout(() => setShowNotification(false), 2000);
      }
    };

    checkNoise();
  }, [isActive]);

  return (
    <AnimatePresence>
      {showNotification && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="fixed top-4 right-4 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3"
        >
          {noiseDetected ? (
            <>
              <MicOff className="w-4 h-4 text-red-500" />
              <span className="text-sm text-gray-300">
                Noise detected - filter active
              </span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-300">Clean audio</span>
            </>
          )}
        </motion.div>
      )}

      {/* Persistent indicator in corner */}
      {isActive && (
        <div className="fixed bottom-4 right-4">
          <div
            className={`w-3 h-3 rounded-full ${
              noiseDetected ? 'bg-red-500' : 'bg-green-500'
            } opacity-50`}
          />
        </div>
      )}
    </AnimatePresence>
  );
};
