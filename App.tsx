/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  orderBy, 
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Calculator, 
  Utensils, 
  History, 
  LogOut, 
  Plus, 
  Trash2, 
  TrendingDown, 
  User as UserIcon,
  ChevronRight,
  Activity,
  Calendar,
  Weight,
  Settings,
  Coffee,
  Apple,
  Pizza,
  Egg,
  Milk,
  Soup,
  Croissant,
  IceCream,
  Wine,
  Beer,
  Cookie,
  Cake,
  Fish,
  Carrot,
  Cherry,
  Citrus,
  Grape,
  Banana,
  Sandwich,
  Drumstick,
  Leaf,
  Bike,
  Dumbbell,
  Footprints,
  Flame,
  Sparkles
} from 'lucide-react';
import { format, startOfDay, subDays, isSameDay } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  weight: number;
  height: number;
  age: number;
  gender: 'male' | 'female';
  activityLevel: string;
  goalWeight?: number;
  goalDate?: string;
  photoURL?: string;
  tmb: number;
  tdee: number;
  dailyCalorieGoal: number;
  updatedAt: string;
}

interface Meal {
  id: string;
  uid: string;
  date: string;
  description: string;
  calories: number;
  timestamp: string;
}

interface Exercise {
  id: string;
  uid: string;
  date: string;
  description?: string;
  caloriesBurned: number;
  duration?: number;
  timestamp: string;
}

interface WeightEntry {
  id: string;
  uid: string;
  date: string;
  weight: number;
  timestamp: string;
}

// --- Constants ---

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentário (pouco ou nenhum exercício)', multiplier: 1.2 },
  { value: 'lightlyActive', label: 'Levemente Ativo (exercício leve 1-3 dias/semana)', multiplier: 1.375 },
  { value: 'moderatelyActive', label: 'Moderadamente Ativo (exercício moderado 3-5 dias/semana)', multiplier: 1.55 },
  { value: 'veryActive', label: 'Muito Ativo (exercício pesado 6-7 dias/semana)', multiplier: 1.725 },
  { value: 'extraActive', label: 'Extra Ativo (exercício muito pesado e trabalho físico)', multiplier: 1.9 },
];

const GENAI_MODEL = "gemini-3-flash-preview";

