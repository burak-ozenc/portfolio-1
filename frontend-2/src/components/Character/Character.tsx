import { motion, useAnimation } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { useBlink } from '../../hooks/useBlink';
import {
    containerVariants,
    headVariants,
    mouthVariants,
    headTiltVariants,
    eyelidTopVariants,
    eyelidBottomVariants,
    eyeGlowVariants,
    blinkVariants,
} from './animations';

export type CharacterState = 'warming' | 'ready' | 'listening' | 'speaking';

interface CharacterProps {
    state: CharacterState;
    audioLevel?: number;
}

export const Character: React.FC<CharacterProps> = ({ state, audioLevel = 0 }) => {
    const controls = useAnimation();
    const [isAwake, setIsAwake] = useState(false);
    const shouldBlink = useBlink(isAwake && state !== 'warming');

    useEffect(() => {
        if (state === 'ready' && !isAwake) {
            setIsAwake(true);
        }
    }, [state, isAwake]);

    useEffect(() => {
        if (shouldBlink) {
            controls.start('blink');
        }
    }, [shouldBlink, controls]);

    return (
        <motion.div
            className="flex items-center justify-center h-screen"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* SVG Character - Larger size */}
            <motion.svg
                width="500"
                height="500"
                viewBox="0 0 500 500"
                className="character-svg"
                variants={headTiltVariants}
                animate={state === 'warming' ? 'yawn' : 'awake'}
            >
                {/* Gradient definitions for eyes */}
                <defs>
                    {/* Red eye gradient */}
                    <radialGradient id="redEyeGradient" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity="1" />
                        <stop offset="70%" stopColor="#EF4444" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </radialGradient>

                    {/* Blue eye gradient */}
                    <radialGradient id="blueEyeGradient" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity="1" />
                        <stop offset="70%" stopColor="#3B82F6" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Head outline - Hidden (no visible outline) */}
                <motion.ellipse
                    cx="250"
                    cy="250"
                    rx="180"
                    ry="200"
                    fill="none"
                    stroke="none"
                    variants={headVariants}
                />

                {/* Eyelids for blinking - adjusted for larger eyes */}
                <g>
                    {/* Left Eye - Top Eyelid */}
                    <motion.rect
                        x="110"
                        y="180"
                        width="80"
                        height="70"
                        fill="#000"
                        variants={eyelidTopVariants}
                        initial="closed"
                        animate={isAwake ? 'opening' : 'closed'}
                    />
                    {/* Left Eye - Bottom Eyelid */}
                    <motion.rect
                        x="110"
                        y="250"
                        width="80"
                        height="70"
                        fill="#000"
                        variants={eyelidBottomVariants}
                        initial="closed"
                        animate={isAwake ? 'opening' : 'closed'}
                    />

                    {/* Right Eye - Top Eyelid */}
                    <motion.rect
                        x="310"
                        y="180"
                        width="80"
                        height="70"
                        fill="#000"
                        variants={eyelidTopVariants}
                        initial="closed"
                        animate={isAwake ? 'opening' : 'closed'}
                    />
                    {/* Right Eye - Bottom Eyelid */}
                    <motion.rect
                        x="310"
                        y="250"
                        width="80"
                        height="70"
                        fill="#000"
                        variants={eyelidBottomVariants}
                        initial="closed"
                        animate={isAwake ? 'opening' : 'closed'}
                    />
                </g>

                {/* Left Eye Glow (Red) - with gradient, no outline */}
                <motion.circle
                    cx="150"
                    cy="220"
                    r="40"
                    fill="url(#redEyeGradient)"
                    className="glow-red"
                    variants={eyeGlowVariants}
                    initial="hidden"
                    animate={isAwake ? 'visible' : 'hidden'}
                />

                {/* Right Eye Glow (Blue) - with gradient, no outline */}
                <motion.circle
                    cx="350"
                    cy="220"
                    r="40"
                    fill="url(#blueEyeGradient)"
                    className="glow-blue"
                    variants={eyeGlowVariants}
                    initial="hidden"
                    animate={isAwake ? 'visible' : 'hidden'}
                />

                {/* Blinking overlay */}
                <motion.g animate={controls} variants={blinkVariants}>
                    <motion.circle
                        cx="150"
                        cy="220"
                        r="40"
                        fill="#000"
                        opacity={shouldBlink ? 1 : 0}
                    />
                    <motion.circle
                        cx="350"
                        cy="220"
                        r="40"
                        fill="#000"
                        opacity={shouldBlink ? 1 : 0}
                    />
                </motion.g>

                {/* Mouth - changes based on state */}
                {state === 'speaking' ? (
                    <Waveform audioLevel={audioLevel} />
                ) : (
                    <motion.path
                        d="M 180 360 L 320 360"
                        fill="none"
                        stroke="#E5E5E5"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray="5 3"
                        variants={mouthVariants}
                        initial="neutral"
                        animate={state === 'warming' ? 'yawn' : 'neutral'}
                    />
                )}
            </motion.svg>
        </motion.div>
    );
};

// Waveform component for speaking state
const Waveform: React.FC<{ audioLevel: number }> = ({ audioLevel }) => {
    const [time, setTime] = useState(0);
    const bars = 25;
    const barWidth = 3;
    const gap = 2;
    const totalWidth = bars * (barWidth + gap);
    const startX = 250 - totalWidth / 2;

    // Add random seed per bar (persist across renders)
    const randomSeeds = useRef(Array.from({ length: bars }, () => Math.random() * Math.PI * 2));

    // Animate continuously
    useEffect(() => {
        let animationFrameId: number;
        const animate = () => {
            setTime((prev) => prev + 0.05);
            animationFrameId = requestAnimationFrame(animate);
        };
        animationFrameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <g>
            {Array.from({ length: bars }).map((_, i) => {
                const baseHeight = 10;
                const waveHeight = 30;
                const phase = (i / bars) * Math.PI * 4;
                // Always show some animation, scale with audioLevel
                const amplitude = Math.max(0.5, Math.min(2, audioLevel * 10));

                // Add randomness to waveform
                const baseWave = Math.abs(Math.sin(phase + time));
                const randomWave = Math.sin(time * 1.5 + randomSeeds.current[i]) * 0.3;
                const combinedWave = baseWave + randomWave;

                const height = baseHeight + combinedWave * waveHeight * amplitude;
                const finalHeight = Math.max(8, height);

                return (
                    <rect
                        key={i}
                        x={startX + i * (barWidth + gap)}
                        y={360 - finalHeight / 2}
                        width={barWidth}
                        height={finalHeight}
                        fill="#E5E5E5"
                        rx={1}
                    />
                );
            })}
        </g>
    );
};