/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, KeyboardEvent, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  Check,
  CheckCircle,
  ListChecks,
  ListTodo,
  ShoppingCart,
  ClipboardList,
  Sparkles,
  X,
  Calendar,
  Clock,
  Store,
  BrainCircuit,
  Loader2,
  Smartphone,
  Share,
  Share2,
  Download,
  Zap,
  RefreshCw
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { analyzeStatus, estimatePrices, generateRecipe } from './services/aiService';
import Markdown from 'react-markdown';

interface Item {
  id: string;
  text: string;
  done: boolean;
  added: string;
  dueDate?: string;
  dueTime?: string;
  price?: number | null;
  notified?: boolean;
  userId?: string;
  type?: 'task' | 'shop' | 'recipe';
  recipeContent?: string;
}

type TabType = 'tasks' | 'shop' | 'journal';

const STORAGE_KEYS: Record<TabType | 'settings' | 'version', string> = {
  tasks: 'plannerok_tasks_v4',
  shop: 'plannerok_shop_v4',
  journal: 'plannerok_journal_v4',
  settings: 'plannerok_settings_v4',
  version: 'plannerok_version_v4',
};

const APP_VERSION = '2.6.0';
const CHANGE_LOG = [
  'PlannerOk 2.6.0: AI Буст Енергії ⚡️',
  'Feature: Додано кнопку "Отримати буст" для миттєвої мотивації від AI',
  'AI: Оновлено промпти для більш влучних та енергійних порад',
  'UI: Покращено візуалізацію блоку мотивації з новими анімаціями',
  'Fix: Оптимізовано кешування AI-аналізу для різних вкладок'
];