// --- Components ---

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'diary' | 'profile' | 'history'>('diary');

  // --- Auth & Profile ---

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);
      if (firebaseUser) {
        await fetchProfile(firebaseUser.uid);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const fetchProfile = async (uid: string) => {
    const path = `users/${uid}`;
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      }
      setLoading(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Real-time Data ---

  useEffect(() => {
    if (!user || !profile) return;

    const mealsQuery = query(
      collection(db, 'meals'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeMeals = onSnapshot(mealsQuery, (snapshot) => {
      const mealData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Meal));
      setMeals(mealData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meals');
    });

    const exercisesQuery = query(
      collection(db, 'exercises'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeExercises = onSnapshot(exercisesQuery, (snapshot) => {
      const exerciseData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exercise));
      setExercises(exerciseData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'exercises');
    });

    const weightQuery = query(
      collection(db, 'weightHistory'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'asc')
    );

    const unsubscribeWeight = onSnapshot(weightQuery, (snapshot) => {
      const weightData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeightEntry));
      setWeightHistory(weightData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'weightHistory');
    });

    return () => {
      unsubscribeMeals();
      unsubscribeExercises();
      unsubscribeWeight();
    };
  }, [user, profile]);

  // --- Calculations ---

  const calculateTMB = (w: number, h: number, a: number, g: 'male' | 'female') => {
    if (g === 'male') {
      return 88.362 + (13.397 * w) + (4.799 * h) - (5.677 * a);
    }
    return 447.593 + (9.247 * w) + (3.098 * h) - (4.330 * a);
  };

  const saveProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    
    const weight = data.weight || profile?.weight || 0;
    const height = data.height || profile?.height || 0;
    const age = data.age || profile?.age || 0;
    const gender = data.gender || profile?.gender || 'male';
    const activityValue = data.activityLevel || profile?.activityLevel || 'sedentary';
    
    const tmb = calculateTMB(weight, height, age, gender);
    const multiplier = ACTIVITY_LEVELS.find(l => l.value === activityValue)?.multiplier || 1.2;
    const tdee = tmb * multiplier;
    
    // Calculate dailyCalorieGoal based on goalWeight and goalDate if provided
    const goalWeight = data.goalWeight ?? profile?.goalWeight;
    const goalDate = data.goalDate ?? profile?.goalDate;
    
    let dailyCalorieGoal = tdee - 500; // Default: 500kcal deficit

    if (goalWeight && goalDate) {
      const today = startOfDay(new Date());
      const targetDate = startOfDay(new Date(goalDate));
      const daysRemaining = Math.max(1, Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      
      const weightToLose = weight - goalWeight;
      if (weightToLose > 0) {
        const totalDeficitNeeded = weightToLose * 7700; // 1kg of fat ≈ 7700 kcal
        const dailyDeficit = totalDeficitNeeded / daysRemaining;
        
        // Ensure the deficit is not too extreme (max 1000kcal or min 1200kcal total intake)
        const calculatedGoal = tdee - dailyDeficit;
        dailyCalorieGoal = Math.max(1200, Math.min(tdee - 200, calculatedGoal));
      }
    }

    const newProfile: any = {
      uid: user.uid,
      name: user.displayName || '',
      email: user.email || '',
      weight,
      height,
      age,
      gender,
      activityLevel: activityValue,
      tmb,
      tdee,
      dailyCalorieGoal,
      updatedAt: new Date().toISOString(),
    };

    if (goalWeight !== undefined) newProfile.goalWeight = goalWeight;
    if (goalDate !== undefined) newProfile.goalDate = goalDate;

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      
      // Also add to weight history if weight changed
      if (data.weight && data.weight !== profile?.weight) {
        await addDoc(collection(db, 'weightHistory'), {
          uid: user.uid,
          date: format(new Date(), 'yyyy-MM-dd'),
          weight: data.weight,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  // --- UI Views ---

  if (!isAuthReady) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  if (!profile && !loading) return <ProfileSetup onSave={saveProfile} />;
  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FFFFFF] font-sans selection:bg-[#10B981]/30">
      {/* Header */}
      <header className="bg-[#141414] border-b border-[#27272A] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#10B981] rounded-lg flex items-center justify-center shadow-lg shadow-[#10B981]/20">
              <TrendingDown className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">FitJourney AI</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-[#A1A1AA] hover:text-[#EF4444] transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 pb-32">
        {activeTab === 'diary' && <DiaryView profile={profile} meals={meals} exercises={exercises} />}
        {activeTab === 'history' && <HistoryView weightHistory={weightHistory} profile={profile} />}
        {activeTab === 'profile' && <ProfileView profile={profile} onSave={saveProfile} />}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#141414]/80 backdrop-blur-xl border-t border-[#27272A] px-4 py-3 z-50">
        <div className="max-w-4xl mx-auto flex justify-around items-center">
          <NavButton 
            active={activeTab === 'diary'} 
            onClick={() => setActiveTab('diary')}
            icon={<Utensils />}
            label="Diário"
          />
          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')}
            icon={<History />}
            label="Evolução"
          />
          <NavButton 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')}
            icon={<UserIcon />}
            label="Perfil"
          />
        </div>
      </nav>
    </div>
  );
}

// --- Sub-Views ---

function getFoodIcon(description: string) {
  const desc = description.toLowerCase();
  if (desc.includes('café') || desc.includes('coffee') || desc.includes('chá') || desc.includes('tea')) return <Coffee className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('maçã') || desc.includes('apple') || desc.includes('fruta') || desc.includes('fruit')) return <Apple className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('pizza')) return <Pizza className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('ovo') || desc.includes('egg')) return <Egg className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('leite') || desc.includes('milk') || desc.includes('iogurte') || desc.includes('yogurt')) return <Milk className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('sopa') || desc.includes('soup') || desc.includes('caldo')) return <Soup className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('pão') || desc.includes('bread') || desc.includes('croissant') || desc.includes('bolo')) return <Croissant className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('sorvete') || desc.includes('ice cream') || desc.includes('doce') || desc.includes('sweet')) return <IceCream className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('vinho') || desc.includes('wine')) return <Wine className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('cerveja') || desc.includes('beer') || desc.includes('álcool')) return <Beer className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('biscoito') || desc.includes('cookie') || desc.includes('bolacha')) return <Cookie className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('peixe') || desc.includes('fish') || desc.includes('sushi')) return <Fish className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('carne') || desc.includes('meat') || desc.includes('frango') || desc.includes('chicken') || desc.includes('beef') || desc.includes('steak')) return <Drumstick className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('salada') || desc.includes('salad') || desc.includes('alface') || desc.includes('vegetal') || desc.includes('vegetable')) return <Leaf className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('sanduíche') || desc.includes('sandwich') || desc.includes('hambúrguer') || desc.includes('burger')) return <Sandwich className="w-6 h-6 text-[#10B981]" />;
  
  return <Utensils className="w-6 h-6 text-[#10B981]" />;
}

