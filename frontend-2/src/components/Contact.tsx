import { useEffect } from 'react';

interface ContactProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Contact({ isOpen, onClose }: ContactProps) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>

                    {/* Content */}
                    <h2 className="text-3xl font-bold text-white mb-6 font-mono">
                        Contact
                    </h2>

                    <div className="space-y-6">
                        {/* Email */}
                        <div className="group">
                            <div className="text-gray-400 text-sm mb-2 font-mono">
                                Email
                            </div>
                            <a
                                href="mailto:brk.ozenc@gmail.com"
                                className="text-blue-400 hover:text-blue-300 transition-colors text-lg font-mono flex items-center gap-2"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                </svg>
                                brk.ozenc@gmail.com
                            </a>
                        </div>

                        {/* GitHub */}
                        <div className="group">
                            <div className="text-gray-400 text-sm mb-2 font-mono">
                                GitHub
                            </div>
                            <a
                                href="https://github.com/burak-ozenc"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 transition-colors text-lg font-mono flex items-center gap-2"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                burak-ozenc
                            </a>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 pt-6 border-t border-gray-800 text-center text-gray-500 text-sm font-mono">
                        Feel free to reach out!
                    </div>
                </div>
            </div>
        </>
    );
}
