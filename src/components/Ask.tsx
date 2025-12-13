'use client';

import React, {useState, useRef, useEffect} from 'react';
import {FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import Markdown from './Markdown';
import ErrorResponse from './ErrorResponse';
import { useLanguage } from '@/contexts/LanguageContext';
import RepoInfo from '@/types/repoinfo';
import getRepoUrl from '@/utils/getRepoUrl';
import { createStreamingRequest, ChatCompletionRequest } from '@/utils/streamingClient';
import styles from './Ask.module.css';

interface Model {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
  models: Model[];
  supportsCustomModel?: boolean;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ResearchStage {
  title: string;
  content: string;
  iteration: number;
  type: 'plan' | 'update' | 'conclusion';
}

interface AskProps {
  repoInfo: RepoInfo;
  provider?: string;
  model?: string;
  isCustomModel?: boolean;
  customModel?: string;
  language?: string;
  onRef?: (ref: { clearConversation: () => void }) => void;
}

const Ask: React.FC<AskProps> = ({
  repoInfo,
  provider = '',
  model = '',
  isCustomModel = false,
  customModel = '',
  language = 'en',
  onRef
}) => {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);

  // Model selection state - sync with props
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [selectedModel, setSelectedModel] = useState(model);
  const [isCustomSelectedModel, setIsCustomSelectedModel] = useState(isCustomModel);
  const [customSelectedModel, setCustomSelectedModel] = useState(customModel);

  // Get language context for translations
  const { messages } = useLanguage();

  // Sync local state when props change (from parent dropdown)
  useEffect(() => {
    setSelectedProvider(provider);
    setSelectedModel(model);
    setIsCustomSelectedModel(isCustomModel);
    setCustomSelectedModel(customModel);
  }, [provider, model, isCustomModel, customModel]);

  // Research navigation state
  const [researchStages, setResearchStages] = useState<ResearchStage[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [researchIteration, setResearchIteration] = useState(0);
  const [researchComplete, setResearchComplete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef(provider);
  const modelRef = useRef(model);

  // Focus input on component mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Expose clearConversation method to parent component
  useEffect(() => {
    if (onRef) {
      onRef({ clearConversation });
    }
  }, [onRef]);

  // Scroll to bottom of response when it changes
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  
  useEffect(() => {
    providerRef.current = provider;
    modelRef.current = model;
  }, [provider, model]);

  useEffect(() => {
    const fetchModel = async () => {
      try {
        setIsLoading(true);

        const response = await fetch('/api/models/config');
        if (!response.ok) {
          throw new Error(`Error fetching model configurations: ${response.status}`);
        }

        const data = await response.json();

        // use latest provider/model ref to check
        if(providerRef.current == '' || modelRef.current== '') {
          setSelectedProvider(data.defaultProvider);

          // Find the default provider and set its default model
          const selectedProvider = data.providers.find((p:Provider) => p.id === data.defaultProvider);
          if (selectedProvider && selectedProvider.models.length > 0) {
            setSelectedModel(selectedProvider.models[0].id);
          }
        } else {
          setSelectedProvider(providerRef.current);
          setSelectedModel(modelRef.current);
        }
      } catch (err) {
        console.error('Failed to fetch model configurations:', err);
      } finally {
        setIsLoading(false);
      }
    };
    if(provider == '' || model == '') {
      fetchModel()
    }
  }, [provider, model]);

  // Detect if response is an error (starts with "Error:" or is JSON error)
  const isErrorResponse = (content: string): boolean => {
    if (!content) return false;
    if (content.trim().startsWith('Error:')) return true;
    // Check if it looks like a JSON error response
    const jsonMatch = content.match(/^\s*{[\s\S]*"detail"[\s\S]*}\s*$/);
    return !!jsonMatch;
  };

  // Extract error content from response
  const extractErrorContent = (content: string): string => {
    // If it starts with "Error:", extract the error message
    if (content.trim().startsWith('Error:')) {
      return content.trim().substring(6).trim();
    }
    return content;
  };

  const clearConversation = () => {
    setQuestion('');
    setResponse('');
    setConversationHistory([]);
    setResearchIteration(0);
    setResearchComplete(false);
    setResearchStages([]);
    setCurrentStageIndex(0);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  const downloadresponse = () =>{
  const blob = new Blob([response], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `response-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

  // Function to check if research is complete based on response content
  const checkIfResearchComplete = (content: string): boolean => {
    // Check for explicit final conclusion markers
    if (content.includes('## Final Conclusion')) {
      return true;
    }

    // Check for conclusion sections that don't indicate further research
    if ((content.includes('## Conclusion') || content.includes('## Summary')) &&
      !content.includes('I will now proceed to') &&
      !content.includes('Next Steps') &&
      !content.includes('next iteration')) {
      return true;
    }

    // Check for phrases that explicitly indicate completion
    if (content.includes('This concludes our research') ||
      content.includes('This completes our investigation') ||
      content.includes('This concludes the deep research process') ||
      content.includes('Key Findings and Implementation Details') ||
      content.includes('In conclusion,') ||
      (content.includes('Final') && content.includes('Conclusion'))) {
      return true;
    }

    // Check for topic-specific completion indicators
    if (content.includes('Dockerfile') &&
      (content.includes('This Dockerfile') || content.includes('The Dockerfile')) &&
      !content.includes('Next Steps') &&
      !content.includes('In the next iteration')) {
      return true;
    }

    return false;
  };

  // Function to extract research stages from the response
  const extractResearchStage = (content: string, iteration: number): ResearchStage | null => {
    // Check for research plan (first iteration)
    if (iteration === 1 && content.includes('## Research Plan')) {
      const planMatch = content.match(/## Research Plan([\s\S]*?)(?:## Next Steps|$)/);
      if (planMatch) {
        return {
          title: 'Research Plan',
          content: content,
          iteration: 1,
          type: 'plan'
        };
      }
    }

    // Check for research updates (iterations 1-4)
    if (iteration >= 1 && iteration <= 4) {
      const updateMatch = content.match(new RegExp(`## Research Update ${iteration}([\\s\\S]*?)(?:## Next Steps|$)`));
      if (updateMatch) {
        return {
          title: `Research Update ${iteration}`,
          content: content,
          iteration: iteration,
          type: 'update'
        };
      }
    }

    // Check for final conclusion
    if (content.includes('## Final Conclusion')) {
      const conclusionMatch = content.match(/## Final Conclusion([\s\S]*?)$/);
      if (conclusionMatch) {
        return {
          title: 'Final Conclusion',
          content: content,
          iteration: iteration,
          type: 'conclusion'
        };
      }
    }

    return null;
  };

  // Function to navigate to a specific research stage
  const navigateToStage = (index: number) => {
    if (index >= 0 && index < researchStages.length) {
      setCurrentStageIndex(index);
      setResponse(researchStages[index].content);
    }
  };

  // Function to navigate to the next research stage
  const navigateToNextStage = () => {
    if (currentStageIndex < researchStages.length - 1) {
      navigateToStage(currentStageIndex + 1);
    }
  };

  // Function to navigate to the previous research stage
  const navigateToPreviousStage = () => {
    if (currentStageIndex > 0) {
      navigateToStage(currentStageIndex - 1);
    }
  };

  
  // Function to continue research automatically
  const continueResearch = async () => {
    if (!deepResearch || researchComplete || !response || isLoading) return;

    // Add a small delay to allow the user to read the current response
    await new Promise(resolve => setTimeout(resolve, 2000));

    setIsLoading(true);

    try {
      // Store the current response for use in the history
      const currentResponse = response;

      // Create a new message from the AI's previous response
      const newHistory: Message[] = [
        ...conversationHistory,
        {
          role: 'assistant',
          content: currentResponse
        },
        {
          role: 'user',
          content: '[DEEP RESEARCH] Continue the research'
        }
      ];

      // Update conversation history
      setConversationHistory(newHistory);

      // Increment research iteration
      const newIteration = researchIteration + 1;
      setResearchIteration(newIteration);

      // Clear previous response
      setResponse('');

      // Prepare the request body
      const requestBody: ChatCompletionRequest = {
        repo_url: getRepoUrl(repoInfo),
        type: repoInfo.type,
        messages: newHistory.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
        provider: selectedProvider,
        model: isCustomSelectedModel ? customSelectedModel : selectedModel,
        language: language
      };

      // Add tokens if available
      if (repoInfo?.token) {
        requestBody.token = repoInfo.token;
      }

      let fullResponse = '';

      // Create a new HTTP streaming request
      await createStreamingRequest(
        requestBody,
        // Message handler
        (message: string) => {
          fullResponse += message;
          setResponse(fullResponse);

          // Extract research stage if this is a deep research response
          if (deepResearch) {
            const stage = extractResearchStage(fullResponse, newIteration);
            if (stage) {
              // Add the stage to the research stages if it's not already there
              setResearchStages(prev => {
                // Check if we already have this stage
                const existingStageIndex = prev.findIndex(s => s.iteration === stage.iteration && s.type === stage.type);
                if (existingStageIndex >= 0) {
                  // Update existing stage
                  const newStages = [...prev];
                  newStages[existingStageIndex] = stage;
                  return newStages;
                } else {
                  // Add new stage
                  return [...prev, stage];
                }
              });

              // Update current stage index to the latest stage
              setCurrentStageIndex(researchStages.length);
            }
          }
        },
        // Error handler
        (error: Error) => {
          console.error('Streaming error:', error);
          setResponse(prev => prev + `\n\nError: ${error.message}`);

          // No fallback needed since we're already using HTTP
        },
        // Close handler
        () => {
          // Check if research is complete when the stream completes
          const isComplete = checkIfResearchComplete(fullResponse);

          // Force completion after a maximum number of iterations (5)
          const forceComplete = newIteration >= 5;

          if (forceComplete && !isComplete) {
            // If we're forcing completion, append a comprehensive conclusion to the response
            const completionNote = "\n\n## Final Conclusion\nAfter multiple iterations of deep research, we've gathered significant insights about this topic. This concludes our investigation process, having reached the maximum number of research iterations. The findings presented across all iterations collectively form our comprehensive answer to the original question.";
            fullResponse += completionNote;
            setResponse(fullResponse);
            setResearchComplete(true);
          } else {
            setResearchComplete(isComplete);
          }

          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Error during API call:', error);
      setResponse(prev => prev + '\n\nError: Failed to continue research. Please try again.');
      setResearchComplete(true);
      setIsLoading(false);
    }
  };

  
  // Effect to continue research when response is updated
  useEffect(() => {
    if (deepResearch && response && !isLoading && !researchComplete) {
      const isComplete = checkIfResearchComplete(response);
      if (isComplete) {
        setResearchComplete(true);
      } else if (researchIteration > 0 && researchIteration < 5) {
        // Only auto-continue if we're already in a research process and haven't reached max iterations
        // Use setTimeout to avoid potential infinite loops
        const timer = setTimeout(() => {
          continueResearch();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, isLoading, deepResearch, researchComplete, researchIteration]);

  // Effect to update research stages when the response changes
  useEffect(() => {
    if (deepResearch && response && !isLoading) {
      // Try to extract a research stage from the response
      const stage = extractResearchStage(response, researchIteration);
      if (stage) {
        // Add or update the stage in the research stages
        setResearchStages(prev => {
          // Check if we already have this stage
          const existingStageIndex = prev.findIndex(s => s.iteration === stage.iteration && s.type === stage.type);
          if (existingStageIndex >= 0) {
            // Update existing stage
            const newStages = [...prev];
            newStages[existingStageIndex] = stage;
            return newStages;
          } else {
            // Add new stage
            return [...prev, stage];
          }
        });

        // Update current stage index to point to this stage
        setCurrentStageIndex(prev => {
          const newIndex = researchStages.findIndex(s => s.iteration === stage.iteration && s.type === stage.type);
          return newIndex >= 0 ? newIndex : prev;
        });
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, isLoading, deepResearch, researchIteration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim() || isLoading) return;

    handleConfirmAsk();
  };

  // Handle confirm and send request
  const handleConfirmAsk = async () => {
    setIsLoading(true);
    setResponse('');
    setResearchIteration(0);
    setResearchComplete(false);

    try {
      // Create initial message
      const initialMessage: Message = {
        role: 'user',
        content: deepResearch ? `[DEEP RESEARCH] ${question}` : question
      };

      // Set initial conversation history
      const newHistory: Message[] = [initialMessage];
      setConversationHistory(newHistory);

      // Prepare request body
      const requestBody: ChatCompletionRequest = {
        repo_url: getRepoUrl(repoInfo),
        type: repoInfo.type,
        messages: newHistory.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
        provider: selectedProvider,
        model: isCustomSelectedModel ? customSelectedModel : selectedModel,
        language: language
      };

      // Add tokens if available
      if (repoInfo?.token) {
        requestBody.token = repoInfo.token;
      }

      let fullResponse = '';

      // Create a new HTTP streaming request
      await createStreamingRequest(
        requestBody,
        // Message handler
        (message: string) => {
          fullResponse += message;
          setResponse(fullResponse);

          // Extract research stage if this is a deep research response
          if (deepResearch) {
            const stage = extractResearchStage(fullResponse, 1); // First iteration
            if (stage) {
              // Add the stage to the research stages
              setResearchStages([stage]);
              setCurrentStageIndex(0);
            }
          }
        },
        // Error handler
        (error: Error) => {
          console.error('Streaming error:', error);
          setResponse(prev => prev + `\n\nError: ${error.message}`);

          // No fallback needed since we're already using HTTP
          setIsLoading(false);
        },
        // Close handler
        () => {
          // If deep research is enabled, check if we should continue
          if (deepResearch) {
            const isComplete = checkIfResearchComplete(fullResponse);
            setResearchComplete(isComplete);

            // If not complete, start the research process
            if (!isComplete) {
              setResearchIteration(1);
              // The continueResearch function will be triggered by the useEffect
            }
          }

          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Error during API call:', error);
      setResponse(prev => prev + '\n\nError: Failed to get a response. Please try again.');
      setResearchComplete(true);
      setIsLoading(false);
    }
  };


  return (
    <div className={styles.askContainer}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .${styles.scanlines}::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            rgba(255, 255, 255, 0.02) 0px,
            rgba(255, 255, 255, 0.02) 1px,
            transparent 1px,
            transparent 2px
          );
          pointer-events: none;
          z-index: 1;
        }
      `}</style>

      <div className={`${styles.askInnerContainer} p-4`}>
        {/* Question input */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <div className={styles.inputPrefix}>▸</div>
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={messages.ask?.placeholder || 'What would you like to know about this codebase?'}
              className={styles.input}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className={`${styles.askButton} ${isLoading ? styles.loading : ''} ${!question.trim() ? styles.disabled : ''}`}
              aria-label="Submit question"
            >
              {isLoading ? (
                <div className={styles.spinnerDot}></div>
              ) : (
                <>
                  <div className={styles.buttonDot}></div>
                  <span className={styles.buttonText}>{messages.ask?.askButton || 'Ask'}</span>
                </>
              )}
            </button>
          </div>

          {/* Deep Research toggle */}
          <div className={styles.deepResearchSection}>
            <div className="group relative">
              <label className={styles.deepResearchLabel}>
                <span className={styles.labelText}>› Deep Research</span>
                <div className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={deepResearch}
                    onChange={() => setDeepResearch(!deepResearch)}
                    className={styles.toggleInput}
                  />
                  <div className={`${styles.toggleTrack} ${deepResearch ? styles.active : ''}`}></div>
                  <div className={`${styles.toggleThumb} ${deepResearch ? styles.active : ''}`}></div>
                </div>
              </label>
              <div className={styles.tooltip}>
                <div className={styles.tooltipArrow}></div>
                <p className={styles.tooltipTitle}>Deep Research conducts multi-turn investigation:</p>
                <ul className={styles.tooltipList}>
                  <li><strong>Plan:</strong> Creates research strategy</li>
                  <li><strong>Iteration 1-4:</strong> Progressive exploration</li>
                  <li><strong>Conclusion:</strong> Comprehensive synthesis</li>
                </ul>
                <p className={styles.tooltipNote}>Auto-continues until complete (max 5 iterations)</p>
              </div>
            </div>
            {deepResearch && (
              <div className={styles.researchStatus}>
                {/* Status indicator dot */}
                <div className={styles.statusDot}></div>
                <span>
                  Multi-turn research
                  {researchIteration > 0 && !researchComplete && ` (iter ${researchIteration})`}
                  {researchComplete && ` (✓ complete)`}
                </span>
              </div>
            )}
          </div>
        </form>

        {/* Response area */}
        {response && (
          <div className={styles.responseContainer}>
            <div className={styles.responseHeader}>
              <div className={styles.statusIndicator}>
                {isLoading ? (
                  <>
                    <div className={styles.statusPulse}></div>
                    <span className={styles.statusText}>Streaming response...</span>
                  </>
                ) : (
                  <>
                    <div className={styles.completeDot}></div>
                    <span className={styles.statusText}>Response complete</span>
                  </>
                )}
              </div>
              {deepResearch && researchStages.length > 1 && (
                <div className={styles.stageIndicator}>
                  <button
                    onClick={() => navigateToPreviousStage()}
                    disabled={currentStageIndex === 0}
                    className={styles.stageButton}
                    aria-label="Previous stage"
                    title="Previous research stage"
                  >
                    <FaChevronLeft size={12} />
                  </button>
                  <div className={styles.stageBadge}>
                    <span className={styles.stageNumber}>{currentStageIndex + 1}</span>
                    <span className={styles.stageSeparator}>/</span>
                    <span>{researchStages.length}</span>
                  </div>
                  <button
                    onClick={() => navigateToNextStage()}
                    disabled={currentStageIndex === researchStages.length - 1}
                    className={styles.stageButton}
                    aria-label="Next stage"
                    title="Next research stage"
                  >
                    <FaChevronRight size={12} />
                  </button>
                  <div className={styles.stageTitle}>
                    {researchStages[currentStageIndex]?.title || `Stage ${currentStageIndex + 1}`}
                  </div>
                </div>
              )}
            </div>

            <div
              ref={responseRef}
              className={`${styles.responseContent} ${styles.scanlines}`}
            >
              {isErrorResponse(response) ? (
                <ErrorResponse error={extractErrorContent(response)} />
              ) : (
                <Markdown content={response} />
              )}
            </div>

            {/* Actions footer */}
            <div className={styles.responseFooter}>
              <div className={styles.actionButtons}>
                <button
                  onClick={downloadresponse}
                  className={styles.actionButton}
                  title="Download response as markdown file"
                >
                  <svg className={styles.buttonIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Download</span>
                </button>

                <button
                  id="ask-clear-conversation"
                  onClick={clearConversation}
                  className={styles.actionButton}
                  title="Clear conversation and start fresh"
                >
                  <svg className={styles.buttonIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !response && (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingHeader}>
              <div className={styles.loadingDots}>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
              </div>
              <span className={styles.loadingText}>
                {deepResearch
                  ? (researchIteration === 0
                    ? "Planning research approach..."
                    : `Research iteration ${researchIteration}...`)
                  : "Processing..."}
              </span>
            </div>

            {deepResearch && (
              <div className={styles.researchSteps}>
                {researchIteration === 0 && (
                  <>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.active}`}></div>
                      <span>Creating research plan</span>
                    </div>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.pending}`}></div>
                      <span>Identifying key areas</span>
                    </div>
                  </>
                )}
                {researchIteration === 1 && (
                  <>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.completed}`}></div>
                      <span>Research plan created</span>
                    </div>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.active}`}></div>
                      <span>Exploring first area in depth</span>
                    </div>
                  </>
                )}
                {researchIteration === 2 && (
                  <>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.completed}`}></div>
                      <span>Initial exploration complete</span>
                    </div>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.active}`}></div>
                      <span>Investigating remaining questions</span>
                    </div>
                  </>
                )}
                {researchIteration >= 3 && (
                  <>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.completed}`}></div>
                      <span>Intermediate research complete</span>
                    </div>
                    <div className={styles.step}>
                      <div className={`${styles.stepDot} ${styles.active}`}></div>
                      <span>Exploring deeper connections</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Ask;