function getExerciseIcon(description: string) {
  const desc = description.toLowerCase();
  if (desc.includes('corrida') || desc.includes('run') || desc.includes('caminhada') || desc.includes('walk')) return <Footprints className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('bike') || desc.includes('ciclismo') || desc.includes('pedalar')) return <Bike className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('academia') || desc.includes('gym') || desc.includes('peso') || desc.includes('weight') || desc.includes('musculação')) return <Dumbbell className="w-6 h-6 text-[#10B981]" />;
  if (desc.includes('caloria') || desc.includes('queima')) return <Flame className="w-6 h-6 text-[#10B981]" />;
  
  return <Activity className="w-6 h-6 text-[#10B981]" />;
}

function DiaryView({ profile, meals, exercises }: { profile: UserProfile, meals: Meal[], exercises: Exercise[] }) {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionInput, setSuggestionInput] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const todayMeals = meals.filter(m => m.date === today);
  const todayExercises = exercises.filter(e => e.date === today);
  
  const consumed = todayMeals.reduce((acc, m) => acc + m.calories, 0);
  const burned = todayExercises.reduce((acc, e) => acc + e.caloriesBurned, 0);
  
  const adjustedGoal = profile.dailyCalorieGoal + burned;
  const remaining = Math.max(0, adjustedGoal - consumed);
  const progress = Math.min(100, (consumed / adjustedGoal) * 100);

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: GENAI_MODEL,
        contents: `Analise o seguinte texto descrevendo uma refeição e estime o total de calorias. 
        Se as quantidades não forem especificadas, use porções médias padrão.
        Responda APENAS com um objeto JSON no formato: {"calories": number, "summary": "breve descrição em português"}.
        Texto: "${input}"`,
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{"calories": 0, "summary": "Erro ao analisar"}');
      
      await addDoc(collection(db, 'meals'), {
        uid: profile.uid,
        date: today,
        description: result.summary || input,
        calories: result.calories,
        timestamp: new Date().toISOString()
      });

      setInput('');
    } catch (error) {
      if (error instanceof Error && error.message.includes('operationType')) {
        throw error; // Re-throw if it's already a FirestoreErrorInfo
      }
      handleFirestoreError(error, OperationType.WRITE, 'meals');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteMeal = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'meals', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `meals/${id}`);
    }
  };

  const deleteExercise = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'exercises', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exercises/${id}`);
    }
  };

  const handleGetSuggestion = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `Com base em um saldo de ${remaining} calorias restantes para o dia, sugira 3 opções de refeições saudáveis e equilibradas em português. 
        FOQUE em comidas reais do dia a dia do brasileiro (ex: arroz, feijão, carnes grelhadas, ovos, frutas locais, tapioca, cuscuz). 
        Evite ingredientes caros ou difíceis de achar.
        ${suggestionInput ? `O usuário pediu especificamente: "${suggestionInput}"` : ""}
        Seja conciso e use emojis.`;
      
      const response = await ai.models.generateContent({
        model: GENAI_MODEL,
        contents: prompt,
      });
      setSuggestion(response.text || "Não foi possível obter sugestões no momento.");
    } catch (error) {
      console.error("Erro ao obter sugestão:", error);
      setSuggestion("Erro ao conectar com a IA. Tente novamente.");
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Calorie Summary Card */}
      <div className="bg-[#141414] rounded-3xl p-8 shadow-2xl border border-[#27272A] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Activity className="w-24 h-24 text-[#10B981]" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Consumido</p>
            <h2 className="text-4xl font-black text-white">{consumed.toLocaleString()} <span className="text-sm font-medium text-[#A1A1AA]">kcal</span></h2>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Exercício</p>
            <h2 className="text-4xl font-black text-[#10B981]">+{burned.toLocaleString()} <span className="text-sm font-medium text-[#A1A1AA]">kcal</span></h2>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Restante</p>
            <h2 className="text-4xl font-black text-white">{remaining.toLocaleString()} <span className="text-sm font-medium text-[#A1A1AA]">kcal</span></h2>
          </div>
        </div>
        
        <div className="mt-8">
          <div className="h-4 bg-[#27272A] rounded-full overflow-hidden mb-4 p-1">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(16,185,129,0.3)]",
                progress > 100 ? "bg-[#EF4444]" : "bg-[#10B981]"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
            <span className="text-[#A1A1AA]">Meta Ajustada: {adjustedGoal.toLocaleString()} kcal</span>
            <span className={cn(progress > 100 ? "text-[#EF4444]" : "text-[#10B981]")}>
              {progress.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => setShowExerciseModal(true)}
          className="bg-[#27272A] hover:bg-[#3F3F46] text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-[#3F3F46]"
        >
          <Activity className="w-5 h-5 text-[#10B981]" />
          Add Exercício
        </button>
        <div className="bg-[#10B981] text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#10B981]/20">
          <Utensils className="w-5 h-5" />
          Diário
        </div>
      </div>

      {/* Add Meal Form */}
      <form onSubmit={handleAddMeal} className="space-y-3">
        <label className="block text-sm font-bold text-[#A1A1AA] uppercase tracking-wider">O que você comeu?</label>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex: 2 ovos mexidos, 1 fatia de pão integral..."
            className="w-full bg-[#141414] border border-[#27272A] text-white rounded-2xl px-5 py-4 pr-14 focus:ring-2 focus:ring-[#10B981] outline-none transition-all resize-none h-28 shadow-inner"
          />
          <button 
            type="submit"
            disabled={isAnalyzing || !input.trim()}
            className="absolute bottom-4 right-4 w-12 h-12 bg-[#10B981] text-white rounded-xl flex items-center justify-center hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-[#10B981]/30"
          >
            {isAnalyzing ? <Activity className="w-6 h-6 animate-spin" /> : <Plus className="w-7 h-7" />}
          </button>
        </div>
      </form>

      {/* Meal Suggestions */}
      <div className="bg-[#141414] rounded-3xl p-6 border border-[#27272A] shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#10B981]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Sugestões de Refeições</h3>
          </div>
        </div>

        <div className="relative">
          <input 
            type="text"
            value={suggestionInput}
            onChange={(e) => setSuggestionInput(e.target.value)}
            placeholder="O que você quer comer? (ex: algo com ovo, lanche rápido)"
            className="w-full bg-[#0A0A0A] border border-[#27272A] text-white rounded-xl px-4 py-3 pr-12 text-xs font-bold outline-none focus:ring-2 focus:ring-[#10B981] transition-all"
            onKeyDown={(e) => e.key === 'Enter' && handleGetSuggestion()}
          />
          <button 
            onClick={handleGetSuggestion}
            disabled={isSuggesting || remaining <= 0}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#10B981] hover:text-[#059669] transition-all disabled:opacity-50"
          >
            {isSuggesting ? (
              <Activity className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
        </div>
        
        {suggestion && (
          <div className="bg-[#0A0A0A] rounded-2xl p-4 border border-[#27272A] animate-in fade-in zoom-in duration-300">
            <p className="text-sm text-[#A1A1AA] leading-relaxed whitespace-pre-wrap">
              {suggestion}
            </p>
          </div>
        )}
        
        {!suggestion && !isSuggesting && (
          <p className="text-xs text-[#3F3F46] italic">
            {remaining > 0 
              ? `Você ainda tem ${remaining.toLocaleString()} kcal. Digite sua preferência acima!` 
              : "Você já atingiu sua meta de calorias para hoje."}
          </p>
        )}
      </div>

      {/* Today's Log */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black flex items-center gap-2">
            <History className="w-6 h-6 text-[#10B981]" />
            Log de Hoje
          </h3>
        </div>

        <div className="space-y-4">
          {/* Meals */}
          {todayMeals.map((meal) => (
            <div key={meal.id} className="bg-[#141414] rounded-2xl p-5 flex items-center justify-between border border-[#27272A] group hover:border-[#10B981]/50 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#10B981]/10 rounded-xl flex items-center justify-center">
                  {getFoodIcon(meal.description)}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">{format(new Date(meal.timestamp), 'HH:mm')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-lg font-black text-white">{meal.calories} <span className="text-xs font-medium text-[#A1A1AA]">kcal</span></span>
                <button 
                  onClick={() => deleteMeal(meal.id)}
                  className="p-2 text-[#3F3F46] hover:text-[#EF4444] transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          {/* Exercises */}
          {todayExercises.map((ex) => (
            <div key={ex.id} className="bg-[#141414] rounded-2xl p-5 flex items-center justify-between border border-[#27272A] group hover:border-[#10B981]/50 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#10B981]/10 rounded-xl flex items-center justify-center">
                  {getExerciseIcon(ex.description || '')}
                </div>
                <div>
                  <div className="flex gap-2">
                    <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">{format(new Date(ex.timestamp), 'HH:mm')}</p>
                    {ex.duration && <p className="text-xs font-bold text-[#10B981] uppercase tracking-wider">• {ex.duration} min</p>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-lg font-black text-[#10B981]">+{ex.caloriesBurned} <span className="text-xs font-medium text-[#A1A1AA]">kcal</span></span>
                <button 
                  onClick={() => deleteExercise(ex.id)}
                  className="p-2 text-[#3F3F46] hover:text-[#EF4444] transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          {todayMeals.length === 0 && todayExercises.length === 0 && (
            <div className="bg-[#141414] rounded-3xl p-12 text-center border-2 border-dashed border-[#27272A]">
              <Calendar className="w-16 h-16 text-[#27272A] mx-auto mb-4" />
              <p className="text-[#A1A1AA] font-bold uppercase tracking-widest">Nada registrado ainda</p>
            </div>
          )}
        </div>
      </div>

      {/* Exercise Modal */}
      {showExerciseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#141414] w-full max-w-md rounded-3xl p-8 border border-[#27272A] shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-black mb-6">Registrar Exercício</h3>
            <ExerciseForm 
              uid={profile.uid} 
              onClose={() => setShowExerciseModal(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseForm({ uid, onClose }: { uid: string, onClose: () => void }) {
  const [mode, setMode] = useState<'direct' | 'calc'>('direct');
  const [desc, setDesc] = useState('');
  const [cals, setCals] = useState('');
  const [duration, setDuration] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalCals = Number(cals);
      let finalDesc = desc;

      if (mode === 'calc') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: GENAI_MODEL,
          contents: `Estime as calorias gastas para o seguinte exercício: "${desc}" por ${duration} minutos.
          Responda APENAS com um objeto JSON: {"calories": number, "summary": "descrição curta"}.`,
          config: { responseMimeType: "application/json" }
        });
        const result = JSON.parse(response.text || '{"calories": 0, "summary": ""}');
        finalCals = result.calories;
        finalDesc = result.summary || desc;
      }

      await addDoc(collection(db, 'exercises'), {
        uid,
        date: format(new Date(), 'yyyy-MM-dd'),
        description: finalDesc,
        caloriesBurned: finalCals,
        duration: duration ? Number(duration) : null,
        timestamp: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message.includes('operationType')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, 'exercises');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex bg-[#0A0A0A] p-1 rounded-xl border border-[#27272A]">
        <button 
          type="button"
          onClick={() => setMode('direct')}
          className={cn("flex-1 py-2 rounded-lg font-bold text-sm transition-all", mode === 'direct' ? "bg-[#27272A] text-white" : "text-[#A1A1AA]")}
        >
          Calorias Direto
        </button>
        <button 
          type="button"
          onClick={() => setMode('calc')}
          className={cn("flex-1 py-2 rounded-lg font-bold text-sm transition-all", mode === 'calc' ? "bg-[#27272A] text-white" : "text-[#A1A1AA]")}
        >
          Calcular com IA
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Descrição</label>
          <input 
            required
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder={mode === 'direct' ? "Ex: Corrida (Relógio)" : "Ex: Natação estilo livre"}
            className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#10B981]"
          />
        </div>

        {mode === 'direct' ? (
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Calorias Gastas</label>
            <input 
              required
              type="number"
              value={cals}
              onChange={e => setCals(e.target.value)}
              placeholder="0"
              className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#10B981]"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Duração (minutos)</label>
            <input 
              required
              type="number"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              placeholder="30"
              className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#10B981]"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <button 
          type="button" 
          onClick={onClose}
          className="flex-1 h-12 rounded-xl font-bold border border-[#27272A] hover:bg-[#27272A] transition-all"
        >
          Cancelar
        </button>
        <button 
          type="submit"
          disabled={isSaving}
          className="flex-1 h-12 bg-[#10B981] text-white rounded-xl font-bold shadow-lg shadow-[#10B981]/20 disabled:opacity-50"
        >
          {isSaving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function HistoryView({ weightHistory, profile }: { weightHistory: WeightEntry[], profile: UserProfile }) {
  const chartData = useMemo(() => {
    return weightHistory.map(entry => ({
      date: format(new Date(entry.timestamp), 'dd/MM'),
      weight: entry.weight
    }));
  }, [weightHistory]);

  const currentWeight = weightHistory[weightHistory.length - 1]?.weight || profile.weight;
  const startWeight = weightHistory[0]?.weight || profile.weight;
  const lost = startWeight - currentWeight;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#141414] rounded-3xl p-6 border border-[#27272A] shadow-xl">
          <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest mb-1">Peso Atual</p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-white">{currentWeight}</span>
            <span className="text-sm font-medium text-[#A1A1AA]">kg</span>
          </div>
        </div>
        <div className="bg-[#141414] rounded-3xl p-6 border border-[#27272A] shadow-xl">
          <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest mb-1">Total Eliminado</p>
          <div className="flex items-baseline gap-1">
            <span className={cn("text-3xl font-black", lost >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
              {lost > 0 ? `-${lost.toFixed(1)}` : Math.abs(lost).toFixed(1)}
            </span>
            <span className="text-sm font-medium text-[#A1A1AA]">kg</span>
          </div>
        </div>
      </div>

      <div className="bg-[#141414] rounded-3xl p-8 border border-[#27272A] shadow-xl">
        <h3 className="text-xl font-black mb-6 flex items-center gap-2">
          <TrendingDown className="w-6 h-6 text-[#10B981]" />
          Progresso de Peso
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272A" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#71717A', fontWeight: 'bold' }}
              />
              <YAxis 
                hide 
                domain={['dataMin - 2', 'dataMax + 2']} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#141414', borderRadius: '16px', border: '1px solid #27272A', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}
                itemStyle={{ color: '#10B981', fontWeight: 'bold' }}
                labelStyle={{ color: '#A1A1AA', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Area 
                type="monotone" 
                dataKey="weight" 
                stroke="#10B981" 
                strokeWidth={4}
                fillOpacity={1} 
                fill="url(#colorWeight)" 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-black flex items-center gap-2">
          <Calendar className="w-6 h-6 text-[#10B981]" />
          Histórico de Pesagens
        </h3>
        <div className="space-y-3">
          {[...weightHistory].reverse().map((entry) => (
            <div key={entry.id} className="bg-[#141414] rounded-2xl p-5 flex items-center justify-between border border-[#27272A] hover:border-[#10B981]/50 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#27272A] rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-[#A1A1AA]" />
                </div>
                <div>
                  <p className="font-bold text-white text-lg">{format(new Date(entry.timestamp), 'dd/MM/yyyy')}</p>
                  <p className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">{format(new Date(entry.timestamp), 'HH:mm')}</p>
                </div>
              </div>
              <span className="text-xl font-black text-white">{entry.weight} <span className="text-xs font-medium text-[#A1A1AA]">kg</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileView({ profile, onSave }: { profile: UserProfile, onSave: (data: Partial<UserProfile>) => void }) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    weight: profile.weight,
    height: profile.height,
    age: profile.age,
    gender: profile.gender,
    activityLevel: profile.activityLevel,
    goalWeight: profile.goalWeight || profile.weight - 5,
    goalDate: profile.goalDate || format(subDays(new Date(), -30), 'yyyy-MM-dd')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setEditing(false);
  };

  const daysLeft = profile.goalDate ? Math.max(0, Math.round((new Date(profile.goalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const weightToLose = profile.goalWeight ? profile.weight - profile.goalWeight : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#141414] rounded-3xl p-8 border border-[#27272A] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <UserIcon className="w-32 h-32 text-[#10B981]" />
        </div>
        
        <div className="flex items-center gap-6 mb-8 relative z-10">
          <div className="w-20 h-20 bg-[#27272A] rounded-full flex items-center justify-center border-4 border-[#141414] shadow-2xl overflow-hidden">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-10 h-10 text-[#A1A1AA]" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">{profile.name}</h2>
            <p className="text-[#A1A1AA] font-bold text-sm tracking-wide">{profile.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <StatCard label="TMB" value={`${Math.round(profile.tmb)}`} sub="Taxa Metabólica Basal" />
          <StatCard label="TDEE" value={`${Math.round(profile.tdee)}`} sub="Gasto Energético Total" />
        </div>
        
        {profile.goalWeight && profile.goalDate && weightToLose > 0 && (
          <div className="mt-6 p-4 bg-[#10B981]/5 rounded-2xl border border-[#10B981]/10 relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-[#10B981]" />
              <p className="text-xs font-black text-[#10B981] uppercase tracking-widest">Plano de Emagrecimento</p>
            </div>
            <p className="text-sm text-[#A1A1AA] leading-relaxed">
              Para perder <span className="text-white font-bold">{weightToLose.toFixed(1)}kg</span> em <span className="text-white font-bold">{daysLeft} dias</span>, sua meta diária foi ajustada para <span className="text-[#10B981] font-black">{Math.round(profile.dailyCalorieGoal)} kcal</span>.
            </p>
          </div>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="bg-[#141414] rounded-3xl p-8 border border-[#27272A] shadow-xl space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <Input label="Peso (kg)" type="number" value={formData.weight} onChange={v => setFormData({...formData, weight: Number(v)})} />
            <Input label="Altura (cm)" type="number" value={formData.height} onChange={v => setFormData({...formData, height: Number(v)})} />
            <Input label="Idade" type="number" value={formData.age} onChange={v => setFormData({...formData, age: Number(v)})} />
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Sexo</label>
              <select 
                value={formData.gender} 
                onChange={e => setFormData({...formData, gender: e.target.value as 'male' | 'female'})}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#10B981] text-white font-bold"
              >
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Nível de Atividade</label>
            <select 
              value={formData.activityLevel} 
              onChange={e => setFormData({...formData, activityLevel: e.target.value as any})}
              className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#10B981] text-white font-bold"
            >
              {ACTIVITY_LEVELS.map(level => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <Input label="Meta de Peso (kg)" type="number" value={formData.goalWeight} onChange={v => setFormData({...formData, goalWeight: Number(v)})} />
            <Input label="Data Alvo" type="date" value={formData.goalDate} onChange={v => setFormData({...formData, goalDate: v})} />
          </div>
          <div className="flex gap-4 pt-4">
            <button 
              type="button" 
              onClick={() => setEditing(false)}
              className="flex-1 h-14 rounded-2xl font-bold border border-[#27272A] hover:bg-[#27272A] transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex-1 h-14 bg-[#10B981] text-white rounded-2xl font-bold shadow-xl shadow-[#10B981]/20"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#141414] rounded-3xl p-8 border border-[#27272A] shadow-xl space-y-6">
            <ProfileRow label="Peso Atual" value={`${profile.weight} kg`} />
            <ProfileRow label="Meta de Peso" value={`${profile.goalWeight || '-'} kg`} />
            <ProfileRow label="Data Alvo" value={profile.goalDate ? format(new Date(profile.goalDate), 'dd/MM/yyyy') : '-'} />
            <ProfileRow label="Altura" value={`${profile.height} cm`} />
            <ProfileRow label="Idade" value={`${profile.age} anos`} />
            <ProfileRow label="Atividade" value={ACTIVITY_LEVELS.find(l => l.value === profile.activityLevel)?.label || ''} />
          </div>
          
          <button 
            onClick={() => setEditing(true)}
            className="w-full h-16 bg-[#27272A] hover:bg-[#3F3F46] text-white rounded-3xl font-bold flex items-center justify-center gap-2 transition-all border border-[#3F3F46] shadow-xl"
          >
            <Settings className="w-6 h-6 text-[#10B981]" />
            Editar Perfil
          </button>
        </div>
      )}
    </div>
  );
}

// --- Helper Components ---

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-[#10B981]" : "text-[#71717A]"
      )}
    >
      <div className={cn("p-2 rounded-xl transition-all", active && "bg-[#10B981]/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]")}>
        {React.cloneElement(icon as React.ReactElement, { className: cn("w-6 h-6", active ? "text-[#10B981]" : "text-[#71717A]") })}
      </div>
      <span className={cn("text-[10px] font-black uppercase tracking-widest", active ? "text-[#10B981]" : "text-[#71717A]")}>{label}</span>
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string, value: string, sub: string }) {
  return (
    <div className="bg-[#0A0A0A] rounded-2xl p-5 border border-[#27272A] shadow-inner">
      <p className="text-[10px] font-black text-[#71717A] uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-[10px] font-bold text-[#3F3F46] mt-1 leading-tight">{sub}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center py-4 border-b border-[#27272A] last:border-0">
      <span className="text-sm font-bold text-[#A1A1AA] uppercase tracking-wider">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function Input({ label, type, value, onChange }: { label: string, type: string, value: any, onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#10B981] text-white font-bold"
      />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-[#10B981]/10 rounded-3xl flex items-center justify-center animate-pulse mb-6 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
        <TrendingDown className="text-[#10B981] w-10 h-10" />
      </div>
      <p className="text-[#A1A1AA] font-black uppercase tracking-widest animate-pulse">Carregando...</p>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#10B981]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10B981]/5 blur-[120px] rounded-full" />
      
      <div className="w-24 h-24 bg-[#10B981] rounded-[2rem] flex items-center justify-center mb-10 shadow-2xl shadow-[#10B981]/30 rotate-6 relative z-10">
        <TrendingDown className="text-white w-12 h-12" />
      </div>
      <h1 className="text-5xl font-black tracking-tighter mb-4 text-white relative z-10">FitJourney AI</h1>
      <p className="text-[#A1A1AA] max-w-xs mb-14 leading-relaxed font-medium relative z-10">
        Seu assistente inteligente para emagrecimento saudável e consciente.
      </p>
      <button 
        onClick={onLogin}
        className="w-full max-w-xs bg-white text-black h-16 rounded-2xl font-black flex items-center justify-center gap-4 hover:bg-[#F4F4F5] transition-all shadow-2xl relative z-10"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
        Entrar com Google
      </button>
    </div>
  );
}

function ProfileSetup({ onSave }: { onSave: (data: Partial<UserProfile>) => void }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    weight: 70,
    height: 170,
    age: 25,
    gender: 'male' as 'male' | 'female',
    activityLevel: 'sedentary',
    goalWeight: 65,
    goalDate: format(subDays(new Date(), -30), 'yyyy-MM-dd')
  });

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-8 flex flex-col">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="mb-14">
          <div className="flex gap-3 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-all duration-500", i <= step ? "bg-[#10B981] shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-[#27272A]")} />
            ))}
          </div>
          <h2 className="text-4xl font-black leading-tight text-white tracking-tighter">
            {step === 1 && "Vamos começar com o básico"}
            {step === 2 && "Sua composição física"}
            {step === 3 && "Seu nível de atividade"}
            {step === 4 && "Quais são suas metas?"}
          </h2>
        </div>

        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div className="grid grid-cols-2 gap-6">
              <button 
                onClick={() => setFormData({...formData, gender: 'male'})}
                className={cn("p-8 rounded-3xl border-2 transition-all text-center group", formData.gender === 'male' ? "border-[#10B981] bg-[#10B981]/10" : "border-[#27272A] bg-[#141414]")}
              >
                <span className="text-4xl mb-3 block group-hover:scale-110 transition-transform">👨</span>
                <span className="font-black uppercase tracking-widest text-sm">Homem</span>
              </button>
              <button 
                onClick={() => setFormData({...formData, gender: 'female'})}
                className={cn("p-8 rounded-3xl border-2 transition-all text-center group", formData.gender === 'female' ? "border-[#10B981] bg-[#10B981]/10" : "border-[#27272A] bg-[#141414]")}
              >
                <span className="text-4xl mb-3 block group-hover:scale-110 transition-transform">👩</span>
                <span className="font-black uppercase tracking-widest text-sm">Mulher</span>
              </button>
            </div>
            <Input label="Sua Idade" type="number" value={formData.age} onChange={v => setFormData({...formData, age: Number(v)})} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <Input label="Seu Peso (kg)" type="number" value={formData.weight} onChange={v => setFormData({...formData, weight: Number(v)})} />
            <Input label="Sua Altura (cm)" type="number" value={formData.height} onChange={v => setFormData({...formData, height: Number(v)})} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
            {ACTIVITY_LEVELS.map(level => (
              <button 
                key={level.value}
                onClick={() => setFormData({...formData, activityLevel: level.value})}
                className={cn(
                  "w-full p-5 rounded-2xl border-2 text-left transition-all",
                  formData.activityLevel === level.value ? "border-[#10B981] bg-[#10B981]/10" : "border-[#27272A] bg-[#141414]"
                )}
              >
                <p className="font-black text-white text-sm uppercase tracking-widest">{level.label}</p>
              </button>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <Input label="Meta de Peso (kg)" type="number" value={formData.goalWeight} onChange={v => setFormData({...formData, goalWeight: Number(v)})} />
            <Input label="Até quando? (Data)" type="date" value={formData.goalDate} onChange={v => setFormData({...formData, goalDate: v})} />
          </div>
        )}

        <div className="mt-16 flex gap-4">
          {step > 1 && (
            <button onClick={back} className="flex-1 h-16 rounded-2xl font-black uppercase tracking-widest text-sm border-2 border-[#27272A] hover:bg-[#141414] transition-all">
              Voltar
            </button>
          )}
          <button 
            onClick={step === 4 ? () => onSave(formData) : next}
            className="flex-[2] h-16 bg-[#10B981] text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 shadow-2xl shadow-[#10B981]/30 hover:bg-[#059669] transition-all"
          >
            {step === 4 ? "Finalizar" : "Continuar"}
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, errorInfo: null as string | null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error instanceof Error ? error.message : String(error) };
  }

  render() {
    const { hasError, errorInfo } = this.state;
    if (hasError) {
      let displayMessage = "Ocorreu um erro inesperado.";
      try {
        if (errorInfo) {
          const parsed = JSON.parse(errorInfo);
          if (parsed.error && parsed.error.includes("insufficient permissions")) {
            displayMessage = "Você não tem permissão para realizar esta ação. Verifique se você está logado corretamente.";
          }
        }
      } catch (e) {
        // Not JSON or other error
      }

      return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-6 border border-red-500/20">
            <Activity className="text-red-500 w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-white mb-4">Ops! Algo deu errado</h2>
          <p className="text-[#A1A1AA] max-w-xs mb-8 font-medium">
            {displayMessage}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 h-14 bg-[#10B981] text-white rounded-2xl font-black shadow-xl shadow-[#10B981]/20"
          >
            Recarregar Aplicativo
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