const APP_FEATURES = [
  { title: 'AI Оптимізація', desc: 'Розумне споживання ресурсів API' },
  { title: 'Розумні ціни', desc: 'Гнучкий пошук цін навіть при неточних назвах' },
  { title: 'Швидкість', desc: 'Робота на базі Gemini 1.5 Flash' },
  { title: 'Журнал', desc: 'Зберігайте найкращі ідеї страв' }
];

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-rose/5">
      <div className="glass p-8 rounded-3xl max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-black text-red-500">Ой! Сталася помилка</h1>
        <p className="text-sm text-text-soft">{error.message}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-deep-rose text-white rounded-xl shadow-md"
        >
          Оновити додаток
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError && this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [tasks, setTasks] = useState<Item[]>([]);
  const [shopItems, setShopItems] = useState<Item[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<Item[]>([]);
  const [theme, setTheme] = useState<'rose' | 'mint' | 'lavender' | 'sky' | 'midnight' | 'plum'>('rose');
  const [language, setLanguage] = useState<'ua' | 'pl'>('ua');
  const [inputValue, setInputValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [currentTime] = useState(new Date());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Safe notification wrapper
  const safeNotify = (title: string, options?: NotificationOptions) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        // Mobile Chrome (Android) and some other browsers strictly forbid 'new Notification()'
        // and require 'ServiceWorkerRegistration.showNotification()' instead.
        // To prevent catastrophic app crashes, we only use the constructor if we're likely on desktop.
        // On mobile, we rely on the fact that SW-based notifications are the preferred way.
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (!isMobile) {
          new Notification(title, options);
        } else {
          // Future: delegate to service worker registration if available
          console.info("Mobile notification requested but skipped constructor to prevent crash:", title);
          
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, options);
            }).catch(err => {
              console.warn("SW notification failed:", err);
            });
          }
        }
      } catch (e) {
        console.warn("Notification constructor was blocked by browser:", e);
      }
    }
  };

  // PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshingSW, setIsRefreshingSW] = useState(false);

  // Pull-to-refresh logic for SW Update
  useEffect(() => {
    let startY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) startY = e.touches[0].pageY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (startY === 0 || window.scrollY > 0) return;
      const currentY = e.touches[0].pageY;
      const diff = currentY - startY;
      if (diff > 0) {
        setPullDistance(Math.min(diff * 0.4, 80));
      }
    };
    const handleTouchEnd = () => {
      if (pullDistance > 60 && 'serviceWorker' in navigator) {
        setIsRefreshingSW(true);
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) {
            // If there's already a waiting worker, skip to activation
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(() => {
                setIsRefreshingSW(false);
                setPullDistance(0);
              }, 1000);
            } else {
              // Otherwise, check for updates
              reg.update().finally(() => {
                setTimeout(() => {
                  setIsRefreshingSW(false);
                  setPullDistance(0);
                }, 1000);
              });
            }
          } else {
            setIsRefreshingSW(false);
            setPullDistance(0);
          }
        });
      } else {
        setPullDistance(0);
      }
      startY = 0;
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance]);

  // Unified Hydration & Version Control (ONE SOURCE OF TRUTH)
  useEffect(() => {
    const hydrate = () => {
      try {
        const savedTasks = localStorage.getItem(STORAGE_KEYS.tasks);
        const savedShop = localStorage.getItem(STORAGE_KEYS.shop);
        const savedJournal = localStorage.getItem(STORAGE_KEYS.journal);
        const savedSettings = localStorage.getItem(STORAGE_KEYS.settings);
        const lastVersionValue = localStorage.getItem(STORAGE_KEYS.version);

        if (savedTasks) setTasks(JSON.parse(savedTasks));
        if (savedShop) setShopItems(JSON.parse(savedShop));
        if (savedJournal) setSavedRecipes(JSON.parse(savedJournal));

        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          if (parsed.theme) setTheme(parsed.theme);
          if (parsed.language) setLanguage(parsed.language);
        }

        // Version Control for Update Modals
        if (!lastVersionValue) {
          setIsFirstVisit(true);
          setShowUpdateModal(true);
        } else if (lastVersionValue !== APP_VERSION) {
          setIsFirstVisit(false);
          setShowUpdateModal(true);
          
          if (Notification.permission === 'granted') {
             safeNotify('PlannerOk Updated! ✨', {
               body: `Now on version ${APP_VERSION}. Tap to see changes.`,
               icon: '/icon.svg'
             });
          }
        }
        
        // Remove immediate version save - moved to Modal onClick Handler
        // localStorage.setItem(STORAGE_KEYS.version, APP_VERSION);

        // Register Service Worker with intelligent update logic
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
              console.log('SW registered:', registration);
              
              // Automatic update check (3:00 AM & Visibility Change)
              const scheduleUpdateCheck = () => {
                const check = () => {
                  const now = new Date();
                  const lastCheck = localStorage.getItem('last_3am_check');
                  const today = now.toISOString().split('T')[0];
                  
                  if (now.getHours() === 3 && lastCheck !== today) {
                    console.log('[PWA] It is 3 AM! Executing scheduled update...');
                    localStorage.setItem('last_3am_check', today);
                    
                    if (registration.waiting) {
                      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    } else {
                      registration.update().then(() => {
                        if (registration.waiting) {
                          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        } else {
                          window.location.reload();
                        }
                      }).catch(() => {
                        window.location.reload();
                      });
                    }
                  } else {
                    // Just a regular check for updates
                    registration.update().catch(() => {});
                  }
                };
                
                const timer = setInterval(check, 15 * 60 * 1000); // Check every 15 mins
                
                // Also check when user returns to app
                const handleVisibilityChange = () => {
                  if (document.visibilityState === 'visible') {
                    console.log('[PWA] App visible -> checking for updates');
                    registration.update().catch(() => {});
                  }
                };
                document.addEventListener('visibilitychange', handleVisibilityChange);
                
                check();
                return () => { 
                  clearInterval(timer);
                  document.removeEventListener('visibilitychange', handleVisibilityChange);
                };
              };
              scheduleUpdateCheck();
              
              // If there's a worker already waiting, tell it to skipWaiting
              if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              }

              // Watch for new workers being installed
              registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (!installingWorker) return;
                
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] New version ready, activating...');
                    installingWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                };
              };
            }).catch(err => console.log('SW registration Error:', err));
          });

          // RELOAD PROTECTION: Only reload when a new worker takes over control
          let refreshing = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            console.log('[PWA] Controller changed -> Auto-reloading for update...');
            
            setTimeout(() => {
              window.location.reload();
            }, 500);
          });
        }
      } catch (e) {
        console.error("Hydration fail:", e);
      }
    };
    hydrate();
  }, []);

  // Finalized Unified Sync (Debounced 1.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSaving(true);
      try {
        localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
        localStorage.setItem(STORAGE_KEYS.shop, JSON.stringify(shopItems));
        localStorage.setItem(STORAGE_KEYS.journal, JSON.stringify(savedRecipes));
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ theme, language }));
      } catch (e) {
        console.error("Sync error:", e);
      } finally {
        setTimeout(() => setIsSaving(false), 800);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [tasks, shopItems, savedRecipes, theme, language]);

  // Apply visual theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Remove unused effects and vars...

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        setNotificationPermission(Notification.permission);
      } catch (e) {
        console.warn("Could not read Notification.permission:", e);
      }
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Ваш браузер не підтримує сповіщення.');
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        const title = language === 'ua' ? 'Сповіщення активовано! 🎉' : 'Powiadomienia aktywowane! 🎉';
        const body = language === 'ua' 
          ? 'Тепер ви будете отримувати нагадування про важливі справи.' 
          : 'Teraz będziesz otrzymywać przypomnienia o ważnych zadaniach.';
          
        safeNotify(title, {
          body,
          icon: '/icon.svg',
          badge: '/icon.svg'
        });
      } else if (permission === 'denied') {
        const msg = language === 'ua' 
          ? 'Сповіщення заблоковано в налаштуваннях браузера. Натисніть на іконку замка в адресному рядку, щоб змінити дозвіл.' 
          : 'Powiadomienia są zablokowane w ustawieniach przeglądarki. Kliknij ikonę kłódki w pasku adresu, aby zmienić uprawnienia.';
        alert(msg);
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      // Fallback for older browsers
      Notification.requestPermission((permission) => {
        setNotificationPermission(permission);
      });
    }
  };

  // Notifications (Periodic background checks removed to save battery)
  useEffect(() => {
    // Initial check on load
    const checkNow = () => {
      if (notificationPermission !== 'granted') return;
      const now = new Date();
      const nowStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const nowTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      
      const tasksToNotify = tasks.filter(task => 
        !task.done && 
        !task.notified && 
        task.dueDate === nowStr && 
        task.dueTime === nowTime
      );

      if (tasksToNotify.length > 0) {
        tasksToNotify.forEach(task => {
          safeNotify('Нагадування!', {
            body: task.text,
            icon: '/icon.svg',
            badge: '/icon.svg'
          });
        });
        
        const notifiedIds = new Set(tasksToNotify.map(t => t.id));
        setTasks(prev => prev.map(t => notifiedIds.has(t.id) ? { ...t, notified: true } : t));
      }
    };
    checkNow();
  }, [tasks, notificationPermission]);

  // AI states
  const [motivation, setMotivation] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recipe, setRecipe] = useState<string | null>(null);
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [showJournalInput, setShowJournalInput] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fullReset = async () => {
    const confirmText = language === 'ua' 
      ? '⚠️ ВИ ВПЕВНЕНІ? Це видалить ВСІ ваші дані, плани та очистить кеш додатку!' 
      : '⚠️ CZY JESTEŚ PEWIEN? To usunie WSZYSTKIE Twoje dane, plany i wyczyści pamięć podręczną aplikacji!';
    
    if (window.confirm(confirmText)) {
      // Clear LocalStorage
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
      localStorage.clear();

      // Clear Service Worker Caches
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHE' });
      }

      // Small delay to ensure cache clearing starts
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  const exportData = () => {
    try {
      const data = {
        tasks,
        shopItems,
        recipes: savedRecipes,
        version: APP_VERSION,
        exportDate: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plannerok_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      if (Notification.permission === 'granted') {
        new Notification(language === 'ua' ? 'Бекап створено! 📦' : 'Kopia zapasowa utworzona! 📦', {
          body: language === 'ua' ? 'Ваші дані успішно збережені у файл.' : 'Twoje dane zostały pomyślnie zapisane do pliku.',
          icon: '/icon.svg'
        });
      }
    } catch (e) {
      console.error("Export fail:", e);
      alert(language === 'ua' ? 'Не вдалося зберегти дані' : 'Nie udało się zapisać danych');
    }
  };

  const t = useMemo(() => ({
    ua: {
      title: 'PlannerOk',
      subtitle: 'ваш персональний еко-планувальник',
      tasks: 'Завдання',
      shop: 'Покупки',
      journal: 'Журнал',
      addItem: 'Додати нову справу…',
      addShop: 'Що купити?…',
      myTasks: 'Мої справи',
      myShop: 'Список покупок',
      myJournal: 'Збережені рецепти',
      emptyTasks: 'Справ поки немає — додай першу!',
      emptyShop: 'Список покупок порожній',
      emptyJournal: 'Журнал порожній — збережи свій перший рецепт!',
      motivation: 'Мотивація від AI',
      updateAnalysis: 'Оновити аналіз',
      totalEstimated: 'Орієнтовна сума:',
      retailers: 'Середня ціна (Biedronka, Lidl, Auchan, Kaufland)',
      whatToCook: 'Що приготувати? (AI Рецепт)',
      saveRecipe: 'Зберегти у Журнал',
      recipeSaved: 'Рецепт збережено!',
      clearDone: 'Очистити виконані',
      version: 'Версія',
      theme: 'Тема',
      language: 'Мова',
      doneLabel: 'з',
      doneAction: 'виконано',
      comparePrice: 'Дізнатися ціну (AI)',
      notificationsOn: '🔔 Сповіщення увімкнено',
      notificationsOff: '🔕 Увімкнути сповіщення',
      notificationsDenied: '⚠️ Сповіщення заблоковано. Увімкніть їх у налаштуваннях браузера',
      addedAt: 'Додано',
      due: 'До',
      at: 'о',
      estimating: 'Оцінюємо...',
      retry: 'Повторити',
      aiAnalyzing: 'AI аналізує твій день...',
      aiHint: 'Натисніть для отримання енергії на сьогодні! ✨',
      getBoost: 'Отримати буст!',
      recipeTitle: 'Ваш ШІ Рецепт',
      chefThinking: 'Шеф-кухар Gemini придумує щось смачненьке...',
      thanks: 'Зрозумів, дякую!',
      failedRecipe: 'Не вдалося отримати рецепт.',
      installTitle: 'Встанови як додаток! 📱',
      installDesc: 'Для швидкого доступу додайте цей список на головний екран телефону',
      updateTitle: 'Оновлення!',
      welcome: 'Ласкаво просимо!',
      letsGo: 'Зрозуміло, поїхали!',
      changeLogTitle: 'Що нового:',
      installLinkText: '\n\n📲 PlannerOk: '
    },
    pl: {
      title: 'PlannerOk',
      subtitle: 'Twój osobisty eko-planer',
      tasks: 'Zadania',
      shop: 'Zakupy',
      journal: 'Journal',
      addItem: 'Dodaj nowe zadanie...',
      addShop: 'Co kupić?...',
      myTasks: 'Moje zadania',
      myShop: 'Lista zakupów',
      myJournal: 'Zapisane przepisy',
      emptyTasks: 'Brak zadań - dodaj pierwsze!',
      emptyShop: 'Lista zakupów jest pusta',
      emptyJournal: 'Dziennik jest pusty - zapisz swój pierwszy przepis!',
      motivation: 'Motywacja AI',
      updateAnalysis: 'Aktualizuj analizę',
      totalEstimated: 'Szacunkowa suma:',
      retailers: 'Średnia cena (Biedronka, Lidl, Auchan, Kaufland)',
      whatToCook: 'AI Przepis',
      saveRecipe: 'Zapisz w Dzienniku',
      recipeSaved: 'Przepis zapisany!',
      clearDone: 'Wyczyść wykonane',
      version: 'Wersja',
      theme: 'Motyw',
      language: 'Język',
      doneLabel: 'z',
      doneAction: 'wykonane',
      comparePrice: 'Sprawdź cenę (AI)',
      notificationsOn: '🔔 Powiadomienia włączone',
      notificationsOff: '🔕 Włącz powiadomienia',
      notificationsDenied: '⚠️ Powiadomienia zablokowane. Włącz je w ustawieniach przeglądarki',
      addedAt: 'Dodano',
      due: 'Do',
      at: 'o',
      estimating: 'Szacowanie...',
      retry: 'Powtórz',
      aiAnalyzing: 'AI analizuje Twój dzień...',
      aiHint: 'Kliknij, aby otrzymać energię na dziś! ✨',
      getBoost: 'Zdobądź doładowanie!',
      recipeTitle: 'Twój AI Przepis',
      chefThinking: 'Szef kuchni Gemini wymyśla coś pysznego...',
      thanks: 'Rozumiem, dzięki!',
      failedRecipe: 'Nie udało się uzyskać przepisu.',
      installTitle: 'Zainstaluj jako aplikację! 📱',
      installDesc: 'Aby uzyskać szybki dostęp, dodaj tę listę do ekranu głównego telefonu',
      updateTitle: 'Aktualizacja!',
      welcome: 'Witamy!',
      letsGo: 'Rozumiem, zaczynamy!',
      changeLogTitle: 'Co nowego:',
      installLinkText: '\n\n📲 PlannerOk: '
    }
  }[language]), [language]);

  // Check for install guide after update modal
  useEffect(() => {
    if (!showUpdateModal) {
      const wasInstallShown = localStorage.getItem('install-guide-shown');
      const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && !wasInstallShown) {
        setShowInstallGuide(true);
      }
    }
  }, [showUpdateModal]);

  // Sorting and Summary
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = a.done ? 1 : 0;
      const bDone = b.done ? 1 : 0;
      
      // Sort by status first (undone first)
      if (aDone !== bDone) return aDone - bDone;

      // Then by due date (ascending)
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      // Finally by added date (newest first)
      return new Date(b.added).getTime() - new Date(a.added).getTime();
    });
  }, [tasks]);

  const shoppingTotal = useMemo(() => {
    return shopItems.reduce((acc, item) => {
      const price = item.price || 0;
      return acc + price;
    }, 0);
  }, [shopItems]);

  const sortedShopItems = useMemo(() => {
    return [...shopItems].sort((a, b) => {
      const aDone = a.done ? 1 : 0;
      const bDone = b.done ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(b.added).getTime() - new Date(a.added).getTime();
    });
  }, [shopItems]);

  const items = useMemo(() => {
    if (activeTab === 'tasks') return sortedTasks;
    if (activeTab === 'shop') return sortedShopItems;
    return savedRecipes;
  }, [activeTab, sortedTasks, sortedShopItems, savedRecipes]);

  const setItems = (action: any) => {
    if (activeTab === 'tasks') setTasks(action);
    if (activeTab === 'shop') setShopItems(action);
    if (activeTab === 'journal') setSavedRecipes(action);
  };

  const total = items.length;
  const doneCount = items.filter(i => i.done).length;
  const progress = total > 0 ? (doneCount / total) * 100 : 0;

  const runRecipeAI = async () => {
    if (shopItems.length === 0) return;
    setIsGeneratingRecipe(true);
    setShowRecipeModal(true);
    try {
      const itemsToCook = shopItems.map(i => i.text);
      const result = await generateRecipe(itemsToCook);
      setRecipe(result);
    } catch (error) {
      console.error("Recipe AI error:", error);
      setRecipe(t.failedRecipe);
    } finally {
      setIsGeneratingRecipe(false);
    }
  };

  const shareShoppingList = async () => {
    if (shopItems.length === 0) return;
    
    // Header for the list
    const title = language === 'ua' ? '🛒 Мій список покупок:' : '🛒 Moja lista zakupów:';
    
    // Format list: check-mark for completed, square for pending
    const listText = shopItems
      .map(item => `${item.done ? '✅' : '⬜'} ${item.text}`)
      .join('\n');
    
    const footer = `\n\n✨ ${language === 'ua' ? 'Створено в PlannerOk' : 'Utworzone w PlannerOk'}${t.installLinkText}${window.location.origin}`;
    const fullText = `${title}\n${listText}${footer}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: language === 'ua' ? 'Список покупок' : 'Lista zakupów',
          text: fullText,
        });
        if (navigator.vibrate) navigator.vibrate(20);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error('Share error:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(fullText);
        alert(language === 'ua' ? 'Список скопійовано в буфер обміну!' : 'Lista skopiowana do schowka!');
      } catch (err) {
        console.error('Clipboard error:', err);
      }
    }
  };

  const shareRecipe = async () => {
    if (!recipe) return;
    
    const cleanText = recipe.replace(/[#*`]/g, '').trim();
    const fullText = `${cleanText}${t.installLinkText}${window.location.origin}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: language === 'ua' ? 'Смачний рецепт' : 'Smaczny przepis',
          text: fullText,
        });
        if (navigator.vibrate) navigator.vibrate(20);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error('Share error:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(fullText);
        alert(language === 'ua' ? 'Рецепт скопійовано!' : 'Przepis skopiowany!');
      } catch (err) {
        console.error('Clipboard error:', err);
      }
    }
  };

  const addItem = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (activeTab === 'journal') {
      setIsGeneratingRecipe(true);
      setShowRecipeModal(true);
      setInputValue('');
      try {
        const itemsToCook = trimmed.split(/[,;\n]/).map(i => i.trim()).filter(Boolean);
        const result = await generateRecipe(itemsToCook);
        setRecipe(result);
      } catch (error) {
        console.error("Recipe generation error:", error);
        setRecipe(t.failedRecipe);
      } finally {
        setIsGeneratingRecipe(false);
      }
      return;
    }

    // Support bulk adding for tasks and shop items via comma/semicolon/newline
    const itemsToAdd = trimmed.split(/[,;\n]/).map(i => i.trim()).filter(Boolean);
    
    if (itemsToAdd.length > 1) {
      const newItems: Item[] = itemsToAdd.map(text => ({
        id: uuidv4(),
        text,
        done: false,
        added: new Date().toISOString(),
        type: activeTab === 'tasks' ? 'task' : 'shop',
        ...(activeTab === 'tasks' && dueDate ? { dueDate } : {}),
        ...(activeTab === 'tasks' && dueTime ? { dueTime } : {})
      }));

      if (activeTab === 'tasks') {
        const updatedTasks = [...newItems, ...tasks];
        setTasks(updatedTasks);
        runMotivation(updatedTasks, shopItems, savedRecipes);
      } else {
        const updatedShop = [...newItems, ...shopItems];
        setShopItems(updatedShop);
        runMotivation(tasks, updatedShop, savedRecipes);
        // Instant price fetching for all new items
        newItems.forEach(item => fetchPriceForItem(item.id, item.text));
      }
    } else {
      const newItem: Item = {
        id: uuidv4(),
        text: trimmed,
        done: false,
        added: new Date().toISOString(),
        type: activeTab === 'tasks' ? 'task' : 'shop',
        ...(activeTab === 'tasks' && dueDate ? { dueDate } : {}),
        ...(activeTab === 'tasks' && dueTime ? { dueTime } : {})
      };

      if (activeTab === 'tasks') {
        const updatedTasks = [newItem, ...tasks];
        setTasks(updatedTasks);
        runMotivation(updatedTasks, shopItems, savedRecipes);
      } else {
        const updatedShop = [newItem, ...shopItems];
        setShopItems(updatedShop);
        runMotivation(tasks, updatedShop, savedRecipes);
        fetchPriceForItem(newItem.id, trimmed);
      }
    }
    
    setInputValue('');
    setDueDate('');
    setDueTime('');
  };

  const saveRecipeToJournal = async () => {
    if (!recipe) return;
    const recipeTitle = recipe.split('\n')[0].replace(/[#*]/g, '').trim() || 'AI Recipe';
    const newSavedRecipe: Item = {
      id: uuidv4(),
      text: recipeTitle,
      done: false,
      added: new Date().toISOString(),
      type: 'recipe',
      recipeContent: recipe
    };
    const updatedRecipes = [newSavedRecipe, ...savedRecipes];
    setSavedRecipes(updatedRecipes);
    safeNotify(t.recipeSaved, { body: recipeTitle });
  };

  const fetchPriceForItem = async (id: string, text: string) => {
    try {
      const result = await estimatePrices([text]);
      if (!result) return;
      
      const keys = Object.keys(result);
      let estimatedPrice = null;

      if (keys.length > 0) {
        const normalizedText = text.toLowerCase().trim();
        // Try exact match, then partial match
        const matchKey = keys.find(k => k.toLowerCase().trim() === normalizedText) || 
                         keys.find(k => {
                           const nk = k.toLowerCase().trim();
                           return normalizedText.includes(nk) || nk.includes(normalizedText);
                         }) || keys[0];
        
        const val = result[matchKey];
        estimatedPrice = (typeof val === 'number' && !isNaN(val)) ? val : null;
      }

      setShopItems(prev => prev.map(item =>
        item.id === id ? { ...item, price: (estimatedPrice && !isNaN(estimatedPrice)) ? estimatedPrice : null } : item
      ));
    } catch (error) {
      console.error("Price fetch error:", error);
    }
  };

  const updateAllPrices = async () => {
    if (shopItems.length === 0) return;
    const itemsToFetch = shopItems.filter(i => i.price === undefined || i.price === null).map(i => i.text);
    if (itemsToFetch.length === 0) return;
    try {
      const results = await estimatePrices(itemsToFetch);
      if (results && Object.keys(results).length > 0) {
        const keys = Object.keys(results);
        setShopItems(prev => prev.map(item => {
          if (item.price !== undefined && item.price !== null) return item;
          
          const normalizedItemText = item.text.toLowerCase().trim();
          const matchKey = keys.find(k => k.toLowerCase().trim() === normalizedItemText) || 
                           keys.find(k => {
                             const nk = k.toLowerCase().trim();
                             return normalizedItemText.includes(nk) || nk.includes(normalizedItemText);
                           });
          
          const estPrice = matchKey ? results[matchKey] : null;
          const finalPrice = (typeof estPrice === 'number' && !isNaN(estPrice)) ? estPrice : null;
          
          return { ...item, price: (finalPrice && !isNaN(finalPrice)) ? finalPrice : null };
        }));
      }
    } catch (error) {
      console.error("Price update error:", error);
    }
  };

  useEffect(() => {
    if (activeTab === 'shop') {
      updateAllPrices();
    }
  }, [activeTab]);

  useEffect(() => {
    if (tasks.length > 0 || shopItems.length > 0 || savedRecipes.length > 0) {
      runMotivation();
    }
  }, [activeTab]);

  const runMotivation = async (currentTasks?: Item[], currentShop?: Item[], currentRecipes?: Item[], force: boolean = false) => {
    setIsAnalyzing(true);
    const tTasks = (currentTasks || tasks).filter(t => !t.done).map(t => t.text);
    const tShop = (currentShop || shopItems).filter(t => !t.done).map(t => t.text);
    const tRecipes = (currentRecipes || savedRecipes).map(t => t.text);
    
    const advice = await analyzeStatus(tTasks, tShop, tRecipes, activeTab, force);
    setMotivation(advice);
    setIsAnalyzing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addItem();
    }
  };

  const toggleItem = (id: string) => {
    if (activeTab === 'tasks') {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
    } else {
      setShopItems(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s));
    }
  };

  const removeItem = (id: string) => {
    if (activeTab === 'tasks') {
      setTasks(prev => prev.filter(item => item.id !== id));
    } else {
      setShopItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const clearDone = () => {
    setItems(prev => prev.filter(item => !item.done));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(language === 'ua' ? 'uk-UA' : 'pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`relative min-h-[100dvh] p-4 md:p-8 flex flex-col items-center overflow-x-hidden transition-colors duration-500 pb-20 theme-${theme}`}>
      {/* Pull-to-refresh Indicator */}
      <div 
        className="fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none"
        style={{ transform: `translateY(${pullDistance - 50}px)`, opacity: pullDistance / 60 }}
      >
        <div className="glass bg-white/95 backdrop-blur-xl p-2 px-4 rounded-full shadow-lg border border-rose/20 flex items-center gap-2">
          {isRefreshingSW ? (
            <Loader2 size={16} className="text-deep-rose animate-spin" />
          ) : (
            <RefreshCw size={16} className={`text-deep-rose transition-transform ${pullDistance > 60 ? 'rotate-180' : ''}`} />
          )}
          <span className="text-[10px] font-black uppercase text-deep-rose">
            {isRefreshingSW ? 'Шукаю...' : 'Потягніть для оновлення'}
          </span>
        </div>
      </div>

      {/* Decorative bokeh circles */}
      <div className="bokeh bg-theme-primary/20 w-[420px] h-[420px] top-[-80px] right-[-80px] blur-[100px] rounded-full absolute -z-10" />
      <div className="bokeh bg-theme-secondary/20 w-[360px] h-[360px] bottom-[-60px] left-[-60px] blur-[100px] rounded-full absolute -z-10" />

      <header className="text-center mb-8 space-y-2 relative w-full max-w-lg">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-4xl font-semibold text-deep-rose"
        >
          PlannerOk
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-text-soft italic text-sm"
        >
          {t.subtitle}
        </motion.p>
        </motion.div>
      </header>

      <div className="w-full max-w-lg font-sans">
        {/* Progress Bar */}
        {total > 0 && (
          <div className="mb-6 px-1">
            <div className="h-1.5 w-full bg-rose/10 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
               <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-linear-to-r from-deep-rose via-rose to-peach"
               />
            </div>
          </div>
        )}
        {/* Navigation Tabs */}
        <div className="flex gap-1 mb-6 justify-center w-full max-w-sm mx-auto">
          {[
            { id: 'tasks', icon: ListTodo, label: t.tasks },
            { id: 'shop', icon: ShoppingCart, label: t.shop },
            { id: 'journal', icon: ClipboardList, label: t.journal }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 py-2 px-1 rounded-xl font-bold text-[10px] sm:text-xs transition-all duration-300 flex flex-col items-center justify-center gap-1 min-w-0 border ${
                activeTab === tab.id
                  ? 'bg-linear-to-br from-rose to-peach text-white shadow-md border-transparent scale-105'
                  : 'glass text-text-soft border-rose/5 hover:text-deep-rose hover:bg-white/40'
              }`}
            >
              <tab.icon size={16} />
              <span className="truncate w-full text-center">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Motivation Section - Universal AI Advisor */}
        {(tasks.length > 0 || shopItems.length > 0 || savedRecipes.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 glass p-4 rounded-3xl border-rose/30 shadow-sm overflow-hidden relative"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-deep-rose font-black text-[11px] uppercase tracking-wider">
                <Sparkles size={16} className="text-orange-400 animate-pulse" />
                {t.motivation}
              </div>
              <button
                onClick={() => runMotivation(undefined, undefined, undefined, true)}
                disabled={isAnalyzing}
                className="text-[10px] font-black uppercase tracking-tight bg-linear-to-r from-rose/20 to-peach/20 hover:from-rose/30 hover:to-peach/30 text-deep-rose px-4 py-1.5 rounded-full transition-all disabled:opacity-50 flex items-center gap-2 border border-rose/10 shadow-xs"
              >
                {isAnalyzing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <>
                     <Zap size={10} />
                     {activeTab === 'tasks' ? t.getBoost : t.updateAnalysis}
                  </>
                )}
              </button>
            </div>
            <div className="relative">
               <motion.p 
                key={motivation}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[13px] text-text-main leading-relaxed font-medium italic pr-8"
               >
                 {motivation || (isAnalyzing ? t.aiAnalyzing : t.aiHint)}
               </motion.p>
               <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                  <BrainCircuit size={40} />
               </div>
            </div>
          </motion.div>
        )}

      {/* Main Card */}
        <motion.div
          layout
          className="glass rounded-[32px] p-6 shadow-2xl space-y-4"
        >
          {activeTab !== 'journal' && (
            <>
              {/* Date and Time Display */}
              <div className="text-center mb-6 py-3 border-b border-rose/10 bg-white/20 rounded-2xl">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-deep-rose font-sans flex flex-wrap justify-center items-center gap-3"
                >
                  <div className="flex items-center text-xl md:text-2xl font-bold tracking-tight">
                    <span>{currentTime.toLocaleDateString(language === 'ua' ? 'uk-UA' : 'pl-PL', { day: '2-digit' })}</span>
                    <span className="mx-0.5">.</span>
                    <span>{currentTime.toLocaleDateString(language === 'ua' ? 'uk-UA' : 'pl-PL', { month: '2-digit' })}</span>
                    <span className="mx-0.5">.</span>
                    <span>{currentTime.getFullYear()}</span>
                  </div>
                  <div className="w-px h-4 bg-rose/20 hidden sm:block"></div>
                  <div className="text-xl md:text-2xl font-medium tabular-nums">
                    {currentTime.toLocaleTimeString(language === 'ua' ? 'uk-UA' : 'pl-PL', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </div>
                </motion.div>
              </div>

              {/* Input Row */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    id="item-input"
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeTab === 'tasks' ? t.addItem : t.addShop}
                    className="flex-1 px-4 py-3 rounded-2xl bg-white/65 border border-rose/20 outline-none focus:ring-2 focus:ring-rose/30 transition-all text-text-main"
                  />
                  <button
                    id="add-item-btn"
                    onClick={addItem}
                    className="bg-linear-to-br from-rose to-peach text-white p-3 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center shrink-0"
                  >
                    <Plus size={24} />
                  </button>
                </div>

                {activeTab === 'tasks' && (
                  <div className="flex flex-col gap-2.5 px-0.5">
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex-1 flex items-center justify-center gap-2 bg-white/40 border border-rose/10 rounded-xl px-2 py-2 min-w-0">
                        <Calendar size={14} className="text-rose shrink-0" />
                        <input
                          type="date"
                          value={dueDate}
                          onChange={e => setDueDate(e.target.value)}
                          className="text-[12px] md:text-[13px] outline-none text-text-soft bg-transparent w-full text-center font-medium"
                        />
                      </div>
                      
                      <div className="flex-1 flex items-center justify-center gap-2 bg-white/40 border border-rose/10 rounded-xl px-2 py-2 min-w-0">
                        <Clock size={14} className="text-rose shrink-0" />
                        <input
                          type="time"
                          value={dueTime}
                          onChange={e => setDueTime(e.target.value)}
                          className="text-[12px] md:text-[13px] outline-none text-text-soft bg-transparent w-full text-center font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={requestPermission}
                        className={`text-[10px] w-full py-1.5 rounded-xl border font-bold transition-all flex items-center justify-center gap-2 ${
                          notificationPermission === 'granted' 
                            ? 'bg-green-50 text-green-600 border-green-200' 
                            : notificationPermission === 'denied'
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : 'bg-rose/5 text-deep-rose border-rose/10 hover:bg-rose/10 shadow-sm'
                        }`}
                      >
                        {notificationPermission === 'granted' 
                          ? (<span>{t.notificationsOn}</span>) 
                          : notificationPermission === 'denied' 
                          ? (<span>{t.notificationsDenied}</span>)
                          : (<span>{t.notificationsOff}</span>)
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1 mb-4">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-soft/60">
                {activeTab === 'tasks' ? t.myTasks : activeTab === 'shop' ? t.myShop : t.myJournal}
              </h2>
              <div className="flex gap-2">
                {activeTab === 'shop' && shopItems.length > 0 && (
                  <button
                    onClick={shareShoppingList}
                    className="text-deep-rose hover:bg-rose/10 p-1 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter"
                  >
                    <Share2 size={12} />
                    {language === 'ua' ? 'Поділитися' : 'Udostępnij'}
                  </button>
                )}
                {activeTab === 'journal' && (
                  <div className="flex gap-2">
                    {shopItems.length > 0 && (
                      <button
                        onClick={runRecipeAI}
                        disabled={isGeneratingRecipe}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg text-[10px] font-black uppercase tracking-tight hover:bg-orange-200 transition-all disabled:opacity-50"
                      >
                        {isGeneratingRecipe ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {t.whatToCook}
                      </button>
                    )}
                    <button
                      onClick={() => setShowJournalInput(!showJournalInput)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-rose text-white rounded-lg text-[10px] font-black uppercase tracking-tight hover:bg-deep-rose transition-all shadow-md"
                    >
                      {showJournalInput ? <X size={12} /> : <Plus size={12} />}
                      {language === 'ua' ? 'Новий рецепт' : 'Nowy przepis'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {activeTab === 'journal' && showJournalInput && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 glass rounded-2xl border border-rose/20 space-y-3 overflow-hidden"
              >
                <textarea
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      addItem();
                      setShowJournalInput(false);
                      setInputValue('');
                    }
                  }}
                  placeholder={language === 'ua' ? 'Список інгредієнтів (можна списком або через кому)... \n\nПриклад:\nКурка, броколі, вершки' : 'Lista składników (można listą lub po przecinku)... \n\nPrzykład:\nKurczak, brokuły, śmietana'}
                  className="w-full h-32 px-4 py-3 rounded-xl bg-white/60 border border-rose/10 outline-none focus:ring-2 focus:ring-rose/30 transition-all text-sm resize-none font-medium placeholder:italic"
                />
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] text-text-soft/60 italic">
                    {language === 'ua' ? '💡 Порада: Натисніть Cmd+Enter для миттєвої генерації' : '💡 Porada: Naciśnij Cmd+Enter dla natychmiastowej generacji'}
                  </span>
                  <button
                    onClick={async () => {
                      await addItem();
                      setShowJournalInput(false);
                      setInputValue('');
                    }}
                    disabled={isGeneratingRecipe || !inputValue.trim()}
                    className="flex items-center justify-center gap-2 py-2.5 px-6 bg-linear-to-r from-rose to-peach text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all transform active:scale-95"
                  >
                    {isGeneratingRecipe ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {t.whatToCook}
                  </button>
                </div>
              </motion.div>
            )}

            <div className="space-y-3 min-h-[100px]">
              <AnimatePresence mode="popLayout" initial={false}>
                {items.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center justify-center py-10 text-text-soft italic text-sm text-center px-4"
                  >
                    <span className="text-4xl mb-2">
                       ✨
                    </span>
                    {activeTab === 'tasks' ? t.emptyTasks : activeTab === 'shop' ? t.emptyShop : t.emptyJournal}
                  </motion.div>
                ) : activeTab === 'journal' ? (
                  savedRecipes.map((recipe) => (
                    <motion.div
                      layout
                      key={recipe.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group glass-item p-4 rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:shadow-md transition-all border border-rose/10 cursor-pointer"
                      onClick={() => {
                        setRecipe(recipe.recipeContent || '');
                        setShowRecipeModal(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-500">
                           <Sparkles size={18} />
                         </div>
                         <div>
                            <div className="text-sm font-bold text-text-main leading-tight">{recipe.text}</div>
                            <div className="text-[10px] text-text-soft/60 uppercase font-black tracking-tighter mt-0.5">{t.addedAt} {new Date(recipe.added).toLocaleDateString()}</div>
                         </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSavedRecipes(prev => prev.filter(r => r.id !== recipe.id));
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-rose hover:bg-rose/10 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  items.map((item, index) => (
                    <motion.div
                      layout
                      key={item.id}
                      initial={{ opacity: 0, x: -20, scale: 0.95 }}
                      animate={{ 
                        opacity: 1, 
                        x: 0, 
                        scale: 1,
                        transition: { delay: index * 0.05 }
                      }}
                      exit={{ opacity: 0, scale: 0.95, x: 20 }}
                      className={`group flex items-start gap-3 p-4 rounded-2xl transition-all duration-300 glass-item ${
                        item.done ? 'opacity-50 grayscale bg-text-soft/5' : 'bg-white/80 shadow-md hover:shadow-xl hover:translate-y-[-2px]'
                      }`}
                    >
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={`mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          item.done
                            ? 'bg-linear-to-br from-rose to-peach border-transparent shadow-sm'
                            : 'border-rose cursor-pointer hover:border-deep-rose'
                        }`}
                      >
                        {item.done && <Check size={14} className="text-white font-bold" />}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`text-[15px] leading-relaxed transition-all break-words flex items-center flex-wrap gap-2 ${
                          item.done ? 'line-through text-text-soft italic' : 'text-text-main font-medium'
                        }`}>
                          <span>{item.text}</span>
                          {activeTab === 'shop' && item.price !== undefined && item.price !== null && (
                            <span className="text-[10px] text-emerald-600 font-black bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 whitespace-nowrap">
                              ~{item.price.toFixed(1)} PLN
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-[10px] text-text-soft">
                            <Sparkles size={10} />
                            <span>{t.addedAt} {formatDate(item.added)}</span>
                          </div>
                          {item.dueDate && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-deep-rose">
                              <Calendar size={10} />
                              <span>{t.due}: {formatDate(item.dueDate).split(' ')[0]}</span>
                              {item.dueTime && <span className="ml-1 text-deep-rose/70">{t.at} {item.dueTime}</span>}
                              {item.dueTime && notificationPermission === 'granted' && (
                                <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} className="ml-1">🔔</motion.span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-text-soft hover:text-red-500 transition-all shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {total > 0 && activeTab !== 'journal' && (
            <div className="space-y-3 pt-4 border-t border-rose/10">
              {activeTab === 'shop' && (
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-text-main font-bold">
                    <Store size={16} className="text-deep-rose" />
                    <div className="flex flex-col">
                      <span className="text-sm">{t.totalEstimated}</span>
                      <span className="text-[9px] font-normal text-text-soft uppercase tracking-wider">{t.retailers}</span>
                    </div>
                  </div>
                  <motion.div
                    key={`total-${shoppingTotal}`}
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="text-lg font-serif font-black text-deep-rose"
                  >
                    {shoppingTotal.toFixed(2)} PLN
                  </motion.div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-soft font-bold uppercase tracking-tight">
                  {doneCount} / {total} {t.doneAction}
                </span>
                {doneCount > 0 && (
                  <button
                    onClick={clearDone}
                    className="text-[10px] font-black text-deep-rose hover:underline transition-all flex items-center gap-1 uppercase tracking-tighter"
                  >
                    <X size={12} />
                    {t.clearDone}
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <footer className="mt-12 text-center text-text-soft/60 text-[11px] space-y-4 pb-8 max-w-lg w-full px-4">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 py-4 border-y border-rose/10 bg-white/10 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-3">
             <span className="font-bold text-deep-rose/80 uppercase tracking-tighter text-[10px]">{t.theme}:</span>
             <button 
              onClick={() => setShowThemeSelector(!showThemeSelector)}
              className="px-3 py-1 bg-rose/10 hover:bg-rose/20 rounded-lg text-deep-rose font-black shadow-xs transition-all uppercase tracking-widest text-[9px]"
             >
                {theme}
             </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-bold text-deep-rose/80 uppercase tracking-tighter text-[10px]">{t.language}:</span>
            <div className="flex gap-1">
              <button 
                onClick={() => setLanguage('ua')}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${language === 'ua' ? 'bg-deep-rose text-white shadow-md' : 'bg-rose/10 text-deep-rose hover:bg-rose/20'}`}
              >
                UA
              </button>
              <button 
                onClick={() => setLanguage('pl')}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${language === 'pl' ? 'bg-deep-rose text-white shadow-md' : 'bg-rose/10 text-deep-rose hover:bg-rose/20'}`}
              >
                PL
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showThemeSelector && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-wrap justify-center gap-3 p-4 glass rounded-3xl"
            >
              {(['rose', 'mint', 'lavender', 'sky', 'midnight', 'plum'] as const).map((variant) => (
                <button
                  key={variant}
                  onClick={() => {
                    setTheme(variant);
                  }}
                  className={`group relative flex flex-col items-center gap-2 p-2 rounded-xl transition-all ${theme === variant ? 'bg-white/40 ring-2 ring-deep-rose ring-offset-2 ring-offset-transparent' : 'hover:bg-white/20'}`}
                >
                  <div 
                    className="w-10 h-10 rounded-full shadow-lg"
                    style={{
                      backgroundColor: 
                        variant === 'rose' ? '#f4a0b0' : 
                        variant === 'mint' ? '#a8e6cf' : 
                        variant === 'lavender' ? '#d1c4e9' : 
                        variant === 'sky' ? '#b3e5fc' :
                        variant === 'midnight' ? '#0f172a' : '#4a148c'
                    }}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-tighter text-text-soft group-hover:text-deep-rose">
                    {variant}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4 pt-4">
          <div className="opacity-40 italic">&copy; {new Date().getFullYear()} PlannerOk • Made with love</div>
          <div className="flex flex-col items-center gap-3">
            <button 
              onClick={() => {
                setIsFirstVisit(false);
                setShowUpdateModal(true);
              }}
              className="hover:text-deep-rose transition-colors font-medium border-b border-transparent hover:border-deep-rose/30 text-xs"
            >
              {t.version}: {APP_VERSION}
            </button>
            <div className="flex flex-col items-center gap-2 w-full max-w-sm">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-text-soft uppercase tracking-tighter self-center mb-1">
                <Zap size={10} className="text-deep-rose" />
                {language === 'ua' ? 'Стабільність системи' : 'Stabilność systemu'}
              </div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={exportData}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-tight border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-95 shadow-sm"
                >
                  <Download size={12} />
                  {language === 'ua' ? 'Зберегти дані' : 'Zapisz dane'}
                </button>
                <button 
                  onClick={fullReset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-rose/5 text-deep-rose text-[10px] font-black uppercase tracking-tight border border-rose/10 hover:bg-rose/10 transition-all active:scale-95 shadow-sm"
                >
                  <Trash2 size={12} />
                  {language === 'ua' ? 'Очищення кешу' : 'Czyść cache'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Recipe Modal */}
      <AnimatePresence>
        {showRecipeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isGeneratingRecipe && setShowRecipeModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              layoutId="recipe-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass-item bg-white/95 rounded-[32px] p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-rose/10">
                <div className="flex items-center gap-2 text-deep-rose font-bold">
                  <Sparkles className="text-orange-500" size={20} />
                  <span>{t.recipeTitle}</span>
                </div>
                <button
                  onClick={() => setShowRecipeModal(false)}
                  className="p-1 hover:bg-rose/10 rounded-full transition-all text-text-soft"
                >
                  <X size={20} />
                </button>
              </div>

              {isGeneratingRecipe ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Loader2 size={40} className="animate-spin text-deep-rose" />
                  <p className="text-text-soft italic animate-pulse">
                    {t.chefThinking}
                  </p>
                </div>
              ) : (
                <div className="markdown-body prose prose-rose prose-sm max-w-none">
                  {recipe ? (
                    <>
                      <div className="flex justify-end gap-2 mb-4">
                        <button
                          onClick={saveRecipeToJournal}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-all shadow-sm active:scale-95"
                        >
                          <Plus size={14} />
                          {t.saveRecipe}
                        </button>
                        <button
                          onClick={shareRecipe}
                          className="flex items-center gap-2 px-4 py-2 bg-rose/10 text-deep-rose rounded-xl text-xs font-bold hover:bg-rose/20 transition-all ripple"
                        >
                          <Share2 size={14} />
                          {language === 'ua' ? 'Поділитися' : 'Udostępnij'}
                        </button>
                      </div>
                      <Markdown>{recipe}</Markdown>
                    </>
                  ) : (
                    <p className="text-text-soft text-center py-10">{t.failedRecipe}</p>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Update/Onboarding Modal */}
      <AnimatePresence>
        {showUpdateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowUpdateModal(false);
                setIsFirstVisit(false);
                localStorage.setItem(STORAGE_KEYS.version, APP_VERSION);
              }}
              className="absolute inset-0 bg-black/50 backdrop-blur-md"
            />
            <motion.div
              layoutId="update-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass-item bg-white/95 rounded-[32px] p-8 shadow-2xl overflow-y-auto max-h-[90dvh]"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-deep-rose/10 rounded-2xl flex items-center justify-center text-deep-rose">
                  {isFirstVisit ? <Sparkles size={32} /> : <CheckCircle size={32} />}
                </div>
                
                <div>
                  <h2 className="text-2xl font-black text-deep-rose italic">
                    {isFirstVisit ? t.welcome : t.updateTitle}
                  </h2>
                  <p className="text-text-soft text-sm">{t.version} {APP_VERSION}</p>
                </div>

                <div className="w-full space-y-6 text-left mt-4">
                  {isFirstVisit && (
                    <div className="space-y-4 pt-4 border-t border-rose/10">
                      <p className="text-[10px] font-black text-deep-rose uppercase tracking-[0.2em] text-center">
                        {language === 'ua' ? 'Оберіть свій стиль:' : 'Wybierz swój styl:'}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'rose', color: '#f4a0b0', name: 'Rose' },
                          { id: 'mint', color: '#a8e6cf', name: 'Mint' },
                          { id: 'lavender', color: '#d1c4e9', name: 'Lavender' },
                          { id: 'sky', color: '#b3e5fc', name: 'Sky' },
                          { id: 'midnight', color: '#0f172a', name: 'Night' },
                          { id: 'plum', color: '#4c1d95', name: 'Plum' }
                        ].map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id as any)}
                            className={`p-2 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                              theme === t.id ? 'border-deep-rose bg-rose/10' : 'border-transparent bg-white/40'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full shadow-inner border border-black/5" style={{ backgroundColor: t.color }} />
                            <span className="text-[9px] font-black uppercase tracking-tighter">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isFirstVisit ? (
                    <div className="space-y-6">
                      <div>
                        <h3 className="font-bold text-deep-rose mb-3 flex items-center gap-2">
                          <ListChecks size={16} /> {language === 'ua' ? 'Що вміє програма:' : 'Co potrafi aplikacja:'}
                        </h3>
                        <div className="grid gap-3">
                          {APP_FEATURES.map((feature, i) => (
                            <div key={i} className="bg-rose/5 p-3 rounded-xl border border-rose/10">
                              <div className="font-bold text-deep-rose text-xs">{feature.title}</div>
                              <div className="text-[10px] text-text-soft">{feature.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {installPrompt ? (
                        <div className="p-5 bg-linear-to-br from-amber-50 to-orange-50 rounded-3xl border border-amber-200 flex flex-col items-center gap-4 shadow-sm">
                          <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                            <Smartphone size={24} />
                          </div>
                          <p className="text-xs text-amber-900 font-bold text-center">
                            {language === 'ua' ? 'Встановіть PlannerOk як додаток!' : 'Zainstaluj PlannerOk jako aplikację!'}
                          </p>
                          {window.location.hostname.includes('europe-west2.run.app') && (
                            <p className="text-[9px] text-amber-600 bg-white/50 p-2 rounded-lg text-center mb-1">
                              {language === 'ua' 
                                ? '⚠️ Якщо кнопка не реагує, відкрийте додаток у новій вкладці та натисніть "Поділитися" -> "На головний екран" (iOS) або меню браузера (Android).'
                                : '⚠️ Jeśli przycisk nie reaguje, otwórz aplikację w nowej karcie i wybierz "Dodaj do ekranu głównego".'}
                            </p>
                          )}
                          <button 
                            onClick={handleInstall}
                            className="w-full py-3 bg-amber-500 text-white rounded-xl text-sm font-black shadow-md active:scale-95 transition-all"
                          >
                            {language === 'ua' ? 'Встановити зараз' : 'Zainstaluj teraz'}
                          </button>
                        </div>
                      ) : (
                        <div className="p-5 bg-linear-to-br from-blue-50 to-sky-50 rounded-3xl border border-blue-100 italic text-[11px] text-blue-800 text-center shadow-sm">
                          {language === 'ua' 
                            ? '💡 Підказка: Ви можете додати PlannerOk на головний екран смартфона через меню браузера ("Додати додому") для миттєвого доступу.' 
                            : '💡 Podpowiedź: Możesz dodać PlannerOk do ekranu głównego smartfona przez menu przeglądarki ("Dodaj do ekranu głównego").'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-bold text-deep-rose mb-2 flex items-center gap-2">
                        <Sparkles size={16} /> {t.changeLogTitle}
                      </h3>
                      <ul className="space-y-2">
                        {CHANGE_LOG.map((change, i) => (
                          <li key={i} className="flex gap-2 text-xs text-text-soft">
                            <span className="text-deep-rose">•</span>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowUpdateModal(false);
                    setIsFirstVisit(false);
                    localStorage.setItem(STORAGE_KEYS.version, APP_VERSION);
                  }}
                  className="w-full py-4 bg-deep-rose text-white font-black rounded-2xl shadow-lg hover:bg-rose-700 transition-all active:scale-95 text-center flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} />
                  {t.letsGo}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Update Notification Banner - Removed for auto-update */}

      {/* Install Guide Modal */}
      <AnimatePresence>
        {showInstallGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstallGuide(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-sm glass-item bg-white/95 rounded-[40px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-linear-to-br from-rose to-peach rounded-3xl text-white shadow-xl rotate-3">
                  <Smartphone size={40} />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-deep-rose leading-tight">
                    {t.installTitle}
                  </h2>
                  <p className="text-sm text-text-soft">
                    {t.installDesc}
                  </p>
                </div>

                <div className="bg-rose/5 rounded-3xl p-6 text-left space-y-4 border border-rose/10">
                  <div className="space-y-4">
                    <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-deep-rose font-bold shrink-0">1</div>
                      <div className="text-xs text-text-main">
                        {language === 'ua' ? 'Натисніть на іконку' : 'Kliknij ikonę'} <span className="font-bold inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-white rounded-lg border border-rose/20 shadow-sm"><Share size={12}/> {language === 'ua' ? 'Поділитись' : 'Udostępnij'}</span> {language === 'ua' ? '(внизу на iOS або в меню Chrome)' : '(na dole w iOS lub w menu Chrome)'}
                      </div>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-deep-rose font-bold shrink-0">2</div>
                      <div className="text-xs text-text-main">
                        {language === 'ua' ? 'Виберіть пункт' : 'Wybierz opcję'} <span className="font-bold underline text-deep-rose">{language === 'ua' ? '«На початковий екран»' : '«Do ekranu początkowego»'}</span> {language === 'ua' ? 'або' : 'lub'} <span className="font-bold underline text-deep-rose">{language === 'ua' ? '«Додати додому»' : '«Dodaj do ekranu głównego»'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowInstallGuide(false);
                    localStorage.setItem('install-guide-shown', 'true');
                  }}
                  className="w-full py-4 bg-linear-to-r from-deep-rose to-rose text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95"
                >
                  {t.thanks}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Status Bar - Static Indicator */}
      <div className="fixed bottom-4 right-4 z-[9999] pointer-events-none select-none flex flex-col items-end gap-2">
        <AnimatePresence>
          {isSaving && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="px-3 py-1.5 rounded-xl bg-deep-rose text-white shadow-lg border border-white/20 flex items-center gap-2"
            >
              <Loader2 size={10} className="animate-spin" />
              <span className="text-[9px] font-black uppercase">{language === 'ua' ? 'Синхронізація' : 'Synchro'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
