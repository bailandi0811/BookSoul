import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle, Map, MessageSquare, BookOpen, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';

const GUIDE_STEPS = [
  {
    title: "欢迎来到 BookSoul",
    content: "这是一个跨越时空的沉浸式阅读伴侣。在这里，你可以与《天龙八部》中的人物自由对话，探索江湖奥秘。",
    icon: <BookOpen className="w-8 h-8 text-[#8B4513]" />
  },
  {
    title: "多角色对话",
    content: "点击左上角的头像或标题，可以切换对话角色。你可以与豪迈的乔峰、痴情的段誉或通晓武学的王语嫣畅聊。",
    icon: <MessageSquare className="w-8 h-8 text-[#2C1810]" />
  },
  {
    title: "实景云游 (MCP)",
    content: "当你询问地名（如“无量山”、“燕子坞”）时，Agent 会自动调用高德地图，为你提供现实世界的地理位置和实景对照。",
    icon: <Map className="w-8 h-8 text-[#5C4A42]" />
  },
  {
    title: "使用贴士",
    content: "支持 Markdown 格式输入。请尽量描述清晰，AI 会优先基于原著回答，并补充现实地理信息。",
    icon: <FileText className="w-8 h-8 text-[#D4C5A9]" />
  }
];

export const OnboardingGuide = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenGuide, setHasSeenGuide] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('booksoul_guide_seen');
    if (!seen) {
      setIsOpen(true);
    }
    setHasSeenGuide(!!seen);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('booksoul_guide_seen', 'true');
    setHasSeenGuide(true);
  };

  const handleNext = () => {
    if (currentStep < GUIDE_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  return (
    <>
      {/* Persistent Help Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          setIsOpen(true);
          setCurrentStep(0);
        }}
        className="fixed bottom-6 right-6 z-50 w-10 h-10 bg-[#2C1810] text-[#F5F2E9] rounded-full flex items-center justify-center shadow-lg hover:bg-[#4A3B32] transition-colors"
        title="使用帮助"
      >
        <HelpCircle className="w-5 h-5" />
      </motion.button>

      {/* Guide Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
              className="bg-[#FAF8F4] w-full max-w-md rounded-2xl shadow-2xl border border-[#E6DCC8] overflow-hidden relative"
            >
              {/* Close Button */}
              <button 
                onClick={handleClose}
                className="absolute top-4 right-4 text-[#8B4513]/60 hover:text-[#8B4513] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Content */}
              <div className="p-8 pt-10 text-center">
                <motion.div 
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-16 h-16 bg-[#E6DCC8]/30 rounded-2xl flex items-center justify-center mb-6">
                    {GUIDE_STEPS[currentStep].icon}
                  </div>
                  <h3 className="text-xl font-bold text-[#2C1810] mb-3 font-serif tracking-wide">
                    {GUIDE_STEPS[currentStep].title}
                  </h3>
                  <p className="text-[#5C4A42] leading-relaxed text-sm">
                    {GUIDE_STEPS[currentStep].content}
                  </p>
                </motion.div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-[#E6DCC8] bg-[#F5F2E9]/50 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {GUIDE_STEPS.map((_, idx) => (
                    <div 
                      key={idx}
                      className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                        idx === currentStep ? 'bg-[#8B4513]' : 'bg-[#E6DCC8]'
                      }`}
                    />
                  ))}
                </div>
                
                <div className="flex gap-3">
                  {currentStep > 0 && (
                    <button 
                      onClick={() => setCurrentStep(prev => prev - 1)}
                      className="text-sm text-[#5C4A42] hover:text-[#2C1810] font-medium px-3 py-1.5"
                    >
                      上一步
                    </button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleNext}
                    className="bg-[#2C1810] text-[#F5F2E9] px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#4A3B32] transition-colors shadow-sm"
                  >
                    {currentStep === GUIDE_STEPS.length - 1 ? '开始体验' : '下一步'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
